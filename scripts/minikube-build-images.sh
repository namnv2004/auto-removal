#!/usr/bin/env bash

set -euo pipefail

MINIKUBE_PROFILE="${MINIKUBE_PROFILE:-minikube}"

eval "$(minikube -p "${MINIKUBE_PROFILE}" docker-env)"

docker build \
  -t object-removal-demo-backend:latest \
  -f backend/Dockerfile \
  .

docker build \
  --target build-stage \
  -t object-removal-demo-frontend:latest \
  -f frontend/Dockerfile \
  .
