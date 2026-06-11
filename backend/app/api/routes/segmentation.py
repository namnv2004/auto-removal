import json
import logging
import os
from typing import Annotated, Any

import numpy as np
import scipy.ndimage as ndimage
import torch
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from PIL import Image, ImageFilter

from app.api.deps import get_current_user, SegmentationServiceDep
from app.api.image_utils import read_image, image_to_base64_png
from app.core.config import settings
from app.schemas.segmentation import SegmentationPredictResponse, SegmentationStatus
from app.services import SegmentationService

logger = logging.getLogger(__name__)

# Enable expandable segments to avoid CUDA memory fragmentation
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True,max_split_size_mb:128")

router = APIRouter(
    prefix="/segmentation",
    tags=["segmentation"],
    dependencies=[Depends(get_current_user)],
)

_predict_lock = torch.multiprocessing.Lock() if torch.cuda.is_available() else Any


def _parse_json_field(raw_value: str | None, field_name: str, default: Any) -> Any:
    if not raw_value:
        return default
    try:
        return json.loads(raw_value)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must be valid JSON",
        )


def _parse_points(raw_points: str | None) -> list[list[float]]:
    points = _parse_json_field(raw_points, "points", [])
    if not isinstance(points, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="points must be an array of [x, y] pairs",
        )

    parsed_points: list[list[float]] = []
    for point in points:
        if not isinstance(point, list) or len(point) != 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="points must be an array of [x, y] pairs",
            )
        parsed_points.append([float(point[0]), float(point[1])])
    return parsed_points


def _parse_point_labels(raw_labels: str | None, point_count: int) -> list[int]:
    labels = _parse_json_field(raw_labels, "point_labels", None)
    if labels is None:
        return [1] * point_count
    if not isinstance(labels, list) or len(labels) != point_count:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="point_labels must match the number of points",
        )

    parsed_labels = [int(label) for label in labels]
    if any(label not in (0, 1) for label in parsed_labels):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="point_labels only supports 0 or 1",
        )
    return parsed_labels


def _parse_box(raw_box: str | None) -> list[float] | None:
    box = _parse_json_field(raw_box, "box", None)
    if box is None:
        return None
    if not isinstance(box, list) or len(box) != 4:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="box must be [x1, y1, x2, y2]",
        )
    return [float(value) for value in box]


def _ellipse_fill_ratio(
    mask: np.ndarray | None,
    box: list[float],
    ref_size: tuple[int, int],
) -> float:
    """Fraction of the ellipse inscribed in `box` that is covered by `mask`.

    `box` is in `ref_size` (width, height) coordinates; the mask may be at a
    different resolution.
    """
    if mask is None:
        return 0.0
    try:
        arr = np.asarray(mask).squeeze() > 0.5
        h, w = arr.shape
        sx = w / ref_size[0]
        sy = h / ref_size[1]
        ecx = (box[0] + box[2]) / 2.0 * sx
        ecy = (box[1] + box[3]) / 2.0 * sy
        erx = max((box[2] - box[0]) / 2.0 * sx, 1.0)
        ery = max((box[3] - box[1]) / 2.0 * sy, 1.0)
        yy, xx = np.ogrid[:h, :w]
        ellipse = ((xx - ecx) / erx) ** 2 + ((yy - ecy) / ery) ** 2 <= 1.0
        ellipse_area = float(ellipse.sum())
        if ellipse_area <= 0:
            return 0.0
        return float(np.logical_and(arr, ellipse).sum()) / ellipse_area
    except Exception as e:
        logger.exception("Error computing ellipse fill ratio: %s", e)
        return 0.0


def _pick_mask_for_circle(
    masks: np.ndarray,
    scores: list[float],
    circle_box: list[float],
    original_image: Image.Image,
) -> np.ndarray | None:
    """Pick the candidate mask with the highest IoU against the drawn ellipse."""
    try:
        first = np.asarray(masks[0]).squeeze()
        h, w = first.shape
        sx = w / original_image.width
        sy = h / original_image.height

        yy, xx = np.mgrid[0:h, 0:w]
        ecx = (circle_box[0] + circle_box[2]) / 2.0 * sx
        ecy = (circle_box[1] + circle_box[3]) / 2.0 * sy
        erx = max((circle_box[2] - circle_box[0]) / 2.0 * sx, 1.0)
        ery = max((circle_box[3] - circle_box[1]) / 2.0 * sy, 1.0)
        ellipse = ((xx - ecx) / erx) ** 2 + ((yy - ecy) / ery) ** 2 <= 1.0
        ellipse_area = float(ellipse.sum())
        if ellipse_area <= 0:
            return None

        best_iou = 0.0
        best: np.ndarray | None = None
        for i, candidate in enumerate(masks):
            score = scores[i] if i < len(scores) else 1.0
            if score < 0.2:
                continue
            arr = np.asarray(candidate).squeeze() > 0.5
            inter = float(np.logical_and(arr, ellipse).sum())
            union = float(arr.sum()) + ellipse_area - inter
            iou = inter / union if union > 0 else 0.0
            if iou > best_iou:
                best_iou = iou
                best = candidate
        return best
    except Exception as e:
        logger.exception("Error picking mask for circle prompt: %s", e)
        return None


def _resize_for_model(
    image: Image.Image,
    points: list[list[float]],
    box: list[float] | None,
) -> tuple[Image.Image, list[list[float]], list[float] | None]:
    long_edge = max(image.size)
    if long_edge <= settings.MAX_LONG_EDGE:
        return image, points, box

    scale = settings.MAX_LONG_EDGE / long_edge
    resized_size = (
        max(1, round(image.width * scale)),
        max(1, round(image.height * scale)),
    )
    resized_image = image.resize(resized_size, Image.Resampling.LANCZOS)
    resized_points = [[x * scale, y * scale] for x, y in points]
    resized_box = [value * scale for value in box] if box else None
    return resized_image, resized_points, resized_box


def _mask_image(
    mask: Any,
    original_size: tuple[int, int],
    model_size: tuple[int, int],
    mask_threshold: float,
    feather_radius: float,
) -> Image.Image:
    mask_array = np.asarray(mask).squeeze()
    if mask_array.ndim != 2:
        raise RuntimeError(f"Expected 2D mask, got shape {mask_array.shape}")

    if mask_array.dtype == np.bool_:
        mask_values = mask_array.astype(np.uint8) * 255
    else:
        mask_values = np.nan_to_num(mask_array.astype(np.float32), nan=0.0)
        if mask_values.max(initial=0.0) <= 1.0:
            mask_values = mask_values >= mask_threshold
        else:
            mask_values = mask_values >= mask_threshold * 255.0
        mask_values = mask_values.astype(np.uint8) * 255

    # Create mask at model scale
    mask_image = Image.fromarray(mask_values, mode="L")
    if mask_image.size != model_size:
        mask_image = mask_image.resize(model_size, Image.Resampling.BILINEAR)

    # Apply morphological filter on the model-scale mask (faster and cleaner)
    mask_image = mask_image.filter(ImageFilter.MaxFilter(3)).filter(
        ImageFilter.MinFilter(3)
    )

    # Resize to original scale with BILINEAR to anti-alias the boundaries
    if mask_image.size != original_size:
        mask_image = mask_image.resize(original_size, Image.Resampling.BILINEAR)

    # Apply feathering at original scale
    if feather_radius > 0:
        mask_image = mask_image.filter(ImageFilter.GaussianBlur(radius=feather_radius))

    return mask_image


def _clamp_float(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)


def _overlay_image(image: Image.Image, mask_image: Image.Image) -> Image.Image:
    mask_alpha = mask_image.point(lambda value: round(value * 0.55))
    teal_mask = Image.new("RGBA", image.size, (20, 184, 166, 0))
    teal_mask.putalpha(mask_alpha)
    return teal_mask


@router.get("/status", response_model=SegmentationStatus)
def segmentation_status(service: SegmentationServiceDep) -> SegmentationStatus:
    return SegmentationStatus(
        model=settings.SEGMENTATION_MODEL,
        device=settings.MODEL_DEVICE,
        cuda_available=torch.cuda.is_available(),
        cuda_device_count=torch.cuda.device_count(),
        checkpoint_path=str(service.checkpoint_path),
        checkpoint_exists=service.checkpoint_path.exists(),
        loaded=service.is_loaded,
    )


def segment_image_core(
    original_image: Image.Image,
    service: SegmentationService,
    points: str | None = None,
    point_labels: str | None = None,
    box: str | None = None,
    text_prompt: str | None = None,
    circle_box: str | None = None,
    mask_threshold: float = 0.35,
    feather_radius: float = 0.0,
) -> tuple[Image.Image, Image.Image, float, int, int]:
    """Core segmentation logic that runs SAM 3.1 and applies mask post-processing."""
    parsed_points = _parse_points(points)
    parsed_box = _parse_box(box)
    parsed_circle_box = _parse_box(circle_box)

    # Circle mode: use box prompt directly (class-agnostic)
    circle_mode_text: str | None = None

    if (
        not parsed_points
        and parsed_box is None
        and not text_prompt
        and parsed_circle_box is None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Add at least one prompt: point, box, circle, or text",
        )

    if parsed_points and text_prompt:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Point prompts and text prompt cannot be used together",
        )

    parsed_labels = _parse_point_labels(point_labels, len(parsed_points))

    # Localized cropping pipeline
    is_cropped = False
    crop_offset_x = 0
    crop_offset_y = 0

    if parsed_box is not None:
        is_cropped = True
        x1, y1, x2, y2 = parsed_box

        # Calculate padding (20% of box size, min 20px)
        box_w = x2 - x1
        box_h = y2 - y1
        pad_x = max(box_w * 0.20, 20.0)
        pad_y = max(box_h * 0.20, 20.0)

        # Clamp crop box to original image bounds
        cx1 = max(0, int(round(x1 - pad_x)))
        cy1 = max(0, int(round(y1 - pad_y)))
        cx2 = min(original_image.width, int(round(x2 + pad_x)))
        cy2 = min(original_image.height, int(round(y2 + pad_y)))

        crop_offset_x = cx1
        crop_offset_y = cy1

        # Crop the original image
        original_image_cropped = original_image.crop((cx1, cy1, cx2, cy2))

        # Translate bounding box to local crop coordinates
        local_box = [x1 - cx1, y1 - cy1, x2 - cx1, y2 - cy1]

        model_image, model_points, model_box = _resize_for_model(
            original_image_cropped, parsed_points, local_box
        )
    else:
        model_image, model_points, model_box = _resize_for_model(
            original_image, parsed_points, parsed_box
        )

    # For circle mode, compute model-scale box from circle_box (bypass crop pipeline)
    circle_model_box: list[float] | None = None
    if parsed_circle_box is not None:
        if model_image.size != (original_image.width, original_image.height):
            csx = model_image.width / original_image.width
            csy = model_image.height / original_image.height
        else:
            csx, csy = 1.0, 1.0
        circle_model_box = [
            parsed_circle_box[0] * csx,
            parsed_circle_box[1] * csy,
            parsed_circle_box[2] * csx,
            parsed_circle_box[3] * csy,
        ]

    # Circle-only mode: For circle prompts, use the drawn circle as a box prompt
    # to find ALL objects within the circle. SAM3 box prompts find objects inside
    # the box region. We then combine multiple returned masks.
    circle_point_mode = False
    circle_retry_box: list[float] | None = None
    if parsed_circle_box is not None and not text_prompt and not model_points:
        assert circle_model_box is not None
        circle_point_mode = True
        circle_retry_box = circle_model_box
        # Use box prompt directly for the drawn circle - finds all objects inside
        effective_box = circle_model_box
        circle_model_box = None

    # Determine effective prompts for SAM
    effective_text = circle_mode_text or text_prompt
    effective_box = circle_model_box or model_box

    try:
        # Wrap lock acquisition dynamically if defined (avoiding global route locks)
        from app.core.concurrency import gpu_lock
        with torch.no_grad():
            # Ensure model is on the correct device if it was previously unloaded
            if service._predictor is not None:
                service._predictor.model.to(service.model_device)

            # Run prediction inside the correct autocast context for the thread
            from contextlib import nullcontext
            autocast_ctx = (
                torch.autocast("cuda", dtype=torch.bfloat16)
                if service.model_device == "cuda"
                else nullcontext()
            )
            with autocast_ctx:
                service.set_image(model_image)
                result = service.predict(
                    point_coords=model_points or None,
                    point_labels=parsed_labels or None,
                    box=effective_box,
                    text_prompt=effective_text,
                )

                # For circle mode (box prompt), combine ALL masks that fall within
                # the drawn circle to capture multiple objects (boat + person, etc.)
                if circle_point_mode and circle_retry_box is not None:
                    masks = result.get("masks")
                    scores = result.get("scores", [])
                    if masks is not None and len(masks) > 1:
                        # Create ellipse mask for the drawn circle (in mask coordinates)
                        h, w = masks[0].shape
                        sx = w / original_image.width
                        sy = h / original_image.height
                        ecx = (circle_retry_box[0] + circle_retry_box[2]) / 2.0 * sx
                        ecy = (circle_retry_box[1] + circle_retry_box[3]) / 2.0 * sy
                        erx = max((circle_retry_box[2] - circle_retry_box[0]) / 2.0 * sx, 1.0)
                        ery = max((circle_retry_box[3] - circle_retry_box[1]) / 2.0 * sy, 1.0)
                        yy, xx = np.ogrid[:h, :w]
                        ellipse = ((xx - ecx) / erx) ** 2 + ((yy - ecy) / ery) ** 2 <= 1.0
                        ellipse_area = float(ellipse.sum())
                        
                        # Combine masks that are significantly inside the drawn ellipse
                                overlap_ratio = float(np.logical_and(mask_bin, ellipse).sum()) / mask_area
                                # Include mask if significant portion is inside the drawn circle
                                if overlap_ratio > 0.2:
                                    combined_mask = np.logical_or(combined_mask, mask_bin)
                                    combined_count += 1
                            
                            if combined_count > 1:
                                logger.info(
                                    "Circle prompt: combined %d masks within circle (overlap > 0.2)",
                                    combined_count
                                )
                                result = {
                                    "masks": combined_mask[None, ...],
                                    "scores": [max(scores) if scores else 0.5],
                                    "best_mask": combined_mask,
                                    "best_score": max(scores) if scores else 0.5,
                                    "best_mask_idx": 0,
                                }
                    
                    final_fill = _ellipse_fill_ratio(
                        result.get("best_mask"), circle_retry_box, model_image.size
                    )
                    
                    if final_fill < 0.40:
                        # SAM could not isolate a clean object inside the
                        # circle; use tighter ellipse (80% of drawn) to avoid over-segmentation.
                        logger.info(
                            "Circle prompt: using tight ellipse geometry mask (fill %.3f)",
                            final_fill,
                        )
                        ecx = (circle_retry_box[0] + circle_retry_box[2]) / 2.0
                        ecy = (circle_retry_box[1] + circle_retry_box[3]) / 2.0
                        erx = max(
                            (circle_retry_box[2] - circle_retry_box[0]) / 2.0 * 0.8, 1.0
                        )
                        ery = max(
                            (circle_retry_box[3] - circle_retry_box[1]) / 2.0 * 0.8, 1.0
                        )
                        yy, xx = np.ogrid[: model_image.height, : model_image.width]
                        ellipse_arr = (
                            ((xx - ecx) / erx) ** 2 + ((yy - ecy) / ery) ** 2
                        ) <= 1.0
                        result = {
                            "masks": ellipse_arr[None, ...],
                            "scores": [0.5],
                            "best_mask": ellipse_arr,
                            "best_score": 0.5,
                            "best_mask_idx": 0,
                        }
    except (FileNotFoundError, RuntimeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )

    masks = result.get("masks")
    effective_is_text = bool(effective_text)
    if (
        effective_is_text
        and parsed_circle_box is None
        and masks is not None
        and len(masks) > 0
    ):
        scores = result.get("scores", [])
        valid_masks = [masks[i] for i, score in enumerate(scores) if score >= 0.35]
        if valid_masks:
            best_mask = np.logical_or.reduce(valid_masks)
        else:
            best_mask = result.get("best_mask")
    elif (
        parsed_circle_box is not None
        and masks is not None
        and len(masks) > 1
    ):
        # SAM3 box prompts are visual exemplars and can return several
        # instances; pick the mask that best fills the drawn ellipse instead
        # of the one with the highest raw score.
        best_mask = _pick_mask_for_circle(
            masks, result.get("scores", []), parsed_circle_box, original_image
        )
        if best_mask is None:
            best_mask = result.get("best_mask")
    else:
        best_mask = result.get("best_mask")

    if best_mask is None or (hasattr(best_mask, "sum") and best_mask.sum() < 5):
        # Fallback logic to prevent crash when SAM fails to detect a mask
        from PIL import ImageDraw
        mask_png = Image.new("L", original_image.size, 0)
        draw = ImageDraw.Draw(mask_png)

        if parsed_circle_box is not None or parsed_box is not None:
            logger.warning("SAM 3.1 did not return a valid mask. Falling back to user prompt geometry.")
            if parsed_circle_box is not None:
                draw.ellipse(parsed_circle_box, fill=255)
            else:
                assert parsed_box is not None
                draw.rectangle(parsed_box, fill=255)
            overlay_png = _overlay_image(original_image, mask_png)
            return (
                mask_png,
                overlay_png,
                0.5,
                original_image.width,
                original_image.height,
            )
        elif parsed_points:
            logger.warning("SAM 3.1 did not return a valid mask. Falling back to click point geometries.")
            has_positive = False
            for idx, pt in enumerate(parsed_points):
                label = parsed_labels[idx] if idx < len(parsed_labels) else 1
                if label == 1:
                    x, y = pt
                    r = 20  # 20px radius circle fallback
                    draw.ellipse([x - r, y - r, x + r, y + r], fill=255)
                    has_positive = True
            if has_positive:
                overlay_png = _overlay_image(original_image, mask_png)
                return (
                    mask_png,
                    overlay_png,
                    0.5,
                    original_image.width,
                    original_image.height,
                )

        if text_prompt:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Could not detect '{text_prompt}'. "
                    "Draw a circle around the object or try a more specific description."
                ),
            )

        logger.warning(
            "SAM 3.1 did not return a valid mask. Returning empty mask fallback."
        )
        overlay_png = _overlay_image(original_image, mask_png)
        return (
            mask_png,
            overlay_png,
            0.0,
            original_image.width,
            original_image.height,
        )

    # Filter connected components to only keep those overlapping with the user's circle/box prompt.
    if model_box is not None and best_mask is not None:
        try:
            h, w = best_mask.shape
            bx1 = model_box[0]
            by1 = model_box[1]
            bx2 = model_box[2]
            by2 = model_box[3]

            # 1. Constrain mask to a padded ellipse matching the user's circled area to prevent background bleed.
            y_indices, x_indices = np.ogrid[:h, :w]
            cx = (bx1 + bx2) / 2.0
            cy = (by1 + by2) / 2.0
            rx = (bx2 - bx1) / 2.0
            ry = (by2 - by1) / 2.0

            rx_pad = max(rx * 1.15, 10.0)
            ry_pad = max(ry * 1.15, 10.0)

            ellipse_mask = (
                ((x_indices - cx) / rx_pad) ** 2 + ((y_indices - cy) / ry_pad) ** 2
            ) <= 1.0
            best_mask = np.logical_and(best_mask, ellipse_mask)

            # 2. Run connected components to isolate the target object
            labeled_mask, num_features = ndimage.label(best_mask)
            if num_features > 0:
                cx1 = max(0, min(int(round(bx1)), w - 1))
                cy1 = max(0, min(int(round(by1)), h - 1))
                cx2 = max(0, min(int(round(bx2)), w - 1))
                cy2 = max(0, min(int(round(by2)), h - 1))

                box_region = labeled_mask[cy1 : cy2 + 1, cx1 : cx2 + 1]
                overlapping_labels = set(np.unique(box_region))
                overlapping_labels.discard(0)  # Remove background

                if overlapping_labels:
                    best_mask = np.isin(labeled_mask, list(overlapping_labels))
        except Exception as e:
            logger.exception(
                "Error filtering connected components with bounding box: %s", e
            )

    # Circle-based ellipse clipping (for drawn circles)
    if parsed_circle_box is not None and best_mask is not None:
        try:
            mask_arr = np.asarray(best_mask).squeeze()
            h, w = mask_arr.shape

            # Scale circle_box from original pixel coords to mask coords
            sx = w / original_image.width
            sy = h / original_image.height

            cx1 = parsed_circle_box[0] * sx
            cy1 = parsed_circle_box[1] * sy
            cx2 = parsed_circle_box[2] * sx
            cy2 = parsed_circle_box[3] * sy

            ecx = (cx1 + cx2) / 2.0
            ecy = (cy1 + cy2) / 2.0
            erx = (cx2 - cx1) / 2.0
            ery = (cy2 - cy1) / 2.0

            erx_pad = max(erx * 1.1, 5.0)
            ery_pad = max(ery * 1.1, 5.0)

            y_indices, x_indices = np.ogrid[:h, :w]
            ellipse = (
                ((x_indices - ecx) / erx_pad) ** 2 + ((y_indices - ecy) / ery_pad) ** 2
            ) <= 1.0

            # Binarize first: interactive point prompts return soft masks where
            # near-zero probabilities are still nonzero and would fuse into one
            # giant connected component.
            mask_bin = mask_arr > 0.5
            labeled_mask, num_features = ndimage.label(mask_bin)
            if num_features > 0:
                ellipse_labels = set(np.unique(labeled_mask[ellipse]))
                ellipse_labels.discard(0)  # Remove background

                if ellipse_labels:
                    selected_components = np.isin(labeled_mask, list(ellipse_labels))
                    pad_x = erx * 1.0
                    pad_y = ery * 1.0
                    limit_x1 = max(0.0, cx1 - pad_x)
                    limit_y1 = max(0.0, cy1 - pad_y)
                    limit_x2 = min(float(w), cx2 + pad_x)
                    limit_y2 = min(float(h), cy2 + pad_y)

                    box_mask = (
                        (x_indices >= limit_x1)
                        & (x_indices <= limit_x2)
                        & (y_indices >= limit_y1)
                        & (y_indices <= limit_y2)
                    )
                    best_mask = np.logical_and(selected_components, box_mask)
                else:
                    best_mask = mask_arr
            else:
                best_mask = mask_arr
        except Exception as e:
            logger.exception("Error in circle-based mask clipping: %s", e)

    # Use higher threshold for circle mode to avoid soft-mask background bleed
    effective_threshold = (
        max(mask_threshold, 0.5) if parsed_circle_box is not None else mask_threshold
    )

    # Convert the crop-scale mask to original size
    mask_png_size = original_image_cropped.size if is_cropped else original_image.size
    mask_png_local = _mask_image(
        best_mask,
        original_size=mask_png_size,
        model_size=model_image.size,
        mask_threshold=_clamp_float(effective_threshold, 0.1, 0.95),
        feather_radius=_clamp_float(feather_radius, 0.0, 4.0),
    )

    if is_cropped:
        mask_png = Image.new("L", original_image.size, 0)
        mask_png.paste(mask_png_local, (crop_offset_x, crop_offset_y))
    else:
        mask_png = mask_png_local

    overlay_png = _overlay_image(original_image, mask_png)

    return (
        mask_png,
        overlay_png,
        float(result.get("best_score", 0.0)),
        model_image.width,
        model_image.height,
    )


@router.post("/predict", response_model=SegmentationPredictResponse)
async def predict_segmentation(
    service: SegmentationServiceDep,
    image: Annotated[UploadFile, File()],
    points: Annotated[str | None, Form()] = None,
    point_labels: Annotated[str | None, Form()] = None,
    box: Annotated[str | None, Form()] = None,
    text_prompt: Annotated[str | None, Form()] = None,
    circle_box: Annotated[str | None, Form()] = None,
    mask_threshold: Annotated[float, Form()] = 0.35,
    feather_radius: Annotated[float, Form()] = 0.0,
) -> SegmentationPredictResponse:
    import anyio
    from app.core.concurrency import gpu_lock
    from app.core.config import settings

    original_image = await read_image(image)
    async with gpu_lock:
        mask_png, overlay_png, best_score, pw, ph = await anyio.to_thread.run_sync(
            lambda: segment_image_core(
                original_image=original_image,
                service=service,
                points=points,
                point_labels=point_labels,
                box=box,
                text_prompt=text_prompt,
                circle_box=circle_box,
                mask_threshold=mask_threshold,
                feather_radius=feather_radius,
            )
        )
    
    if settings.CLEAR_CUDA_CACHE_AFTER_REQUEST and torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()

    return SegmentationPredictResponse(
        width=original_image.width,
        height=original_image.height,
        processed_width=pw,
        processed_height=ph,
        best_score=best_score,
        mask_png_base64=image_to_base64_png(mask_png),
        overlay_png_base64=image_to_base64_png(overlay_png),
    )
