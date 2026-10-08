import numpy as np
from fastapi.testclient import TestClient

from backend.main import SCENARIO_FEATURE, app, cells, features, model


client = TestClient(app)


def test_map_and_evidence_are_real_artifacts():
    response = client.get("/cells")
    assert response.status_code == 200
    layer = response.json()
    assert len(layer["features"]) == 7227
    assert "susceptibility_score" in layer["features"][0]["properties"]
    evidence = client.get("/evidence").json()
    assert evidence["holdout_cells"] == 1839
    assert np.isclose(evidence["metrics"]["roc_auc"], 0.6274206700269812)


def test_simulation_reruns_saved_model_with_only_built_up_fraction_changed():
    cell_id = cells.index[cells[SCENARIO_FEATURE] > 0.5][0]
    response = client.post("/simulate", json={"cell_id": cell_id, "intensity": 0.3})
    assert response.status_code == 200
    result = response.json()
    before = cells.loc[[cell_id], features].copy()
    after = before.copy()
    after.loc[cell_id, SCENARIO_FEATURE] *= 0.7
    assert result["scenario_feature"] == SCENARIO_FEATURE
    assert np.isclose(result["scenario_feature_value"], result["baseline_feature_value"] * 0.7)
    assert np.isclose(result["baseline_susceptibility"], model.predict_proba(before)[0, 1])
    assert np.isclose(result["scenario_susceptibility"], model.predict_proba(after)[0, 1])
    assert np.isclose(result["score_change"], result["scenario_susceptibility"] - result["baseline_susceptibility"])
    assert "not a guaranteed physical outcome" in result["note"]


def test_simulation_rejects_unknown_cell_and_out_of_range_intensity():
    assert client.post("/simulate", json={"cell_id": "unknown", "intensity": 0.3}).status_code == 404
    assert client.post("/simulate", json={"cell_id": cells.index[0], "intensity": 0.7}).status_code == 422
