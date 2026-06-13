from contextlib import asynccontextmanager
import sentry_sdk
from fastapi import FastAPI
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.config import settings
from app.core.readiness import set_models_not_ready, set_models_ready


def custom_generate_unique_id(route: APIRoute) -> str:
    return f"{route.tags[0]}-{route.name}"


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)


def _warmup_models() -> None:
    import logging

    import torch

    from app.api.deps import (
        _segmentation_service,
        get_inpainting_service,
        get_segmentation_service,
    )

    logger = logging.getLogger(__name__)
    logger.info("MODEL_WARMUP enabled: loading segmentation and inpainting models...")

    seg_service = get_segmentation_service()
    seg_service.load_model()

    inpaint_service = get_inpainting_service()
    inpaint_service.load_model()

    if settings.MODEL_DEVICE == "cuda" and not settings.MODEL_GPU_RESIDENT:
        try:
            if (
                _segmentation_service is not None
                and getattr(_segmentation_service, "_predictor", None) is not None
            ):
                logger.info("Unloading SAM 3.1 from GPU to CPU after warmup...")
                _segmentation_service._predictor.model.to("cpu")
                torch.cuda.empty_cache()
        except Exception as exc:
            logger.warning("Failed to unload SAM 3.1 from GPU after warmup: %s", exc)
    elif settings.MODEL_GPU_RESIDENT:
        logger.info("MODEL_GPU_RESIDENT: keeping SAM and ObjectClear on GPU")

    logger.info("Model warmup completed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import logging

    import anyio

    logger = logging.getLogger(__name__)

    # Run db initialization/seeding on startup inside the live container
    try:
        from sqlmodel import Session
        from app.core.db import engine, init_db

        def run_seeding() -> None:
            with Session(engine) as session:
                init_db(session)

        await anyio.to_thread.run_sync(run_seeding)
    except Exception as e:
        logger.exception("Failed to initialize/seed database on startup: %s", e)

    if settings.MODEL_WARMUP:
        set_models_not_ready()
        try:
            await anyio.to_thread.run_sync(_warmup_models)
            set_models_ready()
        except Exception as e:
            logger.exception("Model warmup failed: %s", e)
            set_models_ready()

    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
    lifespan=lifespan,
)

# Set all CORS enabled origins
if settings.all_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router, prefix=settings.API_V1_STR)
