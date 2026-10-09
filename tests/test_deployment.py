"""Check the repository-root Vercel adapter against real saved artifacts."""

import json
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]


def test_vercel_app_serves_real_api_under_public_prefix():
    from app import app

    client = TestClient(app)
    homepage = client.get("/", headers={"accept": "text/html"})
    assert homepage.status_code == 200
    assert "RiskTwin AI" in homepage.text
    assert client.get("/scenario", headers={"accept": "text/html"}).status_code == 200

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["cells"] == 7227

    evidence = client.get("/api/evidence")
    assert evidence.status_code == 200
    assert evidence.json()["holdout_cells"] == 1839

    result = client.post(
        "/api/simulate", json={"cell_id": "C0110_0040", "intensity": 0.25}
    )
    assert result.status_code == 200
    prediction = result.json()
    assert prediction["scenario_feature"] == "built_up_fraction_2021"
    assert prediction["scenario_feature_value"] == prediction["baseline_feature_value"] * 0.75
    assert 0 <= prediction["baseline_susceptibility"] <= 1
    assert 0 <= prediction["scenario_susceptibility"] <= 1
    assert client.get("/api/unknown").status_code == 404


def test_vercel_static_layer_and_routing_are_real():
    config = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    assert config["outputDirectory"] == "frontend/dist"
    assert "installCommand" not in config
    assert config["buildCommand"].startswith("cd frontend && npm ci && npm run build")
    assert config["rewrites"][0] == {
        "source": "/api/cells", "destination": "/cells.geojson"
    }

    source = ROOT / "outputs/chennai_susceptibility_v2.geojson"
    staged = ROOT / "frontend/dist/cells.geojson"
    assert staged.read_bytes() == source.read_bytes()
    layer = json.loads(staged.read_text(encoding="utf-8"))
    assert len(layer["features"]) == 7227
    assert layer["features"][0]["properties"]["driver_1"]
