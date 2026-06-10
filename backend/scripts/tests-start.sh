#! /usr/bin/env bash
set -e
set -x

python app/pre_start.py

bash scripts/test.sh "$@"
