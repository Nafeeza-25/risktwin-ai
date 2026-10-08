import { useCallback, useEffect, useMemo, useState } from 'react'
import MapView from './MapView'
import RiskPanel from './RiskPanel'
import type { CellProperties, ModelEvidence, RiskCategory, RiskFeature, RiskLayer } from './types'
import { CATEGORY_COLORS, categoryForScore } from './types'
import {
  ChevronDown,
  Activity,
  AlertTriangle,
  Info,
  Flame,
  Search,
  RefreshCw,
} from 'lucide-react'

function EvidenceCard({ evidence }: { evidence: ModelEvidence | null }) {
  return (
    <details className="evidence-card" open>
      <summary className="evidence-summary">
        <div className="summary-left">
          <Activity size={14} className="evidence-icon" />
          <span>Spatial Model Evidence</span>
        </div>
        <ChevronDown size={14} className="evidence-chevron" />
      </summary>
      {evidence ? (
        <div className="evidence-body">
          <p className="evidence-subtext">
            Evaluated on geographically held-out northern Chennai cells to prevent spatial
            autocorrelation leakage.
          </p>
          <div className="evidence-metrics-grid">
            <div className="metric-pill">
              <span className="pill-metric-name">ROC-AUC</span>
              <strong className="pill-metric-val">{evidence.metrics.roc_auc.toFixed(3)}</strong>
            </div>
            <div className="metric-pill">
              <span className="pill-metric-name">PR-AUC</span>
              <strong className="pill-metric-val">
                {evidence.metrics.pr_auc_average_precision.toFixed(3)}
              </strong>
            </div>
            <div className="metric-pill">
              <span className="pill-metric-name">Precision</span>
              <strong className="pill-metric-val">{evidence.metrics.precision.toFixed(3)}</strong>
            </div>
            <div className="metric-pill">
              <span className="pill-metric-name">Recall</span>
              <strong className="pill-metric-val">{evidence.metrics.recall.toFixed(3)}</strong>
            </div>
            <div className="metric-pill">
              <span className="pill-metric-name">F1 Score</span>
              <strong className="pill-metric-val">{evidence.metrics.f1.toFixed(3)}</strong>
            </div>
            <div className="metric-pill">
              <span className="pill-metric-name">Holdout Cells</span>
              <strong className="pill-metric-val">
                {evidence.holdout_cells.toLocaleString()}
              </strong>
            </div>
          </div>
          <div className="holdout-prevalence">
            <span>Positive Prevalence in Holdout:</span>
            <strong>{(evidence.positive_prevalence * 100).toFixed(2)}%</strong>
          </div>
        </div>
      ) : (
        <div className="evidence-loading">Loading validation metrics…</div>
      )}
    </details>
  )
}

export default function App() {
  const [layer, setLayer] = useState<RiskLayer | null>(null)
  const [evidence, setEvidence] = useState<ModelEvidence | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

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
        if (
          cells.type !== 'FeatureCollection' ||
          !Array.isArray(cells.features) ||
          cells.features.length === 0
        ) {
          throw new Error('The saved susceptibility layer is empty or invalid')
        }
        setLayer(cells)
        setEvidence(metrics)
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return
        setError(failure instanceof Error ? failure.message : 'Could not load RiskTwin data')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reloadKey])

  const selectedCell: CellProperties | null = useMemo(() => {
    if (!layer || !selectedId) return null
    return (
      layer.features.find((feature) => feature.properties.cell_id === selectedId)?.properties ?? null
    )
  }, [layer, selectedId])

  const categoryCounts = useMemo(() => {
    if (!layer) return { Low: 0, Moderate: 0, High: 0, 'Very High': 0 }
    const counts: Record<RiskCategory, number> = {
      Low: 0,
      Moderate: 0,
      High: 0,
      'Very High': 0,
    }
    for (const feature of layer.features) {
      const cat = categoryForScore(feature.properties.susceptibility_score)
      counts[cat]++
    }
    return counts
  }, [layer])

  // Priority Decision Hotspots (Top vulnerable cells for instant planner exploration)
  const priorityHotspots: RiskFeature[] = useMemo(() => {
    if (!layer) return []
    const demoCell = layer.features.find((f) => f.properties.cell_id === 'C0110_0040')
    const sorted = [...layer.features]
      .filter((f) => f.properties.cell_id !== 'C0110_0040')
      .sort((a, b) => b.properties.susceptibility_score - a.properties.susceptibility_score)
      .slice(0, 3)
    return demoCell ? [demoCell, ...sorted] : sorted.slice(0, 4)
  }, [layer])

  const handleSelect = useCallback((cellId: string) => {
    setSelectedId(cellId)
  }, [])

  const handleSelectDemo = useCallback(() => {
    setSelectedId('C0110_0040')
  }, [])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!layer || !searchQuery.trim()) return
    const query = searchQuery.trim().toUpperCase()
    const match = layer.features.find((f) => f.properties.cell_id.toUpperCase().includes(query))
    if (match) {
      setSelectedId(match.properties.cell_id)
      setSearchQuery('')
    }
  }

  return (
    <div className="app-shell">
      {/* Top Navigation Bar */}
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
            <div className="brand-subtitle">Geospatial Flood Intelligence &amp; Mitigation Decision Support</div>
          </div>
        </div>

        <div className="header-tags">
          <div className="header-tag-pill active-tag">
            <span className="live-dot" />
            <span>Chennai Region</span>
          </div>
          <div className="header-tag-pill">
            <span>2015 Flood Reference</span>
          </div>
          <div className="header-tag-pill">
            <span>XGBoost + SHAP</span>
          </div>
        </div>
      </header>

      {/* Main 3-Region Workspace */}
      <div className="workspace">
        {/* LEFT REGION: Compact Intelligence Controls */}
        <aside className="context-rail" aria-label="Geospatial Intelligence Controls">
          <div className="rail-section-header">
            <span className="rail-kicker">REGION INTELLIGENCE</span>
            <h1 className="rail-headline">
              Chennai Metropolitan Area
              <em>Flood Susceptibility</em>
            </h1>
            <p className="rail-intro">
              Machine-learned spatial susceptibility mapped against the historical 2015 extreme inundation footprint.
            </p>
          </div>

          {/* Quick Search */}
          <form className="cell-search-form" onSubmit={handleSearchSubmit}>
            <div className="search-input-wrap">
              <Search size={13} className="search-icon" />
              <input
                type="text"
                placeholder="Search Cell ID (e.g. C0110_0040)…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search Cell ID"
              />
            </div>
          </form>

          {/* Summary Metric Cards */}
          <div className="summary-grid">
            <div className="summary-card">
              <span className="summary-val">
                {layer ? layer.features.length.toLocaleString() : '7,227'}
              </span>
              <span className="summary-label">Scored Grid Cells</span>
            </div>
            <div className="summary-card">
              <span className="summary-val">250 m</span>
              <span className="summary-label">Cell Resolution</span>
            </div>
          </div>

          {/* Susceptibility Legend */}
          <div className="legend-section">
            <div className="legend-header-row">
              <span className="section-label">SUSCEPTIBILITY LEGEND</span>
              <span className="legend-scale-label">Score (0–1)</span>
            </div>
            <div className="legend-list">
              {(['Low', 'Moderate', 'High', 'Very High'] as const).map((cat) => {
                const range =
                  cat === 'Low'
                    ? '0.00 – 0.25'
                    : cat === 'Moderate'
                      ? '0.25 – 0.50'
                      : cat === 'High'
                        ? '0.50 – 0.75'
                        : '0.75 – 1.00'
                const count = categoryCounts[cat]
                return (
                  <div className="legend-item" key={cat}>
                    <span
                      className="legend-color-dot"
                      style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                    />
                    <span className="legend-item-name">{cat}</span>
                    <span className="legend-item-range">{range}</span>
                    <span className="legend-item-count">{count ? `${count}` : ''}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Priority Risk Hotspots (Decision-Making Quick Jump) */}
          <div className="hotspots-section">
            <div className="hotspots-header">
              <div className="hotspots-title-wrap">
                <Flame size={13} className="hotspot-flame" />
                <span className="section-label">PRIORITY DECISION HOTSPOTS</span>
              </div>
              <span className="hotspot-count-hint">Top Scored</span>
            </div>
            <div className="hotspot-list">
              {priorityHotspots.map((f) => {
                const props = f.properties
                const cat = categoryForScore(props.susceptibility_score)
                const isSelected = selectedId === props.cell_id
                return (
                  <button
                    key={props.cell_id}
                    type="button"
                    className={`hotspot-card ${isSelected ? 'hotspot-active' : ''}`}
                    onClick={() => handleSelect(props.cell_id)}
                  >
                    <div className="hotspot-cell-id">{props.cell_id}</div>
                    <div className="hotspot-score-wrap">
                      <span
                        className="hotspot-cat-pill"
                        style={{
                          color: CATEGORY_COLORS[cat],
                          backgroundColor: `${CATEGORY_COLORS[cat]}18`,
                          borderColor: `${CATEGORY_COLORS[cat]}44`,
                        }}
                      >
                        {cat}
                      </span>
                      <strong className="hotspot-score">
                        {props.susceptibility_score.toFixed(3)}
                      </strong>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Model Evidence (Collapsible) */}
          <EvidenceCard evidence={evidence} />

          {/* Scientific Disclaimer */}
          <div className="rail-scientific-note">
            <Info size={14} className="note-icon" />
            <p>
              Output is an empirical <strong>Flood Susceptibility Score</strong> (spatial similarity to
              2015 inundation), not a probabilistic forecast of future weather events.
            </p>
          </div>
        </aside>

        {/* CENTER REGION: Hero Risk Map */}
        <main className="map-column" aria-label="Interactive Chennai Risk Map">
          <div className="map-top-bar">
            <div className="bar-status">
              <span className="status-live-indicator" />
              <span className="bar-title">Chennai Flood Susceptibility Map</span>
            </div>
            <div className="bar-hint">
              {selectedId ? (
                <span className="selected-hint">
                  Inspecting Cell <strong>{selectedId}</strong>
                </span>
              ) : (
                <span>Select any coloured 250m cell to open Risk Intelligence →</span>
              )}
            </div>
          </div>

          {loading && (
            <div className="map-state-view" role="status" aria-live="polite">
              <div className="map-scanner-animation">
                <div className="scanner-radar" />
              </div>
              <h2>Loading Chennai Geospatial Grid</h2>
              <p>Fetching 7,227 model-scored polygons and SHAP attributions…</p>
            </div>
          )}

          {error && (
            <div className="map-state-view map-error-state" role="alert">
              <AlertTriangle size={36} className="error-icon" />
              <h2>Backend Data Unavailable</h2>
              <p>{error}</p>
              <p className="error-tip">Please ensure the FastAPI backend is running on port 8000.</p>
              <button
                type="button"
                className="retry-btn"
                onClick={() => setReloadKey((v) => v + 1)}
              >
                <RefreshCw size={14} />
                <span>Retry Connection</span>
              </button>
            </div>
          )}

          {layer && !loading && !error && (
            <MapView layer={layer} selectedId={selectedId} onSelect={handleSelect} />
          )}
        </main>

        {/* RIGHT REGION: Risk Decision Workspace */}
        <RiskPanel
          cell={selectedCell}
          onClear={() => setSelectedId(null)}
          onSelectDemo={handleSelectDemo}
        />
      </div>
    </div>
  )
}
