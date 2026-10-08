import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

export type RiskCategory = 'Low' | 'Moderate' | 'High' | 'Critical'

export interface CellProperties {
  cell_id: string
  latitude: number
  longitude: number
  susceptibility_score: number
  validation_region: string
  driver_1: string
  driver_1_value: number
  driver_1_shap: number
  driver_2: string
  driver_2_value: number
  driver_2_shap: number
  driver_3: string
  driver_3_value: number
  driver_3_shap: number
}

export type RiskFeature = Feature<Polygon | MultiPolygon, CellProperties>
export type RiskLayer = FeatureCollection<Polygon | MultiPolygon, CellProperties>

export interface ModelEvidence {
  model: string
  holdout_cells: number
  positive_prevalence: number
  interpretation: string
  metrics: {
    roc_auc: number
    pr_auc_average_precision: number
    precision: number
    recall: number
    f1: number
    confusion_matrix_tn_fp_fn_tp?: [number, number, number, number]
  }
}

export interface SimulationResult {
  cell_id: string
  model: string
  intensity: number
  scenario_feature: string
  baseline_feature_value: number
  scenario_feature_value: number
  baseline_susceptibility: number
  scenario_susceptibility: number
  score_change: number
  assumption: string
  note: string
}

export interface Driver {
  name: string
  value: number
  shap: number
}

export interface DispatchOrder {
  id: string
  cell_id: string
  zone_name: string
  risk_score: number
  team_name: string
  priority: 'Immediate' | 'High' | 'Normal'
  protocol: string
  timestamp: string
  status: 'Simulated Order Created'
  notes: string
}

export type ActiveNavTab = 'dashboard' | 'analysis' | 'planner' | 'simulator' | 'reports'

export interface RiskFilterState {
  critical: boolean
  high: boolean
  moderate: boolean
  low: boolean
}

export const CATEGORY_COLORS: Record<string, string> = {
  Low: '#10b981',        // Emerald/Green (< 0.25)
  Moderate: '#eab308',   // Yellow (0.25 - 0.50)
  High: '#f97316',       // Orange (0.50 - 0.75)
  Critical: '#ef4444',   // Red (>= 0.75)
  'Very High': '#ef4444',
}

export function categoryForScore(score: number): 'Low' | 'Moderate' | 'High' | 'Critical' {
  if (score < 0.25) return 'Low'
  if (score < 0.5) return 'Moderate'
  if (score < 0.75) return 'High'
  return 'Critical'
}

export function topDrivers(cell: CellProperties): Driver[] {
  return [1, 2, 3].map((index) => ({
    name: cell[`driver_${index}` as keyof CellProperties] as string,
    value: Number(cell[`driver_${index}_value` as keyof CellProperties]),
    shap: Number(cell[`driver_${index}_shap` as keyof CellProperties]),
  }))
}
