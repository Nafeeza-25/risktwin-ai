"""Build 250 m Chennai cells and label 2015 inundation intersections."""

from __future__ import annotations

import math
from pathlib import Path

import geopandas as gpd
import numpy as np
from shapely import box, intersection, union_all
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
CRS_METRIC = "EPSG:32644"
CELL_SIZE = 250


def make_grid(boundary, cell_size: int = CELL_SIZE) -> gpd.GeoDataFrame:
    """Clip a metric square lattice to a city boundary."""
    if cell_size <= 0:
        raise ValueError("cell_size must be positive")
    xmin, ymin, xmax, ymax = boundary.bounds
    left = math.floor(xmin / cell_size) * cell_size
    bottom = math.floor(ymin / cell_size) * cell_size
    cols = math.ceil((xmax - left) / cell_size)
    rows = math.ceil((ymax - bottom) / cell_size)
    records = []
    for row in range(rows):
        y = bottom + row * cell_size
        for col in range(cols):
            x = left + col * cell_size
            square = box(x, y, x + cell_size, y + cell_size)
            if not square.intersects(boundary):
                continue
            clipped = square.intersection(boundary)
            if not clipped.is_empty and clipped.area > 0:
                records.append((f"C{row:04d}_{col:04d}", row, col, clipped))
    return gpd.GeoDataFrame(records, columns=["cell_id", "grid_row", "grid_col", "geometry"], crs=CRS_METRIC)


def label_grid(grid: gpd.GeoDataFrame, flood: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """A cell is positive when flood polygons overlap a nonzero area."""
    if grid.crs != flood.crs:
        raise ValueError("grid and flood CRS must match")
    result = grid.copy()
    flooded = np.zeros(len(result), dtype=np.int8)
    geometries = flood.geometry[flood.geometry.notna() & ~flood.geometry.is_empty].to_numpy()
    if len(geometries):
        tree = STRtree(geometries)
        cell_idx, flood_idx = tree.query(result.geometry.to_numpy(), predicate="intersects")
        overlap = intersection(result.geometry.to_numpy()[cell_idx], geometries[flood_idx])
        flooded[cell_idx[np.asarray([g.area > 0 for g in overlap])]] = 1
    result["flooded_2015"] = flooded
    centers = result.geometry.representative_point().to_crs("EPSG:4326")
    result["longitude"] = centers.x
    result["latitude"] = centers.y
    return result


def main() -> None:
    wards = gpd.read_file(ROOT / "data/raw/chennai_gcc_wards_2011.kml")
    flood = gpd.read_file(ROOT / "data/raw/chennai_flood_2015.kml")
    if wards.crs is None or flood.crs is None:
        raise ValueError("Source KML is missing its CRS")
    wards = wards[wards["Name"].astype(str).str.fullmatch(r"Ward \d+")]
    if len(wards) != 200:
        raise ValueError(f"Expected 200 numbered GCC wards, found {len(wards)}")
    boundary = union_all(wards.to_crs(CRS_METRIC).geometry.to_numpy()).buffer(0)
    grid = make_grid(boundary)
    if "pixelvalue" in flood:
        flood = flood[flood["pixelvalue"].astype(str).isin(["1", "13"])]
    flood = flood.to_crs(CRS_METRIC)
    flood = flood[flood.geometry.intersects(boundary)]
    grid = label_grid(grid, flood)
    if grid["flooded_2015"].nunique() != 2:
        raise ValueError("Grid labels have only one class; check source geometry")
    output = ROOT / "data/processed/chennai_grid_250m.gpkg"
    output.parent.mkdir(parents=True, exist_ok=True)
    grid.to_file(output, driver="GPKG")
    print(f"Wrote {len(grid)} cells ({grid.flooded_2015.sum()} flooded) to {output}")


if __name__ == "__main__":
    main()
