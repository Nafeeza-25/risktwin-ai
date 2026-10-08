"""Fetch the public source files used by the first Chennai baseline."""

from __future__ import annotations

from pathlib import Path

import osmnx as ox
import requests

try:
    from ml.prepare_grid import ROOT
except ModuleNotFoundError:
    from prepare_grid import ROOT


RAW = ROOT / "data/raw"
SOURCES = {
    "chennai_flood_2015.kml": "https://data.opencity.in/dataset/866141ab-3a3f-4dc0-8092-421d97ba29a2/resource/2056abd6-26d7-413b-9dfa-e63cbbf41ee7/download/7cb3cecf-a95a-4786-8032-9c7417655d24.kml",
    "chennai_gcc_wards_2011.kml": "https://data.opencity.in/dataset/c77de7f8-e377-4990-90fc-4f0f8ca0e2d2/resource/b8d8ef2c-90ad-41c4-bf95-307c1764c6f6/download/c81c4e31-dd89-47fe-a374-4eb5ad8873a0.kml",
}
for lat in (12, 13):
    name = f"Copernicus_DSM_COG_10_N{lat}_00_E080_00_DEM"
    SOURCES[f"{name}.tif"] = f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"
SOURCES["ESA_WorldCover_10m_2021_v200_N12E078_Map.tif"] = (
    "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
    "ESA_WorldCover_10m_2021_v200_N12E078_Map.tif"
)


def download(url: str, path: Path) -> None:
    if path.exists():
        print(f"Exists: {path.name}")
        return
    part = path.with_suffix(path.suffix + ".part")
    with requests.get(url, stream=True, timeout=120) as response:
        response.raise_for_status()
        with part.open("wb") as output:
            for chunk in response.iter_content(1024 * 1024):
                output.write(chunk)
    part.replace(path)
    print(f"Downloaded: {path.name}")


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        download(url, RAW / name)
    osm_path = RAW / "chennai_osm_water.gpkg"
    if not osm_path.exists():
        ox.settings.use_cache = True
        ox.settings.cache_folder = str(RAW / "osmnx_cache")
        ox.settings.requests_timeout = 180
        water = ox.features_from_bbox(
            (80.13, 12.84, 80.34, 13.25),
            {"waterway": ["river", "stream", "canal"], "natural": "water"},
        ).reset_index()
        columns = [c for c in ("geometry", "waterway", "natural", "water") if c in water]
        water[columns].to_file(osm_path, driver="GPKG")
        print(f"Downloaded: {osm_path.name} ({len(water)} OSM features)")


if __name__ == "__main__":
    main()
