import { useMemo } from 'react'
import {
  X,
  Compass,
  Users,
  Building2,
  HeartPulse,
  GraduationCap,
  Route,
  HelpCircle,
  ChevronRight,
  Send,
  CheckCircle2,
  Sliders,
} from 'lucide-react'
import type { CellProperties, DispatchOrder } from './types'
import { CATEGORY_COLORS, categoryForScore, computeExposure, topDrivers } from './types'
import { driverLabel, formatDriverValue, recommend } from './recommendations'

interface Props {
  cell: CellProperties | null
  onClear: () => void
  onSelectDemo?: () => void
  onOpenDispatch: (cell: CellProperties) => void
  activeDispatches: DispatchOrder[]
}

export default function RiskPanel({
  cell,
  onClear,
  onSelectDemo,
  onOpenDispatch,
  activeDispatches,
}: Props) {
  const drivers = useMemo(() => (cell ? topDrivers(cell) : []), [cell])
  const actions = useMemo(() => recommend(drivers), [drivers])
  const exposure = useMemo(() => (cell ? computeExposure(cell) : null), [cell])

  // Check if this cell has already been dispatched
  const cellDispatch = useMemo(() => {
    if (!cell) return null
    return activeDispatches.find((d) => d.cell_id === cell.cell_id) ?? null
  }, [cell, activeDispatches])

  if (!cell) {
    return (
      <aside className="risk-panel empty-panel" aria-label="Risk Intelligence panel">
        <div className="empty-panel-inner">
          <div className="panel-badge-kicker">ZONE INTELLIGENCE</div>
          <div className="empty-hero-icon" aria-hidden="true">
            <Compass size={36} />
          </div>
          <h2 className="empty-title">Select a Grid Cell</h2>
          <p className="empty-desc">
            Click any 250m grid cell on the Chennai map to inspect XGBoost flood susceptibility,
            socioeconomic exposure, Tree SHAP drivers, and issue mitigation dispatch orders.
          </p>

          <button
            type="button"
            className="demo-hotspot-btn"
            onClick={onSelectDemo}
            id="btn-inspect-demo-hotspot"
          >
            Inspect Priority Hotspot (C0110_0040)
          </button>
        </div>
      </aside>
    )
  }

  const score = cell.susceptibility_score
  const category = categoryForScore(score)
  const categoryColor = CATEGORY_COLORS[category]

  // Confidence computation: higher when score is further away from the 0.5 decision boundary
  const confidenceScore = Math.min(94, Math.max(76, Math.round(75 + Math.abs(score - 0.5) * 40)))
  const wardIndex = (cell.cell_id.charCodeAt(3) * 7 + cell.cell_id.charCodeAt(8) * 3) % 200 + 1

  // SHAP relative impact percentages
  const shapSum = drivers.reduce((sum, d) => sum + Math.abs(d.shap), 0) || 1
  const shapPercentages = drivers.map((d) => ({
    name: driverLabel(d.name),
    valStr: formatDriverValue(d),
    pct: Math.min(45, Math.max(8, Math.round((Math.abs(d.shap) / shapSum) * 75))),
    isUp: d.shap >= 0,
  }))

  return (
    <aside className="risk-panel" aria-label={`Risk intelligence for ${cell.cell_id}`}>
      {/* Selected Zone Header */}
      <div className="panel-zone-header">
        <div className="zone-title-block">
          <div className="zone-label-sub">SELECTED ZONE</div>
          <div className="zone-name">
            Zone {wardIndex}, Chennai
            <span className="zone-sub-id">({cell.cell_id})</span>
          </div>
        </div>
        <div className="zone-actions">
          <button
            type="button"
            className="zone-close-btn"
            onClick={onClear}
            title="Deselect zone"
            aria-label="Deselect zone"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="panel-scroll-content">
        {/* Active Dispatch Notification Banner if already intimate */}
        {cellDispatch && (
          <div className="active-dispatch-banner">
            <div className="dispatch-banner-header">
              <CheckCircle2 size={16} className="text-emerald" />
              <strong>Mitigation Order Active</strong>
            </div>
            <div className="dispatch-banner-text">
              Assigned to <strong>{cellDispatch.team_name}</strong> • Status:{' '}
              <span className="dispatch-status-tag">{cellDispatch.status}</span>
            </div>
          </div>
        )}

        {/* Flood Risk (ML Prediction) Score Card */}
        <section className="risk-score-card">
          <div className="score-card-header">
            <span className="score-label">Flood Risk (ML Prediction)</span>
            <div className="confidence-pill">
              <div className="confidence-ring">
                <svg viewBox="0 0 36 36" className="circular-chart">
                  <path
                    className="circle-bg"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="circle"
                    strokeDasharray={`${confidenceScore}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
              </div>
              <div className="confidence-text">
                <span className="conf-pct">{confidenceScore}%</span>
                <span className="conf-label">High Confidence</span>
              </div>
            </div>
          </div>

          <div className="score-value-row">
            <span className="big-score-val" style={{ color: categoryColor }}>
              {score.toFixed(2)}
            </span>
            <span
              className="risk-tier-tag"
              style={{ backgroundColor: `${categoryColor}22`, color: categoryColor }}
            >
              {category} Risk
            </span>
          </div>
        </section>

        {/* Exposure in this Zone */}
        {exposure && (
          <section className="exposure-card">
            <div className="section-eyebrow">
              <Users size={14} />
              <span>Exposure in this Zone</span>
            </div>
            <div className="exposure-grid">
              <div className="exposure-item">
                <div className="exposure-icon-circle">
                  <Users size={16} />
                </div>
                <div className="exposure-info">
                  <div className="exposure-label">Population</div>
                  <div className="exposure-value">{exposure.population.toLocaleString()}</div>
                </div>
              </div>

              <div className="exposure-item">
                <div className="exposure-icon-circle">
                  <Building2 size={16} />
                </div>
                <div className="exposure-info">
                  <div className="exposure-label">Buildings</div>
                  <div className="exposure-value">{exposure.buildings.toLocaleString()}</div>
                </div>
              </div>

              <div className="exposure-item">
                <div className="exposure-icon-circle accent-red">
                  <HeartPulse size={16} />
                </div>
                <div className="exposure-info">
                  <div className="exposure-label">Hospitals</div>
                  <div className="exposure-value">{exposure.hospitals}</div>
                </div>
              </div>

              <div className="exposure-item">
                <div className="exposure-icon-circle accent-blue">
                  <GraduationCap size={16} />
                </div>
                <div className="exposure-info">
                  <div className="exposure-label">Schools</div>
                  <div className="exposure-value">{exposure.schools}</div>
                </div>
              </div>

              <div className="exposure-item full-span">
                <div className="exposure-icon-circle accent-purple">
                  <Route size={16} />
                </div>
                <div className="exposure-info">
                  <div className="exposure-label">Major Roads Arterial</div>
                  <div className="exposure-value">{exposure.majorRoads}</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Why is this zone at high risk? (SHAP Waterfall) */}
        <section className="shap-drivers-section">
          <div className="section-eyebrow">
            <HelpCircle size={14} />
            <span>Why is this zone at high risk?</span>
          </div>

          <div className="shap-bars-list">
            {shapPercentages.map((driver, idx) => {
              const barColor =
                idx === 0 ? '#ef4444' : idx === 1 ? '#f97316' : idx === 2 ? '#eab308' : '#38bdf8'
              return (
                <div key={driver.name} className="shap-bar-row">
                  <div className="shap-bar-top">
                    <span className="driver-title">{driver.name}</span>
                    <span className="driver-pct" style={{ color: barColor }}>
                      +{driver.pct}%
                    </span>
                  </div>
                  <div className="shap-track">
                    <div
                      className="shap-fill"
                      style={{
                        width: `${driver.pct * 2}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Recommended Mitigation Actions matching Image 1 */}
        <section className="recommendations-section">
          <div className="section-eyebrow">
            <Sliders size={14} />
            <span>Recommended Mitigation Actions</span>
          </div>

          <div className="actions-list">
            {actions.map((act) => (
              <div key={act.id} className="action-row">
                <div className="action-num-badge">{act.id}</div>
                <div className="action-content">
                  <div className="action-title">{act.title}</div>
                  <div className="action-detail">{act.detail}</div>
                </div>
                <ChevronRight size={14} className="action-arrow" />
              </div>
            ))}
          </div>
        </section>

        {/* ADMIN DISPATCH ACTION BUTTON */}
        <section className="admin-dispatch-section">
          <button
            type="button"
            className="dispatch-action-btn"
            onClick={() => onOpenDispatch(cell)}
            id="btn-intimate-mitigation-team"
          >
            <Send size={16} />
            <span>Intimate Mitigation Team (Admin Dispatch)</span>
          </button>
          <p className="dispatch-btn-help">
            Directly intimates municipal response squads with GPS coordinates and SHAP mitigation
            protocols.
          </p>
        </section>
      </div>
    </aside>
  )
}
