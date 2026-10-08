import { useMemo } from 'react'
import {
  X,
  Compass,
  Users,
  HelpCircle,
  ChevronRight,
  Send,
  CheckCircle2,
  Sliders,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from 'lucide-react'
import type { CellProperties, DispatchOrder } from './types'
import { CATEGORY_COLORS, categoryForScore, topDrivers } from './types'
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

  // Check if this cell has a simulated dispatch in current session
  const cellDispatch = useMemo(() => {
    if (!cell) return null
    return activeDispatches.find((d) => d.cell_id === cell.cell_id) ?? null
  }, [cell, activeDispatches])

  if (!cell) {
    return (
      <aside className="risk-panel empty-panel" aria-label="Risk Intelligence panel">
        <div className="empty-panel-inner">
          <div className="panel-badge-kicker">CELL INTELLIGENCE</div>
          <div className="empty-hero-icon" aria-hidden="true">
            <Compass size={36} />
          </div>
          <h2 className="empty-title">Select a Grid Cell</h2>
          <p className="empty-desc">
            Click any 250m grid cell on the Chennai map to inspect XGBoost flood susceptibility,
            local Tree SHAP attributions (log-odds), and planning recommendations.
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

  return (
    <aside className="risk-panel" aria-label={`Risk intelligence for ${cell.cell_id}`}>
      {/* Selected Zone Header */}
      <div className="panel-zone-header">
        <div className="zone-title-block">
          <div className="zone-label-sub">GRID CELL INSPECTION</div>
          <div className="zone-name">
            Cell {cell.cell_id}
            <span className="zone-sub-id">({cell.validation_region} region)</span>
          </div>
        </div>
        <div className="zone-actions">
          <button
            type="button"
            className="zone-close-btn"
            onClick={onClear}
            title="Deselect cell"
            aria-label="Deselect cell"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="panel-scroll-content">
        {/* Active Dispatch Notification Banner if simulated order created */}
        {cellDispatch && (
          <div className="active-dispatch-banner">
            <div className="dispatch-banner-header">
              <CheckCircle2 size={16} className="text-emerald" />
              <strong>Simulated Order Recorded in Memory</strong>
            </div>
            <div className="dispatch-banner-text">
              Assigned to <strong>{cellDispatch.team_name}</strong> • Priority: {cellDispatch.priority}
            </div>
          </div>
        )}

        {/* Flood Susceptibility Score Card (No fake confidence percentage) */}
        <section className="risk-score-card">
          <div className="score-card-header">
            <span className="score-label">Flood Susceptibility Score</span>
            <span className="uncalibrated-notice-tag">Uncalibrated Output</span>
          </div>

          <div className="score-value-row">
            <span className="big-score-val" style={{ color: categoryColor }}>
              {score.toFixed(3)}
            </span>
            <span
              className="risk-tier-tag"
              style={{ backgroundColor: `${categoryColor}22`, color: categoryColor }}
            >
              {category} Susceptibility
            </span>
          </div>

          <div className="score-disclaimer">
            Model score (0.00 – 1.00) measures feature similarity to the 2015 inundation training label.
            It is not a calibrated future-flood probability.
          </div>
        </section>

        {/* Exposure Data Section (Scientifically credible: no fabricated numbers) */}
        <section className="exposure-card">
          <div className="section-eyebrow">
            <Users size={14} />
            <span>Exposure Data</span>
          </div>
          <div className="exposure-notice-box">
            <div className="notice-header-row">
              <AlertCircle size={15} className="notice-icon" />
              <strong>Exposure data not yet integrated</strong>
            </div>
            <p className="notice-body-text">
              Census population, building footprints, critical facilities (hospitals, schools) and
              arterial roads are not yet linked to this 250m grid. Scores represent physical
              and land-cover hazard characteristics only, without socioeconomic exposure weighting.
            </p>
          </div>
        </section>

        {/* Why is this cell at high risk? (Tree SHAP in Log-Odds: no fake percentages) */}
        <section className="shap-drivers-section">
          <div className="section-eyebrow">
            <HelpCircle size={14} />
            <span>Local Model Drivers (Tree SHAP Log-Odds)</span>
          </div>

          <div className="shap-bars-list">
            {drivers.map((driver) => {
              const isUpward = driver.shap >= 0
              const barColor = isUpward ? '#ef4444' : '#10b981'
              // Scaled bar length relative to a typical max absolute SHAP value of 0.8
              const barWidth = Math.min(100, Math.max(12, Math.round((Math.abs(driver.shap) / 0.8) * 100)))

              return (
                <div key={driver.name} className="shap-bar-row">
                  <div className="shap-bar-top">
                    <div className="driver-name-block">
                      <span className="driver-title">{driverLabel(driver.name)}</span>
                      <span className="driver-val-sub">({formatDriverValue(driver)})</span>
                    </div>
                    <div className="driver-shap-badge" style={{ color: barColor }}>
                      {isUpward ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      <span>
                        {isUpward ? `+${driver.shap.toFixed(3)}` : driver.shap.toFixed(3)} log-odds
                      </span>
                    </div>
                  </div>
                  <div className="shap-track">
                    <div
                      className="shap-fill"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                  <div className="driver-direction-caption">
                    {isUpward
                      ? 'Raises model susceptibility estimate'
                      : 'Lowers model susceptibility estimate'}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="shap-method-note">
            Tree SHAP marginal contribution to the XGBoost decision margin. Output space: log-odds
            (base value: +0.754).
          </div>
        </section>

        {/* Recommended Mitigation Actions mapped to physical drivers */}
        <section className="recommendations-section">
          <div className="section-eyebrow">
            <Sliders size={14} />
            <span>Planning Suggestions (Physical Driver Mapped)</span>
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

        {/* PROTOTYPE DISPATCH ACTION BUTTON (Explicitly labelled prototype) */}
        <section className="admin-dispatch-section">
          <button
            type="button"
            className="dispatch-action-btn"
            onClick={() => onOpenDispatch(cell)}
            id="btn-intimate-mitigation-team"
          >
            <Send size={15} />
            <span>Simulate Mitigation Dispatch (Prototype)</span>
          </button>
          <p className="dispatch-btn-help">
            Prototype workflow: Orders are created in local browser memory only and are not
            transmitted to municipal emergency services.
          </p>
        </section>
      </div>
    </aside>
  )
}
