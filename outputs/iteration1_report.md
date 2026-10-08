# Chennai susceptibility: capped improvement iteration

**8 October 2026.** The same 1,839 northern cells (461 labelled inundated; prevalence **25.07%**) were held out, with a 500 m training gap. Each new model used one fixed configuration. Selection was by holdout PR-AUC, measured as average precision. Classification metrics use a score threshold of 0.5. Confusion matrices are `[TN, FP; FN, TP]`.

| Model | ROC-AUC | PR-AUC | Precision | Recall | F1 | Confusion matrix |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Preserved baseline XGBoost | 0.613 | 0.331 | 0.294 | 0.709 | 0.415 | `[591, 787; 134, 327]` |
| Enhanced XGBoost | **0.627** | **0.350** | **0.310** | **0.705** | **0.431** | `[656, 722; 136, 325]` |
| Enhanced Random Forest | 0.590 | 0.312 | 0.291 | 0.696 | 0.410 | `[596, 782; 140, 321]` |

Enhanced XGBoost was selected. The PR-AUC gain over baseline is **0.019** and ROC-AUC gain is **0.015**. These are modest improvements from a single held-out geographic section; selecting by that same section makes the reported winning performance somewhat optimistic. No additional search or tuning was performed.

## Added geographic predictors

- `relative_elevation_1km`: mean 30 m DEM elevation minus the minimum elevation within approximately 1 km of each pixel.
- `log_flow_accumulation_90m`: logarithm of D8 upstream cell count on a depression-filled 90 m resampling of Copernicus GLO-30, padded 5 km beyond the city grid.
- `twi_90m`: mean `ln(specific catchment area / tan(slope))` on that 90 m raster, with a 0.001 slope floor.
- `river_edge_distance` and `any_water_edge_distance`: minimum metres from each cell polygon to mapped OpenStreetMap water features, rather than only from the cell representative point.
- `built_up_fraction_2021`: fraction of valid [ESA WorldCover 2021](https://esa-worldcover.org/en/data-access) 10 m pixels classified as built-up (class 50) within each cell. It is a land-cover proxy, not a count of people or assets.

## Output and interpretation

`chennai_best_v2.joblib` contains the selected model and its feature list. `chennai_susceptibility_v2.geojson` contains all 7,227 valid cell geometries, their `susceptibility_score`, validation-region marker, and the top three local Tree SHAP drivers. Each `driver_N_shap` is signed in **log-odds** units for the selected XGBoost model. Positive values raise the model output relative to the SHAP base value; negative values lower it. The full list of three drivers per cell is also in `chennai_shap_top3.csv`. SHAP additivity was checked against all saved model scores before export. Attributions describe this model and do not establish causal effects or intervention benefits.

The 2015 inundation KML defines a single event, and cells outside its polygons are not verified dry. The Copernicus product is a surface model that includes buildings and vegetation. D8 accumulation and TWI are sensitive to that surface, depression filling, artificial edges, and omitted drainage infrastructure; they are **topographic proxies**, not simulated urban runoff. WorldCover 2021 and current OSM are later than the 2015 label, creating a temporal mismatch. Scores are uncalibrated susceptibility scores and are not probabilities of future flooding. The holdout has high false-positive counts and the model is not ready for operational flood decisions.

Original milestone artifacts remain unchanged in `outputs/baseline/` and at their original paths. Detailed full-precision metrics and model feature lists are in `chennai_iteration1_metrics.json`.
