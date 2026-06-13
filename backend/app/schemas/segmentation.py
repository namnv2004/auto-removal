from pydantic import BaseModel


class SegmentationStatus(BaseModel):
    model: str
    device: str
    cuda_available: bool
    cuda_device_count: int
    checkpoint_path: str
    checkpoint_exists: bool
    loaded: bool


class SegmentationPredictResponse(BaseModel):
    width: int
    height: int
    processed_width: int
    processed_height: int
    best_score: float
    mask_png_base64: str
    overlay_png_base64: str
