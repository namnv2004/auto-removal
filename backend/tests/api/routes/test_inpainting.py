from io import BytesIO
from unittest.mock import MagicMock

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.api.deps import get_inpainting_service
from app.core.config import settings


def test_inpainting_status(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    mock_service = MagicMock()
    mock_service.is_loaded = True

    app.dependency_overrides[get_inpainting_service] = lambda: mock_service
    try:
        response = client.get(
            f"{settings.API_V1_STR}/inpainting/status",
            headers=superuser_token_headers,
        )

        assert response.status_code == 200
        json_resp = response.json()
        assert json_resp["model"] == settings.INPAINTING_MODEL
        assert json_resp["device"] == settings.MODEL_DEVICE
        assert json_resp["loaded"] is True
    finally:
        app.dependency_overrides.clear()


def test_inpainting_remove(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # Create small dummy images in memory
    img = Image.new("RGB", (100, 100), color="red")
    img_byte_arr = BytesIO()
    img.save(img_byte_arr, format="PNG")
    img_byte_arr.seek(0)

    mask = Image.new("L", (100, 100), color=255)
    mask_byte_arr = BytesIO()
    mask.save(mask_byte_arr, format="PNG")
    mask_byte_arr.seek(0)

    mocked_result = {
        "result_image": Image.new("RGB", (100, 100), color="blue"),
        "debug_crop": Image.new("RGB", (100, 100), color="green"),
        "duration_ms": 1234,
        "seed_used": 42,
        "crop_box": (10, 10, 90, 90),
    }

    mock_service = MagicMock()
    mock_service.remove_object.return_value = mocked_result

    app.dependency_overrides[get_inpainting_service] = lambda: mock_service
    try:
        files = {
            "image": ("test.png", img_byte_arr, "image/png"),
            "mask": ("mask.png", mask_byte_arr, "image/png"),
        }
        data = {
            "prompt": "clean background",
            "steps": 20,
            "guidance_scale": 4.5,
            "strength": 0.95,
            "mask_dilation": 15,
            "mask_feather": 5.0,
        }

        response = client.post(
            f"{settings.API_V1_STR}/inpainting/remove",
            headers=superuser_token_headers,
            files=files,
            data=data,
        )

        assert response.status_code == 200
        json_resp = response.json()
        assert "result_png_base64" in json_resp
        assert "debug_crop_png_base64" in json_resp
        assert json_resp["width"] == 100
        assert json_resp["height"] == 100
        assert json_resp["duration_ms"] == 1234
        assert json_resp["seed_used"] == 42
        mock_service.remove_object.assert_called_once()
    finally:
        app.dependency_overrides.clear()

