import { useCallback, useEffect, useMemo, useState } from 'react'
import MapView from './MapView'
import RiskPanel from './RiskPanel'
import type {
  ActiveNavTab,
  CellProperties,
  DispatchOrder,
  LayerToggleState,
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
  Info,
  Clock,
  Activity,
  Play,
  X,
} from 'lucide-react'

// Demo cell ID
const DEMO_CELL_ID = 'C0110_0040'

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('dashboard')
  const [layer, setLayer] = useState<RiskLayer | null>(null)
  const [evidence, setEvidence] = useState<ModelEvidence | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(DEMO_CELL_ID)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Left Sidebar State
  const [timePeriod, setTimePeriod] = useState('Next 6 Months (Monsoon)')
  const [layerToggles, setLayerToggles] = useState<LayerToggleState>({
    floodRisk: true,
    historicalFloods: true,
    waterBodies: true,
    populationDensity: false,
    criticalInfrastructure: true,
    elevationDem: false,
    landCover: false,
    rainfallAverage: false,
    administrativeBoundaries: true,
  })
  const [riskFilters, setRiskFilters] = useState<RiskFilterState>({
    critical: true,
    high: true,
    moderate: true,
    low: true,
  })

  // Bottom What-If Simulator State
  const [mitigationAction, setMitigationAction] = useState('Improve drainage infrastructure')
  const [simIntensity, setSimIntensity] = useState(25)
  const [simulation, setSimulation] = useState<SimulationResult | null>(null)
  const [simulating, setSimulating] = useState(false)

  // Admin Profile & Dispatch Workflow State
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [dispatchModalCell, setDispatchModalCell] = useState<CellProperties | null>(null)
  const [assignedUnit, setAssignedUnit] = useState('GCC Zone 10 Rapid Dewatering Squad #4')
  const [dispatchPriority, setDispatchPriority] = useState<'Critical / Immediate' | 'High' | 'Normal'>(
    'Critical / Immediate'
  )
  const [dispatchProtocol, setDispatchProtocol] = useState(
    'Deploy high-capacity mobile dewatering pumps, clear canal culvert bottleneck, and enforce temporary sandbag berms.'
  )
  const [dispatchNotes, setDispatchNotes] = useState('Urgent: Key primary school & hospital access road in proximity.')
  const [activeDispatches, setActiveDispatches] = useState<DispatchOrder[]>([
    {
      id: 'DISP-GCC-8821',
      cell_id: 'C0110_0040',
      zone_name: 'Zone 104, Chennai',
      risk_score: 0.94,
      team_name: 'GCC Zone 10 Rapid Dewatering Squad #4',
      priority: 'Critical / Immediate',
      protocol: 'Deploy high-capacity mobile dewatering pumps & inspect stormwater outfalls',
      timestamp: 'Today, 01:15 AM',
      status: 'Mitigation Active',
      officer: 'S. Ramanathan, IAS',
      unitContact: '+91 94451 90024 (VHF Ch-04)',
      notes: 'Monsoon high-tide alert active; priority dewatering.',
    },
  ])

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

  // Category counts and statistics
  const stats = useMemo(() => {
    if (!layer) return { criticalPct: 8, highPct: 16, modPct: 38, lowPct: 38, totalExposedPop: '1,24,000' }
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
      criticalPct,
      highPct,
      modPct,
      lowPct,
      totalExposedPop: (critical * 3200 + high * 1800).toLocaleString(),
    }
  }, [layer])

  // Run What-If Simulation
  const handleRunSimulation = useCallback(
    async (cellIdToSimulate: string) => {
      setSimulating(true)
      try {
        const response = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cell_id: cellIdToSimulate,
            intensity: simIntensity / 100,
          }),
        })
        if (!response.ok) throw new Error('Simulation failed')
        const data = (await response.json()) as SimulationResult
        setSimulation(data)
      } catch (err) {
        console.error('Simulation error', err)
      } finally {
        setSimulating(false)
      }
    },
    [simIntensity]
  )

  // Auto-run simulation on initial load for demo cell
  useEffect(() => {
    if (selectedId && !simulation) {
      handleRunSimulation(selectedId)
    }
  }, [selectedId, handleRunSimulation, simulation])

  // Handle Dispatch Submit
  const handleConfirmDispatch = () => {
    if (!dispatchModalCell) return
    const newOrder: DispatchOrder = {
      id: `DISP-GCC-${Math.floor(1000 + Math.random() * 9000)}`,
      cell_id: dispatchModalCell.cell_id,
      zone_name: `Zone ${(dispatchModalCell.cell_id.charCodeAt(3) * 7) % 200 + 1}, Chennai`,
      risk_score: dispatchModalCell.susceptibility_score,
      team_name: assignedUnit,
      priority: dispatchPriority,
      protocol: dispatchProtocol,
      timestamp: 'Just now',
      status: 'Dispatched',
      officer: 'S. Ramanathan, IAS (Commissioner Desk)',
      unitContact: '+91 94451 90038 (Radio VHF-2)',
      notes: dispatchNotes,
    }

    setActiveDispatches((prev) => [newOrder, ...prev])
    setDispatchModalCell(null)
  }

  return (
    <div className="app-shell">
      {/* 1. TOP NAVIGATION BAR matching Image 1 */}
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
            <div className="brand-subtitle">From Risk Prediction to Mitigation Decisions</div>
          </div>
        </div>

        {/* Central Nav Tabs matching Image 1 */}
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
            Risk Analysis
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'planner' ? 'active' : ''}`}
            onClick={() => setActiveTab('planner')}
          >
            Mitigation Planner
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
            Reports
          </button>
        </nav>

        {/* Right Header Controls: Location & Admin Profile */}
        <div className="header-right-tools">
          <div className="location-selector-pill">
            <MapPin size={15} className="location-icon" />
            <span className="location-name">Chennai, Tamil Nadu</span>
            <span className="location-badge">200 Wards</span>
          </div>

          <button
            type="button"
            className="admin-profile-btn"
            onClick={() => setShowAdminModal(true)}
            title="Open Admin Command & Dispatches"
            id="btn-admin-profile"
          >
            <div className="admin-avatar">
              <User size={16} />
            </div>
            <div className="admin-meta">
              <span className="admin-name">S. Ramanathan, IAS</span>
              <span className="admin-role">Disaster Commissioner</span>
            </div>
            {activeDispatches.length > 0 && (
              <span className="dispatch-badge-count" title="Active field dispatches">
                {activeDispatches.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* 2. MAIN APPLICATION CONTENT AREA */}
      {activeTab === 'dashboard' && (
        <div className="app-main-layout">
          {/* LEFT SIDEBAR: Layers, Time Period, Risk Filter matching Image 1 */}
          <aside className="sidebar-left" aria-label="Map Layer Controls">
            {/* Layers Toggle Section */}
            <div className="sidebar-group">
              <div className="sidebar-group-title">
                <Layers size={15} />
                <span>Layers</span>
              </div>
              <div className="layer-checkbox-list">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={layerToggles.floodRisk}
                    onChange={(e) =>
                      setLayerToggles((t) => ({ ...t, floodRisk: e.target.checked }))
                    }
                  />
                  <span className="checkbox-label">
                    Flood Risk (ML Prediction) <Info size={12} className="info-icon" />
                  </span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={layerToggles.historicalFloods}
                    onChange={(e) =>
                      setLayerToggles((t) => ({ ...t, historicalFloods: e.target.checked }))
                    }
                  />
                  <span className="checkbox-label">Historical Floods (2015 NRSC)</span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={layerToggles.waterBodies}
                    onChange={(e) =>
                      setLayerToggles((t) => ({ ...t, waterBodies: e.target.checked }))
                    }
                  />
                  <span className="checkbox-label">Rivers &amp; Water Bodies</span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={layerToggles.populationDensity}
                    onChange={(e) =>
                      setLayerToggles((t) => ({ ...t, populationDensity: e.target.checked }))
                    }
                  />
                  <span className="checkbox-label">Population Density</span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={layerToggles.criticalInfrastructure}
                    onChange={(e) =>
                      setLayerToggles((t) => ({ ...t, criticalInfrastructure: e.target.checked }))
                    }
                  />
                  <span className="checkbox-label">Critical Infrastructure</span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={layerToggles.elevationDem}
                    onChange={(e) =>
                      setLayerToggles((t) => ({ ...t, elevationDem: e.target.checked }))
                    }
                  />
                  <span className="checkbox-label">Elevation (Copernicus DEM)</span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={layerToggles.landCover}
                    onChange={(e) =>
                      setLayerToggles((t) => ({ ...t, landCover: e.target.checked }))
                    }
                  />
                  <span className="checkbox-label">Land Use / Land Cover</span>
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={layerToggles.administrativeBoundaries}
                    onChange={(e) =>
                      setLayerToggles((t) => ({ ...t, administrativeBoundaries: e.target.checked }))
                    }
                  />
                  <span className="checkbox-label">Administrative Boundaries (GCC)</span>
                </label>
              </div>
            </div>

            {/* Time Period Section */}
            <div className="sidebar-group">
              <div className="sidebar-group-title">
                <Calendar size={15} />
                <span>Time Period</span>
              </div>
              <select
                className="sidebar-select"
                value={timePeriod}
                onChange={(e) => setTimePeriod(e.target.value)}
              >
                <option>Next 6 Months (Monsoon)</option>
                <option>Current Snapshot (Live)</option>
                <option>2015 Historical Baseline</option>
              </select>
            </div>

            {/* Risk Level Filter matching Image 1 */}
            <div className="sidebar-group">
              <div className="sidebar-group-title">
                <Filter size={15} />
                <span>Risk Level Filter</span>
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
                  <span className="filter-chip-name">Critical (0.75 – 1.0)</span>
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
                  <span className="filter-chip-name">Low (0 – 0.25)</span>
                </label>
              </div>
            </div>
          </aside>

          {/* CENTER VIEW: Interactive Map & Bottom Widgets matching Image 1 */}
          <main className="center-map-workspace">
            {layer ? (
              <MapView
                layer={layer}
                selectedId={selectedId}
                onSelect={setSelectedId}
                layerToggles={layerToggles}
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

            {/* BOTTOM DOCK OVERLAY matching Image 1 */}
            <div className="bottom-dashboard-dock">
              {/* Left Widget: Risk Statistics (Selected Region) */}
              <div className="dock-widget statistics-widget">
                <div className="widget-header">
                  <div className="widget-title">
                    <Activity size={14} />
                    <span>Risk Statistics (Chennai GCC)</span>
                  </div>
                </div>

                <div className="widget-body-stats">
                  {/* SVG Donut Chart matching Image 1 */}
                  <div className="donut-chart-container">
                    <svg viewBox="0 0 100 100" className="donut-svg">
                      <circle cx="50" cy="50" r="38" className="donut-track" />
                      {/* Critical slice */}
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        className="donut-slice-critical"
                        strokeDasharray={`${stats.criticalPct * 2.38} 238`}
                        strokeDashoffset="0"
                      />
                      {/* High slice */}
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
                      <span>High Risk Area</span>
                    </div>
                  </div>

                  <div className="stats-breakdown-col">
                    <div className="stat-pill-row">
                      <span className="legend-dot bg-red" />
                      <span className="pill-name">Critical</span>
                      <strong className="pill-val">{stats.criticalPct}%</strong>
                    </div>
                    <div className="stat-pill-row">
                      <span className="legend-dot bg-orange" />
                      <span className="pill-name">High</span>
                      <strong className="pill-val">{stats.highPct}%</strong>
                    </div>
                    <div className="stat-pill-row">
                      <span className="legend-dot bg-yellow" />
                      <span className="pill-name">Moderate</span>
                      <strong className="pill-val">{stats.modPct}%</strong>
                    </div>
                    <div className="stat-pill-row">
                      <span className="legend-dot bg-green" />
                      <span className="pill-name">Low</span>
                      <strong className="pill-val">{stats.lowPct}%</strong>
                    </div>
                  </div>

                  <div className="stats-summary-col">
                    <div className="summary-metric">
                      <span className="sub-label">Total Exposed Population</span>
                      <strong className="main-val">{stats.totalExposedPop}</strong>
                    </div>
                    <div className="summary-metric">
                      <span className="sub-label">Critical Infrastructure</span>
                      <strong className="main-val">12 Hospitals • 28 Schools</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Widget: What-If Mitigation Simulator matching Image 1 */}
              <div className="dock-widget simulator-widget">
                <div className="widget-header">
                  <div className="widget-title">
                    <Sliders size={14} />
                    <span>What-If Mitigation Simulator</span>
                  </div>
                  <div className="intensity-slider-wrap">
                    <span className="slider-label">Intensity: {simIntensity}%</span>
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
                    <select
                      className="sim-action-select"
                      value={mitigationAction}
                      onChange={(e) => setMitigationAction(e.target.value)}
                    >
                      <option>Improve drainage infrastructure</option>
                      <option>Convert hardscape to permeable green cover</option>
                      <option>Strengthen riverbank / flood barriers</option>
                    </select>

                    <button
                      type="button"
                      className="sim-run-btn"
                      onClick={() => selectedId && handleRunSimulation(selectedId)}
                      disabled={simulating}
                      id="btn-run-simulation"
                    >
                      {simulating ? <Clock size={14} className="spin" /> : <Play size={14} />}
                      <span>{simulating ? 'Simulating…' : 'Simulate'}</span>
                    </button>
                  </div>

                  {/* Before & After comparison tiles matching Image 1 */}
                  <div className="sim-tiles-row">
                    <div className="sim-tile before-tile">
                      <span className="tile-title">
                        Current Modelled Risk ({selectedId ?? 'Zone'})
                      </span>
                      <div className="tile-mini-grid bg-grid-red">
                        <span className="tile-score-badge bg-red">
                          {selectedCell ? selectedCell.susceptibility_score.toFixed(2) : '0.82'}
                        </span>
                      </div>
                    </div>

                    <ArrowRight size={18} className="sim-arrow" />

                    <div className="sim-tile after-tile">
                      <span className="tile-title">Scenario Modelled Risk (After {simIntensity}%)</span>
                      <div className="tile-mini-grid bg-grid-green">
                        <span className="tile-score-badge bg-yellow">
                          {simulation
                            ? simulation.scenario_susceptibility.toFixed(2)
                            : selectedCell
                            ? (selectedCell.susceptibility_score - 0.19).toFixed(2)
                            : '0.63'}
                        </span>
                      </div>
                    </div>

                    <div className="sim-delta-card">
                      <span className="delta-label">Change in modelled risk</span>
                      <strong className="delta-val text-emerald">
                        <TrendingDown size={16} />
                        {simulation
                          ? `${simulation.score_change.toFixed(2)} (${(
                              simulation.score_change * 100
                            ).toFixed(0)} pts)`
                          : '-0.19 (-19 points)'}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>

          {/* RIGHT SIDEBAR: Selected Zone Intelligence & Admin Dispatch matching Image 1 */}
          <RiskPanel
            cell={selectedCell}
            onClear={() => setSelectedId(null)}
            onSelectDemo={() => setSelectedId(DEMO_CELL_ID)}
            onOpenDispatch={(cell) => setDispatchModalCell(cell)}
            activeDispatches={activeDispatches}
          />
        </div>
      )}

      {/* VIEW 2: RISK ANALYSIS TAB */}
      {activeTab === 'analysis' && (
        <div className="tab-fullscreen-container">
          <div className="tab-header-banner">
            <h2>Explainable Spatial ML Risk Analysis</h2>
            <p>
              XGBoost decision boundaries, Tree SHAP feature attribution distributions, and geographic
              holdout validation across northern Chennai.
            </p>
          </div>

          <div className="analysis-grid-cards">
            {evidence && (
              <div className="analysis-card">
                <h3>Geographic Holdout Validation (Zero-Leakage)</h3>
                <div className="metrics-pill-matrix">
                  <div className="metric-box">
                    <span>ROC-AUC</span>
                    <strong>{evidence.metrics.roc_auc.toFixed(3)}</strong>
                  </div>
                  <div className="metric-box">
                    <span>Precision</span>
                    <strong>{evidence.metrics.precision.toFixed(3)}</strong>
                  </div>
                  <div className="metric-box">
                    <span>Recall</span>
                    <strong>{evidence.metrics.recall.toFixed(3)}</strong>
                  </div>
                  <div className="metric-box">
                    <span>F1 Score</span>
                    <strong>{evidence.metrics.f1.toFixed(3)}</strong>
                  </div>
                </div>
                <p className="analysis-desc-text">
                  Evaluated on 1,839 northern cells separated by a 500m transition buffer. This proves
                  the model does not rely on local spatial autocorrelation memorization.
                </p>
              </div>
            )}

            <div className="analysis-card">
              <h3>Global Feature Importance (Tree SHAP)</h3>
              <div className="feature-bar-list">
                <div className="feature-bar-item">
                  <span>Built-up Hardscape Cover (ESA 10m)</span>
                  <div className="progress-bar">
                    <div className="progress-fill bg-red" style={{ width: '88%' }} />
                  </div>
                  <strong>+0.28 SHAP</strong>
                </div>
                <div className="feature-bar-item">
                  <span>Surface Elevation (Copernicus DEM)</span>
                  <div className="progress-bar">
                    <div className="progress-fill bg-orange" style={{ width: '74%' }} />
                  </div>
                  <strong>+0.22 SHAP</strong>
                </div>
                <div className="feature-bar-item">
                  <span>Distance to River Network (OSMnx)</span>
                  <div className="progress-bar">
                    <div className="progress-fill bg-yellow" style={{ width: '61%' }} />
                  </div>
                  <strong>+0.18 SHAP</strong>
                </div>
                <div className="feature-bar-item">
                  <span>Terrain Slope Gradient</span>
                  <div className="progress-bar">
                    <div className="progress-fill bg-green" style={{ width: '45%' }} />
                  </div>
                  <strong>+0.12 SHAP</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: MITIGATION PLANNER TAB */}
      {activeTab === 'planner' && (
        <div className="tab-fullscreen-container">
          <div className="tab-header-banner">
            <h2>Municipal Mitigation Action Planner &amp; Team Roster</h2>
            <p>
              Priority intervention zones, deployed response teams, and civil engineering investment
              rankings for Greater Chennai Corporation.
            </p>
          </div>

          <div className="planner-table-card">
            <h3>Active Field Dispatches &amp; Response Orders</h3>
            <div className="dispatch-table-wrap">
              <table className="dispatch-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Target Zone</th>
                    <th>Risk Score</th>
                    <th>Assigned Response Unit</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Dispatch Time</th>
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
                          {disp.risk_score.toFixed(2)}
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
          </div>
        </div>
      )}

      {/* VIEW 4: WHAT-IF SIMULATOR LAB TAB */}
      {activeTab === 'simulator' && (
        <div className="tab-fullscreen-container">
          <div className="tab-header-banner">
            <h2>Counterfactual Green-Cover Intervention Lab</h2>
            <p>
              Simulate localized nature-based sponge city interventions: dynamically reducing
              impervious built-up surface fractions and evaluating XGBoost susceptibility deltas.
            </p>
          </div>

          <div className="simulator-lab-grid">
            <div className="lab-control-panel">
              <h3>Simulation Parameters</h3>
              <p className="lab-subtitle">Target Cell: {selectedId ?? 'C0110_0040'}</p>

              <div className="lab-param-group">
                <label>Hardscape Conversion Intensity</label>
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
                <span>Execute Counterfactual Model Run</span>
              </button>
            </div>

            <div className="lab-results-panel">
              <h3>Live Model Inference Output</h3>
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
                    <span>Net Risk Reduction</span>
                    <strong className="text-emerald">
                      {(simulation.score_change * 100).toFixed(1)} percentage points
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="lab-placeholder">Select parameters and click Execute.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 5: REPORTS TAB */}
      {activeTab === 'reports' && (
        <div className="tab-fullscreen-container">
          <div className="report-action-bar">
            <button
              type="button"
              className="print-report-btn"
              onClick={() => window.print()}
            >
              <Printer size={16} />
              <span>Print / Export PDF Brief</span>
            </button>
          </div>

          <article className="official-report-sheet">
            <header className="report-sheet-header">
              <div className="report-sheet-emblem">GREATER CHENNAI CORPORATION</div>
              <h1>FLOOD RISK INTELLIGENCE &amp; MITIGATION DIRECTIVE</h1>
              <div className="report-meta-row">
                <span>Date: October 2026</span>
                <span>Jurisdiction: 200 GCC Wards</span>
                <span>Model Engine: XGBoost v2 (Tree SHAP)</span>
              </div>
            </header>

            <section className="report-body-section">
              <h2>1. Executive Summary</h2>
              <p>
                This document synthesizes machine-learned flood susceptibility scores for Greater
                Chennai Corporation. Using 250m metric grid cells projected to UTM Zone 44N, the
                system identifies critical low-elevation and high-impervious-cover hotspots
                requiring targeted engineering and nature-based sponge interventions.
              </p>
            </section>

            <section className="report-body-section">
              <h2>2. Active Field Response &amp; Intimated Units</h2>
              <p>
                The following teams have been dispatched by the Municipal Commissioner Desk for
                immediate pre-monsoon desilting and mobile pump positioning:
              </p>
              <ul>
                {activeDispatches.map((d) => (
                  <li key={d.id}>
                    <strong>{d.id}</strong>: {d.zone_name} — Assigned to {d.team_name} ({d.priority})
                  </li>
                ))}
              </ul>
            </section>
          </article>
        </div>
      )}

      {/* 3. ADMIN PROFILE & MANAGEMENT MODAL */}
      {showAdminModal && (
        <div className="modal-backdrop" onClick={() => setShowAdminModal(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <User size={18} className="modal-icon" />
                <h3>Municipal Command &amp; Administrator Profile</h3>
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
                <div className="admin-large-avatar">SR</div>
                <div className="admin-credentials">
                  <h4>Thiru S. Ramanathan, IAS</h4>
                  <p>Special Commissioner for Disaster Management</p>
                  <span className="jurisdiction-tag">Greater Chennai Corporation (GCC)</span>
                </div>
              </div>

              <div className="field-units-status-grid">
                <div className="unit-stat-card">
                  <span>Active Dispatched Teams</span>
                  <strong>{activeDispatches.length}</strong>
                </div>
                <div className="unit-stat-card">
                  <span>Standby Dewatering Squads</span>
                  <strong>6 Units</strong>
                </div>
                <div className="unit-stat-card">
                  <span>Monitored High-Risk Zones</span>
                  <strong>18 Hotspots</strong>
                </div>
              </div>

              <div className="recent-orders-list">
                <h4>Recent Mitigation Orders Issued</h4>
                {activeDispatches.map((d) => (
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
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. INTIMATE MITIGATION TEAM / DISPATCH MODAL */}
      {dispatchModalCell && (
        <div className="modal-backdrop" onClick={() => setDispatchModalCell(null)}>
          <div className="dispatch-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <Send size={18} className="text-red" />
                <h3>Intimate Mitigation Team (Admin Dispatch)</h3>
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
              <div className="dispatch-cell-summary">
                <div className="summary-chip">
                  <span>Target Cell:</span>
                  <strong>{dispatchModalCell.cell_id}</strong>
                </div>
                <div className="summary-chip">
                  <span>Modelled Risk:</span>
                  <strong className="text-red">
                    {dispatchModalCell.susceptibility_score.toFixed(2)} (Critical)
                  </strong>
                </div>
                <div className="summary-chip">
                  <span>GPS:</span>
                  <strong>
                    {dispatchModalCell.latitude.toFixed(3)}, {dispatchModalCell.longitude.toFixed(3)}
                  </strong>
                </div>
              </div>

              <div className="dispatch-form-group">
                <label>Assign Municipal Response Unit</label>
                <select
                  value={assignedUnit}
                  onChange={(e) => setAssignedUnit(e.target.value)}
                  className="modal-select"
                >
                  <option>GCC Zone 10 Rapid Dewatering Squad #4</option>
                  <option>PWD Stormwater Canal Maintenance Taskforce</option>
                  <option>NDRF Sector 4 Tactical Disaster Unit</option>
                  <option>Chennai Metro Water Emergency Sump Control</option>
                </select>
              </div>

              <div className="dispatch-form-group">
                <label>Priority Classification</label>
                <select
                  value={dispatchPriority}
                  onChange={(e) => setDispatchPriority(e.target.value as any)}
                  className="modal-select"
                >
                  <option>Critical / Immediate</option>
                  <option>High</option>
                  <option>Normal</option>
                </select>
              </div>

              <div className="dispatch-form-group">
                <label>Standard Mitigation Protocol (SHAP Mapped)</label>
                <textarea
                  value={dispatchProtocol}
                  onChange={(e) => setDispatchProtocol(e.target.value)}
                  className="modal-textarea"
                  rows={2}
                />
              </div>

              <div className="dispatch-form-group">
                <label>Field Notes / Asset Protection Directives</label>
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
                  <span>Transmit Mitigation Directive</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
