import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

export type RiskCategory = 'Low' | 'Moderate' | 'High' | 'Very High' | 'Critical'

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

export interface CellExposure {
  population: number
  buildings: number
  hospitals: number
  schools: number
  majorRoads: string
}

export interface DispatchOrder {
  id: string
  cell_id: string
  zone_name: string
  risk_score: number
  team_name: string
  priority: 'Critical / Immediate' | 'High' | 'Normal'
  protocol: string
  timestamp: string
  status: 'Dispatched' | 'En Route' | 'Mitigation Active' | 'Completed'
  officer: string
  unitContact: string
  notes: string
}

export type ActiveNavTab = 'dashboard' | 'analysis' | 'planner' | 'simulator' | 'reports'

export interface LayerToggleState {
  floodRisk: boolean
  historicalFloods: boolean
  waterBodies: boolean
  populationDensity: boolean
  criticalInfrastructure: boolean
  elevationDem: boolean
  landCover: boolean
  rainfallAverage: boolean
  administrativeBoundaries: boolean
}

export interface RiskFilterState {
  critical: boolean
  high: boolean
  moderate: boolean
  low: boolean
}

export const CATEGORY_COLORS: Record<string, string> = {
  Low: '#10b981',        // Emerald/Green (0 - 0.25)
  Moderate: '#eab308',   // Yellow (0.25 - 0.50)
  High: '#f97316',       // Orange (0.50 - 0.75)
  'Very High': '#ef4444', // Red/Critical (0.75 - 1.0)
  Critical: '#ef4444',
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

export function computeExposure(cell: CellProperties): CellExposure {
  // Deterministic calculation based on cell ID hash and built-up fraction
  const hash = cell.cell_id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const builtUp = Math.max(0.1, Number(cell.driver_1_value) || 0.45)
  const basePop = 2400 + Math.round(builtUp * 4200) + (hash % 1100)
  const baseBuildings = 650 + Math.round(builtUp * 1150) + (hash % 320)
  const hospitals = (hash % 7 === 0) ? 2 : (hash % 3 === 0 ? 1 : 0)
  const schools = 1 + (hash % 4)
  const roads = (1.5 + (hash % 25) / 10).toFixed(1)

  return {
    population: basePop,
    buildings: baseBuildings,
    hospitals,
    schools,
    majorRoads: `${roads} km`,
  }
}
