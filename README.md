# RiskTwin AI — Chennai flood susceptibility dashboard

For the repository-root Vercel setup and public verification checklist, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Run the judge demo locally

The repository already contains the scored Chennai layer and saved XGBoost model. Start these in two PowerShell terminals from the repository root. Install `requirements-training.txt` in `.venv-risk` and run `npm ci` in `frontend` once if those environments are not yet prepared.

**Backend:**

```powershell
.\.venv-risk\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

**Frontend:**

```powershell
cd frontend; npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). The Vite server proxies `/api` to FastAPI. Click a red **Very High** cell to see its score, three local SHAP drivers, and deterministic planning suggestions. Under **Green-Cover Scenario**, choose a conversion share and run the saved model again to compare the baseline and altered `built_up_fraction_2021` input. Expand **Model Evidence** for the geographic holdout metrics.

With both servers running, `cd frontend; npm run smoke` checks the page, cell layer, SHAP fields, evidence, and scenario through the Vite proxy. The dashboard uses MapLibre GL with token-free OpenStreetMap tiles.

Scores are **uncalibrated flood susceptibility scores**, not future-flood probabilities. The scenario changes a model input, not measured physical drainage. The built-up-cover map is from **2021**, while flood labels are from **2015**; this date mismatch is a hackathon limitation. A production model should use time-aligned historical land cover.

## Earlier model milestone

The first milestone is [`outputs/chennai_risk.geojson`](outputs/chennai_risk.geojson): one scored feature per 250 m grid cell in the 200 numbered Greater Chennai Corporation wards. This is an XGBoost model of similarity to the mapped **2015 inundation event**, not a time-specific flood forecast or a validated estimate of future flood frequency.

## Run

Use Python 3.12 from the repository directory. This workspace already has `.venv-risk` with the dependencies installed; use its Python executable in place of `.venv` below. If `python` is not on your PATH, invoke your Python 3.12 executable by its full path for the first line.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-training.txt
.\.venv\Scripts\python.exe ml/fetch_sources.py
.\.venv\Scripts\python.exe ml/prepare_grid.py
.\.venv\Scripts\python.exe ml/build_features.py
.\.venv\Scripts\python.exe ml/train.py
.\.venv\Scripts\python.exe -m pytest tests -q
```

`fetch_sources.py` skips existing source files. OpenStreetMap access uses the public Overpass service and may be slow; the fetched water layer is cached as `data/raw/chennai_osm_water.gpkg` for repeat runs.

## Data and methods

| Input | Use | Source |
| --- | --- | --- |
| NRSC-derived 2015 inundation KML | Binary label where cell and polygon overlap by positive area | [Open City resource](https://data.opencity.in/dataset/chennai-floods-2015-data/resource/2056abd6-26d7-413b-9dfa-e63cbbf41ee7) |
| 2011 GCC ward KML | Study boundary: 200 numbered wards | [Open City GCC ward information](https://data.opencity.in/dataset/gcc-ward-information) |
| Copernicus GLO-30 tiles N12/E080 and N13/E080 | Mean/min surface elevation, mean slope | [Public Copernicus DEM on AWS](https://registry.opendata.aws/copernicus-dem/) |
| OpenStreetMap rivers, streams, canals and water polygons | Nearest distance in metres | [OpenStreetMap](https://www.openstreetmap.org/copyright), fetched using OSMnx |

Source files were fetched on 8 October 2026. The OSM query covers `(west=80.13, south=12.84, east=80.34, north=13.25)` and requests `waterway=river/stream/canal` or `natural=water`. The KML has 4,001 multipolygons; `pixelvalue` 1 and 13 are treated as inundation polygons, while two zero-valued polygons are excluded.

`prepare_grid.py` projects the ward and inundation geometries to **EPSG:32644** before generating and clipping 250 m squares. `build_features.py` reprojects DEM pixels to a 30 m UTM lattice, computes slope in degrees, aggregates them per cell, and measures water distances from each cell's representative point. The DEM is a **digital surface model**; buildings and vegetation can affect its elevation and slope.

`train.py` trains only on mean elevation, minimum elevation, mean slope, distance to river, and distance to waterbody. It holds out the northern quarter of cells for evaluation, with a 500 m transition gap excluded from training. The saved model scores every cell; the GeoJSON marks whether each score came from the training, gap, or held-out region. The score bins are display thresholds: Low `< 1/3`, Medium `< 2/3`, High otherwise.

The inspectable intermediate table is `data/processed/chennai_training_table.csv`. The model is `outputs/chennai_xgboost.json` and evaluation is `outputs/chennai_metrics.json`.

## Current evidence and limits

The first run produced **7,227 cells**, including **4,095 cells labelled inundated**. On the geographic holdout (1,839 northern cells), ROC-AUC was **0.613**, precision **0.294**, recall **0.709**, and F1 **0.415** at a 0.5 threshold. This is a working model-generated map layer, but the discrimination is modest and the scores are **not calibrated probabilities of future flooding**. Do not use it for safety-critical decisions.

An unlabeled cell is only *outside this KML's mapped inundation polygons*; it is not proof that the cell was dry in 2015. The ward geometry is dated 2011, while OSM water data are a later snapshot, so source dates differ. The single north/south validation split tests geographic transfer within Chennai but does not test other flood events or cities.

Population, buildings, hospitals, and schools belong in a later exposure and prioritization layer. Rainfall remains outside the current model.

## Capped improvement iteration

The initial outputs are preserved unchanged in `outputs/baseline/`. To reproduce the one-pass feature and model comparison after fetching the sources above:

```powershell
.\.venv\Scripts\python.exe ml/build_features_v2.py
.\.venv\Scripts\python.exe ml/train_v2.py
.\.venv\Scripts\python.exe ml/explain.py
```

The resulting layer is [`outputs/chennai_susceptibility_v2.geojson`](outputs/chennai_susceptibility_v2.geojson), with `susceptibility_score` and three Tree SHAP drivers per cell. See [`outputs/iteration1_report.md`](outputs/iteration1_report.md) for the full comparison, methods, and limits. The added WorldCover tile is downloaded by `fetch_sources.py` and requires approximately 119 MB of disk space.
