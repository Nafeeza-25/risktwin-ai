import { chromium } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OUT_DIR = './screenshots/final-review'
if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true })
}

async function run() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Users\\Nafeeza\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle'],
  })

  // Capture at 1536x864
  console.log('Capturing at 1536x864...')
  const context = await browser.newContext({
    viewport: { width: 1536, height: 864 },
  })
  const page = await context.newPage()

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR:', msg.text())
    }
  })

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  // 1. Explore Map - default view (unselected state)
  const closeBtn = page.locator('button.btn-close-inspector')
  if (await closeBtn.isVisible()) {
    await closeBtn.click()
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: join(OUT_DIR, '01_explore_map_default_1536x864.png') })
  console.log('Captured 01_explore_map_default_1536x864.png')

  // Select C0110_0040
  const demoBtn = page.locator('#btn-inspect-demo-hotspot')
  if (await demoBtn.isVisible()) {
    await demoBtn.click()
    await page.waitForTimeout(800)
  }

  // 2. Selected Cell - Overview
  await page.click('button.inspector-tab-btn:has-text("Overview")')
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT_DIR, '02_selected_cell_overview_1536x864.png') })
  console.log('Captured 02_selected_cell_overview_1536x864.png')

  // 3. Selected Cell - Drivers
  await page.click('button.inspector-tab-btn:has-text("Drivers")')
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT_DIR, '03_selected_cell_drivers_1536x864.png') })
  console.log('Captured 03_selected_cell_drivers_1536x864.png')

  // 4. Selected Cell - Actions
  await page.click('button.inspector-tab-btn:has-text("Actions")')
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT_DIR, '04_selected_cell_actions_1536x864.png') })
  console.log('Captured 04_selected_cell_actions_1536x864.png')

  // Back to overview and click scenario CTA
  await page.click('button.inspector-tab-btn:has-text("Overview")')
  await page.waitForTimeout(300)
  await page.click('button.btn-explore-scenario')
  await page.waitForTimeout(1000)

  // 5. Scenario Lab - before running
  await page.screenshot({ path: join(OUT_DIR, '05_scenario_lab_before_1536x864.png') })
  console.log('Captured 05_scenario_lab_before_1536x864.png')

  // 6. Scenario Lab - after real API inference
  const runSimBtn = page.locator('button.btn-run-scenario-main')
  if (await runSimBtn.isVisible()) {
    await runSimBtn.click()
    await page.waitForSelector('.simulation-live-result-wrap', { timeout: 10000 })
    await page.waitForTimeout(800)
  }
  await page.screenshot({ path: join(OUT_DIR, '06_scenario_lab_after_1536x864.png') })
  console.log('Captured 06_scenario_lab_after_1536x864.png')

  // 7. Model Evidence
  await page.click('button.nav-item-btn:has-text("Model evidence")')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: join(OUT_DIR, '07_model_evidence_1536x864.png') })
  console.log('Captured 07_model_evidence_1536x864.png')

  // 8. Simulated Dispatch
  await page.click('button.nav-item-btn:has-text("Dispatch prototype")')
  await page.waitForTimeout(1000)
  const openModalBtn = page.locator('button.btn-create-dispatch')
  if (await openModalBtn.isVisible()) {
    await openModalBtn.click()
    await page.waitForTimeout(500)
    const recordBtn = page.locator('button.btn-confirm-record')
    if (await recordBtn.isVisible()) {
      await recordBtn.click()
      await page.waitForTimeout(500)
    }
  }
  await page.screenshot({ path: join(OUT_DIR, '08_simulated_dispatch_1536x864.png') })
  console.log('Captured 08_simulated_dispatch_1536x864.png')

  await context.close()

  // Capture at 1366x768
  console.log('Capturing at 1366x768...')
  const contextSmall = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  })
  const pageSmall = await contextSmall.newPage()
  await pageSmall.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  await pageSmall.waitForTimeout(2000)

  await pageSmall.screenshot({ path: join(OUT_DIR, 'explore_map_1366x768.png') })
  console.log('Captured explore_map_1366x768.png')

  await pageSmall.click('button.nav-item-btn:has-text("Scenario lab")')
  await pageSmall.waitForTimeout(1000)
  await pageSmall.screenshot({ path: join(OUT_DIR, 'scenario_lab_1366x768.png') })
  console.log('Captured scenario_lab_1366x768.png')

  await pageSmall.click('button.nav-item-btn:has-text("Model evidence")')
  await pageSmall.waitForTimeout(1000)
  await pageSmall.screenshot({ path: join(OUT_DIR, 'model_evidence_1366x768.png') })
  console.log('Captured model_evidence_1366x768.png')

  await contextSmall.close()
  await browser.close()
  console.log('All screenshots captured successfully!')
}

run().catch((err) => {
  console.error('FAILED:', err)
  process.exit(1)
})
