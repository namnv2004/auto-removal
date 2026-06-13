import base64
import logging
from io import BytesIO

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps

from app.core.config import settings

logger = logging.getLogger(__name__)


async def read_image(upload: UploadFile) -> Image.Image:
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


async def read_mask(upload: UploadFile, expected_size: tuple[int, int]) -> Image.Image:
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


def image_to_base64_png(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")
