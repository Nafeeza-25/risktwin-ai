import { useCallback, useEffect, useMemo, useState } from 'react'
import MapView from './MapView'
import RiskPanel from './RiskPanel'
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
  Layers,
  Calendar,
  Filter,
  MapPin,
  User,
  Sliders,
  Send,
  Printer,
  TrendingDown,
  ArrowRight,
  Clock,
  Activity,
  Play,
  X,
  AlertCircle,
  Database,
} from 'lucide-react'

// Priority demo cell ID (Very High / Critical risk cell)
const DEMO_CELL_ID = 'C0110_0040'

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('dashboard')
  const [layer, setLayer] = useState<RiskLayer | null>(null)
  const [evidence, setEvidence] = useState<ModelEvidence | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(DEMO_CELL_ID)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Map Controls
  const [showSusceptibilityGrid, setShowSusceptibilityGrid] = useState(true)
  const [riskFilters, setRiskFilters] = useState<RiskFilterState>({
    critical: true,
    high: true,
    moderate: true,
    low: true,
  })

  // Bottom What-If Simulator State (Only implemented model transformation)
  const [simIntensity, setSimIntensity] = useState(25)
  const [simulation, setSimulation] = useState<SimulationResult | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [simulationError, setSimulationError] = useState<string | null>(null)

  // Clear stale simulation result whenever selected cell or intensity changes
  useEffect(() => {
    setSimulation(null)
    setSimulationError(null)
  }, [selectedId, simIntensity])

  // Admin Profile & Dispatch Workflow State (Explicit prototype in frontend memory)
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [dispatchModalCell, setDispatchModalCell] = useState<CellProperties | null>(null)
  const [assignedUnit, setAssignedUnit] = useState('Field Response Unit A (Simulated)')
  const [dispatchPriority, setDispatchPriority] = useState<'Immediate' | 'High' | 'Normal'>('Immediate')
  const [dispatchProtocol, setDispatchProtocol] = useState(
    'Inspect canal drainage corridor, assess temporary pumping capacity, and review local road access.'
  )
  const [dispatchNotes, setDispatchNotes] = useState('Simulation test for scenario planning demonstration.')
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

  // Category counts and statistics directly from the 7,227 cells
  const stats = useMemo(() => {
    if (!layer) return { criticalPct: 0, highPct: 0, modPct: 0, lowPct: 0, totalCells: 0, criticalCount: 0, highCount: 0 }
    let critical = 0
    let high = 0
    let moderate = 0
    let low = 0

    for (const f of layer.features) {
      const s = f.properties.susceptibility_score
      if (s >= 0.75) critical++
      else if (s >= 0.5) high++
      else if (s >= 0.25) moderate++
      else low++
    }

    const total = layer.features.length || 1
    const criticalPct = Math.round((critical / total) * 100)
    const highPct = Math.round((high / total) * 100)
    const modPct = Math.round((moderate / total) * 100)
    const lowPct = 100 - criticalPct - highPct - modPct

    return {
      totalCells: total,
      criticalCount: critical,
      highCount: high,
      criticalPct,
      highPct,
      modPct,
      lowPct,
    }
  }, [layer])

  // Run What-If Simulation via FastAPI /simulate
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

  return (
    <div className="app-shell">
      {/* 1. TOP NAVIGATION BAR */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-logo-mark" aria-hidden="true">
            <svg viewBox="0 0 44 44" fill="none">
              <path
                d="M22 3 39 10v12c0 11-7.5 17-17 20C12.5 39 5 33 5 22V10L22 3Z"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <path
                d="M11 25c4.5-3.5 8.5 3.5 13 0s6.5-2.5 9 0M12 18c3.5-2.5 7 2.5 11 0 3.5-2.5 6.5-1.5 9 0"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="brand-text">
            <div className="brand-title">
              RiskTwin <span>AI</span>
            </div>
            <div className="brand-subtitle">Chennai Flood Susceptibility &amp; Mitigation Decision Support</div>
          </div>
        </div>

        {/* Central Nav Tabs */}
        <nav className="header-nav-tabs" aria-label="Main Navigation">
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'analysis' ? 'active' : ''}`}
            onClick={() => setActiveTab('analysis')}
          >
            Model Evidence
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'planner' ? 'active' : ''}`}
            onClick={() => setActiveTab('planner')}
          >
            Dispatch Prototype
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'simulator' ? 'active' : ''}`}
            onClick={() => setActiveTab('simulator')}
          >
            What-If Simulator
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            Technical Summary
          </button>
        </nav>

        {/* Right Header Controls: Location & Admin Profile */}
        <div className="header-right-tools">
          <div className="location-selector-pill">
            <MapPin size={15} className="location-icon" />
            <span className="location-name">Chennai GCC</span>
            <span className="location-badge">200 Wards (7,227 Cells)</span>
          </div>

          <button
            type="button"
            className="admin-profile-btn"
            onClick={() => setShowAdminModal(true)}
            title="Open Simulated Admin Prototype"
            id="btn-admin-profile"
          >
            <div className="admin-avatar">
              <User size={16} />
            </div>
            <div className="admin-meta">
              <span className="admin-name">Admin (Simulation Mode)</span>
              <span className="admin-role">Prototype Dispatch Desk</span>
            </div>
            {activeDispatches.length > 0 && (
              <span className="dispatch-badge-count" title="Simulated orders in session">
                {activeDispatches.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* 2. MAIN APPLICATION CONTENT AREA */}
      {activeTab === 'dashboard' && (
        <div className="app-main-layout">
          {/* LEFT SIDEBAR: Layers, Event Baseline, Risk Filter */}
          <aside className="sidebar-left" aria-label="Map Layer Controls">
            {/* Layers Toggle Section */}
            <div className="sidebar-group">
              <div className="sidebar-group-title">
                <Layers size={15} />
                <span>Rendered Layers</span>
              </div>
              <div className="layer-checkbox-list">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={showSusceptibilityGrid}
                    onChange={(e) => setShowSusceptibilityGrid(e.target.checked)}
                  />
                  <span className="checkbox-label">
                    Flood Susceptibility Grid (7,227 cells)
                  </span>
                </label>
              </div>

              {/* Informative list of derived feature sources */}
              <div className="derived-sources-box">
                <div className="derived-sources-title">
                  <Database size={13} />
                  <span>Feature Sources (Aggregated)</span>
                </div>
                <ul className="derived-sources-list">
                  <li>Copernicus GLO-30 DEM (Elevation / Slope)</li>
                  <li>OpenStreetMap (River &amp; Waterbody Distances)</li>
                  <li>ESA WorldCover 2021 (Built-Up Fraction)</li>
                  <li>NRSC 2015 KML (Historical Training Label)</li>
                </ul>
              </div>
            </div>

            {/* Time / Event Reference (Honest static reference) */}
            <div className="sidebar-group">
              <div className="sidebar-group-title">
                <Calendar size={15} />
                <span>Event Reference</span>
              </div>
              <div className="static-event-box">
                <span className="event-name">2015 Inundation Baseline (NRSC)</span>
                <p className="event-note">
                  Static spatial susceptibility model; dynamic temporal forecasting not integrated.
                </p>
              </div>
            </div>

            {/* Risk Level Filter (Active filtering on map) */}
            <div className="sidebar-group">
              <div className="sidebar-group-title">
                <Filter size={15} />
                <span>Susceptibility Score Filter</span>
              </div>
              <div className="risk-filter-list">
                <label className="filter-chip-row">
                  <input
                    type="checkbox"
                    checked={riskFilters.critical}
                    onChange={(e) =>
                      setRiskFilters((f) => ({ ...f, critical: e.target.checked }))
                    }
                  />
                  <span className="chip-indicator bg-red" />
                  <span className="filter-chip-name">Critical (&ge; 0.75)</span>
                </label>

                <label className="filter-chip-row">
                  <input
                    type="checkbox"
                    checked={riskFilters.high}
                    onChange={(e) => setRiskFilters((f) => ({ ...f, high: e.target.checked }))}
                  />
                  <span className="chip-indicator bg-orange" />
                  <span className="filter-chip-name">High (0.50 – 0.75)</span>
                </label>

                <label className="filter-chip-row">
                  <input
                    type="checkbox"
                    checked={riskFilters.moderate}
                    onChange={(e) =>
                      setRiskFilters((f) => ({ ...f, moderate: e.target.checked }))
                    }
                  />
                  <span className="chip-indicator bg-yellow" />
                  <span className="filter-chip-name">Moderate (0.25 – 0.50)</span>
                </label>

                <label className="filter-chip-row">
                  <input
                    type="checkbox"
                    checked={riskFilters.low}
                    onChange={(e) => setRiskFilters((f) => ({ ...f, low: e.target.checked }))}
                  />
                  <span className="chip-indicator bg-green" />
                  <span className="filter-chip-name">Low (&lt; 0.25)</span>
                </label>
              </div>
            </div>
          </aside>

          {/* CENTER VIEW: Interactive Map & Bottom Widgets */}
          <main className="center-map-workspace">
            {layer ? (
              <MapView
                layer={layer}
                selectedId={selectedId}
                onSelect={setSelectedId}
                showSusceptibilityGrid={showSusceptibilityGrid}
                riskFilters={riskFilters}
              />
            ) : (
              <div className="map-loading-indicator">
                {error ? (
                  <span className="text-red">{error}</span>
                ) : (
                  <>
                    <div className="loading-spinner" />
                    <span>{loading ? 'Loading Chennai Geospatial Twin (7,227 cells)…' : 'No spatial data'}</span>
                  </>
                )}
              </div>
            )}

            {/* BOTTOM DOCK OVERLAY */}
            <div className="bottom-dashboard-dock">
              {/* Left Widget: Real Grid Distribution Statistics */}
              <div className="dock-widget statistics-widget">
                <div className="widget-header">
                  <div className="widget-title">
                    <Activity size={14} />
                    <span>Grid Susceptibility Distribution</span>
                  </div>
                </div>

                <div className="widget-body-stats">
                  {/* SVG Donut Chart from real 7,227 cell counts */}
                  <div className="donut-chart-container">
                    <svg viewBox="0 0 100 100" className="donut-svg">
                      <circle cx="50" cy="50" r="38" className="donut-track" />
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        className="donut-slice-critical"
                        strokeDasharray={`${stats.criticalPct * 2.38} 238`}
                        strokeDashoffset="0"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        className="donut-slice-high"
                        strokeDasharray={`${stats.highPct * 2.38} 238`}
                        strokeDashoffset={`-${stats.criticalPct * 2.38}`}
                      />
                    </svg>
                    <div className="donut-center-label">
                      <strong>{stats.criticalPct + stats.highPct}%</strong>
                      <span>High / Crit</span>
                    </div>
                  </div>

                  <div className="stats-breakdown-col">
                    <div className="stat-pill-row">
                      <span className="legend-dot bg-red" />
                      <span className="pill-name">Critical:</span>
                      <strong className="pill-val">
                        {stats.criticalCount} ({stats.criticalPct}%)
                      </strong>
                    </div>
                    <div className="stat-pill-row">
                      <span className="legend-dot bg-orange" />
                      <span className="pill-name">High:</span>
                      <strong className="pill-val">
                        {stats.highCount} ({stats.highPct}%)
                      </strong>
                    </div>
                    <div className="stat-pill-row">
                      <span className="legend-dot bg-yellow" />
                      <span className="pill-name">Moderate:</span>
                      <strong className="pill-val">{stats.modPct}%</strong>
                    </div>
                    <div className="stat-pill-row">
                      <span className="legend-dot bg-green" />
                      <span className="pill-name">Low:</span>
                      <strong className="pill-val">{stats.lowPct}%</strong>
                    </div>
                  </div>

                  <div className="stats-summary-col">
                    <div className="summary-metric">
                      <span className="sub-label">Study Extent</span>
                      <strong className="main-val">{stats.totalCells.toLocaleString()} Metric Cells</strong>
                    </div>
                    <div className="summary-metric">
                      <span className="sub-label">Resolution</span>
                      <strong className="main-val">250m UTM Zone 44N</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Widget: Real What-If Mitigation Simulator (Only implemented feature) */}
              <div className="dock-widget simulator-widget">
                <div className="widget-header">
                  <div className="widget-title">
                    <Sliders size={14} />
                    <span>Green-Cover What-If Scenario</span>
                  </div>
                  <div className="intensity-slider-wrap">
                    <span className="slider-label">Conversion: {simIntensity}%</span>
                    <input
                      type="range"
                      min="10"
                      max="50"
                      step="5"
                      value={simIntensity}
                      onChange={(e) => setSimIntensity(Number(e.target.value))}
                      className="mini-range-slider"
                    />
                  </div>
                </div>

                <div className="widget-body-sim">
                  <div className="sim-control-row">
                    <div className="sim-feature-tag">
                      Target Feature: <code>built_up_fraction_2021</code>
                    </div>

                    <button
                      type="button"
                      className="sim-run-btn"
                      onClick={() => selectedId && handleRunSimulation(selectedId)}
                      disabled={simulating || !selectedId}
                      id="btn-run-simulation"
                    >
                      {simulating ? <Clock size={14} className="spin" /> : <Play size={14} />}
                      <span>{simulating ? 'Evaluating…' : 'Run Scenario'}</span>
                    </button>
                  </div>

                  {/* Result display: Only shown after genuine API call */}
                  {simulation ? (
                    <div className="sim-tiles-row">
                      <div className="sim-tile before-tile">
                        <span className="tile-title">Baseline Model Score</span>
                        <div className="tile-mini-grid bg-grid-red">
                          <span className="tile-score-badge bg-red">
                            {simulation.baseline_susceptibility.toFixed(4)}
                          </span>
                        </div>
                      </div>

                      <ArrowRight size={18} className="sim-arrow" />

                      <div className="sim-tile after-tile">
                        <span className="tile-title">
                          Altered Input (Cover: {(simulation.scenario_feature_value * 100).toFixed(0)}%)
                        </span>
                        <div className="tile-mini-grid bg-grid-green">
                          <span className="tile-score-badge bg-yellow">
                            {simulation.scenario_susceptibility.toFixed(4)}
                          </span>
                        </div>
                      </div>

                      <div className="sim-delta-card">
                        <span className="delta-label">Model Score Delta</span>
                        <strong className="delta-val text-emerald">
                          <TrendingDown size={16} />
                          {simulation.score_change.toFixed(4)}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <div className="sim-idle-prompt">
                      {simulating ? (
                        <span>Evaluating altered built-up fraction through saved XGBoost model…</span>
                      ) : simulationError ? (
                        <span className="text-red">{simulationError}</span>
                      ) : (
                        <span>
                          Select conversion share (10%–50%) and click Run Scenario to evaluate cell {selectedId ?? 'C0110_0040'}.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>

          {/* RIGHT SIDEBAR: Selected Cell Intelligence */}
          <RiskPanel
            cell={selectedCell}
            onClear={() => setSelectedId(null)}
            onSelectDemo={() => setSelectedId(DEMO_CELL_ID)}
            onOpenDispatch={(cell) => setDispatchModalCell(cell)}
            activeDispatches={activeDispatches}
          />
        </div>
      )}

      {/* VIEW 2: MODEL EVIDENCE TAB (Scientifically verified) */}
      {activeTab === 'analysis' && (
        <div className="tab-fullscreen-container">
          <div className="tab-header-banner">
            <h2>Model Evaluation &amp; Spatial Evidence</h2>
            <p>
              Evaluation on a geographically separated holdout in northern Chennai, with a 500m
              transition gap to avoid spatial autocorrelation leakage.
            </p>
          </div>

          <div className="analysis-grid-cards">
            {evidence && (
              <div className="analysis-card">
                <h3>Geographically Separated Holdout Metrics</h3>
                <div className="metrics-pill-matrix">
                  <div className="metric-box">
                    <span>ROC-AUC</span>
                    <strong>{evidence.metrics.roc_auc.toFixed(3)}</strong>
                  </div>
                  <div className="metric-box">
                    <span>PR-AUC</span>
                    <strong>{evidence.metrics.pr_auc_average_precision.toFixed(3)}</strong>
                  </div>
                  <div className="metric-box">
                    <span>Precision</span>
                    <strong>{evidence.metrics.precision.toFixed(3)}</strong>
                  </div>
                  <div className="metric-box">
                    <span>Recall</span>
                    <strong>{evidence.metrics.recall.toFixed(3)}</strong>
                  </div>
                </div>
                <div className="holdout-stats-row">
                  <div>
                    <span>Holdout Cells:</span> <strong>{evidence.holdout_cells.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Holdout Flood Prevalence:</span>{' '}
                    <strong>{(evidence.positive_prevalence * 100).toFixed(1)}%</strong>
                  </div>
                  <div>
                    <span>F1 Score (0.5 threshold):</span>{' '}
                    <strong>{evidence.metrics.f1.toFixed(3)}</strong>
                  </div>
                </div>
                <p className="analysis-desc-text">
                  Model discrimination is moderate (ROC-AUC 0.627). Scores are uncalibrated similarity
                  metrics to the 2015 mapped inundation footprint, not future-flood probabilities.
                </p>
              </div>
            )}

            {/* Global SHAP Mean Absolute Values directly from outputs/chennai_shap_summary.json */}
            <div className="analysis-card">
              <h3>Global Feature Importance (Tree SHAP Mean |Log-Odds|)</h3>
              <div className="feature-bar-list">
                <div className="feature-bar-item">
                  <span>Mean Elevation (Copernicus DEM)</span>
                  <div className="progress-bar">
                    <div className="progress-fill bg-red" style={{ width: '100%' }} />
                  </div>
                  <strong>0.788 log-odds</strong>
                </div>
                <div className="feature-bar-item">
                  <span>River Edge Distance</span>
                  <div className="progress-bar">
                    <div className="progress-fill bg-orange" style={{ width: '41%' }} />
                  </div>
                  <strong>0.322 log-odds</strong>
                </div>
                <div className="feature-bar-item">
                  <span>Minimum Elevation</span>
                  <div className="progress-bar">
                    <div className="progress-fill bg-orange" style={{ width: '40%' }} />
                  </div>
                  <strong>0.319 log-odds</strong>
                </div>
                <div className="feature-bar-item">
                  <span>Built-Up Fraction 2021 (WorldCover)</span>
                  <div className="progress-bar">
                    <div className="progress-fill bg-yellow" style={{ width: '31%' }} />
                  </div>
                  <strong>0.246 log-odds</strong>
                </div>
                <div className="feature-bar-item">
                  <span>Distance to Waterbody</span>
                  <div className="progress-bar">
                    <div className="progress-fill bg-yellow" style={{ width: '29%' }} />
                  </div>
                  <strong>0.232 log-odds</strong>
                </div>
                <div className="feature-bar-item">
                  <span>Distance to River</span>
                  <div className="progress-bar">
                    <div className="progress-fill bg-green" style={{ width: '25%' }} />
                  </div>
                  <strong>0.194 log-odds</strong>
                </div>
              </div>
              <p className="analysis-desc-text">
                Computed via Tree SHAP with tree-path-dependent background across the study area.
                Base value: +0.754 log-odds.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: DISPATCH PROTOTYPE TAB */}
      {activeTab === 'planner' && (
        <div className="tab-fullscreen-container">
          <div className="tab-header-banner">
            <h2>Simulated Dispatch Roster (Frontend Prototype)</h2>
            <p>
              Demonstration interface for municipal dispatch concepts. Note: Orders exist in frontend
              memory during this session only; no persistent external database or civic service is contacted.
            </p>
          </div>

          <div className="planner-table-card">
            <div className="table-header-row">
              <h3>Session Dispatch Directives</h3>
              <span className="prototype-badge">Prototype / Memory Only</span>
            </div>

            {activeDispatches.length === 0 ? (
              <div className="empty-dispatches-box">
                <AlertCircle size={20} />
                <p>No simulated dispatch orders created in this session.</p>
                <span>Select a cell on the Dashboard map and click "Simulate Mitigation Dispatch".</span>
              </div>
            ) : (
              <div className="dispatch-table-wrap">
                <table className="dispatch-table">
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Target Cell</th>
                      <th>Model Score</th>
                      <th>Assigned Unit</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDispatches.map((disp) => (
                      <tr key={disp.id}>
                        <td>
                          <strong>{disp.id}</strong>
                        </td>
                        <td>{disp.zone_name}</td>
                        <td>
                          <span className="badge-risk-table bg-red">
                            {disp.risk_score.toFixed(3)}
                          </span>
                        </td>
                        <td>{disp.team_name}</td>
                        <td>
                          <span className="priority-pill">{disp.priority}</span>
                        </td>
                        <td>
                          <span className="status-pill status-active">{disp.status}</span>
                        </td>
                        <td>{disp.timestamp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 4: WHAT-IF SIMULATOR LAB */}
      {activeTab === 'simulator' && (
        <div className="tab-fullscreen-container">
          <div className="tab-header-banner">
            <h2>Green-Cover What-If Simulation Lab</h2>
            <p>
              Tests model sensitivity to converted built-up land cover. Reduces{' '}
              <code>built_up_fraction_2021</code> by the specified percentage while holding terrain and
              hydrology features fixed.
            </p>
          </div>

          <div className="simulator-lab-grid">
            <div className="lab-control-panel">
              <h3>Simulation Parameters</h3>
              <p className="lab-subtitle">Active Cell: {selectedId ?? 'C0110_0040'}</p>

              <div className="lab-param-group">
                <label>Built-Up Hardscape Conversion Share</label>
                <div className="intensity-buttons">
                  {[10, 20, 30, 40, 50].map((intVal) => (
                    <button
                      key={intVal}
                      type="button"
                      className={`int-btn ${simIntensity === intVal ? 'active' : ''}`}
                      onClick={() => setSimIntensity(intVal)}
                    >
                      {intVal}%
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="lab-run-btn"
                onClick={() => selectedId && handleRunSimulation(selectedId)}
                disabled={simulating}
              >
                <Play size={16} />
                <span>{simulating ? 'Evaluating…' : 'Execute Model Inference'}</span>
              </button>
            </div>

            <div className="lab-results-panel">
              <h3>Live FastAPI Model Response</h3>
              {simulation ? (
                <div className="lab-output-grid">
                  <div className="output-stat">
                    <span>Baseline Susceptibility</span>
                    <strong>{simulation.baseline_susceptibility.toFixed(4)}</strong>
                  </div>
                  <div className="output-stat">
                    <span>Scenario Susceptibility</span>
                    <strong className="text-emerald">
                      {simulation.scenario_susceptibility.toFixed(4)}
                    </strong>
                  </div>
                  <div className="output-stat">
                    <span>Score Delta</span>
                    <strong className="text-emerald">
                      {simulation.score_change.toFixed(4)}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="lab-placeholder">
                  {simulating
                    ? 'Executing model inference on backend...'
                    : 'Click Execute Model Inference to evaluate the selected cell.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 5: TECHNICAL SUMMARY TAB */}
      {activeTab === 'reports' && (
        <div className="tab-fullscreen-container">
          <div className="report-action-bar">
            <button
              type="button"
              className="print-report-btn"
              onClick={() => window.print()}
            >
              <Printer size={16} />
              <span>Print Technical Brief</span>
            </button>
          </div>

          <article className="official-report-sheet">
            <header className="report-sheet-header">
              <div className="report-sheet-emblem">RISKTWIN AI — CHENNAI FLOOD SUSCEPTIBILITY</div>
              <h1>TECHNICAL SPECIFICATION &amp; METHODOLOGY BRIEF</h1>
              <div className="report-meta-row">
                <span>Model: XGBoost v2</span>
                <span>Study Area: Greater Chennai Corporation</span>
                <span>Grid Resolution: 250m Metric (EPSG:32644)</span>
              </div>
            </header>

            <section className="report-body-section">
              <h2>1. Scope and Scientific Caveats</h2>
              <p>
                Scores represent statistical susceptibility to historical mapped 2015 inundation, not
                calibrated probabilities of future flooding. Rainfall forecasting, hydrodynamic routing,
                and socioeconomic exposure remain unintegrated into this prototype.
              </p>
            </section>

            <section className="report-body-section">
              <h2>2. Validation Strategy</h2>
              <p>
                Models were evaluated on a geographically separated holdout in northern Chennai (1,839 cells)
                buffered by a 500m transition gap. Holdout ROC-AUC is 0.627 and PR-AUC is 0.350 against a 25.1%
                prevalence baseline.
              </p>
            </section>

            <section className="report-body-section">
              <h2>3. Simulation Mechanics</h2>
              <p>
                The counterfactual scenario engine alters <code>built_up_fraction_2021</code> only. Terrain,
                distance to waterways, and all other features remain constant during re-scoring.
              </p>
            </section>
          </article>
        </div>
      )}

      {/* 3. SIMULATED ADMIN PROFILE MODAL */}
      {showAdminModal && (
        <div className="modal-backdrop" onClick={() => setShowAdminModal(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <User size={18} className="modal-icon" />
                <h3>Simulated Dispatch Desk (Prototype)</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowAdminModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body-admin">
              <div className="admin-badge-profile">
                <div className="admin-large-avatar">DM</div>
                <div className="admin-credentials">
                  <h4>Demo Operator</h4>
                  <p>Simulation Mode — Municipal Dispatch Prototype</p>
                  <span className="jurisdiction-tag">In-Memory Session Only</span>
                </div>
              </div>

              <div className="prototype-disclosure-banner">
                <AlertCircle size={15} />
                <span>
                  All dispatch actions in this interface are simulated for demonstration. Orders exist
                  strictly in browser memory and are not transmitted to actual municipal services.
                </span>
              </div>

              <div className="recent-orders-list">
                <h4>Session Dispatches Created: {activeDispatches.length}</h4>
                {activeDispatches.length === 0 ? (
                  <p className="no-orders-caption">No orders recorded in this session yet.</p>
                ) : (
                  activeDispatches.map((d) => (
                    <div key={d.id} className="recent-order-item">
                      <div className="order-left">
                        <strong>{d.id}</strong>
                        <span>{d.zone_name}</span>
                      </div>
                      <div className="order-right">
                        <span className="order-unit">{d.team_name}</span>
                        <span className="order-status-badge">{d.status}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. SIMULATE DISPATCH ORDER MODAL */}
      {dispatchModalCell && (
        <div className="modal-backdrop" onClick={() => setDispatchModalCell(null)}>
          <div className="dispatch-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <Send size={18} className="text-red" />
                <h3>Simulated Dispatch Directive (Prototype)</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDispatchModalCell(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body-dispatch">
              <div className="prototype-disclosure-banner">
                <AlertCircle size={15} />
                <span>
                  Prototype only: This order will be stored in frontend memory for this browser session.
                  No real field unit will be contacted.
                </span>
              </div>

              <div className="dispatch-cell-summary">
                <div className="summary-chip">
                  <span>Target Cell:</span>
                  <strong>{dispatchModalCell.cell_id}</strong>
                </div>
                <div className="summary-chip">
                  <span>Susceptibility:</span>
                  <strong className="text-red">
                    {dispatchModalCell.susceptibility_score.toFixed(3)}
                  </strong>
                </div>
                <div className="summary-chip">
                  <span>Region:</span>
                  <strong>{dispatchModalCell.validation_region}</strong>
                </div>
              </div>

              <div className="dispatch-form-group">
                <label>Simulated Field Unit (Demo Identifier)</label>
                <select
                  value={assignedUnit}
                  onChange={(e) => setAssignedUnit(e.target.value)}
                  className="modal-select"
                >
                  <option>Field Response Unit A (Simulated)</option>
                  <option>Drainage Maintenance Crew 01 (Simulated)</option>
                  <option>Mobile Dewatering Unit 02 (Simulated)</option>
                </select>
              </div>

              <div className="dispatch-form-group">
                <label>Priority Classification</label>
                <select
                  value={dispatchPriority}
                  onChange={(e) => setDispatchPriority(e.target.value as any)}
                  className="modal-select"
                >
                  <option>Immediate</option>
                  <option>High</option>
                  <option>Normal</option>
                </select>
              </div>

              <div className="dispatch-form-group">
                <label>Mitigation Protocol</label>
                <textarea
                  value={dispatchProtocol}
                  onChange={(e) => setDispatchProtocol(e.target.value)}
                  className="modal-textarea"
                  rows={2}
                />
              </div>

              <div className="dispatch-form-group">
                <label>Session Notes</label>
                <input
                  type="text"
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  className="modal-input"
                />
              </div>

              <div className="modal-actions-row">
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={() => setDispatchModalCell(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="modal-submit-btn"
                  onClick={handleConfirmDispatch}
                  id="btn-confirm-dispatch-order"
                >
                  <Send size={15} />
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
