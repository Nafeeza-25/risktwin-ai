import geopandas as gpd
import numpy as np
from shapely import box, Point

from ml.prepare_grid import CRS_METRIC, label_grid, make_grid
from ml.build_features import nearest_distance
from ml.train import spatial_split


def test_metric_grid_and_area_labels():
    grid = make_grid(box(0, 0, 500, 250))
    flood = gpd.GeoDataFrame(geometry=[box(0, 0, 250, 250)], crs=CRS_METRIC)
    labelled = label_grid(grid, flood)
    assert len(labelled) == 2
    assert list(labelled.flooded_2015) == [1, 0]
    assert np.allclose(labelled.geometry.area, 62500)


def test_northern_holdout_and_transition_gap():
    grid = make_grid(box(0, 0, 250, 2000))
    grid["flooded_2015"] = [0, 1] * 4
    train, test = spatial_split(grid, gap_m=500)
    assert test.sum() == 2
    assert train.sum() == 4
    assert not np.any(train & test)


def test_nearest_distance_is_metric():
    distances = nearest_distance([Point(0, 0), Point(3, 4)], [Point(0, 0)])
    assert np.allclose(distances, [0, 5])
