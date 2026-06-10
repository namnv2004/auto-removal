import base64
import os
import sys
import time
from io import BytesIO
from pathlib import Path
import json

import httpx
from PIL import Image

# Add backend to path to read config if needed
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

def load_env():
    import os
    env_path = Path(__file__).parent.parent.parent / ".env"
    env_vars = {}
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if line.strip() and not line.startswith("#"):
                    key, val = line.strip().split("=", 1)
                    env_vars[key.strip()] = val.strip().strip('"').strip("'")
    
    # Fallback/override with process environment variables
    for key in ["FIRST_SUPERUSER", "FIRST_SUPERUSER_PASSWORD", "BACKEND_PORT"]:
        if key in os.environ:
            env_vars[key] = os.environ[key]
    return env_vars

def get_token(client: httpx.Client, env_vars: dict, api_base: str) -> str:
    username = env_vars.get("FIRST_SUPERUSER", "admin@example.com")
    password = env_vars.get("FIRST_SUPERUSER_PASSWORD", "changethis")
    print(f"Logging in as {username}...")
    
    response = client.post(
        f"{api_base}/login/access-token",
        data={"username": username, "password": password}
    )
    response.raise_for_status()
    token = response.json()["access_token"]
    print("Login successful.")
    return token

def run_unified_test(
    client: httpx.Client,
    headers: dict,
    api_base: str,
    image_path: Path,
    output_dir: Path,
    test_name: str,
    prompt_params: dict
):
    print(f"\nRunning test '{test_name}' on {image_path.name}...")
    t0 = time.monotonic()
    
    with open(image_path, "rb") as f:
        files = {"image": (image_path.name, f, "image/jpeg")}
        
        response = client.post(
            f"{api_base}/inpainting/remove-unified",
            headers=headers,
            files=files,
            data=prompt_params,
            timeout=600.0
        )
        
    duration = time.monotonic() - t0
    
    if response.status_code != 200:
        print(f"ERROR: Request failed with status {response.status_code}: {response.text}")
        return False
        
    data = response.json()
    
    # Save results
    test_out_dir = output_dir / test_name
    test_out_dir.mkdir(parents=True, exist_ok=True)
    
    # Save original
    original = Image.open(image_path)
    original.save(test_out_dir / "01_original.jpg")
    
    # Decode and save mask
    mask_data = base64.b64decode(data["mask_png_base64"])
    mask = Image.open(BytesIO(mask_data))
    mask.save(test_out_dir / "02_mask.png")
    
    # Decode and save overlay
    overlay_data = base64.b64decode(data["overlay_png_base64"])
    overlay = Image.open(BytesIO(overlay_data))
    overlay.save(test_out_dir / "03_overlay.png")
    
    # Decode and save result
    result_data = base64.b64decode(data["result_png_base64"])
    result = Image.open(BytesIO(result_data))
    result.save(test_out_dir / "04_result.jpg")
    
    # Save comparison side-by-side
    w, h = original.size
    comp = Image.new("RGB", (w * 2, h))
    comp.paste(original, (0, 0))
    comp.paste(result, (w, 0))
    comp.save(test_out_dir / "05_comparison.jpg")
    
    # Save metadata
    meta = {
        "duration_ms": data["duration_ms"],
        "script_duration_s": duration,
        "seed_used": data["seed_used"],
        "width": data["width"],
        "height": data["height"],
        "prompt_params": {k: v for k, v in prompt_params.items()}
    }
    with open(test_out_dir / "metadata.json", "w") as f:
        json.dump(meta, f, indent=2)
        
    print(f"✓ Completed in {duration:.1f}s (API reported {data['duration_ms']/1000:.1f}s), seed: {data['seed_used']}")
    return True

def main():
    env_vars = load_env()
    api_port = env_vars.get("BACKEND_PORT", "5000")
    api_base = f"http://localhost:{api_port}/api/v1"
    
    samples_dir = Path(__file__).parent / "samples"
    output_dir = Path(__file__).parent / "outputs" / "eval_unified"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    with httpx.Client(timeout=300.0) as client:
        try:
            token = get_token(client, env_vars, api_base)
        except Exception as e:
            print(f"ERROR: Cannot login to backend server: {e}")
            sys.exit(1)
            
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test Case 1: Dog image with text prompt (Optimized background matching)
        dog_img = samples_dir / "eval_dog.jpg"
        if dog_img.exists():
            try:
                run_unified_test(
                    client=client,
                    headers=headers,
                    api_base=api_base,
                    image_path=dog_img,
                    output_dir=output_dir,
                    test_name="dog_text_prompt",
                    prompt_params={
                        "text_prompt": "dog",
                        "prompt": "clean dirt gravel path, blurry background, seamless, highly detailed",
                        "steps": "40"
                    }
                )
            except Exception as e:
                print(f"FAILED dog_text_prompt: {e}")
            
            # Test Case 1b: Dog image with circle box (bounding box)
            try:
                img = Image.open(dog_img)
                w, h = img.size
                print(f"Dog image size: {w}x{h}")
                cx, cy = w // 2, h // 2
                # Circle box encompassing more of the dog
                circle_box = [cx - 200, cy - 250, cx + 200, cy + 250]
                run_unified_test(
                    client=client,
                    headers=headers,
                    api_base=api_base,
                    image_path=dog_img,
                    output_dir=output_dir,
                    test_name="dog_circle_prompt",
                    prompt_params={
                        "circle_box": json.dumps(circle_box),
                        "prompt": "clean gravel road, blurry background, seamless",
                        "steps": "40"
                    }
                )
            except Exception as e:
                print(f"FAILED dog_circle_prompt: {e}")
            
        # Test Case 2: Coffee cup with text prompt (Optimized table texture matching)
        coffee_img = samples_dir / "eval_coffee.jpg"
        if coffee_img.exists():
            try:
                run_unified_test(
                    client=client,
                    headers=headers,
                    api_base=api_base,
                    image_path=coffee_img,
                    output_dir=output_dir,
                    test_name="coffee_text_prompt",
                    prompt_params={
                        "text_prompt": "cup",
                        "prompt": "clean wooden table surface, natural wood texture, seamless",
                        "steps": "40"
                    }
                )
            except Exception as e:
                print(f"FAILED coffee_text_prompt: {e}")
            
        # Test Case 3: Car with text prompt (Optimized highway asphalt matching)
        car_img = samples_dir / "eval_car.jpg"
        if car_img.exists():
            try:
                run_unified_test(
                    client=client,
                    headers=headers,
                    api_base=api_base,
                    image_path=car_img,
                    output_dir=output_dir,
                    test_name="car_text_prompt",
                    prompt_params={
                        "text_prompt": "car",
                        "prompt": "empty highway road, dark asphalt pavement, blurry highway background, seamless",
                        "steps": "40"
                    }
                )
            except Exception as e:
                print(f"FAILED car_text_prompt: {e}")

if __name__ == "__main__":
    main()
