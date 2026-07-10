#!/usr/bin/env bash
# Bootstrap a venv with the font toolchain and build the emoji webfont.
# See scripts/build-emoji-font.py for what the build actually does.
set -euo pipefail
cd "$(dirname "$0")/.."

VENV=scripts/emoji-font-build/.venv
if [ ! -x "$VENV/bin/python" ]; then
  if command -v uv >/dev/null; then
    uv venv "$VENV"
    VIRTUAL_ENV="$PWD/$VENV" uv pip install --quiet nanoemoji ninja 'fonttools[woff]' uharfbuzz
  else
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install --quiet nanoemoji ninja 'fonttools[woff]' uharfbuzz
  fi
fi
exec "$VENV/bin/python" scripts/build-emoji-font.py "$@"
