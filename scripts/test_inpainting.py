#!/usr/bin/env python3
"""
End-to-end inpainting test: SAM 3.1 segment → ObjectClear inpaint → save results.

Run from the project root:
    python scripts/test_inpainting.py --image samples/coffee.jpg --point 400,300
    python scripts/test_inpainting.py --image samples/dog.jpg --box 100,100,500,600
    python scripts/test_inpainting.py --image samples/coffee.jpg --text "the cup"
    python scripts/test_inpainting.py --image samples/dog.jpg --point 400,300 --output outputs/test/
"""
import argparse
import sys
import time
from pathlib import Path

# Add backend to path so we can import app modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Test SAM 3.1 + SD3.5 Medium inpainting pipeline")
    parser.add_argument("--image", required=True, help="Path to input image")
    parser.add_argument("--point", help="Point prompt as x,y (e.g. 400,300)")
    parser.add_argument("--box", help="Box prompt as x1,y1,x2,y2")
    parser.add_argument("--text", help="Text prompt (e.g. 'the cup')")
    parser.add_argument("--output", default="outputs/test_inpaint", help="Output directory")
    parser.add_argument("--device", default="cuda", help="Device: cuda or cpu")
    parser.add_argument("--steps", type=int, default=40, help="Inpainting steps")
    parser.add_argument("--seed", type=int, default=None, help="Random seed")
    parser.add_argument("--dilation", type=int, default=15, help="Mask dilation px")
    args = parser.parse_args()

    image_path = Path(args.image)
    if not image_path.exists():
        print(f"ERROR: Image not found: {image_path}")
        sys.exit(1)

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    from PIL import Image

    print(f"\n{'='*60}")
    print(f"Input: {image_path}")
    print(f"Output: {output_dir}")
    print(f"Device: {args.device}")
    print(f"Steps: {args.steps}")
    print(f"{'='*60}\n")

    # ── Step 1: Load image ──────────────────────────────────────
    original = Image.open(image_path).convert("RGB")
    original.save(output_dir / "01_original.png")
    print(f"✓ Original: {original.size[0]}x{original.size[1]}px")

    # ── Step 2: SAM 3.1 segmentation ───────────────────────────
    print("\n[1/3] Running SAM 3.1 segmentation...")
    t0 = time.monotonic()

    from app.services.segmentation import SegmentationService

    seg_service = SegmentationService(model_device=args.device)
    seg_service.set_image(original)

    point_coords = None
    point_labels = None
    box = None
    text_prompt = None

    if args.point:
        x, y = map(int, args.point.split(","))
        point_coords = [[float(x), float(y)]]
        point_labels = [1]
        print(f"  Point prompt: ({x}, {y})")
    elif args.box:
        vals = list(map(float, args.box.split(",")))
        box = vals
        print(f"  Box prompt: {vals}")
    elif args.text:
        text_prompt = args.text
        print(f"  Text prompt: '{text_prompt}'")
    else:
        print("ERROR: Provide --point, --box, or --text")
        sys.exit(1)

    seg_result = seg_service.predict(
        point_coords=point_coords,
        point_labels=point_labels,
        box=box,
        text_prompt=text_prompt,
    )

    best_mask = seg_result.get("best_mask")
    if best_mask is None:
        print("ERROR: SAM returned no mask")
        sys.exit(1)

    import numpy as np

    mask_arr = (best_mask.astype(np.float32) * 255).astype(np.uint8)
    mask_img = Image.fromarray(mask_arr, mode="L")
    mask_img.save(output_dir / "02_mask_raw.png")

    seg_ms = int((time.monotonic() - t0) * 1000)
    area = float(best_mask.sum()) / best_mask.size * 100
    score = seg_result.get("best_score", 0.0)
    print(f"  ✓ Mask: area={area:.1f}%, score={score:.3f}, time={seg_ms}ms")

    # Unload SAM 3.1 from GPU to prevent OOM
    if args.device == "cuda" and hasattr(seg_service, "_predictor") and seg_service._predictor is not None:
        print("  ✓ Unloading SAM 3.1 from GPU to free VRAM...")
        seg_service._predictor.model.to("cpu")
        import torch
        torch.cuda.empty_cache()

    # ── Step 3: Inpainting ──────────────────────────────────────
    print("\n[2/3] Running SD 3.5 Medium inpainting...")
    t0 = time.monotonic()

    from app.services.inpainting import InpaintingService

    from app.core.config import settings

    inpaint_service = InpaintingService(
        model_device=args.device,
        default_steps=args.steps,
        default_dilation_px=args.dilation,
        hf_token=settings.HF_TOKEN,
    )

    result = inpaint_service.remove_object(
        image=original,
        mask=mask_img,
        seed=args.seed,
    )

    inpaint_ms = result["duration_ms"]
    print(f"  ✓ Inpainting done: {inpaint_ms}ms, seed={result['seed_used']}")
    print(f"  ✓ Crop region: {result['crop_box']}")

    # ── Step 4: Save debug artifacts ───────────────────────────
    # Refined mask
    from app.services.inpainting import InpaintingService as _IS
    _svc_tmp = _IS.__new__(_IS)
    _svc_tmp._default_dilation_px = args.dilation
    _svc_tmp._default_feather_radius = 5.0
    binary_mask, feathered_mask = inpaint_service.refine_mask(mask_img, args.dilation, 5.0)
    binary_mask.save(output_dir / "03_mask_refined.png")

    # Crop input
    crop_box = result["crop_box"]
    x1, y1, x2, y2 = crop_box
    crop_img = original.crop(crop_box).resize((1024, 1024), Image.Resampling.LANCZOS)
    crop_img.save(output_dir / "04_crop_input.png")
    crop_mask = binary_mask.crop(crop_box).resize((1024, 1024), Image.Resampling.LANCZOS)
    crop_mask.save(output_dir / "05_crop_mask.png")

    # SD3.5 output (debug crop at 1024x1024)
    result["debug_crop"].save(output_dir / "06_crop_output.png")

    # Final result
    result["result_image"].save(output_dir / "07_result.png")

    # Side-by-side comparison
    w, h = original.size
    comparison = Image.new("RGB", (w * 2, h))
    comparison.paste(original, (0, 0))
    comparison.paste(result["result_image"], (w, 0))
    comparison.save(output_dir / "08_comparison.png")

    print("\n[3/3] Saved debug artifacts:")
    for f in sorted(output_dir.iterdir()):
        size_kb = f.stat().st_size // 1024
        print(f"  {f.name} ({size_kb} KB)")

    print(f"\n{'='*60}")
    print(f"✅ Pipeline complete!")
    print(f"  Segmentation: {seg_ms}ms")
    print(f"  Inpainting:   {inpaint_ms}ms")
    print(f"  Total:        {seg_ms + inpaint_ms}ms")
    print(f"  Seed used:    {result['seed_used']}")
    print(f"  Results in:   {output_dir.resolve()}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
