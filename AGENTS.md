# Agent Instructions

This project builds a quality-first object-removal image demo.

Priorities:

- Keep the app runnable before integrating heavy AI models.
- Prefer small, testable changes.
- Do not commit model weights, generated image data, secrets, or cloned external repos.
- Keep it simple: Docker Compose for local dev, minikube for K8s deployment. AWS/EKS is a later phase.
- Backend APIs should remain compatible with future SAM/BrushNet/PowerPaint integration.

Current model strategy:

- Segmentation: SAM 3 if available, fallback SAM 2.1 Large or HQ-SAM.
- Inpainting: BrushNet-SDXL or PowerPaint-SDXL as primary, Big-LaMa as fallback/prefill.

## Project Structure

```
auto-removal/
  backend/         — FastAPI image processing backend
  frontend/        — Frontend UI (Vite + React 19 + TypeScript)
  compose.yml      — Docker Compose for local dev
  scripts/         — Utility scripts
  docs/            — Documentation
```

## Commands

```bash
# Backend
cd backend && uv sync
uv run uvicorn main:app --reload

# Frontend
cd frontend && npm run dev

# Docker
docker compose up -d
docker compose logs -f

# Kubernetes (minikube)
minikube start
kubectl apply -f k8s/
```

## Subagents

- `backend-engineer` — FastAPI backend, AI model integration
- `frontend-engineer` — Vite + React 19 + TypeScript frontend
- `debugger` — Debug tests, runtime errors
- `reviewer` — Code review (read-only)
- `devops-engineer` — Docker Compose, Kubernetes (minikube)
