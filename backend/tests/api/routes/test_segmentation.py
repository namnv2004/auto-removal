from io import BytesIO
from unittest.mock import MagicMock, patch

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from app.api.deps import get_segmentation_service
from app.core.config import settings
from app.main import app


def test_predict_segmentation_with_text_prompt(client: TestClient) -> None:
    # Create a small dummy image in memory
    img = Image.new("RGB", (100, 100), color="red")
    img_byte_arr = BytesIO()
    img.save(img_byte_arr, format="PNG")
    img_byte_arr.seek(0)

    dummy_mask = np.ones((100, 100), dtype=bool)
    mocked_result = {
        "masks": np.array([dummy_mask]),
        "scores": [0.99],
        "best_mask": dummy_mask,
        "best_score": 0.99,
        "best_mask_idx": 0,
    }

    mock_service = MagicMock()
    mock_service.predict.return_value = mocked_result
    mock_service.is_loaded = True
    mock_service.checkpoint_path.exists.return_value = True

    app.dependency_overrides[get_segmentation_service] = lambda: mock_service
    try:
        with patch("app.api.deps.settings.SEGMENTATION_MODEL", "sam3.1"):
            # Post request to /segmentation/predict
            files = {"image": ("test.png", img_byte_arr, "image/png")}
            data = {
                "text_prompt": "red square",
                "mask_threshold": 0.35,
                "feather_radius": 0.0,
            }
            response = client.post(
                f"{settings.API_V1_STR}/segmentation/predict",
                files=files,
                data=data,
            )

            assert response.status_code == 200
            json_resp = response.json()
            assert "mask_png_base64" in json_resp
            assert "overlay_png_base64" in json_resp
            assert json_resp["best_score"] == 0.99
            mock_service.predict.assert_called_once()
            kwargs = mock_service.predict.call_args[1]
            assert kwargs["text_prompt"] == "red square"
    finally:
        app.dependency_overrides.clear()


def test_predict_segmentation_conflict_error(client: TestClient) -> None:
    # Create a small dummy image in memory
    img = Image.new("RGB", (100, 100), color="red")
    img_byte_arr = BytesIO()
    img.save(img_byte_arr, format="PNG")
    img_byte_arr.seek(0)

    # Post request with both points and text_prompt
    files = {"image": ("test.png", img_byte_arr, "image/png")}
    data = {
        "points": "[[50, 50]]",
        "point_labels": "[1]",
        "text_prompt": "red square",
    }
    response = client.post(
        f"{settings.API_V1_STR}/segmentation/predict",
        files=files,
        data=data,
    )
    assert response.status_code == 422
    assert "Point prompts and text prompt cannot be used together" in response.json()["detail"]
