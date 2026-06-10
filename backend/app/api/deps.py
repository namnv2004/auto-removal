from collections.abc import Generator
import threading
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlmodel import Session

from app.core import security
from app.core.config import settings
from app.core.db import engine
from app.models import TokenPayload, User
from app.services import SegmentationService, InpaintingService

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_current_user(session: SessionDep, token: TokenDep) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    user = session.get(User, token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_active_superuser(current_user: CurrentUser) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user


_segmentation_service: SegmentationService | None = None
_segmentation_lock = threading.Lock()

_inpainting_service: InpaintingService | None = None
_inpainting_lock = threading.Lock()


def get_segmentation_service() -> SegmentationService:
    if settings.SEGMENTATION_MODEL != "sam3.1":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only SEGMENTATION_MODEL=sam3.1 is supported in this demo",
        )
    global _segmentation_service
    with _segmentation_lock:
        if _segmentation_service is None:
            _segmentation_service = SegmentationService(
                model_device=settings.MODEL_DEVICE,
                model_cache_dir=settings.MODEL_CACHE_DIR,
                checkpoint_path=settings.SAM31_CHECKPOINT_PATH,
            )
    return _segmentation_service


def get_inpainting_service() -> InpaintingService:
    global _inpainting_service
    with _inpainting_lock:
        if _inpainting_service is None:
            _inpainting_service = InpaintingService(
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
    return _inpainting_service


SegmentationServiceDep = Annotated[SegmentationService, Depends(get_segmentation_service)]
InpaintingServiceDep = Annotated[InpaintingService, Depends(get_inpainting_service)]
