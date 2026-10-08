"""Aggregate terrain and OSM water-distance predictors to Chennai cells."""

from __future__ import annotations

import math
from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from shapely.strtree import STRtree

try:
    from ml.prepare_grid import CRS_METRIC, ROOT
except ModuleNotFoundError:
    from prepare_grid import CRS_METRIC, ROOT


FEATURES = ["mean_elevation", "min_elevation", "mean_slope", "distance_to_river", "distance_to_waterbody"]


def terrain_features(grid: gpd.GeoDataFrame, dem_paths: list[Path], resolution: int = 30) -> dict[str, np.ndarray]:
    """Reproject DEM to 30 m UTM pixels and aggregate each cell's pixels."""
    xmin, ymin, xmax, ymax = grid.total_bounds
    xmin, ymin = math.floor(xmin / resolution) * resolution, math.floor(ymin / resolution) * resolution
    xmax, ymax = math.ceil(xmax / resolution) * resolution, math.ceil(ymax / resolution) * resolution
    width, height = round((xmax - xmin) / resolution), round((ymax - ymin) / resolution)
    transform = from_origin(xmin, ymax, resolution, resolution)
    elevation = np.full((height, width), np.nan, dtype=np.float32)
    for path in dem_paths:
        with rasterio.open(path) as src:
            reproject(
                source=rasterio.band(src, 1), destination=elevation,
                src_transform=src.transform, src_crs=src.crs,
                dst_transform=transform, dst_crs=CRS_METRIC,
                dst_nodata=np.nan, init_dest_nodata=False,
                resampling=Resampling.bilinear,
            )
    if not np.isfinite(elevation).any():
        raise ValueError("DEM does not cover the Chennai grid")
    gy, gx = np.gradient(elevation, resolution)
    slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
    ids = rasterize(((geom, i + 1) for i, geom in enumerate(grid.geometry)),
                    out_shape=elevation.shape, transform=transform, fill=0, dtype="int32")
    flat_ids = ids.ravel()
    valid = (flat_ids > 0) & np.isfinite(elevation.ravel()) & np.isfinite(slope.ravel())
    counts = np.bincount(flat_ids[valid], minlength=len(grid) + 1)
    mean_elevation = np.bincount(flat_ids[valid], weights=elevation.ravel()[valid], minlength=len(grid) + 1)[1:] / np.maximum(counts[1:], 1)
    mean_slope = np.bincount(flat_ids[valid], weights=slope.ravel()[valid], minlength=len(grid) + 1)[1:] / np.maximum(counts[1:], 1)
    min_elevation = np.full(len(grid) + 1, np.inf)
    np.minimum.at(min_elevation, flat_ids[valid], elevation.ravel()[valid])
    min_elevation = min_elevation[1:]
    # Tiny boundary slivers can contain no 30 m pixel centre. Sample their
    # representative point rather than silently dropping them.
    missing = np.flatnonzero(counts[1:] == 0)
    for i in missing:
        pt = grid.geometry.iloc[i].representative_point()
        row, col = rasterio.transform.rowcol(transform, pt.x, pt.y)
        if 0 <= row < height and 0 <= col < width and np.isfinite(elevation[row, col]):
            mean_elevation[i] = min_elevation[i] = elevation[row, col]
            mean_slope[i] = slope[row, col]
        else:
            raise ValueError(f"No DEM data for cell {grid.cell_id.iloc[i]}")
    return {"mean_elevation": mean_elevation, "min_elevation": min_elevation, "mean_slope": mean_slope}


def nearest_distance(points, geometries) -> np.ndarray:
    """Distance in metres from each cell point to the nearest OSM geometry."""
    geometries = np.asarray([g for g in geometries if g is not None and not g.is_empty], dtype=object)
    if not len(geometries):
        raise ValueError("No OSM geometries for a required distance feature")
    _, distances = STRtree(geometries).query_nearest(np.asarray(points, dtype=object), return_distance=True, all_matches=False)
    return distances


def main() -> None:
    grid = gpd.read_file(ROOT / "data/processed/chennai_grid_250m.gpkg")
    if grid.crs.to_string() != CRS_METRIC:
        raise ValueError("Grid must be in EPSG:32644")
    dem_paths = sorted((ROOT / "data/raw").glob("Copernicus_DSM_COG_10_N*_00_E080_00_DEM.tif"))
    if len(dem_paths) != 2:
        raise FileNotFoundError("Expected the N12 and N13 Copernicus GLO-30 tiles")
    for name, values in terrain_features(grid, dem_paths).items():
        grid[name] = values
    osm_path = ROOT / "data/raw/chennai_osm_water.gpkg"
    if not osm_path.exists():
        raise FileNotFoundError(f"Download OSM water features first: {osm_path}")
    osm = gpd.read_file(osm_path).to_crs(CRS_METRIC)
    waterway = osm["waterway"].fillna("") if "waterway" in osm else ""
    natural = osm["natural"].fillna("") if "natural" in osm else ""
    rivers = osm[waterway.isin(["river", "stream", "canal"])]
    waterbodies = osm[(natural == "water") & osm.geom_type.isin(["Polygon", "MultiPolygon"])]
    points = grid.geometry.representative_point().to_numpy()
    grid["distance_to_river"] = nearest_distance(points, rivers.geometry)
    grid["distance_to_waterbody"] = nearest_distance(points, waterbodies.geometry)
    if not np.isfinite(grid[FEATURES].to_numpy()).all():
        raise ValueError("Missing or non-finite terrain/water features")
    output = ROOT / "data/processed/chennai_features.gpkg"
    grid.to_file(output, driver="GPKG")
    print(f"Wrote {len(grid)} feature rows to {output}; rivers={len(rivers)}, waterbodies={len(waterbodies)}")


if __name__ == "__main__":
    main()
