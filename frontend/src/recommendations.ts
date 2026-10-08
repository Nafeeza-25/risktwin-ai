import type { Driver } from './types'

const TERRAIN = new Set([
  'mean_elevation', 'min_elevation', 'mean_slope', 'relative_elevation_1km',
  'log_flow_accumulation_90m', 'twi_90m',
])
const WATER = new Set([
  'distance_to_river', 'distance_to_waterbody', 'river_edge_distance',
  'any_water_edge_distance',
])

export interface Recommendation {
  title: string
  detail: string
  tag: string
  reason: string
}

export function recommend(drivers: Driver[]): Recommendation[] {
  const upward = drivers.filter((driver) => driver.shap > 0).sort((a, b) => b.shap - a.shap)
  const groups = new Set(upward.map((driver) =>
    driver.name === 'built_up_fraction_2021' ? 'built' :
    WATER.has(driver.name) ? 'water' :
    TERRAIN.has(driver.name) ? 'terrain' : 'other',
  ))
  const actions: Recommendation[] = []

  if (groups.has('built')) {
    const driver = upward.find(({ name }) => name === 'built_up_fraction_2021')!
    actions.push({
      title: 'Evaluate green-cover conversion',
      detail: 'Identify suitable hardscape for permeable surfaces, planting, or small green infrastructure. Verify land ownership and site conditions first.',
      tag: 'Land cover',
      reason: `Suggested because ${driverLabel(driver.name).toLowerCase()} raises this cell’s model score.`,
    })
  }
  if (groups.has('water')) {
    const driver = upward.find(({ name }) => WATER.has(name))!
    actions.push({
      title: 'Protect and monitor water corridors',
      detail: 'Review floodplain encroachment, river or lake levels, and local evacuation readiness near mapped water.',
      tag: 'Water proximity',
      reason: `Suggested because ${driverLabel(driver.name).toLowerCase()} raises this cell’s model score.`,
    })
  }
  if (groups.has('terrain')) {
    const driver = upward.find(({ name }) => TERRAIN.has(name))!
    actions.push({
      title: 'Investigate drainage and retention',
      detail: 'Survey low spots, flow paths, and drainage capacity; consider retention options and early-warning triggers.',
      tag: 'Terrain / flow',
      reason: `Suggested because ${driverLabel(driver.name).toLowerCase()} raises this cell’s model score.`,
    })
  }
  if (actions.length === 0) {
    actions.push({
      title: 'Verify local conditions',
      detail: 'The top displayed drivers lower this model score. Check field conditions and maintain preparedness before planning an intervention.',
      tag: 'Field review',
      reason: 'The displayed local drivers do not provide an upward signal for a specific intervention.',
    })
  }
  return actions.slice(0, 3)
}

const LABELS: Record<string, string> = {
  mean_elevation: 'Mean elevation',
  min_elevation: 'Lowest elevation',
  mean_slope: 'Ground slope proxy',
  distance_to_river: 'River distance',
  distance_to_waterbody: 'Waterbody distance',
  relative_elevation_1km: 'Relative elevation',
  log_flow_accumulation_90m: 'Upstream flow proxy',
  twi_90m: 'Wetness index',
  river_edge_distance: 'River edge distance',
  any_water_edge_distance: 'Water edge distance',
  built_up_fraction_2021: 'Mapped built-up cover',
}

export function driverLabel(name: string): string {
  return LABELS[name] ?? name.replaceAll('_', ' ')
}

export function formatDriverValue(driver: Driver): string {
  if (driver.name === 'built_up_fraction_2021') return `${(driver.value * 100).toFixed(0)}% mapped cover`
  if (driver.name.includes('distance')) return `${Math.round(driver.value).toLocaleString()} m`
  if (driver.name.includes('elevation')) return `${driver.value.toFixed(1)} m`
  if (driver.name === 'mean_slope') return `${driver.value.toFixed(1)}°`
  return `${driver.value.toFixed(2)} index`
}

export function interpretDriver(driver: Driver): string {
  const direction = driver.shap >= 0 ? 'raises' : 'lowers'
  const value = formatDriverValue(driver)
  if (driver.name === 'built_up_fraction_2021') {
    return `${value} ${direction} this model's susceptibility estimate. Built-up cover is a 2021 land-cover proxy, not a direct measure of drainage.`
  }
  if (WATER.has(driver.name)) {
    return `At ${value}, mapped water proximity ${direction} the model estimate. This reflects location relative to known water features.`
  }
  if (driver.name.includes('flow') || driver.name === 'twi_90m') {
    return `The DEM-derived value (${value}) ${direction} the model estimate. It approximates terrain flow, not a drainage-network simulation.`
  }
  return `At ${value}, this terrain measure ${direction} the model estimate. It describes the mapped surface rather than a measured flood depth.`
}
