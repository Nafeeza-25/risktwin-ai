import assert from 'node:assert/strict'

const origin = process.env.RISKTWIN_URL ?? 'http://127.0.0.1:5173'

async function json(path, options) {
  const response = await fetch(`${origin}${path}`, options)
  assert.equal(response.status, 200, `${path} returned ${response.status}`)
  return response.json()
}

const page = await fetch(origin)
assert.equal(page.status, 200, 'Vite page did not load')
assert.match(await page.text(), /RiskTwin AI/)

const [layer, evidence] = await Promise.all([json('/api/cells'), json('/api/evidence')])
assert.equal(layer.type, 'FeatureCollection')
assert.equal(layer.features.length, 7227)
assert.equal(evidence.holdout_cells, 1839)

const cell = layer.features.find(({ properties }) => properties.cell_id === 'C0110_0040')
assert.ok(cell, 'Demo cell missing')
assert.ok(cell.properties.susceptibility_score >= 0.75, 'Demo cell is not Very High')
for (const rank of [1, 2, 3]) {
  assert.ok(cell.properties[`driver_${rank}`], `Missing SHAP driver ${rank}`)
}

const scenario = await json('/api/simulate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cell_id: cell.properties.cell_id, intensity: 0.3 }),
})
assert.equal(scenario.scenario_feature, 'built_up_fraction_2021')
assert.ok(Math.abs(scenario.scenario_feature_value - scenario.baseline_feature_value * 0.7) < 1e-9)
assert.ok(Number.isFinite(scenario.baseline_susceptibility))
assert.ok(Number.isFinite(scenario.scenario_susceptibility))

console.log(`PASS: page, ${layer.features.length} cells, SHAP drivers, evidence, and green-cover scenario (${scenario.baseline_susceptibility.toFixed(3)} → ${scenario.scenario_susceptibility.toFixed(3)})`)
