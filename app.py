"""Vercel entrypoint: same-origin API plus the built React dashboard."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import RedirectResponse

from backend.main import app as inference_app


ROOT = Path(__file__).resolve().parent

app = FastAPI(title="RiskTwin AI")


@app.get("/api/cells", include_in_schema=False)
def cdn_cells() -> RedirectResponse:
    """Keep the public API path while serving the large layer from the CDN."""
    return RedirectResponse("/cells.geojson", status_code=307)


app.mount("/api", inference_app)
app.frontend("/", directory=str(ROOT / "frontend/dist"), fallback="index.html")
