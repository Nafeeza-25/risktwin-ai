import { useState, useMemo } from 'react'
import {
  X,
  Compass,
  ArrowRight,
  AlertCircle,
  Mountain,
  Waves,
  Building,
  Info,
  Send,
  CheckCircle2,
} from 'lucide-react'
import type { CellProperties, DispatchOrder, InspectorTab } from './types'
import { CATEGORY_COLORS, categoryForScore, topDrivers } from './types'
import { driverLabel, formatDriverValue, recommend } from './recommendations'

interface Props {
  cell: CellProperties | null
  onClear: () => void
  onSelectDemo?: () => void
  onNavigateToScenario: () => void
  onOpenDispatch: (cell: CellProperties) => void
  activeDispatches: DispatchOrder[]
}

export default function RiskPanel({
  cell,
  onClear,
  onSelectDemo,
  onNavigateToScenario,
  onOpenDispatch,
  activeDispatches,
}: Props) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('overview')

  const drivers = useMemo(() => (cell ? topDrivers(cell) : []), [cell])
  const actions = useMemo(() => recommend(drivers), [drivers])

  // Check if simulated order exists for this cell
  const cellDispatch = useMemo(() => {
    if (!cell) return null
    return activeDispatches.find((d) => d.cell_id === cell.cell_id) ?? null
  }, [cell, activeDispatches])

  if (!cell) {
    return (
      <aside className="inspector-panel empty" aria-label="Location inspector">
        <div className="inspector-empty-inner">
          <div className="empty-icon-wrap">
            <Compass size={32} className="text-blue" />
          </div>
          <h3 className="empty-heading">Select a location on the map</h3>
          <p className="empty-body">
            Click any 250m grid cell across Chennai to inspect its XGBoost flood susceptibility
            score, Tree SHAP attributions, and planning scenarios.
          </p>

          <button
            type="button"
            className="btn-select-hotspot"
            onClick={onSelectDemo}
            id="btn-inspect-demo-hotspot"
          >
            Inspect priority hotspot (C0110_0040)
          </button>
        </div>
      </aside>
    )
  }

  const score = cell.susceptibility_score
  const category = categoryForScore(score)
  const categoryColor = CATEGORY_COLORS[category]

  return (
    <aside className="inspector-panel" aria-label={`Inspection panel for cell ${cell.cell_id}`}>
      {/* Header matching Image 1 */}
      <div className="inspector-header">
        <div className="inspector-title-block">
          <span className="inspector-eyebrow">SELECTED LOCATION</span>
          <h2 className="inspector-title">Cell {cell.cell_id}</h2>
          <span className="inspector-subtitle">
            Greater Chennai Corporation · {cell.validation_region} zone
          </span>
        </div>

        <button
          type="button"
          className="btn-close-inspector"
          onClick={onClear}
          title="Deselect location"
          aria-label="Deselect location"
        >
          <X size={16} />
        </button>
      </div>

      {/* Susceptibility Score Banner matching Image 1 */}
      <div className="susceptibility-card-banner">
        <div className="banner-left">
          <span className="banner-label">Model susceptibility</span>
          <strong className="banner-score">{score.toFixed(3)}</strong>
        </div>
        <span
          className="banner-badge"
          style={{
            backgroundColor: `${categoryColor}18`,
            color: categoryColor,
          }}
        >
          {category}
        </span>
      </div>

      {/* Sub-Tabs matching Image 1: Overview | Drivers | Actions | Exposure */}
      <div className="inspector-tabs-nav">
        <button
          type="button"
          className={`inspector-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          className={`inspector-tab-btn ${activeTab === 'drivers' ? 'active' : ''}`}
          onClick={() => setActiveTab('drivers')}
        >
          Drivers
        </button>
        <button
          type="button"
          className={`inspector-tab-btn ${activeTab === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveTab('actions')}
        >
          Actions
        </button>
        <button
          type="button"
          className={`inspector-tab-btn ${activeTab === 'exposure' ? 'active' : ''}`}
          onClick={() => setActiveTab('exposure')}
        >
          Exposure
        </button>
      </div>

      {/* Scrollable Content Body */}
      <div className="inspector-content-scroll">
        {/* Active Dispatch Notification Banner if created in session */}
        {cellDispatch && (
          <div className="dispatch-session-banner">
            <CheckCircle2 size={15} className="text-emerald" />
            <div className="banner-text">
              <strong>Simulated dispatch recorded in session:</strong> {cellDispatch.team_name}
            </div>
          </div>
        )}

        {/* TAB 1: OVERVIEW matching Image 1 */}
        {activeTab === 'overview' && (
          <div className="tab-pane-overview">
            <div className="overview-question-header">
              <h3>Why might this area be at risk?</h3>
              <p>
                The trained XGBoost model examines local geographic, hydraulic, and environmental features.
              </p>
            </div>

            {/* Top 3 Drivers with icons matching Image 1 */}
            <div className="overview-driver-cards-list">
              {drivers.slice(0, 3).map((driver, index) => {
                const isUpward = driver.shap >= 0
                const IconComponent =
                  driver.name.includes('elevation') || driver.name.includes('slope')
                    ? Mountain
                    : driver.name.includes('water') || driver.name.includes('river')
                    ? Waves
                    : Building

                return (
                  <div
                    key={driver.name}
                    className="overview-driver-item stagger-item"
                    style={{ animationDelay: `${index * 70}ms` }}
                  >
                    <div className="driver-icon-circle">
                      <IconComponent size={16} />
                    </div>
                    <div className="driver-info-wrap">
                      <div className="driver-title-row">
                        <strong className="driver-label">{driverLabel(driver.name)}</strong>
                        <span
                          className="driver-shap-pill"
                          style={{ color: isUpward ? '#DC2626' : '#0D9488' }}
                        >
                          {isUpward ? `+${driver.shap.toFixed(3)}` : driver.shap.toFixed(3)} log-odds
                        </span>
                      </div>
                      <span className="driver-detail-sub">
                        Measured input: {formatDriverValue(driver)} · {isUpward ? 'Increases risk' : 'Decreases risk'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Information Footnote matching Image 1 */}
            <div className="inspector-info-callout">
              <Info size={15} className="callout-icon" />
              <p>
                These are local <strong>Tree SHAP attributions</strong> in log-odds space from the
                trained XGBoost model. Output is an uncalibrated susceptibility score, not a
                future-flood probability.
              </p>
            </div>

            {/* Primary CTA Button matching Image 1 */}
            <div className="inspector-cta-row">
              <button
                type="button"
                className="btn-explore-scenario"
                onClick={onNavigateToScenario}
              >
                <span>Explore green-cover scenario</span>
                <ArrowRight size={15} />
              </button>
            </div>

            {/* Prototype Dispatch Trigger */}
            <div className="secondary-action-wrap">
              <button
                type="button"
                className="btn-link-dispatch"
                onClick={() => onOpenDispatch(cell)}
              >
                <Send size={13} />
                <span>Create simulated dispatch directive (Prototype)</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: DETAILED DRIVERS */}
        {activeTab === 'drivers' && (
          <div className="tab-pane-drivers">
            <div className="overview-question-header">
              <h3>Tree SHAP Model Drivers</h3>
              <p>
                Exact marginal contributions to the decision margin (log-odds). Base value: +0.754.
              </p>
            </div>

            <div className="drivers-detail-list">
              {drivers.map((driver) => {
                const isUpward = driver.shap >= 0
                const barColor = isUpward ? '#DC2626' : '#0D9488'
                const barWidth = Math.min(100, Math.max(12, Math.round((Math.abs(driver.shap) / 0.8) * 100)))

                return (
                  <div key={driver.name} className="driver-detail-card">
                    <div className="driver-card-header">
                      <div>
                        <strong>{driverLabel(driver.name)}</strong>
                        <span className="driver-raw-val">({formatDriverValue(driver)})</span>
                      </div>
                      <span className="driver-logodds-text" style={{ color: barColor }}>
                        {isUpward ? `+${driver.shap.toFixed(3)}` : driver.shap.toFixed(3)} log-odds
                      </span>
                    </div>

                    <div className="driver-progress-track">
                      <div
                        className="driver-progress-bar"
                        style={{ width: `${barWidth}%`, backgroundColor: barColor }}
                      />
                    </div>

                    <div className="driver-direction-caption">
                      {isUpward ? 'Raises model susceptibility' : 'Lowers model susceptibility'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TAB 3: ACTIONS */}
        {activeTab === 'actions' && (
          <div className="tab-pane-actions">
            <div className="overview-question-header">
              <h3>Planning Suggestions</h3>
              <p>
                Context-aware recommendations mapped directly to dominant physical drivers.
              </p>
            </div>

            <div className="actions-card-list">
              {actions.map((act, index) => (
                <div
                  key={act.id}
                  className="action-card-item stagger-item"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <div className="action-badge-number">{act.id}</div>
                  <div className="action-text-block">
                    <div className="action-heading">{act.title}</div>
                    <div className="action-description">{act.detail}</div>
                    <span className="action-reason-tag">{act.reason}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="inspector-info-callout">
              <Info size={14} className="callout-icon" />
              <p>
                Planning suggestions are heuristic and require civil engineering verification. They do
                not replace hydrodynamic drainage modeling.
              </p>
            </div>
          </div>
        )}

        {/* TAB 4: EXPOSURE */}
        {activeTab === 'exposure' && (
          <div className="tab-pane-exposure">
            <div className="overview-question-header">
              <h3>Socioeconomic Exposure</h3>
              <p>Population, buildings, and critical civic infrastructure.</p>
            </div>

            <div className="exposure-honest-box">
              <div className="notice-icon-circle">
                <AlertCircle size={18} className="text-amber" />
              </div>
              <h4>Exposure data not yet integrated</h4>
              <p>
                Census population counts, building polygons, healthcare facilities, schools, and road
                networks are not currently linked to this 250m grid.
              </p>
              <p className="notice-subtext">
                Current susceptibility scores quantify hazard and physical terrain characteristics
                only, without socioeconomic exposure weighting.
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
