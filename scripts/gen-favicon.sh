#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
convert favicon.png -resize 32x32 public/favicon.png
echo "Generated public/favicon.png"
