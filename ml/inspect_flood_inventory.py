"""Inspect geospatial files in data/raw/flood_inventory and summarize the latest usable dataset.

Does not write any output files. Column names are detected, not assumed.
"""

from __future__ import annotations

import re
import sys
import traceback
from pathlib import Path

import pandas as pd

try:
    import geopandas as gpd
except ImportError:
    print("ERROR: GeoPandas is not installed. Install it with: pip install geopandas")
    sys.exit(1)


REPO_ROOT = Path(__file__).resolve().parents[1]
INVENTORY_DIR = REPO_ROOT / "data" / "raw" / "flood_inventory"

VECTOR_EXTENSIONS = {".shp", ".geojson", ".gpkg", ".gml", ".kml", ".json"}
TABLE_EXTENSIONS = {".csv", ".tsv"}
ARCHIVE_EXTENSIONS = {".zip"}
SKIP_EXTENSIONS = {".dbf", ".shx", ".prj", ".cpg", ".sbn", ".sbx", ".shp.xml", ".qmd"}
SKIP_NAMES = {".ds_store"}

DATE_NAME_TOKENS = ("date", "year", "time", "start", "end", "month")
DATE_NAME_EXCLUDE = ("duration", "days", "hours", "minutes")
LOCATION_NAME_TOKENS = (
    "state",
    "district",
    "location",
    "place",
    "city",
    "village",
    "latitude",
    "longitude",
    "lat",
    "lon",
    "lng",
    "coord",
    "region",
    "country",
    "block",
    "taluk",
    "tehsil",
)
LAT_NAME_RE = re.compile(r"(^|[^a-z])(lat|latitude)([^a-z]|$)", re.I)
LON_NAME_RE = re.compile(r"(^|[^a-z])(lon|lng|long|longitude)([^a-z]|$)", re.I)
VERSION_RE = re.compile(r"(?:^|[/\\])v(\d+(?:\.\d+)?)(?:[/\\]|$)", re.I)


class InspectError(Exception):
    """Raised when inspection cannot continue."""


def discover_dataset_paths(root: Path) -> list[Path]:
    if not root.exists():
        raise InspectError(f"Inventory directory not found: {root}")
    if not root.is_dir():
        raise InspectError(f"Inventory path is not a directory: {root}")

    found: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        name = path.name.lower()
        if name in SKIP_NAMES or name.endswith(".md"):
            continue
        suffix = path.suffix.lower()
        if suffix in SKIP_EXTENSIONS:
            continue
        if suffix in VECTOR_EXTENSIONS or suffix in TABLE_EXTENSIONS or suffix in ARCHIVE_EXTENSIONS:
            found.append(path)

    if not found:
        raise InspectError(f"No shapefile, GeoJSON, CSV, or other geospatial files found under {root}")
    return sorted(found)


def parse_version(path: Path, root: Path) -> float:
    try:
        relative = path.relative_to(root).as_posix()
    except ValueError:
        relative = str(path)
    match = VERSION_RE.search("/" + relative)
    if not match:
        return 0.0
    try:
        return float(match.group(1))
    except ValueError:
        return 0.0


def score_dataset(path: Path, root: Path) -> tuple:
    """Higher score = more recent / more appropriate event inventory."""
    name = path.name.lower()
    stem = path.stem.lower()
    version = parse_version(path, root)
    is_inventory = "inventory" in stem or "inventroy" in stem  # v1 filename typo
    is_district_agg = stem.startswith("district_")
    is_shapefile = path.suffix.lower() == ".shp"
    is_corrected = "corrected" in str(path).lower()
    is_zip = path.suffix.lower() == ".zip"

    score = (
        version * 1000
        + (200 if is_inventory else 0)
        + (80 if is_shapefile else 0)
        + (40 if is_corrected else 0)
        - (300 if is_district_agg else 0)
        - (20 if is_zip else 0)
    )
    return (score, version, is_inventory, not is_district_agg, path)


def select_dataset(paths: list[Path], root: Path) -> Path:
    ranked = sorted((score_dataset(p, root) for p in paths), reverse=True)
    return ranked[0][-1]


def load_with_geopandas(path: Path) -> gpd.GeoDataFrame:
    suffix = path.suffix.lower()
    try:
        if suffix in TABLE_EXTENSIONS:
            return _load_table(path)
        return gpd.read_file(path)
    except Exception as exc:
        raise InspectError(f"Failed to load {path}: {exc}") from exc


def _read_csv_fallback(path: Path) -> pd.DataFrame:
    last_error: Exception | None = None
    for kwargs in (
        {"low_memory": False},
        {"encoding": "utf-8", "low_memory": False},
        {"encoding": "latin-1", "low_memory": False},
        {"sep": None, "engine": "python"},
    ):
        try:
            return pd.read_csv(path, **kwargs)
        except Exception as exc:
            last_error = exc
    raise InspectError(f"Failed to read CSV {path}: {last_error}") from last_error


def _load_table(path: Path) -> gpd.GeoDataFrame:
    try:
        gdf = gpd.read_file(path)
    except Exception:
        frame = _read_csv_fallback(path)
        gdf = gpd.GeoDataFrame(frame)

    if _has_usable_geometry(gdf):
        return gdf

    lat_col, lon_col = _detect_coordinate_columns(list(gdf.columns))
    if lat_col is None or lon_col is None:
        return gdf

    try:
        lon = pd.to_numeric(gdf[lon_col], errors="coerce")
        lat = pd.to_numeric(gdf[lat_col], errors="coerce")
        geometry = gpd.points_from_xy(lon, lat, crs=None)
        gdf = gpd.GeoDataFrame(gdf, geometry=geometry, crs=None)
        gdf.attrs["geometry_source"] = (
            f"Point geometry built from columns {lon_col!r} (x) and {lat_col!r} (y). "
            "No CRS was present in the file, so CRS was left unset."
        )
        return gdf
    except Exception as exc:
        print(f"WARNING: Could not build geometry from {lat_col!r}/{lon_col!r}: {exc}")
        return gdf


def _has_usable_geometry(gdf: gpd.GeoDataFrame) -> bool:
    if "geometry" not in gdf.columns and getattr(gdf, "geometry", None) is None:
        return False
    try:
        geom = gdf.geometry
    except Exception:
        return False
    if geom is None:
        return False
    try:
        return geom.notna().any()
    except Exception:
        return False


def _detect_coordinate_columns(columns: list) -> tuple[str | None, str | None]:
    lat_matches = [c for c in columns if isinstance(c, str) and LAT_NAME_RE.search(c)]
    lon_matches = [c for c in columns if isinstance(c, str) and LON_NAME_RE.search(c)]
    lat_col = lat_matches[0] if len(lat_matches) == 1 else None
    lon_col = lon_matches[0] if len(lon_matches) == 1 else None
    if lat_col is None and len(lat_matches) > 1:
        print(f"WARNING: Multiple latitude-like columns, not used for geometry: {lat_matches}")
    if lon_col is None and len(lon_matches) > 1:
        print(f"WARNING: Multiple longitude-like columns, not used for geometry: {lon_matches}")
    return lat_col, lon_col


def _name_tokens(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(name).lower())


def candidate_date_fields(columns: list) -> list[str]:
    found = []
    exclude = set(DATE_NAME_EXCLUDE)
    include = set(DATE_NAME_TOKENS)
    for col in columns:
        parts = set(_name_tokens(col).split())
        if (parts & exclude) and not (parts & {"date", "year"}):
            continue
        if parts & include:
            found.append(col)
    return found


def candidate_location_fields(columns: list) -> list[str]:
    found = []
    include = set(LOCATION_NAME_TOKENS)
    for col in columns:
        parts = set(_name_tokens(col).split())
        if parts & include:
            found.append(col)
    return found


def detect_date_range(gdf: gpd.GeoDataFrame, date_fields: list[str]) -> None:
    if not date_fields:
        print("Earliest / latest event dates: not detectable (no candidate date/year fields)")
        return

    any_range = False
    for col in date_fields:
        parsed = _try_parse_dates(gdf[col])
        valid = parsed.dropna()
        if valid.empty:
            print(f"  {col}: could not parse dates")
            continue
        any_range = True
        print(
            f"  {col}: earliest={valid.min()}  latest={valid.max()}  "
            f"(parsed {len(valid)} / {len(parsed)} non-null after parse)"
        )

    if not any_range:
        print("Earliest / latest event dates: not detectable (candidate fields did not parse as dates)")


def _try_parse_dates(series: pd.Series) -> pd.Series:
    parsed = pd.to_datetime(series, errors="coerce", utc=False)
    if parsed.notna().sum() > 0:
        return parsed

    numeric = pd.to_numeric(series, errors="coerce")
    years = numeric.dropna()
    if not years.empty and years.between(1000, 3000).all():
        as_year = pd.to_datetime(numeric.astype("Int64").astype(str) + "-01-01", errors="coerce")
        return as_year

    return parsed


def print_section(title: str) -> None:
    print("\n" + title)
    print("-" * len(title))


def inspect(gdf: gpd.GeoDataFrame, selected: Path, discovered: list[Path], root: Path) -> None:
    print_section("Search results")
    for path in discovered:
        score, version, *_ = score_dataset(path, root)
        rel = path.relative_to(root)
        print(f"  [{score:g}] v={version:g}  {rel}")

    print_section("File selected")
    print(selected)
    try:
        print(f"Relative path: {selected.relative_to(root)}")
    except ValueError:
        pass
    score, version, is_inventory, *_ = score_dataset(selected, root)
    reasons = []
    if version:
        reasons.append(f"highest version folder detected (v{version:g})")
    if is_inventory:
        reasons.append("filename looks like the event inventory")
    if reasons:
        print("Selection reason: " + "; ".join(reasons))
    geom_note = gdf.attrs.get("geometry_source")
    if geom_note:
        print(geom_note)

    print_section("Number of rows")
    print(len(gdf))

    print_section("All columns")
    print(list(gdf.columns))

    print_section("CRS")
    print(gdf.crs if gdf.crs is not None else "None (not present in file / not set)")

    print_section("Geometry types")
    try:
        geom = gdf.geometry
        type_counts = geom.geom_type.value_counts(dropna=False)
        print(type_counts.to_string())
        null_geom = int(geom.isna().sum())
        print(f"null geometry: {null_geom}")
    except Exception as exc:
        print(f"Geometry types: not available ({exc})")

    print_section("First 5 rows")
    with pd.option_context("display.max_columns", None, "display.width", 200, "display.max_colwidth", 80):
        print(gdf.head(5).to_string())

    print_section("Missing values")
    missing = gdf.isna().sum()
    print(missing.to_string())
    print(f"Total missing cells: {int(gdf.isna().sum().sum())}")

    columns = list(gdf.columns)
    date_fields = candidate_date_fields(columns)
    location_fields = candidate_location_fields(columns)

    print_section("Candidate date/year fields")
    print(date_fields if date_fields else "None detected from column names")

    print_section("Candidate state/location fields")
    print(location_fields if location_fields else "None detected from column names")

    print_section("Earliest and latest event dates")
    detect_date_range(gdf, date_fields)


def main() -> int:
    try:
        discovered = discover_dataset_paths(INVENTORY_DIR)
        selected = select_dataset(discovered, INVENTORY_DIR)
        gdf = load_with_geopandas(selected)
        inspect(gdf, selected, discovered, INVENTORY_DIR)
        return 0
    except InspectError as exc:
        print(f"ERROR: {exc}")
        return 1
    except Exception as exc:
        print(f"ERROR: Unexpected failure: {exc}")
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
