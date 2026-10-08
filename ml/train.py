"""Train a spatially validated XGBoost flood-susceptibility baseline."""

from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import numpy as np
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score
from xgboost import XGBClassifier

try:
    from ml.build_features import FEATURES, ROOT
except ModuleNotFoundError:
    from build_features import FEATURES, ROOT


def spatial_split(grid: gpd.GeoDataFrame, gap_m: int = 500) -> tuple[np.ndarray, np.ndarray]:
    """Reserve the northern quarter; omit a 500 m transition strip."""
    if gap_m < 0:
        raise ValueError("gap_m must be nonnegative")
    y = grid.geometry.representative_point().y.to_numpy()
    threshold = float(np.quantile(y, 0.75))
    train = y < threshold - gap_m
    test = y >= threshold
    labels = grid["flooded_2015"].to_numpy()
    if len(np.unique(labels[train])) != 2 or len(np.unique(labels[test])) != 2:
        raise ValueError("Spatial train/test split must contain both label classes")
    return train, test


def main() -> None:
    frame = gpd.read_file(ROOT / "data/processed/chennai_features.gpkg")
    required = FEATURES + ["flooded_2015", "cell_id", "latitude", "longitude"]
    if frame[required].isna().any().any():
        raise ValueError("Training table has missing required values")
    train_mask, test_mask = spatial_split(frame)
    x = frame[FEATURES]
    y = frame["flooded_2015"].astype(int)
    model = XGBClassifier(
        n_estimators=250, max_depth=4, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.9,
        objective="binary:logistic", eval_metric="logloss",
        random_state=42, n_jobs=4,
    )
    model.fit(x.loc[train_mask], y.loc[train_mask])
    test_probability = model.predict_proba(x.loc[test_mask])[:, 1]
    test_prediction = (test_probability >= 0.5).astype(int)
    metrics = {
        "model": "XGBoost binary classifier",
        "interpretation": "2015-event flood susceptibility; scores are not calibrated future flood probabilities",
        "split": "northern 25% of cells held out; 500 m transition strip omitted from training",
        "train_cells": int(train_mask.sum()),
        "test_cells": int(test_mask.sum()),
        "train_flooded": int(y.loc[train_mask].sum()),
        "test_flooded": int(y.loc[test_mask].sum()),
        "roc_auc": float(roc_auc_score(y.loc[test_mask], test_probability)),
        "precision": float(precision_score(y.loc[test_mask], test_prediction, zero_division=0)),
        "recall": float(recall_score(y.loc[test_mask], test_prediction, zero_division=0)),
        "f1": float(f1_score(y.loc[test_mask], test_prediction, zero_division=0)),
        "feature_names": FEATURES,
    }
    outputs = ROOT / "outputs"
    outputs.mkdir(exist_ok=True)
    (outputs / "chennai_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    model.save_model(outputs / "chennai_xgboost.json")
    table = frame.drop(columns="geometry")
    table.to_csv(ROOT / "data/processed/chennai_training_table.csv", index=False)

    risk = frame[["cell_id", "latitude", "longitude", "flooded_2015", "geometry"]].copy()
    risk["risk_probability"] = model.predict_proba(x)[:, 1].round(6)
    risk["risk_level"] = np.select(
        [risk.risk_probability < 1/3, risk.risk_probability < 2/3],
        ["Low", "Medium"], default="High",
    )
    risk["validation_region"] = np.select(
        [test_mask, train_mask], ["held_out_north", "training"], default="transition_gap"
    )
    risk = risk.to_crs("EPSG:4326")
    risk.geometry = risk.geometry.buffer(0)
    if not risk.geometry.is_valid.all() or risk.geometry.is_empty.any():
        raise ValueError("Invalid geometry remains in GeoJSON export")
    risk.to_file(outputs / "chennai_risk.geojson", driver="GeoJSON")
    print(json.dumps(metrics, indent=2))
    print(f"Wrote {len(risk)} risk cells to {outputs / 'chennai_risk.geojson'}")


if __name__ == "__main__":
    main()
