import logging
from pathlib import Path

import numpy as np
import torch
from PIL import Image

logger = logging.getLogger(__name__)

SAM3_1_REPO = "AEmotionStudio/sam3.1"
SAM3_1_CKPT = "sam3.1_multiplex.pt"


class SegmentationService:
    def __init__(
        self,
        model_device: str = "cuda",
        model_cache_dir: str = "/models",
        checkpoint_path: str | None = None,
    ):
        self.model_device = model_device
        self.model_cache_dir = Path(model_cache_dir)
        self._checkpoint_path = Path(checkpoint_path) if checkpoint_path else None
        self._predictor = None
        self._inference_state = None
        self._autocast = None

    def _get_checkpoint_path(self) -> Path:
        checkpoint_path = self._checkpoint_path or self.model_cache_dir / SAM3_1_CKPT

        if not checkpoint_path.exists():
            raise FileNotFoundError(
                f"SAM 3.1 checkpoint not found at {checkpoint_path}. "
                "Mount the downloaded model into the backend container."
            )

        return checkpoint_path

    def load_model(self):
        if self._predictor is not None:
            return

        if self.model_device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError(
                "MODEL_DEVICE=cuda but CUDA is not available inside the backend container"
            )

        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True

        if self.model_device == "cuda":
            self._autocast = torch.autocast("cuda", dtype=torch.bfloat16)
            self._autocast.__enter__()

        from sam3 import build_sam3_predictor

        ckpt_path = self._get_checkpoint_path()
        logger.info(
            "Loading SAM 3.1 predictor from %s (device=%s)",
            ckpt_path,
            self.model_device,
        )

        self._predictor = build_sam3_predictor(
            checkpoint_path=str(ckpt_path),
            version="sam3.1",
            compile=False,
            use_fa3=False,
        )
        logger.info("SAM 3.1 predictor loaded successfully")

    def set_image(self, image: Image.Image):
        self.load_model()

        import tempfile

        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                image.save(f, format="PNG")
                temp_path = f.name

            self._inference_state = self._predictor.model.init_state(
                resource_path=temp_path,
                offload_video_to_cpu=False,
            )
        finally:
            if temp_path:
                Path(temp_path).unlink(missing_ok=True)

    def clean_text_prompt(self, text: str) -> str:
        if not text:
            return text
        import re
        cleaned = text.strip().lower()
        prefixes = [
            r"^xóa\s+bỏ\s+", r"^xóa\s+", r"^bỏ\s+", r"^gỡ\s+", r"^lấy\s+đi\s+", r"^cắt\s+",
            r"^delete\s+the\s+", r"^delete\s+", r"^remove\s+the\s+", r"^remove\s+",
            r"^erase\s+the\s+", r"^erase\s+", r"^clear\s+the\s+", r"^clear\s+",
            r"^get\s+rid\s+of\s+the\s+", r"^get\s+rid\s+of\s+",
        ]
        for pattern in prefixes:
            cleaned = re.sub(pattern, "", cleaned)
        suffixes = [
            r"\s+đi$", r"\s+dùm$", r"\s+hộ$", r"\s+cho\s+tôi$", r"\s+nhé$", r"\s+nha$"
        ]
        for pattern in suffixes:
            cleaned = re.sub(pattern, "", cleaned)
        cleaned = cleaned.strip(".,!? ")
        return cleaned if cleaned else text

    def _translate_to_english(self, text: str) -> str:
        import json
        import urllib.parse
        import urllib.request

        try:
            encoded_text = urllib.parse.quote(text)
            url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q={encoded_text}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode("utf-8"))
                translated = data[0][0][0]
                logger.info("Translated text prompt: '%s' -> '%s'", text, translated)
                return translated
        except Exception as e:
            logger.warning("Failed to translate text prompt '%s': %s", text, e)
            return text

    def predict(
        self,
        point_coords: list[list[float]] | None = None,
        point_labels: list[int] | None = None,
        box: list[float] | None = None,
        text_prompt: str | None = None,
    ) -> dict:
        self.load_model()
        if self._inference_state is None:
            raise RuntimeError("No image set. Call set_image() first.")

        H = self._inference_state["orig_height"]
        W = self._inference_state["orig_width"]

        points_xy = None
        labels = point_labels
        boxes_xywh = None
        box_labels = None

        if point_coords is not None:
            points_xy = [[x / W, y / H] for x, y in point_coords]
            labels = labels or [1] * len(points_xy)
            points_xy = torch.tensor(
                points_xy,
                dtype=torch.float32,
                device=self.model_device,
            )
            labels = torch.tensor(labels, dtype=torch.int32, device=self.model_device)

        if box is not None:
            x1, y1, x2, y2 = box
            bw = max(x2 - x1, 1.0)
            bh = max(y2 - y1, 1.0)
            boxes_xywh = [[x1 / W, y1 / H, bw / W, bh / H]]
            box_labels = [1]

        if points_xy is not None:
            boxes_xywh = None
            box_labels = None
            text_str = None
        else:
            if text_prompt:
                cleaned_prompt = self.clean_text_prompt(text_prompt)
                lower_cleaned = cleaned_prompt.lower()
                if lower_cleaned in ["chậu hoa", "chậu bông", "bông hoa trong chậu", "hoa trong chậu", "chậu hoa hồng", "chậu hoa cảnh"]:
                    text_str = "flower pot and flowers, potted plant"
                elif lower_cleaned in ["chậu cây", "cây trong chậu"]:
                    text_str = "potted plant, plant in a pot"
                else:
                    translated = self._translate_to_english(cleaned_prompt)
                    lower_translated = translated.lower()
                    if lower_translated in ["flower pot", "flowerpot", "potted flower", "potted flowers", "flowers in a pot"]:
                        text_str = "flower pot and flowers, potted plant"
                    elif lower_translated in ["potted plant", "potted plants", "plant in a pot"]:
                        text_str = "potted plant, plant in a pot"
                    else:
                        text_str = translated
            else:
                text_str = None

        obj_id = 1
        frame_idx, outputs = self._predictor.model.add_prompt(
            inference_state=self._inference_state,
            frame_idx=0,
            text_str=text_str,
            points=points_xy,
            point_labels=labels,
            boxes_xywh=boxes_xywh,
            box_labels=box_labels,
            clear_old_points=True,
            clear_old_boxes=True,
            obj_id=obj_id,
            rel_coordinates=True,
        )
        formatted = self._format_output({"outputs": outputs})
        if formatted["best_mask"] is None and points_xy is not None:
            interactive_output = self._format_interactive_output(frame_idx, obj_id)
            if interactive_output is not None:
                return interactive_output
        return formatted

    @staticmethod
    def _format_output(response: dict) -> dict:
        outputs = response.get("outputs", {})
        if outputs is None:
            out_binary_masks = None
            out_probs = None
        else:
            out_binary_masks = outputs.get("out_binary_masks")
            out_probs = outputs.get("out_probs")

        if out_binary_masks is not None:
            out_binary_masks = SegmentationService._to_numpy(out_binary_masks)

        if out_binary_masks is None or out_binary_masks.size == 0:
            return {
                "masks": np.array([]),
                "best_mask": None,
                "best_score": 0.0,
                "best_mask_idx": -1,
            }

        masks = np.asarray(out_binary_masks, dtype=bool)
        if masks.ndim == 2:
            masks = masks[None, ...]
        elif masks.ndim == 4 and masks.shape[1] == 1:
            masks = masks[:, 0, ...]

        scores = (
            np.asarray(
                SegmentationService._to_numpy(out_probs), dtype=np.float64
            ).reshape(-1)
            if out_probs is not None
            else np.ones(len(masks))
        )
        if scores.size != len(masks):
            scores = np.ones(len(masks))

        best_idx = int(scores.argmax())
        return {
            "masks": masks,
            "scores": scores.tolist(),
            "best_mask": masks[best_idx],
            "best_score": float(scores[best_idx]),
            "best_mask_idx": best_idx,
        }

    @property
    def is_loaded(self) -> bool:
        return self._predictor is not None

    @property
    def checkpoint_path(self) -> Path:
        return self._checkpoint_path or self.model_cache_dir / SAM3_1_CKPT

    def _format_interactive_output(self, frame_idx: int, obj_id: int) -> dict | None:
        if self._inference_state is None:
            return None

        for child_state in self._inference_state.get("sam2_inference_states", []):
            obj_id_to_idx = child_state.get("obj_id_to_idx", {})
            obj_idx = obj_id_to_idx.get(obj_id)
            if obj_idx is None:
                continue

            object_outputs = child_state.get("output_dict_per_obj", {}).get(obj_idx, {})
            frame_output = object_outputs.get("cond_frame_outputs", {}).get(frame_idx)
            if frame_output is None:
                frame_output = object_outputs.get("non_cond_frame_outputs", {}).get(
                    frame_idx
                )
            if not frame_output:
                continue

            mask_logits = frame_output.get("pred_masks_video_res")
            if mask_logits is None:
                mask_logits = frame_output.get("pred_masks")
            if mask_logits is None:
                continue

            mask = self._soft_mask_from_logits(mask_logits)
            score = 1.0
            score_logits = frame_output.get("object_score_logits")
            if score_logits is not None:
                score_tensor = torch.sigmoid(score_logits.detach().float()).max()
                score = float(score_tensor.cpu())

            return {
                "masks": mask[None, ...],
                "scores": [score],
                "best_mask": mask,
                "best_score": score,
                "best_mask_idx": 0,
            }

        return None

    def _soft_mask_from_logits(self, mask_logits) -> np.ndarray:
        if self._inference_state is None:
            raise RuntimeError("No image set. Call set_image() first.")

        logits = (
            mask_logits.detach().float()
            if isinstance(mask_logits, torch.Tensor)
            else torch.as_tensor(mask_logits, dtype=torch.float32)
        )
        while logits.ndim > 4:
            logits = logits.squeeze(0)
        if logits.ndim == 2:
            logits = logits[None, None, ...]
        elif logits.ndim == 3:
            logits = logits[:, None, ...]

        target_size = (
            int(self._inference_state["orig_height"]),
            int(self._inference_state["orig_width"]),
        )
        if tuple(logits.shape[-2:]) != target_size:
            logits = torch.nn.functional.interpolate(
                logits,
                size=target_size,
                mode="bilinear",
                align_corners=False,
            )

        return torch.sigmoid(logits).squeeze().detach().cpu().numpy()

    @staticmethod
    def _to_numpy(value):
        if isinstance(value, torch.Tensor):
            return value.detach().cpu().numpy()
        return np.asarray(value)

    def unload_model(self):
        """Unload model from GPU and free CUDA memory."""
        if self._predictor is not None:
            if hasattr(self._predictor, 'model'):
                self._predictor.model.to("cpu")
            self._predictor = None
        if self._inference_state is not None:
            self._inference_state = None
        if self._autocast is not None:
            self._autocast.__exit__(None, None, None)
            self._autocast = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
        logger.info("SAM 3.1 unloaded from GPU")
