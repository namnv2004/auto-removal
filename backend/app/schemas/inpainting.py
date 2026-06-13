from pydantic import BaseModel


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

