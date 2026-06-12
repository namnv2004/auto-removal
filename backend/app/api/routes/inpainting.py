import logging
import os
from typing import Annotated

import anyio
import torch
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.api.deps import InpaintingServiceDep
from app.api.image_utils import image_to_base64_png, read_image, read_mask
from app.core.concurrency import gpu_lock
from app.core.config import settings
from app.schemas.inpainting import InpaintingResponse, InpaintingStatusResponse

logger = logging.getLogger(__name__)

# Enable expandable segments to avoid CUDA memory fragmentation
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True,max_split_size_mb:128")

router = APIRouter(
    prefix="/inpainting",
    tags=["inpainting"],
)


@router.get("/status", response_model=InpaintingStatusResponse)
def inpainting_status(service: InpaintingServiceDep) -> InpaintingStatusResponse:
    return InpaintingStatusResponse(
        model=settings.INPAINTING_MODEL,
        device=settings.MODEL_DEVICE,
        cuda_available=torch.cuda.is_available(),
        loaded=service.is_loaded,
    )


@router.post("/remove", response_model=InpaintingResponse)
async def remove_object(
    service: InpaintingServiceDep,
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
    """Remove the masked object using ObjectClear inpainting."""
    original = await read_image(image)
    mask_img = await read_mask(mask, (original.width, original.height))

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
    finally:
        if settings.CLEAR_CUDA_CACHE_AFTER_REQUEST and torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()

    return InpaintingResponse(
        result_png_base64=image_to_base64_png(result["result_image"]),
        debug_crop_png_base64=image_to_base64_png(result["debug_crop"]),
        width=original.width,
        height=original.height,
        duration_ms=result["duration_ms"],
        seed_used=result["seed_used"],
    )
