import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

export type RiskCategory = 'Low' | 'Moderate' | 'High' | 'Very High'

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

export const CATEGORY_COLORS: Record<RiskCategory, string> = {
  Low: '#0d9488',
  Moderate: '#d97706',
  High: '#ea580c',
  'Very High': '#be123c',
}

export function categoryForScore(score: number): RiskCategory {
  if (score < 0.25) return 'Low'
  if (score < 0.5) return 'Moderate'
  if (score < 0.75) return 'High'
  return 'Very High'
}

export function topDrivers(cell: CellProperties): Driver[] {
  return [1, 2, 3].map((index) => ({
    name: cell[`driver_${index}` as keyof CellProperties] as string,
    value: Number(cell[`driver_${index}_value` as keyof CellProperties]),
    shap: Number(cell[`driver_${index}_shap` as keyof CellProperties]),
  }))
}
