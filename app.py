"""Vercel entrypoint: same-origin API plus the built React dashboard."""

from pathlib import Path

from fastapi import FastAPI

from backend.main import app as inference_app


ROOT = Path(__file__).resolve().parent

app = FastAPI(title="RiskTwin AI")
app.mount("/api", inference_app)
app.frontend("/", directory=str(ROOT / "frontend/dist"), fallback="index.html")
