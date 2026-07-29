// QA Ch3: ArchDiagram hover/pin/keyboard + rapid interactions
import { chromium } from "playwright"
const BASE = "http://localhost:4173"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
await page.goto(BASE, { waitUntil: "networkidle" })
await page.locator("#ch-3 svg[role='group']").scrollIntoViewIfNeeded()
await page.waitForTimeout(500)

const mods = page.locator("#ch-3 svg[role='group'] g[role='button']")
console.log("module count:", await mods.count())
const cardText = async () => (await page.locator("#ch-3 .card").first().innerText()).replace(/\s+/g, " ").slice(0, 90)

// 1. hover a module -> card shows its info (not pinned)
const stem = mods.nth(1)
await stem.hover()
await page.waitForTimeout(150)
console.log("hover stem -> card:", await cardText())

// 2. click module -> pinned; move mouse away -> card stays
await stem.click()
await page.mouse.move(30, 850)
await page.waitForTimeout(200)
console.log("pin stem, mouse away -> card:", await cardText())

// 3. click same module again -> unpin
await stem.click()
await page.waitForTimeout(150)
console.log("unpin -> card:", await cardText())

// 4. pin module A, then click module B rapidly alternating 10x
const a = mods.nth(2), b = mods.nth(4)
for (let i = 0; i < 10; i++) { await (i % 2 ? b : a).click() }
await page.waitForTimeout(150)
console.log("after 10 alternating clicks (last=b) -> card:", await cardText())

// 5. click svg empty area -> unpin
await page.locator("#ch-3 svg[role='group']").click({ position: { x: 10, y: 10 } })
await page.waitForTimeout(150)
console.log("click svg bg -> card:", await cardText())

// 6. keyboard: Tab to a module, press Enter -> pin
await mods.nth(0).focus()
console.log("focused module aria-label:", await page.evaluate(() => document.activeElement?.getAttribute("aria-label")))
await page.keyboard.press("Enter")
await page.waitForTimeout(150)
console.log("Enter on input -> card:", await cardText())
// Space on another module
await mods.nth(7).focus()
await page.keyboard.press(" ")
await page.waitForTimeout(150)
console.log("Space on tanh -> card:", await cardText())

// 7. pinned + hover other module: card shows hovered (preview), then back to pinned
await mods.nth(7).click() // ensure pinned tanh (Space toggled? check)
console.log("after click tanh again -> card:", await cardText())
await mods.nth(0).hover()
await page.waitForTimeout(150)
console.log("hover input while tanh pinned -> card:", await cardText())
await page.mouse.move(30, 850)
await page.waitForTimeout(200)
console.log("mouse away -> card:", await cardText())

// 8. Tab order: how many tabbable inside svg
await page.locator("#ch-3 svg[role='group']").evaluate((el) => el.querySelector("g[role='button']").focus())
const seq = []
for (let i = 0; i < 9; i++) {
  seq.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName))
  await page.keyboard.press("Tab")
}
console.log("tab sequence from first module:", JSON.stringify(seq))

console.log("errors:", JSON.stringify(errors))
await browser.close()
console.log("DONE")
