import numpy as np
from rasterio.transform import from_origin
from shapely import box

from ml.build_features_v2 import aggregate_mean
from ml.prepare_grid import make_grid
from ml.train_v2 import evaluate


def test_cell_raster_aggregation_keeps_cell_order():
    grid = make_grid(box(0, 0, 500, 250))
    values = np.array([[2.0, 6.0]])
    result = aggregate_mean(grid, values, from_origin(0, 250, 250, 250))
    assert result.tolist() == [2.0, 6.0]


def test_evaluation_uses_declared_confusion_order():
    y = np.array([0, 0, 1, 1])
    scores = np.array([0.1, 0.8, 0.4, 0.9])
    result = evaluate(y, scores)
    assert result["confusion_matrix_tn_fp_fn_tp"] == [1, 1, 1, 1]
    assert result["precision"] == result["recall"] == result["f1"] == 0.5
