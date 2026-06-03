#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXTERNAL_DIR="${ROOT_DIR}/external"

mkdir -p "${EXTERNAL_DIR}"

clone_or_update() {
  local name="$1"
  local url="$2"
  local branch="${3:-}"
  local target="${EXTERNAL_DIR}/${name}"

  if [ -d "${target}/.git" ]; then
    git -C "${target}" fetch --depth 1 origin
    if [ -n "${branch}" ]; then
      git -C "${target}" checkout "${branch}"
      git -C "${target}" pull --ff-only origin "${branch}"
    else
      git -C "${target}" pull --ff-only
    fi
    return
  fi

  if [ -n "${branch}" ]; then
    git clone --depth 1 --branch "${branch}" "${url}" "${target}"
  else
    git clone --depth 1 "${url}" "${target}"
  fi
}

clone_or_update "sam2" "https://github.com/facebookresearch/sam2.git" "sam2.1"
clone_or_update "lama" "https://github.com/advimman/lama.git"
clone_or_update "BrushNet" "https://github.com/TencentARC/BrushNet.git"
clone_or_update "PowerPaint" "https://github.com/open-mmlab/PowerPaint.git"

printf 'Model source repos are ready in %s\n' "${EXTERNAL_DIR}"
printf 'Do not commit checkpoints or generated image data. Use models/ for local weights.\n'
