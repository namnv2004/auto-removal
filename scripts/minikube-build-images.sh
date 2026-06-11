#!/usr/bin/env bash

set -euo pipefail

MINIKUBE_PROFILE="${MINIKUBE_PROFILE:-minikube}"

eval "$(minikube -p "${MINIKUBE_PROFILE}" docker-env)"

docker build \
  -t object-removal-demo-backend:latest \
  -f backend/Dockerfile \
  .

docker build \
  --build-arg VITE_API_URL="" \
  --build-arg VITE_BASE_PATH="/object-removal/" \
  -t object-removal-demo-frontend:latest \
  -f frontend/Dockerfile \
  .
