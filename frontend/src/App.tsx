import { useCallback, useEffect, useMemo, useState } from 'react'
import MapView from './MapView'
import RiskPanel from './RiskPanel'
import { categoryForScore } from './types'
import type {
  ActiveNavTab,
  CellProperties,
  DispatchOrder,
  ModelEvidence,
  RiskFilterState,
  RiskLayer,
  SimulationResult,
} from './types'
import {
  Map as MapIcon,
  Activity,
  Sliders,
  FileText,
  Send,
  Filter,
  Download,
  ChevronDown,
  Info,
  Clock,
  Play,
  X,
  AlertCircle,
  Database,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Minus,
  Layers,
  CheckCircle2,
} from 'lucide-react'

// Default priority hotspot cell ID
const DEFAULT_DEMO_CELL = 'C0110_0040'

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('map')
  const [layer, setLayer] = useState<RiskLayer | null>(null)
  const [evidence, setEvidence] = useState<ModelEvidence | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(DEFAULT_DEMO_CELL)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter state for score tiers
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [riskFilters, setRiskFilters] = useState<RiskFilterState>({
    critical: true,
    high: true,
    moderate: true,
    low: true,
  })

  // Scenario Lab State
  const [simIntensity, setSimIntensity] = useState(25)
  const [simulation, setSimulation] = useState<SimulationResult | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [simulationError, setSimulationError] = useState<string | null>(null)

  // Clear stale simulation result when selected cell or intensity changes
  useEffect(() => {
    setSimulation(null)
    setSimulationError(null)
  }, [selectedId, simIntensity])

  // Simulated Dispatch Workflow State (in-memory prototype)
  const [dispatchModalCell, setDispatchModalCell] = useState<CellProperties | null>(null)
  const [assignedUnit, setAssignedUnit] = useState('Field Response Unit A (Simulated)')
  const [dispatchPriority, setDispatchPriority] = useState<'Immediate' | 'High' | 'Normal'>('Immediate')
  const [dispatchProtocol, setDispatchProtocol] = useState(
    'Inspect canal drainage corridor, assess temporary pumping capacity, and review local road access.'
  )
  const [dispatchNotes, setDispatchNotes] = useState('Simulated session order for scenario demonstration.')
  const [activeDispatches, setActiveDispatches] = useState<DispatchOrder[]>([])

  // Fetch initial layer & evidence
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    Promise.all([
      fetch('/api/cells', { signal: controller.signal }),
      fetch('/api/evidence', { signal: controller.signal }),
    ])
      .then(async ([cellsResponse, evidenceResponse]) => {
        if (!cellsResponse.ok || !evidenceResponse.ok) {
          throw new Error(`Backend unavailable (${cellsResponse.status}/${evidenceResponse.status})`)
        }
        const [cells, metrics] = (await Promise.all([
          cellsResponse.json(),
          evidenceResponse.json(),
        ])) as [RiskLayer, ModelEvidence]
        setLayer(cells)
        setEvidence(metrics)
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to load spatial data')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  // Selected cell object
  const selectedCell = useMemo(() => {
    if (!layer || !selectedId) return null
    return (
      layer.features.find((feature) => feature.properties.cell_id === selectedId)?.properties ?? null
    )
  }, [layer, selectedId])

  // Real What-If Simulation execution calling FastAPI /api/simulate
  const handleRunSimulation = useCallback(
    async (cellIdToSimulate: string) => {
      setSimulating(true)
      setSimulationError(null)
      try {
        const response = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cell_id: cellIdToSimulate,
            intensity: simIntensity / 100,
          }),
        })
        if (!response.ok) throw new Error(`Simulation failed (${response.status})`)
        const data = (await response.json()) as SimulationResult
        if (data.cell_id !== cellIdToSimulate) {
          throw new Error('Simulation response does not match selected cell')
        }
        setSimulation(data)
      } catch (err) {
        setSimulationError(err instanceof Error ? err.message : 'Simulation failed')
      } finally {
        setSimulating(false)
      }
    },
    [simIntensity]
  )

  // Handle Simulated Dispatch Submit
  const handleConfirmDispatch = () => {
    if (!dispatchModalCell) return
    const newOrder: DispatchOrder = {
      id: `SIM-DISP-${Math.floor(1000 + Math.random() * 9000)}`,
      cell_id: dispatchModalCell.cell_id,
      zone_name: `Cell ${dispatchModalCell.cell_id}`,
      risk_score: dispatchModalCell.susceptibility_score,
      team_name: assignedUnit,
      priority: dispatchPriority,
      protocol: dispatchProtocol,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'Simulated Order Created',
      notes: dispatchNotes,
    }

    setActiveDispatches((prev) => [newOrder, ...prev])
    setDispatchModalCell(null)
  }

  // Handle GeoJSON Export
  const handleExportData = () => {
    if (!layer) return
    const blob = new Blob([JSON.stringify(layer, null, 2)], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'chennai_susceptibility_v2.geojson'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="saas-shell">
      {/* 1. LEFT SIDEBAR NAVIGATION matching Image 1 */}
      <aside className="saas-sidebar" aria-label="Main Navigation">
        {/* Brand Header */}
        <div className="sidebar-brand-block">
          <div className="brand-logo-icon">
            <svg viewBox="0 0 40 40" fill="none" className="brand-svg">
              <path
                d="M20 4 35 10v10c0 9.5-6.5 15-15 18C11.5 35 5 29.5 5 20V10L20 4Z"
                fill="#2563EB"
              />
              <path
                d="M11 22c3.5-2.5 6.5 2.5 10 0s5-2 7 0M12 16c3-2 5.5 2 9 0 3-2 5-1.5 7 0"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="brand-name-text">
            RiskTwin <span className="brand-accent">AI</span>
          </span>
        </div>

        {/* Navigation Sections matching Image 1 */}
        <div className="sidebar-nav-sections">
          <div className="nav-group">
            <span className="nav-group-label">WORKSPACE</span>
            <button
              type="button"
              className={`nav-item-btn ${activeTab === 'map' ? 'active' : ''}`}
              onClick={() => setActiveTab('map')}
            >
              <MapIcon size={17} />
              <span>Explore map</span>
            </button>
            <button
              type="button"
              className={`nav-item-btn ${activeTab === 'evidence' ? 'active' : ''}`}
              onClick={() => setActiveTab('evidence')}
            >
              <Activity size={17} />
              <span>Model evidence</span>
            </button>
            <button
              type="button"
              className={`nav-item-btn ${activeTab === 'scenario' ? 'active' : ''}`}
              onClick={() => setActiveTab('scenario')}
            >
              <Sliders size={17} />
              <span>Scenario lab</span>
            </button>
          </div>

          <div className="nav-group">
            <span className="nav-group-label">PROJECT</span>
            <button
              type="button"
              className={`nav-item-btn ${activeTab === 'methods' ? 'active' : ''}`}
              onClick={() => setActiveTab('methods')}
            >
              <FileText size={17} />
              <span>Data &amp; methods</span>
            </button>
            <button
              type="button"
              className={`nav-item-btn ${activeTab === 'dispatch' ? 'active' : ''}`}
              onClick={() => setActiveTab('dispatch')}
            >
              <Send size={17} />
              <span>Dispatch prototype</span>
              {activeDispatches.length > 0 && (
                <span className="nav-badge-count">{activeDispatches.length}</span>
              )}
            </button>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="sidebar-footer-note">
          <span className="footer-title">Chennai Study Area</span>
          <span className="footer-sub">7,227 Cells · 200 GCC Wards</span>
        </div>
      </aside>

      {/* 2. MAIN APPLICATION CONTENT AREA */}
      <div className="saas-main-viewport">
        {/* Minimal White Top Bar matching Image 1 */}
        <header className="saas-top-bar">
          <div className="top-bar-breadcrumbs">
            <span className="breadcrumb-root">Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <span className="breadcrumb-current">
              {activeTab === 'map'
                ? 'Flood risk explorer'
                : activeTab === 'evidence'
                ? 'Model evidence'
                : activeTab === 'scenario'
                ? 'Scenario lab'
                : activeTab === 'methods'
                ? 'Data & methods'
                : 'Dispatch prototype'}
            </span>
          </div>

          <div className="top-bar-right-controls">
            <div className="study-area-dropdown-pill">
              <span className="pill-prefix">Study area</span>
              <div className="pill-select-box">
                <span className="pill-value">Chennai GCC (200 Wards)</span>
                <ChevronDown size={14} className="pill-chevron" />
              </div>
            </div>

            <div className="user-avatar-circle" title="RiskTwin AI Workspace">
              <span>RT</span>
            </div>
          </div>
        </header>

        {/* PAGE 1: EXPLORE MAP SCREEN matching Image 1 */}
        {activeTab === 'map' && (
          <div className="workspace-page-content">
            {/* Page Header matching Image 1 */}
            <div className="page-header-row">
              <div className="header-titles">
                <h1 className="page-title">Flood risk explorer</h1>
                <p className="page-subtitle">
                  Explore spatial risk zones and inspect the factors behind them.
                </p>
              </div>

              <div className="header-actions">
                <button
                  type="button"
                  className={`btn-header-action ${showFilterModal ? 'active-filter' : ''}`}
                  onClick={() => setShowFilterModal(!showFilterModal)}
                >
                  <Filter size={14} />
                  <span>Filter</span>
                </button>
                <button
                  type="button"
                  className="btn-header-action"
                  onClick={handleExportData}
                  title="Export GeoJSON data layer"
                >
                  <Download size={14} />
                  <span>Export</span>
                </button>
              </div>
            </div>

            {/* Filter Dropdown Popover */}
            {showFilterModal && (
              <div className="filter-popover-card">
                <div className="filter-popover-header">
                  <strong>Susceptibility Tier Filter</strong>
                  <button
                    type="button"
                    className="btn-close-popover"
                    onClick={() => setShowFilterModal(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="filter-popover-options">
                  <label className="filter-check-row">
                    <input
                      type="checkbox"
                      checked={riskFilters.critical}
                      onChange={(e) =>
                        setRiskFilters((f) => ({ ...f, critical: e.target.checked }))
                      }
                    />
                    <span className="filter-color-dot dot-critical" />
                    <span>Critical (&ge; 0.75)</span>
                  </label>
                  <label className="filter-check-row">
                    <input
                      type="checkbox"
                      checked={riskFilters.high}
                      onChange={(e) =>
                        setRiskFilters((f) => ({ ...f, high: e.target.checked }))
                      }
                    />
                    <span className="filter-color-dot dot-high" />
                    <span>High (0.50 – 0.75)</span>
                  </label>
                  <label className="filter-check-row">
                    <input
                      type="checkbox"
                      checked={riskFilters.moderate}
                      onChange={(e) =>
                        setRiskFilters((f) => ({ ...f, moderate: e.target.checked }))
                      }
                    />
                    <span className="filter-color-dot dot-moderate" />
                    <span>Moderate (0.25 – 0.50)</span>
                  </label>
                  <label className="filter-check-row">
                    <input
                      type="checkbox"
                      checked={riskFilters.low}
                      onChange={(e) =>
                        setRiskFilters((f) => ({ ...f, low: e.target.checked }))
                      }
                    />
                    <span className="filter-color-dot dot-low" />
                    <span>Low (&lt; 0.25)</span>
                  </label>
                </div>
              </div>
            )}

            {/* Central Two-Column Layout: Map + Inspector matching Image 1 */}
            <div className="explorer-two-column-layout">
              {/* Central Map Canvas Frame */}
              <div className="map-frame-box">
                {layer ? (
                  <MapView
                    layer={layer}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    showSusceptibilityGrid={true}
                    riskFilters={riskFilters}
                  />
                ) : (
                  <div className="map-loading-placeholder">
                    {error ? (
                      <span className="text-red">{error}</span>
                    ) : (
                      <>
                        <div className="loading-spinner" />
                        <span>{loading ? 'Loading spatial grid (7,227 cells)…' : 'No spatial data'}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Right-Hand Selected Location Inspector matching Image 1 */}
              <RiskPanel
                cell={selectedCell}
                onClear={() => setSelectedId(null)}
                onSelectDemo={() => setSelectedId(DEFAULT_DEMO_CELL)}
                onNavigateToScenario={() => setActiveTab('scenario')}
                onOpenDispatch={(cell) => setDispatchModalCell(cell)}
                activeDispatches={activeDispatches}
              />
            </div>
          </div>
        )}

        {/* PAGE 2: MODEL EVIDENCE SCREEN */}
        {activeTab === 'evidence' && (
          <div className="workspace-page-content scrollable">
            <div className="page-header-row">
              <div className="header-titles">
                <h1 className="page-title">Model evidence &amp; spatial validation</h1>
                <p className="page-subtitle">
                  Evaluation on geographically separated northern Chennai holdout (1,839 cells).
                </p>
              </div>
            </div>

            <div className="evidence-grid-layout">
              {/* Metrics Highlights Cards */}
              <div className="evidence-card-box">
                <h3 className="card-box-title">Geographically Separated Holdout Metrics</h3>
                <p className="card-box-desc">
                  Northern quarter of Chennai held out with a 500m transition buffer to prevent spatial
                  autocorrelation leakage.
                </p>

                {evidence && (
                  <div className="metrics-cards-grid">
                    <div className="metric-tile">
                      <span className="tile-label">ROC-AUC</span>
                      <strong className="tile-value">{evidence.metrics.roc_auc.toFixed(3)}</strong>
                      <span className="tile-context">Moderate discrimination</span>
                    </div>
                    <div className="metric-tile">
                      <span className="tile-label">PR-AUC (Avg Precision)</span>
                      <strong className="tile-value">
                        {evidence.metrics.pr_auc_average_precision.toFixed(3)}
                      </strong>
                      <span className="tile-context">Vs 25.1% prevalence</span>
                    </div>
                    <div className="metric-tile">
                      <span className="tile-label">Precision</span>
                      <strong className="tile-value">{evidence.metrics.precision.toFixed(3)}</strong>
                      <span className="tile-context">At 0.5 threshold</span>
                    </div>
                    <div className="metric-tile">
                      <span className="tile-label">Recall</span>
                      <strong className="tile-value">{evidence.metrics.recall.toFixed(3)}</strong>
                      <span className="tile-context">Detects 70.5% floods</span>
                    </div>
                    <div className="metric-tile">
                      <span className="tile-label">F1 Score</span>
                      <strong className="tile-value">{evidence.metrics.f1.toFixed(3)}</strong>
                      <span className="tile-context">Balanced metric</span>
                    </div>
                    <div className="metric-tile">
                      <span className="tile-label">Holdout Cells</span>
                      <strong className="tile-value">{evidence.holdout_cells.toLocaleString()}</strong>
                      <span className="tile-context">1,839 test cells</span>
                    </div>
                  </div>
                )}

                <div className="confusion-matrix-section">
                  <h4>Confusion Matrix (Holdout at 0.5 Threshold)</h4>
                  <table className="confusion-table">
                    <thead>
                      <tr>
                        <th>Actual \ Predicted</th>
                        <th>Predicted Dry (0)</th>
                        <th>Predicted Flooded (1)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>Actual Dry (0)</strong></td>
                        <td>656 (True Negatives)</td>
                        <td>722 (False Positives)</td>
                      </tr>
                      <tr>
                        <td><strong>Actual Flooded (1)</strong></td>
                        <td>136 (False Negatives)</td>
                        <td>325 (True Positives)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Global Feature Importance (Tree SHAP Mean |Log-Odds|) */}
              <div className="evidence-card-box">
                <h3 className="card-box-title">Global Feature Importance (Tree SHAP)</h3>
                <p className="card-box-desc">
                  Mean absolute Tree SHAP values across the study area in log-odds space. Base value:
                  +0.754 log-odds.
                </p>

                <div className="shap-global-list">
                  <div className="shap-global-item">
                    <span className="item-name">Mean Elevation (Copernicus DEM)</span>
                    <div className="item-bar-track">
                      <div className="item-bar-fill fill-red" style={{ width: '100%' }} />
                    </div>
                    <strong className="item-val">0.788 log-odds</strong>
                  </div>
                  <div className="shap-global-item">
                    <span className="item-name">River Edge Distance</span>
                    <div className="item-bar-track">
                      <div className="item-bar-fill fill-orange" style={{ width: '41%' }} />
                    </div>
                    <strong className="item-val">0.322 log-odds</strong>
                  </div>
                  <div className="shap-global-item">
                    <span className="item-name">Minimum Elevation</span>
                    <div className="item-bar-track">
                      <div className="item-bar-fill fill-orange" style={{ width: '40%' }} />
                    </div>
                    <strong className="item-val">0.319 log-odds</strong>
                  </div>
                  <div className="shap-global-item">
                    <span className="item-name">Built-Up Fraction 2021 (WorldCover)</span>
                    <div className="item-bar-track">
                      <div className="item-bar-fill fill-amber" style={{ width: '31%' }} />
                    </div>
                    <strong className="item-val">0.246 log-odds</strong>
                  </div>
                  <div className="shap-global-item">
                    <span className="item-name">Distance to Waterbody</span>
                    <div className="item-bar-track">
                      <div className="item-bar-fill fill-amber" style={{ width: '29%' }} />
                    </div>
                    <strong className="item-val">0.232 log-odds</strong>
                  </div>
                  <div className="shap-global-item">
                    <span className="item-name">Distance to River</span>
                    <div className="item-bar-track">
                      <div className="item-bar-fill fill-teal" style={{ width: '25%' }} />
                    </div>
                    <strong className="item-val">0.194 log-odds</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PAGE 3: SCENARIO LAB SCREEN */}
        {activeTab === 'scenario' && (
          <div className="workspace-page-content scrollable">
            <div className="page-header-row">
              <div className="header-titles">
                <h1 className="page-title">Scenario lab — Green-cover intervention</h1>
                <p className="page-subtitle">
                  Test model sensitivity to converting mapped impervious built-up hardscape to permeable
                  green cover.
                </p>
              </div>
            </div>

            <div className="scenario-lab-layout">
              {/* Controls Column */}
              <div className="scenario-controls-box">
                <div className="scenario-active-target">
                  <span className="target-label">Selected Target Cell</span>
                  <strong className="target-value">{selectedId ?? 'C0110_0040'}</strong>
                  <span className="target-note">
                    {selectedCell
                      ? `Current score: ${selectedCell.susceptibility_score.toFixed(3)}`
                      : 'High susceptibility cell'}
                  </span>
                </div>

                <div className="scenario-feature-box">
                  <span className="feature-label">Model Transformation Feature</span>
                  <div className="feature-pill">
                    <code>built_up_fraction_2021</code>
                  </div>
                  <p className="feature-desc">
                    Alters mapped artificial surface cover. Elevation, slope, and water distance remain
                    fixed.
                  </p>
                </div>

                <div className="scenario-slider-section">
                  <div className="slider-header-row">
                    <label>Conversion Intensity</label>
                    <strong className="intensity-value">{simIntensity}%</strong>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="50"
                    step="5"
                    value={simIntensity}
                    onChange={(e) => setSimIntensity(Number(e.target.value))}
                    className="saas-range-slider"
                  />
                  <div className="slider-range-labels">
                    <span>10% (Modest)</span>
                    <span>30%</span>
                    <span>50% (Max)</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-run-scenario-main"
                  onClick={() => selectedId && handleRunSimulation(selectedId)}
                  disabled={simulating || !selectedId}
                >
                  {simulating ? <Clock size={16} className="spin" /> : <Play size={16} />}
                  <span>{simulating ? 'Running XGBoost inference…' : 'Run scenario on backend'}</span>
                </button>
              </div>

              {/* Output Display Column */}
              <div className="scenario-results-box">
                <h3 className="results-box-heading">FastAPI Model Inference Result</h3>

                {simulation ? (() => {
                  const isDecrease = simulation.score_change < -0.0005
                  const isIncrease = simulation.score_change > 0.0005
                  const deltaColor = isDecrease ? '#0D9488' : isIncrease ? '#DC2626' : '#64748B'
                  const DeltaIcon = isDecrease ? TrendingDown : isIncrease ? TrendingUp : Minus
                  const baseCat = categoryForScore(simulation.baseline_susceptibility)
                  const scenCat = categoryForScore(simulation.scenario_susceptibility)

                  return (
                    <div className="simulation-live-result-wrap">
                      <div className="comparison-tiles-pair">
                        <div className="comp-tile before">
                          <span className="comp-tile-label">Baseline Score</span>
                          <strong className="comp-tile-score">
                            {simulation.baseline_susceptibility.toFixed(4)}
                          </strong>
                          <span className="comp-tile-meta">
                            Built-up: {(simulation.baseline_feature_value * 100).toFixed(1)}% · {baseCat}
                          </span>
                        </div>

                        <ArrowRight size={22} className="comp-arrow" />

                        <div className="comp-tile after">
                          <span className="comp-tile-label">Altered Model Score</span>
                          <strong className="comp-tile-score" style={{ color: deltaColor }}>
                            {simulation.scenario_susceptibility.toFixed(4)}
                          </strong>
                          <span className="comp-tile-meta">
                            Built-up: {(simulation.scenario_feature_value * 100).toFixed(1)}% · {scenCat}
                          </span>
                        </div>
                      </div>

                      {/* Animated Score Comparison Bars */}
                      <div className="sim-comparison-bars">
                        <div className="sim-bar-row">
                          <span className="sim-bar-label">Baseline</span>
                          <div className="sim-bar-track">
                            <div
                              className="sim-bar-fill baseline"
                              style={{ width: `${Math.min(100, Math.max(5, simulation.baseline_susceptibility * 100))}%` }}
                            />
                          </div>
                          <span className="sim-bar-val">{simulation.baseline_susceptibility.toFixed(4)}</span>
                        </div>
                        <div className="sim-bar-row">
                          <span className="sim-bar-label">Scenario</span>
                          <div className="sim-bar-track">
                            <div
                              className="sim-bar-fill scenario"
                              style={{
                                width: `${Math.min(100, Math.max(5, simulation.scenario_susceptibility * 100))}%`,
                                backgroundColor: deltaColor,
                              }}
                            />
                          </div>
                          <span className="sim-bar-val" style={{ color: deltaColor }}>
                            {simulation.scenario_susceptibility.toFixed(4)}
                          </span>
                        </div>
                      </div>

                      {/* Score Delta with directional coloring */}
                      <div
                        className="score-delta-summary-card"
                        style={{
                          backgroundColor: isDecrease ? '#ECFDF5' : isIncrease ? '#FEF2F2' : '#F8FAFC',
                          borderColor: isDecrease ? '#A7F3D0' : isIncrease ? '#FECACA' : '#CBD5E1',
                        }}
                      >
                        <div className="delta-left">
                          <DeltaIcon size={20} style={{ color: deltaColor }} />
                          <div>
                            <strong style={{ color: deltaColor }}>
                              Score Delta: {simulation.score_change >= 0 ? `+${simulation.score_change.toFixed(4)}` : simulation.score_change.toFixed(4)}
                            </strong>
                            <p style={{ color: deltaColor }}>
                              {isDecrease
                                ? `Model susceptibility reduced by ${Math.abs(simulation.score_change).toFixed(4)} under ${simIntensity}% green-cover conversion.`
                                : isIncrease
                                ? `Model susceptibility increased under this perturbation.`
                                : `Negligible marginal score shift under this conversion intensity.`}
                            </p>
                            <span className="category-shift-note">
                              {baseCat === scenCat
                                ? `Tier remains ${baseCat} (incremental sensitivity shift within existing risk band).`
                                : `Risk tier shifted from ${baseCat} to ${scenCat}.`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Concise visual explanation chain */}
                      <div className="sim-chain-pill">
                        <span><strong>Process:</strong> Land-cover input changed → Saved XGBoost model rerun via FastAPI → Susceptibility scores compared.</span>
                      </div>

                      <div className="simulation-caveat-box">
                        <Info size={15} />
                        <p>
                          <strong>Methodological Note:</strong> This scenario measures input sensitivity of
                          the trained XGBoost model. It is an empirical indicator, not a validated 2D
                          hydrodynamic drainage forecast.
                        </p>
                      </div>
                    </div>
                  )
                })() : (
                  <div className="scenario-idle-state">
                    {simulating ? (
                      <div className="idle-message">
                        <div className="loading-spinner" />
                        <span>Evaluating altered feature vector through FastAPI...</span>
                      </div>
                    ) : simulationError ? (
                      <div className="idle-message text-red">
                        <AlertCircle size={20} />
                        <span>{simulationError}</span>
                      </div>
                    ) : (
                      <div className="idle-message">
                        <Sliders size={24} className="text-muted" />
                        <strong>No active scenario calculated yet</strong>
                        <p>
                          Select a conversion share and click "Run scenario on backend" to inspect the
                          score change for cell {selectedId ?? 'C0110_0040'}.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PAGE 4: DATA & METHODS SCREEN */}
        {activeTab === 'methods' && (
          <div className="workspace-page-content scrollable">
            <div className="page-header-row">
              <div className="header-titles">
                <h1 className="page-title">Data sources &amp; methodology</h1>
                <p className="page-subtitle">
                  Scientific provenance, geospatial inputs, and machine learning pipeline design.
                </p>
              </div>
            </div>

            <div className="methods-cards-stack">
              <div className="method-card">
                <div className="method-card-header">
                  <Database size={18} className="text-blue" />
                  <h3>1. Geospatial Data Ingestion &amp; 250m Metric Tessellation</h3>
                </div>
                <div className="method-card-body">
                  <p>
                    The study area comprises the 200 numbered wards of the Greater Chennai Corporation.
                    All boundary polygons were projected from WGS84 (EPSG:4326) to <strong>UTM Zone 44N
                    (EPSG:32644)</strong> to preserve metric distances. A tessellated 250m grid was
                    clipped to the ward perimeter, yielding exactly <strong>7,227 analysis cells</strong>.
                  </p>
                </div>
              </div>

              <div className="method-card">
                <div className="method-card-header">
                  <Layers size={18} className="text-blue" />
                  <h3>2. Physical Feature Engineering</h3>
                </div>
                <div className="method-card-body">
                  <ul className="methods-bullets">
                    <li>
                      <strong>Copernicus GLO-30 DEM:</strong> Sampled at 30m resolution to compute mean
                      elevation, minimum elevation, slope gradient (degrees), and relative 1km elevation.
                    </li>
                    <li>
                      <strong>OpenStreetMap Waterways:</strong> Ingested rivers, streams, canals, and water
                      bodies via OSMnx. Computed nearest Euclidean Euclidean distances per cell.
                    </li>
                    <li>
                      <strong>ESA WorldCover 2021:</strong> 10m satellite classification aggregating the
                      fraction of impervious artificial built-up surface per cell.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="method-card">
                <div className="method-card-header">
                  <Activity size={18} className="text-blue" />
                  <h3>3. Machine Learning &amp; Tree SHAP Attribution</h3>
                </div>
                <div className="method-card-body">
                  <p>
                    Trained an <strong>XGBoost classifier</strong> against binary historical inundation
                    labels from the 2015 Chennai flood (NRSC KML). Evaluated strictly on the northern 1,839
                    cells with a 500m transition buffer to prevent spatial autocorrelation leakage.
                    Exact feature attributions are computed natively via <strong>Tree SHAP</strong> in
                    log-odds margin space.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PAGE 5: DISPATCH PROTOTYPE SCREEN */}
        {activeTab === 'dispatch' && (
          <div className="workspace-page-content scrollable">
            <div className="page-header-row">
              <div className="header-titles">
                <h1 className="page-title">Simulated dispatch — Prototype</h1>
                <p className="page-subtitle">
                  Demonstration of how SHAP-informed recommendations can be structured into municipal
                  field orders.
                </p>
              </div>
            </div>

            <div className="dispatch-prototype-layout">
              <div className="prototype-disclaimer-banner">
                <AlertCircle size={18} className="text-amber" />
                <div className="disclaimer-text">
                  <strong>Prototype Simulation Mode:</strong> Orders exist only in temporary frontend
                  browser memory for this demonstration. No municipal emergency services or physical
                  squads are contacted.
                </div>
              </div>

              <div className="dispatch-roster-box">
                <div className="roster-header">
                  <h3>Session Directives ({activeDispatches.length})</h3>
                  <button
                    type="button"
                    className="btn-create-dispatch-header"
                    onClick={() => selectedCell && setDispatchModalCell(selectedCell)}
                  >
                    Create order for active cell ({selectedId ?? 'C0110_0040'})
                  </button>
                </div>

                {activeDispatches.length === 0 ? (
                  <div className="empty-roster-state">
                    <Send size={24} className="text-muted" />
                    <strong>No simulated orders created in this session</strong>
                    <p>
                      Inspect a cell on the map or click the button above to test the prototype
                      directive creation flow.
                    </p>
                  </div>
                ) : (
                  <div className="roster-table-wrap">
                    <table className="roster-table">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Target Cell</th>
                          <th>Model Score</th>
                          <th>Assigned Team</th>
                          <th>Priority</th>
                          <th>Status</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDispatches.map((order) => (
                          <tr key={order.id}>
                            <td><strong>{order.id}</strong></td>
                            <td>{order.zone_name}</td>
                            <td>
                              <span className="table-score-badge">{order.risk_score.toFixed(3)}</span>
                            </td>
                            <td>{order.team_name}</td>
                            <td><span className="table-priority-tag">{order.priority}</span></td>
                            <td>
                              <span className="table-status-tag">
                                <CheckCircle2 size={12} /> {order.status}
                              </span>
                            </td>
                            <td>{order.timestamp}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. SIMULATED DISPATCH DIRECTIVE MODAL */}
      {dispatchModalCell && (
        <div className="saas-modal-backdrop" onClick={() => setDispatchModalCell(null)}>
          <div className="saas-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3>Simulate Mitigation Dispatch (Prototype)</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setDispatchModalCell(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body-content">
              <div className="modal-warning-box">
                <AlertCircle size={15} />
                <span>
                  Prototype only: This simulated order is stored in browser memory during this
                  session.
                </span>
              </div>

              <div className="modal-cell-meta-bar">
                <div>
                  <span className="meta-sub">Target Cell:</span>
                  <strong>{dispatchModalCell.cell_id}</strong>
                </div>
                <div>
                  <span className="meta-sub">Score:</span>
                  <strong className="text-red">
                    {dispatchModalCell.susceptibility_score.toFixed(3)}
                  </strong>
                </div>
                <div>
                  <span className="meta-sub">Zone:</span>
                  <strong>{dispatchModalCell.validation_region}</strong>
                </div>
              </div>

              <div className="modal-form-group">
                <label>Assigned Unit (Demo Identifier)</label>
                <select
                  value={assignedUnit}
                  onChange={(e) => setAssignedUnit(e.target.value)}
                  className="modal-select-input"
                >
                  <option>Field Response Unit A (Simulated)</option>
                  <option>Drainage Maintenance Crew 01 (Simulated)</option>
                  <option>Mobile Dewatering Unit 02 (Simulated)</option>
                </select>
              </div>

              <div className="modal-form-group">
                <label>Priority</label>
                <select
                  value={dispatchPriority}
                  onChange={(e) => setDispatchPriority(e.target.value as any)}
                  className="modal-select-input"
                >
                  <option>Immediate</option>
                  <option>High</option>
                  <option>Normal</option>
                </select>
              </div>

              <div className="modal-form-group">
                <label>Protocol Directive</label>
                <textarea
                  value={dispatchProtocol}
                  onChange={(e) => setDispatchProtocol(e.target.value)}
                  className="modal-textarea-input"
                  rows={2}
                />
              </div>

              <div className="modal-form-group">
                <label>Session Notes</label>
                <input
                  type="text"
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  className="modal-text-input"
                />
              </div>

              <div className="modal-actions-row">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setDispatchModalCell(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-modal-submit"
                  onClick={handleConfirmDispatch}
                  id="btn-confirm-dispatch-order"
                >
                  <span>Create Simulated Order</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
