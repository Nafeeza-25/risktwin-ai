"""Export per-cell Tree SHAP drivers for the selected susceptibility model."""

from __future__ import annotations

import json

import geopandas as gpd
import joblib
import numpy as np
import pandas as pd
import shap
from scipy.special import expit

try:
    from ml.prepare_grid import ROOT
except ModuleNotFoundError:
    from prepare_grid import ROOT


def shap_positive_class(model, x: pd.DataFrame):
    """Return class-1 Tree SHAP values and the model output space."""
    explainer = shap.TreeExplainer(model, model_output="raw")
    values = np.asarray(explainer.shap_values(x))
    base = np.asarray(explainer.expected_value)
    if values.ndim == 3 and values.shape[2] == 2:
        values = values[:, :, 1]
        base = float(base[1])
        output_space = "class_1_score"
        reconstructed = base + values.sum(axis=1)
    elif values.ndim == 2:
        base = float(base)
        output_space = "log_odds"
        reconstructed = expit(base + values.sum(axis=1))
    else:
        raise ValueError(f"Unexpected SHAP shape: {values.shape}")
    actual = model.predict_proba(x)[:, 1]
    if not np.allclose(reconstructed, actual, atol=2e-4):
        raise ValueError(f"SHAP additivity check failed (max error {np.max(np.abs(reconstructed - actual))})")
    return values, base, output_space


def main() -> None:
    bundle = joblib.load(ROOT / "outputs/chennai_best_v2.joblib")
    frame = gpd.read_file(ROOT / "data/processed/chennai_features_v2.gpkg")
    scored = gpd.read_file(ROOT / "data/processed/chennai_scored_v2.gpkg")
    if not frame.cell_id.equals(scored.cell_id):
        raise ValueError("Feature/scored row order changed")
    features = bundle["features"]
    x = frame[features]
    values, base, output_space = shap_positive_class(bundle["model"], x)
    if values.shape != x.shape:
        raise ValueError("SHAP value dimensions do not match model predictors")
    if not np.allclose(bundle["model"].predict_proba(x)[:, 1], scored.susceptibility_score, atol=1e-6):
        raise ValueError("Saved susceptibility scores do not match selected model")
    rank = np.argsort(-np.abs(values), axis=1)[:, :3]
    rows = np.arange(len(frame))
    for slot in range(3):
        indices = rank[:, slot]
        scored[f"driver_{slot + 1}"] = [features[i] for i in indices]
        scored[f"driver_{slot + 1}_value"] = x.to_numpy()[rows, indices].round(6)
        scored[f"driver_{slot + 1}_shap"] = values[rows, indices].round(6)
    scored["shap_base_value"] = base
    scored["shap_output_space"] = output_space
    outputs = ROOT / "outputs"
    columns = ["cell_id", "susceptibility_score", "validation_region"]
    for slot in range(1, 4):
        columns += [f"driver_{slot}", f"driver_{slot}_value", f"driver_{slot}_shap"]
    columns += ["shap_base_value", "shap_output_space"]
    scored[columns].to_csv(outputs / "chennai_shap_top3.csv", index=False)
    summary = {
        "model": bundle["name"],
        "method": "Tree SHAP, tree-path-dependent background",
        "output_space": output_space,
        "base_value": base,
        "interpretation": "Signed local model attributions; not causal intervention effects",
        "mean_absolute_shap": dict(zip(features, np.abs(values).mean(axis=0).tolist())),
    }
    (outputs / "chennai_shap_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    scored = scored.to_crs("EPSG:4326")
    scored.geometry = scored.geometry.buffer(0)
    if not scored.geometry.is_valid.all() or scored.geometry.is_empty.any():
        raise ValueError("Invalid geometry remains in final GeoJSON")
    scored.to_file(outputs / "chennai_susceptibility_v2.geojson", driver="GeoJSON")
    print(f"Wrote {len(scored)} cells with three SHAP drivers each; output space={output_space}")


if __name__ == "__main__":
    main()
