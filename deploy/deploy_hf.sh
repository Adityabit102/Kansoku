#!/usr/bin/env bash
# Deploy the Kansoku API to a Hugging Face Space (Gradio SDK, free tier).
#
# One-time setup:
#   1. Create the Space at https://huggingface.co/new-space
#      -> SDK: Gradio (free tier), blank template, name e.g. "kansoku-api", public
#   2. Create a WRITE token at https://huggingface.co/settings/tokens
#
# Usage:
#   HF_TOKEN=hf_xxx ./deploy/deploy_hf.sh <hf-username> [space-name]
#
# The script pushes a copy of this repo with the HF metadata front-matter
# prepended to README.md — GitHub's copy stays untouched.
set -euo pipefail

USER="${1:?usage: HF_TOKEN=... $0 <hf-username> [space-name]}"
SPACE="${2:-kansoku-api}"
: "${HF_TOKEN:?set HF_TOKEN to a write token from huggingface.co/settings/tokens}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git -C "$ROOT" archive HEAD | tar -x -C "$TMP"

# HF reads its config from README front-matter; app.py mounts the FastAPI.
cat > "$TMP/README.md" <<EOF
---
title: Kansoku API
emoji: 👁️
colorFrom: red
colorTo: green
sdk: gradio
sdk_version: 6.20.0
app_file: app.py
pinned: false
---

$(cat "$ROOT/README.md")
EOF

cd "$TMP"
git init -q -b main
git add -A
git -c user.name="deploy" -c user.email="deploy@kansoku" commit -qm "Deploy Kansoku API"
git push -q --force "https://$USER:$HF_TOKEN@huggingface.co/spaces/$USER/$SPACE" main

echo "Pushed. Build logs: https://huggingface.co/spaces/$USER/$SPACE"
echo "API will serve at:  https://$USER-$SPACE.hf.space"
