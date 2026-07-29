// Targeted verification of review fixes
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const OUT = "/tmp/exp-verify"
mkdirSync(OUT, { recursive: true })
const URL = "http://localhost:4173"

const browser = await chromium.launch()

// 1) Ch5 slider at iteration 0: root value must render "0.00" (not "-0.00")
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.goto(URL, { waitUntil: "networkidle" })
  const slider = page.locator("#ch-5 input[type=range]").first()
  await slider.scrollIntoViewIfNeeded()
  await slider.fill("0")
  await page.waitForTimeout(400)
  const stat = await page.locator("#ch-5 .stat-big").first().textContent()
  console.log(`ch5 iter0 root value: "${stat}" (expect 0.00)`)
  await page.locator("#ch-5 .figure").first().screenshot({ path: `${OUT}/ch5-iter0.png` })
  await page.close()
}

// 2) 1680px: rail visible, no overlap; anchor click lands header below topbar
{
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } })
  await page.goto(URL, { waitUntil: "networkidle" })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/rail-1680.png` })
  // click rail item for ch-3
  const link = page.locator('.rail a[href="#ch-3"]')
  await link.scrollIntoViewIfNeeded()
  await link.click()
  await page.waitForTimeout(900)
  // measure: ch-3 section top should be >= 56px (topbar height)
  const top = await page.evaluate(() => {
    const el = document.getElementById("ch-3")
    return el ? el.getBoundingClientRect().top : -1
  })
  console.log(`ch-3 top after anchor: ${top}px (expect >= 56, i.e. not covered)`)
  await page.screenshot({ path: `${OUT}/anchor-ch3.png` })
  await page.close()
}

// 3) Ch3 gauge in dark theme
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.addInitScript(() => { try { localStorage.setItem("exp-theme", "dark") } catch (e) {} })
  await page.goto(URL, { waitUntil: "networkidle" })
  const fig = page.locator("#ch-3 .figure").nth(1)
  await fig.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await fig.screenshot({ path: `${OUT}/ch3-gauge-dark.png` })
  await page.close()
}

await browser.close()
console.log("verify shots saved")
