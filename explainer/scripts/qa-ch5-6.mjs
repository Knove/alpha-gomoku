// QA Ch5 (PiEvolution slider) + Ch6 (SymmetryLab, LossChart)
import { chromium } from "playwright"
const BASE = "http://localhost:4173"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
await page.goto(BASE, { waitUntil: "networkidle" })

/* ---------- Ch5 slider ---------- */
const ch5 = page.locator("#ch-5")
await ch5.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
const slider = ch5.locator("input[type=range]")
console.log("slider min/max/value:", await slider.getAttribute("min"), await slider.getAttribute("max"), await slider.inputValue())
const roundLabel = async () => (await ch5.locator(".mini-label", { hasText: "空局首手" }).innerText()).trim()
console.log("initial:", await roundLabel())
// set min
await slider.fill("0")
await page.waitForTimeout(150)
console.log("after fill 0:", await roundLabel())
// set max
await slider.fill("3")
await page.waitForTimeout(150)
console.log("after fill 3:", await roundLabel())
// keyboard arrows
await slider.focus()
await page.keyboard.press("ArrowLeft")
await page.waitForTimeout(120)
console.log("after ArrowLeft:", await roundLabel(), "value:", await slider.inputValue())
await page.keyboard.press("Home")
await page.waitForTimeout(120)
console.log("after Home:", await roundLabel(), "value:", await slider.inputValue())
await page.keyboard.press("End")
await page.waitForTimeout(120)
console.log("after End:", await roundLabel(), "value:", await slider.inputValue())
// heat discs visible at each extreme?
const heatCount = async () => ch5.locator("figure").first().locator("svg").first().locator("circle[style*='heat'], circle[opacity]").count()
await slider.fill("0"); await page.waitForTimeout(150)
const fig1 = ch5.locator(".figure").first()
const heatCircles0 = await fig1.locator("svg circle").count()
await slider.fill("3"); await page.waitForTimeout(150)
const heatCircles3 = await fig1.locator("svg circle").count()
console.log("fig5-1 circle counts idx0/idx3:", heatCircles0, heatCircles3)
// TOP5 list rows at idx 0
const top5rows = await fig1.locator(".chip").count()
console.log("top5 chips at idx0:", top5rows)

/* ---------- Ch6 SymmetryLab ---------- */
const ch6 = page.locator("#ch-6")
await ch6.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
const thumbs = ch6.locator("button[aria-pressed]")
console.log("thumbnails:", await thumbs.count())
const mainChip = async () => (await ch6.locator(".chip.accent").first().innerText()).replace(/\s+/g, " ").trim()
const candChip = async () => (await ch6.locator(".chip", { hasText: "候选点" }).first().innerText()).replace(/\s+/g, " ").trim()

// expected candidate mapping (compute dihedral in test)
const Nn = 9
const DEMO_CAND = { x: 5, y: 2 }
function dihedralPoint(x, y, n, k) { let px = x, py = y; for (let i = 0; i < k % 4; i++) { const nx = py, ny = n - 1 - px; px = nx; py = ny } if (k >= 4) px = n - 1 - px; return { x: px, y: py } }
const COLS = "ABCDEFGHJ"
const label = (x, y) => `${COLS[x]}${y + 1}`

for (let k = 0; k < 8; k++) {
  await thumbs.nth(k).click()
  await page.waitForTimeout(80)
  const exp = dihedralPoint(DEMO_CAND.x, DEMO_CAND.y, Nn, k)
  const chip = await candChip()
  const pressed = await thumbs.nth(k).getAttribute("aria-pressed")
  console.log(`k=${k} chip="${chip}" expect cand ${label(exp.x, exp.y)} pressed=${pressed}`)
  // verify main view heat circle exists at expected position: main board is the first svg in ch6
  const mainSvg = ch6.locator("svg").first()
  const heat = await mainSvg.evaluate((el, { ex, ey }) => {
    const VB = 560, pad = VB * 0.075, cell = (VB - 2 * pad) / 8
    const cx = pad + ex * cell, cy = pad + ey * cell
    const circles = [...el.querySelectorAll("circle")]
    return circles.some((c) => Math.abs(Number(c.getAttribute("cx")) - cx) < 1 && Math.abs(Number(c.getAttribute("cy")) - cy) < 1 && getComputedStyle(c).fill === "rgb(190, 52, 37)" || circles.some((c2) => Math.abs(Number(c2.getAttribute("cx")) - cx) < 1 && Math.abs(Number(c2.getAttribute("cy")) - cy) < 1 && c2.style.fill.includes("heat")))
  }, { ex: exp.x, ey: exp.y })
  console.log(`k=${k} main-view heat at expected cell:`, heat)
}
// rapid clicking all thumbs
for (let i = 0; i < 16; i++) await thumbs.nth(i % 8).click()
await page.waitForTimeout(150)
console.log("after rapid clicks k chip:", await mainChip())
// keyboard: focus thumb 3, press Enter
await thumbs.nth(3).focus()
await page.keyboard.press("Enter")
await page.waitForTimeout(120)
console.log("keyboard Enter on thumb3:", await mainChip(), "pressed:", await thumbs.nth(3).getAttribute("aria-pressed"))
// verify thumbnail mini-board heat matches main view heat position for k=3
const exp3 = dihedralPoint(5, 2, 9, 3)
const thumbHeat = await thumbs.nth(3).locator("svg").evaluate((el, { ex, ey }) => {
  const VB = 560, pad = VB * 0.045, cell = (VB - 2 * pad) / 8
  const cx = pad + ex * cell, cy = pad + ey * cell
  return [...el.querySelectorAll("circle")].some((c) => Math.abs(Number(c.getAttribute("cx")) - cx) < 1 && Math.abs(Number(c.getAttribute("cy")) - cy) < 1)
}, { ex: exp3.x, ey: exp3.y })
console.log("thumb3 heat at expected cell:", thumbHeat)

/* ---------- Ch6 LossChart ---------- */
const fig2 = ch6.locator(".figure").nth(1)
await fig2.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
const chart = fig2.locator("svg").first()
const cbb = await chart.boundingBox()
const tip = fig2.locator(".tip")
// hover far left edge
async function hoverAt(fracX, fracY = 0.5) {
  await page.mouse.move(cbb.x + cbb.width * fracX, cbb.y + cbb.height * fracY, { steps: 2 })
  await page.waitForTimeout(120)
  if (await tip.count() && await tip.isVisible()) return (await tip.innerText()).replace(/\s+/g, " ")
  return null
}
console.log("hover x=0.01:", await hoverAt(0.01))
console.log("hover x=0.5:", await hoverAt(0.5))
console.log("hover x=0.99:", await hoverAt(0.99))
// tooltip clipped? check bounding box vs figure box
await hoverAt(0.99)
const tipBB = await tip.boundingBox()
const figBB = await fig2.boundingBox()
console.log("tip within figure horizontally:", tipBB.x >= figBB.x - 1 && tipBB.x + tipBB.width <= figBB.x + figBB.width + 1, "tipBB:", JSON.stringify(tipBB), "fig right:", figBB.x + figBB.width)
await hoverAt(0.01)
const tipBB0 = await tip.boundingBox()
console.log("left-edge tip within figure:", tipBB0.x >= figBB.x - 1)
// leave
await page.mouse.move(cbb.x + cbb.width / 2, cbb.y - 60)
await page.waitForTimeout(150)
console.log("tip hidden after leave:", (await tip.count()) === 0 || !(await tip.isVisible().catch(() => false)))

console.log("errors:", JSON.stringify(errors))
await browser.close()
console.log("DONE")
