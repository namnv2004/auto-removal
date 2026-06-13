from fastapi import APIRouter

from app.api.routes import inpainting, login, segmentation, users, utils

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(segmentation.router)
api_router.include_router(inpainting.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
