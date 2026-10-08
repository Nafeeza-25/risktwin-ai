"""Read-only map API and one explicit land-cover what-if scenario."""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from xgboost import XGBClassifier


ROOT = Path(__file__).resolve().parents[1]
SCORE_FILE = ROOT / "outputs/chennai_susceptibility_v2.geojson"
METRICS_FILE = ROOT / "outputs/chennai_iteration1_metrics.json"
SCENARIO_FEATURE = "built_up_fraction_2021"
SCENARIO_NOTE = "Modelled scenario based on altered input assumptions; not a guaranteed physical outcome."
ASSUMPTION = (
    "Convert the selected share of this cell's mapped 2021 built-up cover "
    "to non-built green cover. Only built_up_fraction_2021 changes; terrain, water proximity, "
    "drainage and all other model inputs stay fixed."
)

bundle = joblib.load(ROOT / "outputs/chennai_best_v2.joblib")
model = bundle["model"]
features: list[str] = bundle["features"]
if not isinstance(model, XGBClassifier) or SCENARIO_FEATURE not in features:
    raise RuntimeError("The saved XGBoost model has no defensible built-up-cover scenario feature")
cells = pd.read_csv(ROOT / "data/processed/chennai_training_table_v2.csv").set_index("cell_id")
if not cells.index.is_unique:
    raise RuntimeError("Feature table contains duplicate cell IDs")
if cells[features].isna().any().any():
    raise RuntimeError("Model feature table contains missing values")
report = json.loads(METRICS_FILE.read_text(encoding="utf-8"))

app = FastAPI(title="RiskTwin AI", version="0.1.0")


class SimulationRequest(BaseModel):
    cell_id: str
    intensity: float = Field(ge=0.0, le=0.5, description="Share of mapped built-up cover converted, 0–0.5")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": bundle["name"], "cells": len(cells)}


@app.get("/cells")
def map_cells() -> FileResponse:
    return FileResponse(SCORE_FILE, media_type="application/geo+json", filename=SCORE_FILE.name)


@app.get("/evidence")
def evidence() -> dict:
    return {
        "model": report["selected_model"],
        "holdout_cells": report["holdout_cells"],
        "positive_prevalence": report["holdout_prevalence"],
        "metrics": report["metrics"][report["selected_model"]],
        "interpretation": report["score_interpretation"],
    }


@app.post("/simulate")
def simulate(request: SimulationRequest) -> dict:
    if request.cell_id not in cells.index:
        raise HTTPException(status_code=404, detail="Unknown Chennai cell_id")
    baseline = cells.loc[[request.cell_id], features].copy(deep=True)
    original_cover = float(baseline.iloc[0][SCENARIO_FEATURE])
    scenario = baseline.copy(deep=True)
    scenario.loc[request.cell_id, SCENARIO_FEATURE] = original_cover * (1.0 - request.intensity)
    changed = [name for name in features if not baseline[name].equals(scenario[name])]
    if request.intensity > 0 and original_cover > 0 and changed != [SCENARIO_FEATURE]:
        raise RuntimeError("Scenario must alter only built_up_fraction_2021")
    before = float(model.predict_proba(baseline)[:, 1][0])
    after = float(model.predict_proba(scenario)[:, 1][0])
    return {
        "cell_id": request.cell_id,
        "model": bundle["name"],
        "intensity": request.intensity,
        "scenario_feature": SCENARIO_FEATURE,
        "baseline_feature_value": original_cover,
        "scenario_feature_value": float(scenario.iloc[0][SCENARIO_FEATURE]),
        "baseline_susceptibility": before,
        "scenario_susceptibility": after,
        "score_change": after - before,
        "assumption": ASSUMPTION,
        "note": SCENARIO_NOTE,
    }
