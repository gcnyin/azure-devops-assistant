#!/usr/bin/env bash
set -e

echo "=== Installing Python dependencies (uv) ==="
uv sync

echo "=== Building frontend ==="
cd frontend
npm ci
npm run build

echo "=== Build output: ../static/ ==="
echo "=== Starting backend ==="
cd ..
exec uv run python main.py "$@"
