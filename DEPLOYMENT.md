# RiskTwin AI on Vercel

Deploy from the **repository root** on the `master` branch. `vercel.json` sets the FastAPI preset and builds `frontend` with `npm ci` and `npm run build`, then publishes `frontend/dist`. Vercel automatically installs the pinned Python dependencies from the root `requirements.txt`, allowing its Python function bundle optimization. The root `app.py` mounts the existing inference API under `/api` and registers the Vite build as the React frontend. Python 3.12 and the inference-only package versions are pinned in `.python-version` and `requirements.txt`; the full model-training environment remains in `requirements-training.txt`.

## Vercel project settings

1. Import `Nafeeza-25/risktwin-ai` from GitHub into Vercel.
2. Set **Root Directory** to `./` (repository root), **Production Branch** to `master`, and **Framework Preset** to FastAPI. Leave the Install, Build, and Output overrides off so the committed `vercel.json` values apply.
3. Deploy. No DEM, OSM, satellite, or training data download is part of the build. The tracked model, feature table, metrics, and scored layer are the runtime inputs.
4. Inspect deployment logs and test the public URL as described below before sharing it.

The 6,308,224-byte scored GeoJSON exceeds Vercel's 4.5 MB Function response limit. The build copies the **unchanged** file to `frontend/dist/cells.geojson`; Vercel rewrites `/api/cells` to that CDN asset. `/api/health`, `/api/evidence`, and `/api/simulate` reach the actual FastAPI/XGBoost app. The `/api/cells` rewrite is first, and FastAPI's `app.frontend()` gives API routes priority over its SPA fallback. An unknown `/api/*` URL returns 404 rather than React HTML.

The [Python runtime guide](https://vercel.com/docs/functions/runtimes/python) currently lists a 500 MB standard uncompressed Python bundle limit and optional Large Functions support up to 5 GB with Fluid compute. The [Functions limits](https://vercel.com/docs/functions/limitations) list 2 GB memory on Hobby and the 4.5 MB response limit. `xgboost-cpu` is the official [CPU-only XGBoost package](https://xgboost.readthedocs.io/en/stable/install.html#minimal-installation-cpu-only) and is pinned to the same XGBoost release that saved the model. If an existing Vercel project needs Large Functions, enable `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` in its environment and redeploy. Do not remove the simulator to get a smaller build.

## Local production check

From the repository root, with Python 3.12 and the full local environment installed:

```powershell
cd frontend
npm ci
npm run build
node ..\scripts\stage-vercel-assets.mjs
cd ..
.\.venv-risk\Scripts\python.exe -m pytest tests -q
.\.venv-risk\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8001
```

In another PowerShell terminal, run `$env:RISKTWIN_URL='http://127.0.0.1:8001'; cd frontend; npm run smoke`, or request `/api/health`, `/api/cells`, `/api/evidence`, and POST `/api/simulate` on that origin. The saved model is rerun on the feature row; no UI or server fallback fabricates scores.

## Public acceptance check

After deployment, verify the public homepage and these routes on the same origin:

| Route | Expected result |
| --- | --- |
| `/api/health` | JSON with `cells: 7227` |
| `/api/cells` | Real GeoJSON with 7,227 features and `driver_1` values |
| `/api/evidence` | Real holdout metrics with `holdout_cells: 1839` |
| `POST /api/simulate` | For `{"cell_id":"C0110_0040","intensity":0.25}`, model-generated baseline and scenario scores |

Then navigate Explore Map → select a cell → Drivers → Actions → Scenario Lab → Run scenario → Model Evidence → Dispatch Prototype. Confirm the map grid and three SHAP drivers render and the scenario scores match the API response. The street basemap requires browser access to OpenStreetMap's tile server.

## If the Vercel Python Function cannot deploy

Keep the React frontend and `/api/cells` CDN asset on Vercel. Run `backend.main:app` as a Python 3.12 web service on Render or Railway from the same repository root. Install `requirements.txt` and `uvicorn==0.54.0`; start with `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`. Check `/health` and `/simulate` on the backend's public URL. In `vercel.json`, add a rewrite after `/api/cells` and before the SPA fallback:

```json
{ "source": "/api/:path*", "destination": "https://YOUR-BACKEND-HOST/:path*" }
```

Redeploy Vercel and repeat the public acceptance check. This keeps all frontend requests on the Vercel origin, with real inference running on the external backend.
