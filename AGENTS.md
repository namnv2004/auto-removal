# Agent Instructions

This project builds a quality-first object-removal image app.

Priorities:

- Keep the app runnable before integrating heavy AI models.
- Prefer small, testable changes.
- Do not commit model weights, generated image data, secrets, or cloned external repos.
- Keep it simple: minikube for K8s deployment. AWS/EKS is a later phase.
- Backend APIs should remain compatible with future SAM/BrushNet/PowerPaint integration.

Current model strategy:

- Segmentation: SAM 3 if available, fallback SAM 2.1 Large or HQ-SAM.
- Inpainting: BrushNet-SDXL or PowerPaint-SDXL as primary, Big-LaMa as fallback/prefill.

## Project Structure

```
auto-removal/
  backend/         — FastAPI image processing backend
  frontend/        — Frontend UI (Vite + React 19 + TypeScript)
  k8s/             — Kubernetes manifests (minikube)
  scripts/         — Build & deploy scripts
  docs/            — Documentation
```

## Commands

```bash
# Kubernetes (minikube)
minikube start
bash scripts/minikube-build-images.sh
bash scripts/minikube-deploy.sh

# Tests
cd backend && uv sync && uv run pytest
```

## Subagents

- `backend-engineer` — FastAPI backend, AI model integration
- `frontend-engineer` — Vite + React 19 + TypeScript frontend
- `debugger` — Debug tests, runtime errors
- `reviewer` — Code review (read-only)
- `devops-engineer` — Kubernetes (minikube)

## Behavioral Guidelines

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

*These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.*
