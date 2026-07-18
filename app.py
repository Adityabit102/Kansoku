"""Hugging Face Spaces entrypoint (Gradio SDK, free tier).

The Docker SDK isn't available on every plan, so this Space runs as a Gradio
app that mounts the real Kansoku FastAPI — every /predict, /leaderboard,
/signal... route is served unchanged at the Space root, with a minimal Gradio
landing page tucked at /ui to satisfy the SDK.
"""

import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "backend"))
os.environ.setdefault("KANSOKU_ROOT", ROOT)

import gradio as gr
import uvicorn

from kansoku.api.main import app as api

with gr.Blocks(title="Kansoku API") as demo:
    gr.Markdown(
        "# 観測 Kansoku API\n"
        "Multi-algorithm bearing fault diagnosis.\n\n"
        "- interactive docs: [/docs](/docs)\n"
        "- health: [/health](/health)\n"
        "- demo diagnosis: [/predict/demo/234](/predict/demo/234)"
    )

app = gr.mount_gradio_app(api, demo, path="/ui")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "7860")))
