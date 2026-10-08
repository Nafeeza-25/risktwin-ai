"""One capped hydrologic/land-cover feature pass; baseline files stay intact."""

from __future__ import annotations

import math
from pathlib import Path

import geopandas as gpd
import numpy as np
import pyflwdir
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from scipy.ndimage import minimum_filter

try:
    from ml.build_features import FEATURES as BASE_FEATURES, nearest_distance
    from ml.prepare_grid import CRS_METRIC, ROOT
except ModuleNotFoundError:
    from build_features import FEATURES as BASE_FEATURES, nearest_distance
    from prepare_grid import CRS_METRIC, ROOT


NEW_FEATURES = [
    "relative_elevation_1km", "log_flow_accumulation_90m", "twi_90m",
    "river_edge_distance", "any_water_edge_distance", "built_up_fraction_2021",
]
FEATURES_V2 = BASE_FEATURES + NEW_FEATURES
WORLDCOVER = ROOT / "data/raw/ESA_WorldCover_10m_2021_v200_N12E078_Map.tif"


def target_grid(bounds, resolution: int, pad: int = 0):
    xmin, ymin, xmax, ymax = bounds
    xmin = math.floor((xmin - pad) / resolution) * resolution
    ymin = math.floor((ymin - pad) / resolution) * resolution
    xmax = math.ceil((xmax + pad) / resolution) * resolution
    ymax = math.ceil((ymax + pad) / resolution) * resolution
    width, height = round((xmax - xmin) / resolution), round((ymax - ymin) / resolution)
    return (height, width), from_origin(xmin, ymax, resolution, resolution)


def load_dem(bounds, resolution: int, pad: int = 0):
    shape, transform = target_grid(bounds, resolution, pad)
    dem = np.full(shape, np.nan, dtype=np.float32)
    paths = sorted((ROOT / "data/raw").glob("Copernicus_DSM_COG_10_N*_00_E080_00_DEM.tif"))
    if len(paths) != 2:
        raise FileNotFoundError("Expected N12 and N13 Copernicus DEM tiles")
    for path in paths:
        with rasterio.open(path) as src:
            reproject(
                source=rasterio.band(src, 1), destination=dem,
                src_transform=src.transform, src_crs=src.crs,
                dst_transform=transform, dst_crs=CRS_METRIC,
                dst_nodata=np.nan, init_dest_nodata=False,
                resampling=Resampling.bilinear,
            )
    return dem, transform


def aggregate_mean(grid: gpd.GeoDataFrame, values: np.ndarray, transform) -> np.ndarray:
    ids = rasterize(((geom, i + 1) for i, geom in enumerate(grid.geometry)),
                    out_shape=values.shape, transform=transform, fill=0, dtype="int32")
    flat_ids, flat_values = ids.ravel(), values.ravel()
    valid = (flat_ids > 0) & np.isfinite(flat_values)
    counts = np.bincount(flat_ids[valid], minlength=len(grid) + 1)
    sums = np.bincount(flat_ids[valid], weights=flat_values[valid], minlength=len(grid) + 1)
    means = sums[1:] / np.maximum(counts[1:], 1)
    for i in np.flatnonzero(counts[1:] == 0):
        pt = grid.geometry.iloc[i].representative_point()
        row, col = rasterio.transform.rowcol(transform, pt.x, pt.y)
        if 0 <= row < values.shape[0] and 0 <= col < values.shape[1] and np.isfinite(values[row, col]):
            means[i] = values[row, col]
        else:
            raise ValueError(f"No raster value for {grid.cell_id.iloc[i]}")
    return means


def relative_elevation(grid: gpd.GeoDataFrame) -> np.ndarray:
    dem, transform = load_dem(grid.total_bounds, resolution=30, pad=1000)
    local_min = minimum_filter(np.where(np.isfinite(dem), dem, np.inf), size=33, mode="nearest")
    relative = np.where(np.isfinite(dem), np.maximum(dem - local_min, 0), np.nan)
    return aggregate_mean(grid, relative, transform)


def flow_features(grid: gpd.GeoDataFrame) -> tuple[np.ndarray, np.ndarray]:
    """D8 upstream area and TWI proxy on a depression-filled 90 m DSM."""
    dem, transform = load_dem(grid.total_bounds, resolution=90, pad=5000)
    if not np.isfinite(dem).all():
        raise ValueError("The padded 90 m DEM has gaps; flow routing would be invalid")
    flw = pyflwdir.from_dem(dem, nodata=-9999.0, transform=transform, latlon=False)
    upstream_cells = np.asarray(flw.upstream_area(unit="cell"), dtype=np.float64)
    if upstream_cells.shape != dem.shape or not np.isfinite(upstream_cells).all():
        raise ValueError("Invalid D8 upstream area")
    gy, gx = np.gradient(dem.astype(np.float64), 90)
    tan_slope = np.maximum(np.hypot(gx, gy), 0.001)
    # Specific catchment area (m2 per m contour) divided by local tan(slope).
    twi = np.log(np.maximum(upstream_cells, 1) * 90 / tan_slope)
    return aggregate_mean(grid, np.log1p(upstream_cells), transform), aggregate_mean(grid, twi, transform)


def built_up_fraction(grid: gpd.GeoDataFrame) -> np.ndarray:
    shape, transform = target_grid(grid.total_bounds, resolution=10)
    landcover = np.zeros(shape, dtype=np.uint8)
    with rasterio.open(WORLDCOVER) as src:
        reproject(
            source=rasterio.band(src, 1), destination=landcover,
            src_transform=src.transform, src_crs=src.crs,
            src_nodata=0, dst_transform=transform, dst_crs=CRS_METRIC,
            dst_nodata=0, resampling=Resampling.nearest,
        )
    ids = rasterize(((geom, i + 1) for i, geom in enumerate(grid.geometry)),
                    out_shape=shape, transform=transform, fill=0, dtype="int32")
    valid = (ids > 0) & (landcover != 0)
    total = np.bincount(ids[valid], minlength=len(grid) + 1)
    built = np.bincount(ids[valid & (landcover == 50)], minlength=len(grid) + 1)
    fractions = built[1:] / np.maximum(total[1:], 1)
    for i in np.flatnonzero(total[1:] == 0):
        pt = grid.geometry.iloc[i].representative_point()
        row, col = rasterio.transform.rowcol(transform, pt.x, pt.y)
        if 0 <= row < shape[0] and 0 <= col < shape[1] and landcover[row, col] != 0:
            fractions[i] = float(landcover[row, col] == 50)
        else:
            raise ValueError(f"No WorldCover data for {grid.cell_id.iloc[i]}")
    return fractions


def main() -> None:
    frame = gpd.read_file(ROOT / "data/processed/chennai_features.gpkg")
    if frame.crs.to_string() != CRS_METRIC:
        raise ValueError("Expected baseline cells in EPSG:32644")
    frame["relative_elevation_1km"] = relative_elevation(frame)
    frame["log_flow_accumulation_90m"], frame["twi_90m"] = flow_features(frame)
    osm = gpd.read_file(ROOT / "data/raw/chennai_osm_water.gpkg").to_crs(CRS_METRIC)
    rivers = osm[osm["waterway"].fillna("").isin(["river", "stream", "canal"])]
    waterbodies = osm[(osm["natural"].fillna("") == "water") & osm.geom_type.isin(["Polygon", "MultiPolygon"])]
    frame["river_edge_distance"] = nearest_distance(frame.geometry, rivers.geometry)
    frame["any_water_edge_distance"] = nearest_distance(frame.geometry, osm.geometry)
    frame["built_up_fraction_2021"] = built_up_fraction(frame)
    if not np.isfinite(frame[FEATURES_V2].to_numpy()).all():
        raise ValueError("Engineered features contain non-finite values")
    output = ROOT / "data/processed/chennai_features_v2.gpkg"
    frame.to_file(output, driver="GPKG")
    frame.drop(columns="geometry").to_csv(ROOT / "data/processed/chennai_training_table_v2.csv", index=False)
    print(f"Wrote {len(frame)} cells with {len(FEATURES_V2)} predictors to {output}")
    print(frame[NEW_FEATURES].describe().to_string())


if __name__ == "__main__":
    main()
