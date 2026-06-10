import asyncio
import base64
import logging
import threading
from io import BytesIO
from typing import Annotated

import anyio
import torch
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from PIL import Image, ImageOps
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.core.config import settings
from app.services.inpainting import InpaintingService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/inpainting",
    tags=["inpainting"],
    dependencies=[Depends(get_current_user)],
)

_service: InpaintingService | None = None
_service_lock = threading.Lock()
from app.core.concurrency import gpu_lock


class InpaintingStatusResponse(BaseModel):
    model: str
    device: str
    cuda_available: bool
    loaded: bool


class InpaintingResponse(BaseModel):
    result_png_base64: str
    debug_crop_png_base64: str
    width: int
    height: int
    duration_ms: int
    seed_used: int


def _get_service() -> InpaintingService:
    global _service
    with _service_lock:
        if _service is None:
            _service = InpaintingService(
                model_id=settings.INPAINTING_MODEL,
                model_device=settings.MODEL_DEVICE,
                model_cache_dir=settings.MODEL_CACHE_DIR,
                hf_token=settings.HF_TOKEN,
                default_steps=settings.INPAINTING_STEPS,
                default_guidance_scale=settings.INPAINTING_GUIDANCE_SCALE,
                default_strength=settings.INPAINTING_STRENGTH,
                default_prompt=settings.INPAINTING_DEFAULT_PROMPT,
                default_negative_prompt=settings.INPAINTING_DEFAULT_NEGATIVE,
                default_dilation_px=settings.MASK_DILATION_PX,
                default_feather_radius=settings.MASK_FEATHER_RADIUS,
                default_prefill=settings.INPAINTING_PREFILL,
                default_strength_prefill=settings.INPAINTING_STRENGTH_PREFILL,
            )
    return _service


async def _read_image(upload: UploadFile) -> Image.Image:
    image_bytes = await upload.read()
    max_bytes = settings.MAX_IMAGE_MB * 1024 * 1024
    if len(image_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image too large (max {settings.MAX_IMAGE_MB} MB)",
        )
    try:
        img = Image.open(BytesIO(image_bytes))
        img = ImageOps.exif_transpose(img)
        return img.convert("RGB")
    except Exception:
        logger.exception("Failed to read image upload")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Upload must be a valid image file",
        )


async def _read_mask(upload: UploadFile, expected_size: tuple[int, int]) -> Image.Image:
    mask_bytes = await upload.read()
    try:
        mask = Image.open(BytesIO(mask_bytes)).convert("L")
        if mask.size != expected_size:
            mask = mask.resize(expected_size, Image.Resampling.LANCZOS)
        return mask
    except Exception:
        logger.exception("Failed to read mask upload")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="mask must be a valid grayscale PNG",
        )


def _image_to_base64_png(image: Image.Image) -> str:
    buf = BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


@router.get("/status", response_model=InpaintingStatusResponse)
def inpainting_status() -> InpaintingStatusResponse:
    service = _get_service()
    return InpaintingStatusResponse(
        model=settings.INPAINTING_MODEL,
        device=settings.MODEL_DEVICE,
        cuda_available=torch.cuda.is_available(),
        loaded=service.is_loaded,
    )


def _maybe_unload_sam() -> None:
    """Unload SAM 3.1 from GPU to CPU to free up VRAM for Stable Diffusion 3.5."""
    try:
        from app.api.routes.segmentation import _service as sam_service

        if (
            sam_service is not None
            and getattr(sam_service, "_predictor", None) is not None
        ):
            logger.info("Unloading SAM 3.1 from GPU to CPU to prevent VRAM OOM...")
            sam_service._predictor.model.to("cpu")
            torch.cuda.empty_cache()
    except Exception as e:
        logger.warning("Failed to unload SAM 3.1 from GPU: %s", e)


@router.post("/remove", response_model=InpaintingResponse)
async def remove_object(
    image: Annotated[UploadFile, File()],
    mask: Annotated[UploadFile, File()],
    prompt: Annotated[str | None, Form()] = None,
    negative_prompt: Annotated[str | None, Form()] = None,
    steps: Annotated[int, Form()] = 20,
    guidance_scale: Annotated[float, Form()] = 2.5,
    strength: Annotated[float, Form()] = 1.0,
    seed: Annotated[int | None, Form()] = None,
    mask_dilation: Annotated[int, Form()] = 4,
    mask_feather: Annotated[float, Form()] = 2.0,
    prefill: Annotated[bool | None, Form()] = None,
    strength_prefill: Annotated[float | None, Form()] = None,
) -> InpaintingResponse:
    """Remove the masked object using SD 3.5 Medium inpainting."""
    original = await _read_image(image)
    mask_img = await _read_mask(mask, (original.width, original.height))

    if settings.MODEL_DEVICE == "cuda":
        _maybe_unload_sam()

    service = _get_service()

    try:
        async with gpu_lock:
            result = await anyio.to_thread.run_sync(
                lambda: service.remove_object(
                    image=original,
                    mask=mask_img,
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    steps=steps,
                    guidance_scale=guidance_scale,
                    strength=strength,
                    seed=seed,
                    mask_dilation=mask_dilation,
                    mask_feather=mask_feather,
                    prefill=prefill,
                    strength_prefill=strength_prefill,
                )
            )
    except (RuntimeError, OSError) as exc:
        logger.exception("Inpainting failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )

    return InpaintingResponse(
        result_png_base64=_image_to_base64_png(result["result_image"]),
        debug_crop_png_base64=_image_to_base64_png(result["debug_crop"]),
        width=original.width,
        height=original.height,
        duration_ms=result["duration_ms"],
        seed_used=result["seed_used"],
    )


class UnifiedInpaintingResponse(BaseModel):
    result_png_base64: str
    mask_png_base64: str
    overlay_png_base64: str
    width: int
    height: int
    duration_ms: int
    seed_used: int


@router.post("/remove-unified", response_model=UnifiedInpaintingResponse)
async def remove_object_unified(
    image: Annotated[UploadFile, File()],
    # Segmentation params
    points: Annotated[str | None, Form()] = None,
    point_labels: Annotated[str | None, Form()] = None,
    box: Annotated[str | None, Form()] = None,
    text_prompt: Annotated[str | None, Form()] = None,
    circle_box: Annotated[str | None, Form()] = None,
    mask_threshold: Annotated[float, Form()] = 0.35,
    feather_radius: Annotated[float, Form()] = 0.0,
    # Inpainting params
    prompt: Annotated[str | None, Form()] = None,
    negative_prompt: Annotated[str | None, Form()] = None,
    steps: Annotated[int, Form()] = 20,
    guidance_scale: Annotated[float, Form()] = 2.5,
    strength: Annotated[float, Form()] = 1.0,
    seed: Annotated[int | None, Form()] = None,
    mask_dilation: Annotated[int, Form()] = 4,
    mask_feather: Annotated[float, Form()] = 2.0,
    prefill: Annotated[bool | None, Form()] = None,
    strength_prefill: Annotated[float | None, Form()] = None,
) -> UnifiedInpaintingResponse:
    """Run the entire pipeline: Segmentation (SAM 3.1) -> Inpainting (SD 3.5) in one request."""
    # 1. Read input image
    original = await _read_image(image)

    async with gpu_lock:
        # 2. Run Segmentation (SAM 3.1)
        from app.api.routes.segmentation import segment_image_core

        try:
            mask_png, overlay_png, _, _, _ = await anyio.to_thread.run_sync(
                lambda: segment_image_core(
                    original_image=original,
                    points=points,
                    point_labels=point_labels,
                    box=box,
                    text_prompt=text_prompt,
                    circle_box=circle_box,
                    mask_threshold=mask_threshold,
                    feather_radius=feather_radius,
                )
            )
        except HTTPException as he:
            raise he
        except Exception as exc:
            logger.exception("Segmentation step failed in unified pipeline")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Segmentation failed: {exc}",
            )

        # 3. Unload SAM from GPU to CPU to free VRAM for SD 3.5
        if settings.MODEL_DEVICE == "cuda":
            _maybe_unload_sam()

        # 4. Run Inpainting (SD 3.5)
        service = _get_service()
        inpaint_neg_prompt = negative_prompt
        if text_prompt:
            if inpaint_neg_prompt:
                inpaint_neg_prompt = f"{text_prompt}, {inpaint_neg_prompt}"
            else:
                inpaint_neg_prompt = f"{text_prompt}, {settings.INPAINTING_DEFAULT_NEGATIVE}"
        try:
            result = await anyio.to_thread.run_sync(
                lambda: service.remove_object(
                    image=original,
                    mask=mask_png,
                    prompt=prompt,
                    negative_prompt=inpaint_neg_prompt,
                    steps=steps,
                    guidance_scale=guidance_scale,
                    strength=strength,
                    seed=seed,
                    mask_dilation=mask_dilation,
                    mask_feather=mask_feather,
                    prefill=prefill,
                    strength_prefill=strength_prefill,
                )
            )
        except (RuntimeError, OSError) as exc:
            logger.exception("Inpainting step failed in unified pipeline")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Inpainting failed: {exc}",
            )

    return UnifiedInpaintingResponse(
        result_png_base64=_image_to_base64_png(result["result_image"]),
        mask_png_base64=_image_to_base64_png(mask_png),
        overlay_png_base64=_image_to_base64_png(overlay_png),
        width=original.width,
        height=original.height,
        duration_ms=result["duration_ms"],
        seed_used=result["seed_used"],
    )
