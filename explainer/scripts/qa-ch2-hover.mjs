// QA Ch2 planes hover - deep check
import { chromium } from "playwright"
const BASE = "http://localhost:4173"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on("pageerror", (e) => console.log("PAGEERROR", String(e)))
await page.goto(BASE, { waitUntil: "networkidle" })
await page.locator("#ch-2 svg[aria-label='平面 0 · 己方子']").scrollIntoViewIfNeeded()
await page.waitForTimeout(400)

const vars = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement)
  return { accent: cs.getPropertyValue("--accent").trim(), hairline: cs.getPropertyValue("--hairline").trim(), wash2: cs.getPropertyValue("--accent-wash-2").trim() }
})
console.log("CSS vars:", JSON.stringify(vars))

const state = async (p, i) => page.locator(`#ch-2 svg[aria-label^='平面']`).nth(p).locator("rect").nth(i)
  .evaluate((el) => ({ stroke: getComputedStyle(el).stroke, fill: getComputedStyle(el).fill, sw: el.getAttribute("stroke-width") ?? getComputedStyle(el).strokeWidth }))

console.log("before hover cell40 p0:", JSON.stringify(await state(0, 40)))

// hover via real mouse on cell 40 of plane 0
const bb = await page.locator(`#ch-2 svg[aria-label^='平面']`).nth(0).locator("rect").nth(40).boundingBox()
console.log("cell40 bbox:", JSON.stringify(bb))
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 3 })
await page.waitForTimeout(200)
console.log("during hover p0c40:", JSON.stringify(await state(0, 40)))
console.log("during hover p1c40:", JSON.stringify(await state(1, 40)))
console.log("during hover p2c40:", JSON.stringify(await state(2, 40)))

// touch tap test
await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2).catch((e) => console.log("tap err", e.message))
await page.waitForTimeout(200)
console.log("after tap p0c40:", JSON.stringify(await state(0, 40)))
console.log("after tap p1c40:", JSON.stringify(await state(1, 40)))
// tap elsewhere (page body)
await page.touchscreen.tap(50, 50).catch(() => {})
await page.waitForTimeout(200)
console.log("after tap elsewhere p0c40:", JSON.stringify(await state(0, 40)))
await browser.close()
console.log("DONE")
