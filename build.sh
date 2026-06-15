#!/usr/bin/env bash
set -e

echo "=== Building frontend ==="
cd frontend
npm ci
npm run build

echo "=== Build output: ../static/ ==="
echo "=== Starting backend ==="
cd ..
exec python main.py "$@"
