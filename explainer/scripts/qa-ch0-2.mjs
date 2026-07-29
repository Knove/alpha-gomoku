// QA Ch0/Ch1/Ch2 interactions
import { chromium } from "playwright"

const BASE = "http://localhost:4173"
const out = []
const log = (area, item, result) => { out.push({ area, item, result }); console.log(`[${area}] ${item}: ${result}`) }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
await page.goto(BASE, { waitUntil: "networkidle" })
await page.waitForTimeout(600)

/* ---------- Ch0 ---------- */
const ch0 = page.locator("#ch-0")
const ch0Buttons = await ch0.locator("button").count()
log("Ch0", "button count", ch0Buttons)
const cta = ch0.locator("a.btn.primary")
log("Ch0", "CTA href", await cta.getAttribute("href"))
await cta.click()
await page.waitForTimeout(400)
const ch1Top = await page.locator("#ch-1").evaluate((el) => el.getBoundingClientRect().top)
log("Ch0", "CTA click scrolls to ch-1 (top px)", Math.round(ch1Top))
// disabled buttons?
const ch0Disabled = await ch0.locator("button:disabled, a[aria-disabled='true']").count()
log("Ch0", "dead/disabled controls", ch0Disabled)

/* ---------- Ch1 flywheel ---------- */
const ch1 = page.locator("#ch-1")
const push = ch1.locator("button.btn.primary")
await ch1.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
log("Ch1", "initial button label", (await push.innerText()).trim())
const ledgerRows = () => ch1.locator(".card .mono", { hasText: "第" }).count()
// click once
await push.click()
await page.waitForTimeout(150)
log("Ch1", "after 1 click label", (await push.innerText()).trim())
// rapid fire 10 clicks
for (let i = 0; i < 10; i++) await push.click({ force: true }).catch(() => {})
await page.waitForTimeout(300)
log("Ch1", "after rapid 11 total: disabled?", await push.isDisabled())
log("Ch1", "after rapid: label", (await push.innerText()).trim())
const ledgerCards = await ch1.locator(".card").count()
log("Ch1", "ledger cards visible (expect >=4: 4 rounds)", ledgerCards)
const banner = await ch1.locator(".banner.accent").count()
log("Ch1", "done banner count (expect 1)", banner)
// click disabled button rapidly - should be no-op, no errors
for (let i = 0; i < 5; i++) await push.click({ force: true }).catch(() => {})
await page.waitForTimeout(200)
log("Ch1", "clicking disabled button: still label", (await push.innerText()).trim())

/* ---------- Ch2 perspective toggle ---------- */
const ch2 = page.locator("#ch-2")
await ch2.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
const segBtns = ch2.locator(".seg-btn")
log("Ch2", "seg buttons count", await segBtns.count())
// rapid alternate toggle 20x
for (let i = 0; i < 20; i++) await segBtns.nth(i % 2).click()
await page.waitForTimeout(600)
// after 20 clicks ending on 行棋方视角(index 1 last): i=19 -> nth(1)
const activeLabel = await ch2.locator(".seg-btn.active").innerText()
log("Ch2", "after 20 rapid toggles active", activeLabel.trim())
// verify matrix values in canonical mode: cell containing white stone at (5,4) originally -1 -> canon +1
const matrixVal = await ch2.evaluate(() => {
  // find the numeric grid: locate spans within ch-2 grid cells with two layers
  const sec = document.querySelector("#ch-2")
  const grids = sec.querySelectorAll("div[style*='grid-template-columns']")
  return null
})
// Direct DOM check: count stones rendered in svg of fig 2-1
const stoneCount = await ch2.locator("svg circle").count()
log("Ch2", "fig2-1 svg circle count (stones doubled layers + stars)", stoneCount)
// keyboard: focus seg buttons and press Enter
await segBtns.nth(0).focus()
await page.keyboard.press("Enter")
await page.waitForTimeout(200)
log("Ch2", "after keyboard Enter on 客观视角, active", (await ch2.locator(".seg-btn.active").innerText()).trim())

/* ---------- Ch2 planes hover ---------- */
const planes = ch2.locator("svg[role='img'][aria-label^='平面']")
log("Ch2", "planes count", await planes.count())
// hover cell index 40 (x=4,y=4 center, occupied by own white in canon plane0)
const rect = await planes.nth(0).locator("rect").nth(40).boundingBox()
await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
await page.waitForTimeout(150)
const strokeOf = async (p, i) => planes.nth(p).locator("rect").nth(i).evaluate((el) => getComputedStyle(el).stroke)
const s0 = await strokeOf(0, 40), s1 = await strokeOf(1, 40), s2 = await strokeOf(2, 40)
log("Ch2", "hover sync strokes same cell 3 planes", JSON.stringify([s0, s1, s2]))
const same = s0 === s1 && s1 === s2
log("Ch2", "hover sync same highlight color?", same)
// move away -> hover cleared
await page.mouse.move(rect.x + rect.width / 2, rect.y - 100)
await page.waitForTimeout(150)
const sAfter = await strokeOf(0, 40)
log("Ch2", "after leave stroke reverts?", sAfter !== s0)

log("GLOBAL", "page errors", JSON.stringify(errors))
await browser.close()
console.log("DONE")
