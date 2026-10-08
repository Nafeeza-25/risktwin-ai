import { useEffect, useMemo, useRef, useState } from 'react'
import {
  X,
  Compass,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Info,
  AlertCircle,
  Play,
} from 'lucide-react'
import type { CellProperties, SimulationResult } from './types'
import { CATEGORY_COLORS, categoryForScore, topDrivers } from './types'
import { driverLabel, formatDriverValue, interpretDriver, recommend } from './recommendations'

interface Props {
  cell: CellProperties | null
  onClear: () => void
  onSelectDemo?: () => void
}

const formatScore = (value: number) => value.toFixed(3)
const formatComparison = (value: number) => value.toFixed(4)
const formatChange = (value: number) =>
  Math.abs(value) < 0.0001 ? Math.abs(value).toFixed(6) : Math.abs(value).toFixed(4)

export default function RiskPanel({ cell, onClear, onSelectDemo }: Props) {
  const [intensity, setIntensity] = useState(20)
  const [simulation, setSimulation] = useState<SimulationResult | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const drivers = useMemo(() => (cell ? topDrivers(cell) : []), [cell])
  const actions = useMemo(() => recommend(drivers), [drivers])

  useEffect(() => {
    requestRef.current?.abort()
    setSimulation(null)
    setError(null)
    setIntensity(20)
    setSimulating(false)
    return () => requestRef.current?.abort()
  }, [cell?.cell_id])

  async function runSimulation() {
    if (!cell) return
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setSimulating(true)
    setError(null)
    setSimulation(null)

    try {
      const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cell_id: cell.cell_id, intensity: intensity / 100 }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Scenario request failed (${response.status})`)
      const data = (await response.json()) as SimulationResult
      if (data.cell_id !== cell.cell_id) {
        throw new Error('Scenario result did not match the selected cell')
      }
      setSimulation(data)
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : 'Scenario could not be calculated')
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setSimulating(false)
      }
    }
  }

  if (!cell) {
    return (
      <aside className="risk-panel empty-panel" aria-label="Risk Intelligence panel">
        <div className="panel-badge-kicker">DECISION WORKSPACE</div>
        <div className="empty-hero-icon" aria-hidden="true">
          <Compass size={32} />
        </div>
        <h2 className="empty-title">Select a Grid Cell</h2>
        <p className="empty-desc">
          Click any coloured 250m grid cell on the Chennai map or choose a priority hotspot to inspect
          local ML drivers, planning suggestions, and simulate green-cover intervention scenarios.
        </p>

        <div className="workflow-steps">
          <div className="workflow-step">
            <div className="step-num">01</div>
            <div className="step-content">
              <strong>Inspect Susceptibility</strong>
              <span>Review model score and regional risk level</span>
            </div>
          </div>
          <div className="workflow-step">
            <div className="step-num">02</div>
            <div className="step-content">
              <strong>Understand SHAP Drivers</strong>
              <span>Transparent local attributions from XGBoost</span>
            </div>
          </div>
          <div className="workflow-step">
            <div className="step-num">03</div>
            <div className="step-content">
              <strong>Simulate Green-Cover</strong>
              <span>Test built-up land conversion what-if scenarios</span>
            </div>
          </div>
        </div>

        {onSelectDemo && (
          <button
            type="button"
            className="demo-trigger-btn"
            onClick={onSelectDemo}
          >
            <span>Inspect Demo Hotspot (C0110_0040)</span>
            <ArrowRight size={14} />
          </button>
        )}
      </aside>
    )
  }

  const category = categoryForScore(cell.susceptibility_score)
  const cover =
    cell.driver_1 === 'built_up_fraction_2021'
      ? cell.driver_1_value
      : cell.driver_2 === 'built_up_fraction_2021'
        ? cell.driver_2_value
        : cell.driver_3 === 'built_up_fraction_2021'
          ? cell.driver_3_value
          : null
  const delta = simulation?.score_change ?? 0

  return (
    <aside
      className="risk-panel selected-panel"
      aria-label="Risk Intelligence panel"
      key={cell.cell_id}
    >
      {/* Header */}
      <div className="panel-head">
        <div>
          <div className="panel-badge-kicker">RISK DECISION INTELLIGENCE</div>
          <h2 className="panel-title">Cell Analysis</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClear}
          title="Close cell analysis"
          aria-label="Close cell analysis"
        >
          <X size={16} />
        </button>
      </div>

      {/* Main Score Card */}
      <section className="score-card">
        <div className="score-card-header">
          <span className="score-label">Flood Susceptibility Score</span>
          <span className="score-scale-hint">0.00 – 1.00 index</span>
        </div>

        <div className="score-main-row">
          <strong className="score-number">{formatScore(cell.susceptibility_score)}</strong>
          <span
            className="category-pill"
            style={{
              backgroundColor: `${CATEGORY_COLORS[category]}20`,
              color: CATEGORY_COLORS[category],
              borderColor: CATEGORY_COLORS[category],
            }}
          >
            {category} Susceptibility
          </span>
        </div>

        <div className="score-meter-track" aria-hidden="true">
          <div
            className="score-meter-bar"
            style={{
              width: `${Math.min(100, Math.max(0, cell.susceptibility_score * 100))}%`,
              backgroundColor: CATEGORY_COLORS[category],
            }}
          />
        </div>

        <div className="cell-coordinates">
          <div className="coord-item">
            <span>Cell ID</span>
            <strong>{cell.cell_id}</strong>
          </div>
          <div className="coord-item">
            <span>Coordinates</span>
            <strong>
              {cell.latitude.toFixed(4)}° N, {cell.longitude.toFixed(4)}° E
            </strong>
          </div>
          <div className="coord-item">
            <span>Validation Zone</span>
            <strong>{cell.validation_region || 'Spatial Grid'}</strong>
          </div>
        </div>
      </section>

      {/* Scientific Context */}
      <div className="scientific-caption">
        <Info size={13} className="info-icon" />
        <span>
          Empirical similarity to the 2015 inundation benchmark. Scores are uncalibrated and
          represent geographic susceptibility, not future flood probability.
        </span>
      </div>

      {/* Top 3 SHAP Drivers */}
      <section className="panel-section">
        <div className="section-head">
          <h3 className="section-title">Model Drivers</h3>
          <span className="section-tag">TOP 3 LOCAL SHAP</span>
        </div>
        <p className="section-desc">
          Local attributions showing how spatial features shifted the model score for this cell.
        </p>

        <div className="driver-list">
          {drivers.map((driver, index) => {
            const isUpward = driver.shap >= 0
            return (
              <article className="driver-card" key={`${driver.name}-${index}`}>
                <div className="driver-header">
                  <span className="driver-index">0{index + 1}</span>
                  <span className="driver-name">{driverLabel(driver.name)}</span>
                  <span className={`driver-direction ${isUpward ? 'dir-up' : 'dir-down'}`}>
                    {isUpward ? (
                      <>
                        <TrendingUp size={11} /> Raises score
                      </>
                    ) : (
                      <>
                        <TrendingDown size={11} /> Lowers score
                      </>
                    )}
                  </span>
                </div>
                <div className="driver-stats">
                  <span className="driver-value">{formatDriverValue(driver)}</span>
                  <span className="driver-shap">
                    SHAP {driver.shap >= 0 ? '+' : ''}
                    {driver.shap.toFixed(3)} log-odds
                  </span>
                </div>
                <p className="driver-explanation">{interpretDriver(driver)}</p>
              </article>
            )
          })}
        </div>
        <div className="fine-disclaimer">
          SHAP values explain model attribution, not physical causal relationships.
        </div>
      </section>

      {/* Planning Suggestions */}
      <section className="panel-section">
        <div className="section-head">
          <h3 className="section-title">Planning Suggestions</h3>
          <span className="section-tag">RULE-BASED SUPPORT</span>
        </div>
        <p className="section-desc">
          Actionable mitigation suggestions mapped from upward model drivers; verify with local site
          inspection.
        </p>

        <div className="action-list">
          {actions.map((action, i) => (
            <article className="action-card" key={`${action.title}-${i}`}>
              <div className="action-tag">{action.tag}</div>
              <h4 className="action-title">{action.title}</h4>
              <p className="action-reason">{action.reason}</p>
              <p className="action-detail">{action.detail}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Green-Cover Scenario */}
      <section className="panel-section scenario-section">
        <div className="section-head">
          <h3 className="section-title">Green-Cover Scenario</h3>
          <span className="section-tag highlight-tag">WHAT-IF SIMULATION</span>
        </div>
        <p className="section-desc">
          Simulate converting a portion of mapped built-up cover into permeable green cover.
          Only <code>built_up_fraction_2021</code> input changes; all terrain and drainage remain fixed.
        </p>

        <div className="slider-control-card">
          <div className="slider-header">
            <label htmlFor="intensity-slider">Built-up Cover Converted</label>
            <span className="slider-value-display">{intensity}%</span>
          </div>

          <input
            id="intensity-slider"
            className="scenario-slider"
            type="range"
            min="5"
            max="50"
            step="5"
            value={intensity}
            onChange={(e) => {
              setIntensity(Number(e.target.value))
              setSimulation(null)
            }}
          />

          <div className="slider-ticks">
            <span>5%</span>
            <span>25%</span>
            <span>50%</span>
          </div>

          {cover !== null && (
            <div className="cover-preview">
              <span>Current Mapped Built-up: <b>{(cover * 100).toFixed(0)}%</b></span>
              <span>Projected: <b>{(cover * (1 - intensity / 100) * 100).toFixed(0)}%</b></span>
            </div>
          )}
        </div>

        <button
          type="button"
          className="scenario-submit-btn"
          onClick={runSimulation}
          disabled={simulating}
        >
          {simulating ? (
            <>
              <span className="btn-spinner" />
              <span>Simulating with XGBoost…</span>
            </>
          ) : (
            <>
              <span>Run Green-Cover Simulation</span>
              <Play size={14} />
            </>
          )}
        </button>

        {error && (
          <div className="scenario-error-box" role="alert">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Simulation Result */}
        {simulation && (
          <div className="scenario-result-card" aria-live="polite">
            <div className="result-header">
              <span className="result-kicker">MODELLED SCENARIO COMPARISON</span>
              {Math.abs(delta) < 0.005 ? (
                <span className="minimal-change-badge">
                  Minimal modelled change
                </span>
              ) : (
                <span className="significant-change-badge">
                  Modelled reduction
                </span>
              )}
            </div>

            <div className="comparison-metric-grid">
              <div className="metric-box">
                <span className="metric-label">Baseline Score</span>
                <strong className="metric-val">{formatComparison(simulation.baseline_susceptibility)}</strong>
              </div>
              <div className="metric-box scenario-box">
                <span className="metric-label">Scenario Score</span>
                <strong className="metric-val">{formatComparison(simulation.scenario_susceptibility)}</strong>
              </div>
            </div>

            <div className="result-row">
              <span className="result-row-label">Susceptibility Delta</span>
              <strong className={`result-row-val ${delta < 0 ? 'change-down' : delta > 0 ? 'change-up' : ''}`}>
                {delta < 0 ? '−' : delta > 0 ? '+' : ''}
                {formatChange(delta)} {delta < 0 ? 'reduction' : delta > 0 ? 'increase' : 'unchanged'}
              </strong>
            </div>

            <div className="result-row">
              <span className="result-row-label">Built-Up Fraction</span>
              <strong className="result-row-val">
                {(simulation.baseline_feature_value * 100).toFixed(1)}% → {(simulation.scenario_feature_value * 100).toFixed(1)}%
              </strong>
            </div>
          </div>
        )}

        <div className="scenario-caveat">
          <AlertCircle size={13} className="caveat-icon" />
          <span>
            Scenario projection based on land-cover assumptions; does not guarantee physical hydraulic flood reduction.
          </span>
        </div>

        <details className="science-limitations-accordion">
          <summary>Data &amp; Modeling Limitations</summary>
          <div className="accordion-content">
            <p>
              The land-cover layer is from 2021, whereas the inundation benchmark is from 2015.
              A production model should utilize temporal satellite harmonization.
              Both SHAP values and scenario projections reflect machine-learning model response rather than hydrodynamic simulations.
            </p>
          </div>
        </details>
      </section>
    </aside>
  )
}
