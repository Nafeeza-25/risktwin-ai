# RiskTwin AI — Mockup-Based UI/UX Redesign Documentation & Jury Guide

## 1. Executive Summary & Design Alignment

The RiskTwin AI web application has been completely redesigned from a dark dashboard into a **clean white-and-blue civic-geospatial SaaS interface**, directly modeled after **Image 1 (Primary Design Reference)** and implementing the user journey from **Image 2**:

$$\text{Explore Map} \longrightarrow \text{Select Cell} \longrightarrow \text{Understand Drivers} \longrightarrow \text{Review Actions} \longrightarrow \text{Run Scenario} \longrightarrow \text{Inspect Model Evidence}$$

### Visual & Architectural Design System (Image 1 Compliance)
- **Palette**: Clean workspace background (`#F7F9FC`), crisp white cards (`#FFFFFF`), primary blue accents (`#2563EB`), slate typography (`#14263D` headings, `#64748B` navigation & labels), and subtle borders (`#E2E8F0`).
- **Susceptibility Palette Preserved**:
  - Low: Teal (`#0D9488`)
  - Moderate: Amber (`#D97706`)
  - High: Orange (`#EA580C`)
  - Very High: Crimson (`#DC2626`)
- **Navigation**: Clean left sidebar with 5 core sections:
  1. **Explore map** (central interactive geospatial canvas)
  2. **Model evidence** (genuine holdout metrics & global Tree SHAP table)
  3. **Scenario lab** (counterfactual built-up cover simulation connected to FastAPI)
  4. **Data & methods** (geospatial projection EPSG:32644, base margin, feature definitions)
  5. **Simulated dispatch** (clearly disclosed operational prototype)
- **Top Bar**: Minimalist white header with breadcrumb navigation (`Workspace / Flood risk explorer`), study area dropdown (`Greater Chennai Corporation`), and user profile pill (`RT · Nafeeza`).
- **Map View**: Full MapLibre GL canvas rendering all **7,227 real 250m grid cells** across Chennai's 200 wards with CartoDB Voyager light basemap, floating search input, layer opacity dropdown, street/satellite switcher, and Image 1 floating bottom-left legend.
- **Right Selected-Location Inspector**:
  - Location eyebrow, Cell ID (`C0110_0040`), study area tag (`Greater Chennai Corporation · North zone`).
  - Model susceptibility banner (`0.945 Very High`).
  - 4 clean sub-tabs: **Overview**, **Drivers**, **Actions**, **Exposure**.
  - Overview: Top 3 dominant physical drivers with icons, measured values, and signed SHAP log-odds.
  - Footnote disclaimer explaining Tree SHAP and uncalibrated scores.
  - Primary blue CTA: **"Explore green-cover scenario →"**.

---

## 2. Scientific Integrity & Credibility Safeguards

1. **No Fabricated Exposure**: The Exposure tab and metric cards explicitly declare: *"Exposure data not yet integrated. Census population counts, building polygons, and critical infrastructure are not currently linked to this 250m grid."*
2. **No Invented Confidence Scores**: Removed artificial confidence gauges. Scores are transparently communicated as uncalibrated model susceptibility.
3. **Real Tree SHAP Log-Odds**: Contributions are displayed in true signed log-odds space (base margin: $+0.754$), showing exact directional impact (e.g. $+0.768$ raises risk, $-0.210$ lowers risk).
4. **Legitimate Scenario Engine**: Only the verified counterfactual transformation (`built_up_fraction_2021` reduction) is supported, sending live requests to FastAPI `/api/simulate` and displaying exact before/after output and signed delta.
5. **Simulated Dispatch Disclosure**: Explicitly badged as `"Simulated Dispatch — Prototype (Non-operational)"` with a statement that field personnel are not contacted.

---

## 3. Verification & Test Results

| Test Suite | Command | Status | Notes |
| :--- | :--- | :---: | :--- |
| **Frontend TypeScript & Vite Build** | `npm run build` | **PASS (0 errors)** | Bundle generated in 1.38s with zero type errors. |
| **End-to-End Smoke Test** | `node smoke.mjs` | **PASS** | Validates 7,227 cells, Tree SHAP drivers, evidence endpoint, and live counterfactual inference ($0.945 \to 0.927$). |
| **Backend Pytest** | `pytest tests -q` | **PASS (8/8)** | Verified `/cells`, `/evidence`, `/simulate`, and schema validators. |
| **Live Browser Verification** | Playwright agent | **PASS** | Checked all screens, interactive tabs, simulation sliders, and responsive layout. |

---

## 4. Step-by-Step Jury Presentation Script

When demonstrating to the judges, follow this concise 3-minute sequence:

### Step 1: Open the Map (Establish the Problem & Real Data)
- **Click**: `Explore map` in the left sidebar.
- **Say**: *"RiskTwin AI is an explainable spatial ML decision-support system for civic flood resilience. Rather than showing static vulnerability maps, we map all 7,227 contiguous 250m grid cells across Greater Chennai's 200 wards using high-resolution terrain and land-cover data."*
- **Click**: Click on cell `C0110_0040` (or click the quick button *"Inspect priority hotspot (C0110_0040)"*).

### Step 2: Explain Why (The Tree SHAP Inspector)
- **Show**: The right inspector panel opens with score `0.945 (Very High)`.
- **Say**: *"Every prediction is backed by local Tree SHAP attributions in log-odds space. For cell C0110_0040, the dominant risk drivers are low elevation (3.6m), proximity to river channels (120m), and high built-up imperviousness (88%)."*
- **Click**: The `Drivers` tab to show exact marginal feature attributions, then `Actions` tab to show deterministic planning recommendations mapped to dominant drivers.
- **Click**: The `Exposure` tab to emphasize scientific integrity: *"We intentionally do not fabricate census or school numbers; our exposure tab honestly states that socioeconomic data is scheduled for integration."*

### Step 3: Run the What-If Counterfactual Simulation
- **Click**: The blue button *"Explore green-cover scenario →"*.
- **Say**: *"Traditional GIS tools show where risk is, but don't tell planners what happens if they intervene. In the Scenario Lab, we test converting mapped built-up cover into green permeable buffer."*
- **Action**: Adjust the slider to 25% or 40% and click **"Run Counterfactual Simulation"**.
- **Show**: Live result from FastAPI backend: Score reduces from `0.9452` to `0.9307` ($\Delta -0.0145$).
- **Say**: *"This query hits our FastAPI backend running XGBoost inference in real time, computing the exact marginal shift without hardcoded estimates."*

### Step 4: Show Model Evidence & Validation
- **Click**: `Model evidence` in the left sidebar.
- **Say**: *"We validated our spatial ML model using a strict 500-meter buffer geographic holdout of 1,839 cells to prevent spatial autocorrelation leakage. We achieve a geographic holdout ROC-AUC of 0.627, PR-AUC of 0.350, and F1 of 0.431 on extreme uncalibrated flood events."*

### Step 5: Wrap up with Dispatch Prototype
- **Click**: `Simulated dispatch` in the left sidebar.
- **Say**: *"To bridge the gap between risk intelligence and field operations, we built this simulated dispatch prototype where incident commanders can log mitigation work orders for high-risk zones."*

---

## 5. Technical Questions & Answers (Cheat Sheet for Jury)

- **Q: Why are your SHAP numbers negative and positive decimals instead of percentages?**
  - **A**: *"Tree SHAP operates directly on the model's raw margin—log-odds space. Converting SHAP values to arbitrary percentages masks the non-linear sigmoid activation function. By reporting true log-odds relative to the base margin of +0.754, we maintain strict mathematical fidelity."*
- **Q: How did you split your data for ML validation?**
  - **A**: *"We used spatial block holdout with a 500m separation buffer between training and test cells. Standard random k-fold cross-validation inflates spatial ML metrics because neighboring cells share identical environmental characteristics."*
- **Q: Is the simulation physically modeling water flow?**
  - **A**: *"No, and we are completely transparent about that in the UI. It is an empirical ML sensitivity simulation showing how the trained model responds to altered surface features, serving as an exploratory screening tool prior to hydrodynamic modeling."*
