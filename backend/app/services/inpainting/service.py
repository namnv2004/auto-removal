import logging
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageFilter

logger = logging.getLogger(__name__)


class InpaintingService:
    """ObjectClear inpainting service.

    Orchestrates the full object-removal pipeline:
    mask refinement -> crop -> inpaint -> blend.
    """

    def __init__(
        self,
        model_id: str = "jixin0101/ObjectClear",
        model_device: str = "cuda",
        model_cache_dir: str = "/models",
        hf_token: str | None = None,
        default_steps: int = 20,
        default_guidance_scale: float = 2.5,
        default_strength: float = 1.0,
        default_prompt: str = "clean natural background, realistic, seamless, consistent lighting, detailed texture",
        default_negative_prompt: str = "object, person, shadow, reflection, artifact, blur, distortion, duplicate, watermark, text, logo",
        default_dilation_px: int = 15,
        default_feather_radius: float = 5.0,
        default_prefill: bool = False,
        default_strength_prefill: float = 0.70,
    ):
        self._model_id = model_id
        self._model_device = model_device
        self._model_cache_dir = Path(model_cache_dir)
        self._hf_token = hf_token
        self._default_steps = default_steps
        self._default_guidance_scale = default_guidance_scale
        self._default_strength = default_strength
        self._default_prompt = default_prompt
        self._default_negative_prompt = default_negative_prompt
        self._default_dilation_px = default_dilation_px
        self._default_feather_radius = default_feather_radius
        self._default_prefill = default_prefill
        self._default_strength_prefill = default_strength_prefill
        self._pipe = None
        self._is_objectclear = "objectclear" in model_id.lower() or "object-clear" in model_id.lower()
        self._is_sdxl = ("stable-diffusion-xl" in model_id or "sdxl" in model_id) and not self._is_objectclear

    @property
    def is_loaded(self) -> bool:
        return self._pipe is not None

    def load_model(self) -> None:
        """Lazy-load the configured inpainting pipeline."""
        if self._pipe is not None:
            return

        if self._model_device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError(
                "MODEL_DEVICE=cuda but CUDA is not available inside the container"
            )

        model_id = self._model_id
        logger.info("Loading inpainting pipeline for model: %s...", model_id)

        torch_dtype = torch.float16 if self._model_device == "cuda" else torch.float32
        cache_dir_str = str(self._model_cache_dir) if self._model_cache_dir else None

        try:
            if self._is_objectclear:
                from .object_clear import ObjectClearPipeline
                variant = "fp16" if self._model_device == "cuda" else None
                self._pipe = ObjectClearPipeline.from_pretrained_with_custom_modules(
                    model_id,
                    torch_dtype=torch_dtype,
                    variant=variant,
                    cache_dir=cache_dir_str,
                )
                self._is_sdxl = False
            elif "stable-diffusion-xl" in model_id or "sdxl" in model_id:
                from diffusers import StableDiffusionXLInpaintPipeline
                self._pipe = StableDiffusionXLInpaintPipeline.from_pretrained(
                    model_id,
                    torch_dtype=torch_dtype,
                    token=self._hf_token or None,
                    cache_dir=cache_dir_str,
                )
                self._is_sdxl = True
            else:
                from diffusers import StableDiffusionInpaintPipeline
                self._pipe = StableDiffusionInpaintPipeline.from_pretrained(
                    model_id,
                    torch_dtype=torch_dtype,
                    token=self._hf_token or None,
                    cache_dir=cache_dir_str,
                )
                self._is_sdxl = False
            logger.info("Pipeline loaded successfully: %s", model_id)
        except Exception as e:
            logger.warning(
                "Failed to load configured model %s: %s. Falling back to ungated SD 1.5 inpainting model...",
                model_id,
                e,
            )
            from diffusers import StableDiffusionInpaintPipeline
            self._pipe = StableDiffusionInpaintPipeline.from_pretrained(
                "stable-diffusion-v1-5/stable-diffusion-inpainting",
                torch_dtype=torch_dtype,
                cache_dir=cache_dir_str,
            )
            self._is_objectclear = False
            self._is_sdxl = False
            logger.info("SD 1.5 Inpainting loaded as fallback")

        if self._model_device == "cuda":
            self._pipe.enable_model_cpu_offload()
            logger.info("Inpainting pipeline loaded with CPU offload (VRAM efficient)")
        else:
            self._pipe.to("cpu")
            logger.info("Inpainting pipeline loaded on CPU")

    def refine_mask(
        self,
        mask: Image.Image,
        dilation_px: int = 15,
        feather_radius: float = 5.0,
    ) -> tuple[Image.Image, Image.Image]:
        """Refine SAM mask: fill holes, remove noise, dilate, feather.

        Returns:
            (binary_mask, feathered_mask) — both L-mode PIL Images at same size as input.
        """
        import scipy.ndimage as ndimage

        mask_arr = np.array(mask.convert("L"))

        # 1. Binarize
        binary = (mask_arr > 128).astype(np.uint8)

        # 2. Fill interior holes
        filled = ndimage.binary_fill_holes(binary).astype(np.uint8)

        # 3. Keep all valid mask components (do not erase small selections)
        pass

        # 4. Dilate to cover object edges + subtle shadows
        if dilation_px > 0:
            struct = ndimage.generate_binary_structure(2, 1)
            filled = ndimage.binary_dilation(
                filled.astype(bool), structure=struct, iterations=dilation_px
            ).astype(np.uint8)

        binary_mask = Image.fromarray(filled * 255, mode="L")

        # 5. Feather edges for seamless blending
        feathered_mask = binary_mask.copy()
        if feather_radius > 0:
            feathered_mask = feathered_mask.filter(
                ImageFilter.GaussianBlur(radius=feather_radius)
            )

        return binary_mask, feathered_mask

    def apply_color_correction(
        self,
        gen_image: Image.Image,
        orig_image: Image.Image,
        mask: Image.Image,
    ) -> Image.Image:
        """Apply local color correction and texture matching to generated image.

        Uses a narrow boundary band immediately outside the mask to compute a constant
        color offset (bias), preserving generated texture contrast perfectly.
        """
        import cv2

        gen_np = np.array(gen_image).astype(np.float32)
        orig_np = np.array(orig_image).astype(np.float32)
        mask_np = np.array(mask.convert("L"))

        # Create boundary band using dilation
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        mask_d1 = cv2.dilate(mask_np, kernel, iterations=2)   # safety margin of ~6px
        mask_d2 = cv2.dilate(mask_np, kernel, iterations=12)  # band width of ~30px
        
        band = (mask_d2 > 128) & (mask_d1 <= 128)
        
        # Fallback if band is empty
        if not np.any(band):
            band = mask_np <= 128

        # Compute mean RGB on the boundary band
        orig_mean = np.mean(orig_np[band], axis=0)  # Shape: (3,)
        gen_mean = np.mean(gen_np[band], axis=0)    # Shape: (3,)
        
        # Apply constant color offset (no std dev scaling to prevent contrast flattening)
        color_offset = orig_mean - gen_mean
        
        # Add offset to the generated image
        corrected_np = gen_np + color_offset
        corrected_np = np.clip(corrected_np, 0.0, 255.0)

        # Apply subtle texture noise inside the mask to break smoothness
        h, w = mask_np.shape
        noise_std = 3.0
        noise = np.random.normal(0, noise_std, (h, w, 3)).astype(np.float32)
        
        mask_weight = (mask_np.astype(np.float32) / 255.0)[:, :, np.newaxis]
        corrected_np = corrected_np + noise * mask_weight
        corrected_np = np.clip(corrected_np, 0.0, 255.0)

        return Image.fromarray(corrected_np.astype(np.uint8))

    def _opencv_prefill(self, image: Image.Image, mask: Image.Image) -> Image.Image:
        """Pre-fill the masked region using OpenCV's fast inpainting.

        This prevents the diffusion model from seeing and hallucinating/drawing over the original object.
        """
        import cv2

        img_np = np.array(image.convert("RGB"))
        img_cv = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

        mask_np = np.array(mask.convert("L"))

        # Run inpainting with TELEA algorithm
        inpainted_cv = cv2.inpaint(img_cv, mask_np, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

        # Convert back to PIL RGB
        inpainted_rgb = cv2.cvtColor(inpainted_cv, cv2.COLOR_BGR2RGB)
        return Image.fromarray(inpainted_rgb)

    def compute_crop_region(
        self,
        mask: Image.Image,
        image_size: tuple[int, int],
        padding_ratio: float = 0.25,
        min_padding: int = 64,
        min_crop_size: int = 512,
    ) -> tuple[int, int, int, int]:
        """Compute bbox crop region from mask with padding and minimum size.

        Returns:
            (x1, y1, x2, y2) clamped to image bounds.
        """
        mask_arr = np.array(mask.convert("L"))
        nonzero = np.where(mask_arr > 0)

        img_w, img_h = image_size

        if len(nonzero[0]) == 0:
            # Empty mask — use full image
            return (0, 0, img_w, img_h)

        y1_bb, y2_bb = int(nonzero[0].min()), int(nonzero[0].max())
        x1_bb, x2_bb = int(nonzero[1].min()), int(nonzero[1].max())

        bbox_w = x2_bb - x1_bb
        bbox_h = y2_bb - y1_bb
        pad_x = max(int(bbox_w * padding_ratio), min_padding)
        pad_y = max(int(bbox_h * padding_ratio), min_padding)

        cx1 = max(0, x1_bb - pad_x)
        cy1 = max(0, y1_bb - pad_y)
        cx2 = min(img_w, x2_bb + pad_x)
        cy2 = min(img_h, y2_bb + pad_y)

        # Enforce minimum crop size
        crop_w = cx2 - cx1
        crop_h = cy2 - cy1

        if crop_w < min_crop_size and img_w >= min_crop_size:
            diff_w = min_crop_size - crop_w
            left_pad = diff_w // 2
            right_pad = diff_w - left_pad
            cx1 = max(0, cx1 - left_pad)
            cx2 = min(img_w, cx2 + right_pad)
            crop_w = cx2 - cx1
            if crop_w < min_crop_size:
                if cx1 == 0:
                    cx2 = min(img_w, min_crop_size)
                elif cx2 == img_w:
                    cx1 = max(0, img_w - min_crop_size)

        if crop_h < min_crop_size and img_h >= min_crop_size:
            diff_h = min_crop_size - crop_h
            top_pad = diff_h // 2
            bottom_pad = diff_h - top_pad
            cy1 = max(0, cy1 - top_pad)
            cy2 = min(img_h, cy2 + bottom_pad)
            crop_h = cy2 - cy1
            if crop_h < min_crop_size:
                if cy1 == 0:
                    cy2 = min(img_h, min_crop_size)
                elif cy2 == img_h:
                    cy1 = max(0, img_h - min_crop_size)

        return (cx1, cy1, cx2, cy2)

    def _run_pipeline(
        self,
        image: Image.Image,
        mask: Image.Image,
        prompt: str,
        negative_prompt: str,
        steps: int,
        guidance_scale: float,
        strength: float,
        seed: int,
    ) -> Image.Image:
        """Call inpainting pipeline synchronously (handles ObjectClear & SD)."""
        self.load_model()
        
        gen_device = "cpu" if self._model_device == "cpu" else "cuda"
        generator = torch.Generator(device=gen_device).manual_seed(seed)
        
        if self._is_objectclear:
            output = self._pipe(
                prompt="remove the instance of object",
                image=image,
                mask_image=mask,
                generator=generator,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                strength=strength,
                height=image.height,
                width=image.width,
                return_attn_map=True,
            )
        else:
            output = self._pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                image=image,
                mask_image=mask,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                strength=strength,
                generator=generator,
            )
        return output.images[0]

    def blend_result(
        self,
        original: Image.Image,
        inpaint_crop: Image.Image,
        crop_box: tuple[int, int, int, int],
        feathered_mask: Image.Image,
        binary_mask: Image.Image,
    ) -> Image.Image:
        """Alpha-composite inpaint crop back into original image with local color correction.

        Uses feathered mask for seamless blending at mask edges.
        """
        x1, y1, x2, y2 = crop_box
        crop_w = x2 - x1
        crop_h = y2 - y1

        orig_crop = original.crop(crop_box)
        mask_crop = binary_mask.crop(crop_box)

        resized = inpaint_crop.resize((crop_w, crop_h), Image.Resampling.LANCZOS)
        
        # If model is ObjectClear, it has already applied its own wavelet color fix and attention fusion
        if self._is_objectclear:
            corrected = resized
        else:
            # Apply local color correction & texture grain matching at the crop level for standard SD models
            corrected = self.apply_color_correction(resized, orig_crop, mask_crop)
        
        output = original.copy()
        crop_alpha = feathered_mask.convert("L").crop((x1, y1, x2, y2))
        output.paste(corrected, (x1, y1), mask=crop_alpha)
        return output

    def remove_object(
        self,
        image: Image.Image,
        mask: Image.Image,
        prompt: str | None = None,
        negative_prompt: str | None = None,
        steps: int | None = None,
        guidance_scale: float | None = None,
        strength: float | None = None,
        seed: int | None = None,
        mask_dilation: int | None = None,
        mask_feather: float | None = None,
        prefill: bool | None = None,
        strength_prefill: float | None = None,
    ) -> dict:
        """Full pipeline: refine mask -> crop -> inpaint -> blend.

        Returns:
            dict with keys:
                result_image (Image.Image): final full-size result
                debug_crop (Image.Image): 1024x1024 inpaint output (debug)
                duration_ms (int): total wall time in milliseconds
                seed_used (int): seed used (for reproducibility / retry)
                crop_box (tuple): (x1, y1, x2, y2)
        """
        t_start = time.monotonic()
        image = image.convert("RGB")

        # Load model early to check which model type is active
        self.load_model()

        # Resolve params
        _steps = steps if steps is not None else self._default_steps
        if guidance_scale is not None:
            _guidance = guidance_scale
        else:
            _guidance = self._default_guidance_scale if (self._is_sdxl or self._is_objectclear) else 7.5

        _strength = strength if strength is not None else self._default_strength
        _prompt = prompt or self._default_prompt
        _neg = negative_prompt or self._default_negative_prompt
        _dilation = (
            mask_dilation if mask_dilation is not None else self._default_dilation_px
        )
        _feather = (
            mask_feather if mask_feather is not None else self._default_feather_radius
        )
        _seed = seed if seed is not None else int(torch.randint(0, 2**31, (1,)).item())
        _prefill = prefill if prefill is not None else self._default_prefill
        _strength_prefill = strength_prefill if strength_prefill is not None else self._default_strength_prefill

        # Step 1: Refine mask
        binary_mask, feathered_mask = self.refine_mask(mask, _dilation, _feather)

        if self._is_objectclear:
            # Dynamically scale dilation and feathering based on image size to ensure a clean boundary
            short_side = min(image.width, image.height)
            scale = short_side / 512.0
            
            oc_dilation = max(int(8 * scale), _dilation)
            oc_feather = max(6.0 * scale, _feather)
            
            # Re-refine mask with the scaled parameters for high-quality ObjectClear boundary blending
            binary_mask, feathered_mask = self.refine_mask(mask, oc_dilation, oc_feather)

        # Step 2: Compute full merged crop region (for compatibility/metadata)
        merged_crop_box = self.compute_crop_region(binary_mask, image.size)

        import scipy.ndimage as ndimage
        binary_arr = np.array(binary_mask.convert("L")) > 128
        labeled, num_features = ndimage.label(binary_arr)

        current_image = image.copy()
        target_size = 1024 if self._is_sdxl else 512
        last_inpaint_result = None
        last_crop_box = merged_crop_box

        # Extract features and their pixel sizes
        features = []
        for i in range(1, num_features + 1):
            size = np.sum(labeled == i)
            if size > 0:
                features.append((i, size))

        # Sort features by size descending
        features.sort(key=lambda x: x[1], reverse=True)

        if not features:
            # Empty mask — return original image
            last_inpaint_result = current_image.crop(merged_crop_box).resize(
                (target_size, target_size), Image.Resampling.LANCZOS
            )
        else:
            # Filter features: keep only those with size >= 100 pixels (unless largest is < 100)
            largest_size = features[0][1]
            min_size_threshold = 100
            if largest_size < min_size_threshold:
                filtered_features = [f[0] for f in features]
            else:
                filtered_features = [f[0] for f in features if f[1] >= min_size_threshold]

            # Limit maximum number of diffusion components to 4 to bound latency
            filtered_features = filtered_features[:4]

            # Fast prefill for excluded (tiny/extra) features
            excluded_mask_arr = np.zeros_like(binary_arr, dtype=np.uint8)
            for i in range(1, num_features + 1):
                if i not in filtered_features:
                    excluded_mask_arr[labeled == i] = 255

            if np.any(excluded_mask_arr > 0):
                excluded_mask = Image.fromarray(excluded_mask_arr, mode="L")
                logger.info("Applying fast OpenCV TELEA prefill for small/extra mask components...")
                current_image = self._opencv_prefill(current_image, excluded_mask)

            # Sequentially process each filtered component
            model_name = "SDXL" if self._is_sdxl else "SD 1.5"
            for idx, comp_idx in enumerate(filtered_features):
                # Extract mask for this component
                comp_mask_arr = (labeled == comp_idx).astype(np.uint8) * 255
                comp_mask = Image.fromarray(comp_mask_arr, mode="L")

                # Compute feathered mask for this component
                comp_feathered = comp_mask.copy()
                if _feather > 0:
                    comp_feathered = comp_feathered.filter(
                        ImageFilter.GaussianBlur(radius=_feather)
                    )

                # Compute crop region for this component
                comp_crop_box = self.compute_crop_region(comp_mask, current_image.size)
                last_crop_box = comp_crop_box

                # Crop & resize component
                crop_image = current_image.crop(comp_crop_box).resize(
                    (target_size, target_size), Image.Resampling.LANCZOS
                )
                crop_mask = comp_mask.crop(comp_crop_box).resize(
                    (target_size, target_size), Image.Resampling.LANCZOS
                )

                comp_strength = _strength
                if _prefill:
                    logger.info("Applying OpenCV TELEA prefill to crop image...")
                    crop_image = self._opencv_prefill(crop_image, crop_mask)
                    comp_strength = _strength_prefill

                logger.info(
                    "Inpainting crop component %d/%d %s with %s (steps=%d, cfg=%.1f, strength=%.2f, seed=%d, prefill=%s)",
                    idx + 1,
                    len(filtered_features),
                    comp_crop_box,
                    model_name,
                    _steps,
                    _guidance,
                    comp_strength,
                    _seed + idx,
                    _prefill,
                )

                # Step 4: Inpaint
                last_inpaint_result = self._run_pipeline(
                    image=crop_image,
                    mask=crop_mask,
                    prompt=_prompt,
                    negative_prompt=_neg,
                    steps=_steps,
                    guidance_scale=_guidance,
                    strength=comp_strength,
                    seed=_seed + idx,
                )

                # Step 5: Blend back into current image
                current_image = self.blend_result(
                    current_image, last_inpaint_result, comp_crop_box, comp_feathered, comp_mask
                )

        duration_ms = int((time.monotonic() - t_start) * 1000)
        logger.info("Object removal completed in %dms", duration_ms)

        return {
            "result_image": current_image,
            "debug_crop": last_inpaint_result,
            "duration_ms": duration_ms,
            "seed_used": _seed,
            "crop_box": last_crop_box,
        }
