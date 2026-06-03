# Agent Instructions

This project builds a quality-first object-removal image demo.

Priorities:

- Keep the app runnable before integrating heavy AI models.
- Prefer small, testable changes.
- Do not commit model weights, generated image data, secrets, or cloned external repos.
- Keep AWS deployment simple first: EC2 GPU + Docker Compose + S3. EKS is a later phase.
- Backend APIs should remain compatible with future SAM/BrushNet/PowerPaint integration.

Current model strategy:

- Segmentation: SAM 3 if available, fallback SAM 2.1 Large or HQ-SAM.
- Inpainting: BrushNet-SDXL or PowerPaint-SDXL as primary, Big-LaMa as fallback/prefill.
