"""One fixed-model comparison on the unchanged geographic holdout."""

from __future__ import annotations

import json

import geopandas as gpd
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    average_precision_score, confusion_matrix, f1_score, precision_score,
    recall_score, roc_auc_score,
)
from xgboost import XGBClassifier

try:
    from ml.build_features_v2 import FEATURES_V2, ROOT
    from ml.build_features import FEATURES as BASE_FEATURES
    from ml.train import spatial_split
except ModuleNotFoundError:
    from build_features_v2 import FEATURES_V2, ROOT
    from build_features import FEATURES as BASE_FEATURES
    from train import spatial_split


def evaluate(y_true, scores) -> dict:
    predicted = (scores >= 0.5).astype(int)
    return {
        "roc_auc": float(roc_auc_score(y_true, scores)),
        "pr_auc_average_precision": float(average_precision_score(y_true, scores)),
        "precision": float(precision_score(y_true, predicted, zero_division=0)),
        "recall": float(recall_score(y_true, predicted, zero_division=0)),
        "f1": float(f1_score(y_true, predicted, zero_division=0)),
        "confusion_matrix_tn_fp_fn_tp": confusion_matrix(y_true, predicted, labels=[0, 1]).ravel().astype(int).tolist(),
    }


def main() -> None:
    frame = gpd.read_file(ROOT / "data/processed/chennai_features_v2.gpkg")
    baseline = gpd.read_file(ROOT / "data/processed/chennai_features.gpkg")
    if not frame.cell_id.equals(baseline.cell_id) or not frame.flooded_2015.equals(baseline.flooded_2015):
        raise ValueError("Enhanced rows/labels differ from the preserved baseline")
    train_mask, test_mask = spatial_split(frame, gap_m=500)
    y = frame.flooded_2015.astype(int)
    y_test = y.loc[test_mask]
    baseline_model = XGBClassifier()
    baseline_model.load_model(ROOT / "outputs/baseline/chennai_xgboost.json")
    xgb = XGBClassifier(
        n_estimators=250, max_depth=4, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.9,
        objective="binary:logistic", eval_metric="logloss",
        random_state=42, n_jobs=4,
    )
    forest = RandomForestClassifier(
        n_estimators=160, max_depth=12, min_samples_leaf=5,
        random_state=42, n_jobs=4,
    )
    xgb.fit(frame.loc[train_mask, FEATURES_V2], y.loc[train_mask])
    forest.fit(frame.loc[train_mask, FEATURES_V2], y.loc[train_mask])
    candidates = {
        "baseline_xgboost": (baseline_model, BASE_FEATURES),
        "enhanced_xgboost": (xgb, FEATURES_V2),
        "enhanced_random_forest": (forest, FEATURES_V2),
    }
    results = {}
    for name, (model, features) in candidates.items():
        scores = model.predict_proba(frame.loc[test_mask, features])[:, 1]
        results[name] = evaluate(y_test, scores)
    # A single declared selection rule: highest held-out average precision.
    winner = max(candidates, key=lambda name: results[name]["pr_auc_average_precision"])
    best_model, best_features = candidates[winner]
    best_scores = best_model.predict_proba(frame[best_features])[:, 1]
    if not np.isfinite(best_scores).all() or not np.all((0 <= best_scores) & (best_scores <= 1)):
        raise ValueError("Selected model produced invalid scores")
    report = {
        "selection_rule": "highest holdout PR-AUC (average precision); one fixed configuration per new model",
        "selected_model": winner,
        "split": "unchanged northern-quarter holdout with a 500 m training gap",
        "classification_threshold": 0.5,
        "train_cells": int(train_mask.sum()),
        "holdout_cells": int(test_mask.sum()),
        "holdout_flooded": int(y_test.sum()),
        "holdout_prevalence": float(y_test.mean()),
        "features_by_model": {name: features for name, (_, features) in candidates.items()},
        "metrics": results,
        "score_interpretation": "uncalibrated susceptibility score for the 2015-event label",
    }
    outputs = ROOT / "outputs"
    (outputs / "chennai_iteration1_metrics.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    joblib.dump({"model": best_model, "features": best_features, "name": winner}, outputs / "chennai_best_v2.joblib")
    scored = frame[["cell_id", "latitude", "longitude", "flooded_2015", "geometry"]].copy()
    scored["susceptibility_score"] = best_scores
    scored["validation_region"] = np.select(
        [test_mask, train_mask], ["held_out_north", "training"], default="transition_gap"
    )
    scored.to_file(ROOT / "data/processed/chennai_scored_v2.gpkg", driver="GPKG")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
