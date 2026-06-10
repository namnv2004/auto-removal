#!/usr/bin/env bash

set -euo pipefail

NAMESPACE="${K8S_NAMESPACE:-object-removal-demo}"

bash scripts/minikube-build-images.sh

kubectl apply -f k8s/namespace.yml
kubectl wait --for=jsonpath='{.status.phase}'=Active "namespace/${NAMESPACE}" --timeout=60s
kubectl apply -f k8s/config.yml
kubectl apply -f k8s/postgres.yml
kubectl apply -f k8s/backend.yml
kubectl apply -f k8s/frontend.yml

kubectl -n "${NAMESPACE}" rollout status deployment/db --timeout=180s
kubectl -n "${NAMESPACE}" rollout status deployment/backend --timeout=180s
kubectl -n "${NAMESPACE}" rollout status deployment/frontend --timeout=180s

cat <<MSG
Kubernetes stack is ready.

Open k9s with:
  k9s --context minikube -n ${NAMESPACE}

Frontend:
  http://$(minikube ip):30073

Backend docs:
  http://$(minikube ip):30080/docs
MSG
