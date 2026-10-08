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
  id: number
  title: string
  detail: string
  tag: string
  reason: string
}

export function recommend(drivers: Driver[]): Recommendation[] {
  const upward = drivers.filter((driver) => driver.shap > 0).sort((a, b) => b.shap - a.shap)
  const hasBuilt = upward.some((d) => d.name === 'built_up_fraction_2021')
  const hasWater = upward.some((d) => WATER.has(d.name))
  const hasTerrain = upward.some((d) => TERRAIN.has(d.name))

  const actions: Recommendation[] = [
    {
      id: 1,
      title: hasTerrain ? 'Improve drainage infrastructure & desilting' : 'Upgrade arterial stormwater drains',
      detail: 'Increase conveyance capacity of micro-drains and clear downstream culvert bottlenecks to reduce surface runoff.',
      tag: 'Drainage',
      reason: hasTerrain ? 'High terrain runoff accumulation detected by DEM features.' : 'Standard civic drainage mitigation protocol.',
    },
    {
      id: 2,
      title: hasWater ? 'Strengthen riverbank & flood barrier bunds' : 'Enforce riparian buffer & sluice gate control',
      detail: 'Reinforce embankment revetments, check canal bund integrity, and inspect flap gates to prevent backflow.',
      tag: 'Water Barrier',
      reason: hasWater ? 'Cell is within proximity threshold of mapped water corridor.' : 'Protects adjacent catchment zone.',
    },
    {
      id: 3,
      title: 'Enhance early warning & sensor telemetry',
      detail: 'Deploy ultrasonic water level gauges at nearby bridges and establish automated SMS ward alerts.',
      tag: 'Early Warning',
      reason: 'Critical response requirement for high susceptibility zones.',
    },
    {
      id: 4,
      title: hasBuilt ? 'Convert hardscape to permeable green cover' : 'Retrofit bioswales & infiltration basins',
      detail: 'Mandate permeable interlocking concrete pavement, rooftop retention, and roadside rain gardens.',
      tag: 'Nature-Based',
      reason: hasBuilt ? 'Driven by high built-up impervious surface fraction in this zone.' : 'Reduces localized surface ponding.',
    },
    {
      id: 5,
      title: 'Protect critical infrastructure & staging points',
      detail: 'Install flood barrier walls around local substations, ensure hospital backup power, and designate school evacuation shelters.',
      tag: 'Asset Protection',
      reason: 'Safeguards essential civic infrastructure in vulnerable zone.',
    },
  ]

  return actions
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
    return `${value} ${direction} this model's susceptibility estimate. Built-up cover is an impervious surface proxy.`
  }
  if (WATER.has(driver.name)) {
    return `At ${value}, mapped water proximity ${direction} the model estimate. Reflects distance to river/waterbody network.`
  }
  if (driver.name.includes('flow') || driver.name === 'twi_90m') {
    return `The DEM flow proxy (${value}) ${direction} susceptibility. Approximates natural gravity drainage flow.`
  }
  return `At ${value}, this terrain measure ${direction} the model estimate.`
}
