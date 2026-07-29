// QA Ch7 replay slider + mobile/touch + theme toggle + rail
import { chromium } from "playwright"
const BASE = "http://localhost:4173"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
await page.goto(BASE, { waitUntil: "networkidle" })
const ch7 = page.locator("#ch-7")
await ch7.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)

const fig2 = ch7.locator(".figure").nth(1)
const slider = fig2.locator("input[type=range]")
const max = Number(await slider.getAttribute("max"))
console.log("replay slider max (moves):", max, "initial value:", await slider.inputValue())
const stepLabel = async () => (await fig2.locator(".mono", { hasText: "/" }).first().innerText()).trim()
const stoneCount = async () => fig2.locator("svg").first().evaluate((el) => {
  // count stone groups (they use gradient fills)
  return [...el.querySelectorAll("circle")].filter((c) => (c.getAttribute("fill") || "").includes("url(")).length
})
const bannerCount = async () => fig2.locator(".banner").count()

console.log("initial (end):", await stepLabel(), "stones:", await stoneCount(), "banner:", await bannerCount())
// to 0
await slider.fill("0")
await page.waitForTimeout(150)
console.log("at 0:", await stepLabel(), "stones (expect 0):", await stoneCount(), "banner (expect 0):", await bannerCount())
console.log("right label at 0:", await fig2.locator(".flex.justify-between span").last().innerText())
// to middle
const mid = Math.floor(max / 2)
await slider.fill(String(mid))
await page.waitForTimeout(150)
console.log(`at ${mid}:`, await stepLabel(), "stones (expect " + mid + "):", await stoneCount(), "banner:", await bannerCount())
// to max
await slider.fill(String(max))
await page.waitForTimeout(150)
console.log("at max:", await stepLabel(), "stones (expect " + max + "):", await stoneCount(), "banner:", await bannerCount())
console.log("banner text:", (await fig2.locator(".banner").innerText()).replace(/\s+/g, " "))
// trend chart highlighted dot at last index
const dots = await fig2.locator("svg[aria-label='估值走势'] circle").all()
const rLast = await dots[dots.length - 1].getAttribute("r")
console.log("trend dots:", dots.length, "last r (expect 4):", rLast)
// at 0, no highlighted dot (r=4 none)
await slider.fill("0")
await page.waitForTimeout(150)
const rs = await Promise.all((await fig2.locator("svg[aria-label='估值走势'] circle").all()).map((c) => c.getAttribute("r")))
console.log("at 0, any r=4 dot:", rs.includes("4"))
// keyboard
await slider.focus()
await page.keyboard.press("ArrowLeft")
await page.waitForTimeout(120)
console.log("after ArrowLeft value:", await slider.inputValue())
await page.keyboard.press("End")
await page.keyboard.press("ArrowRight") // beyond max
await page.waitForTimeout(120)
console.log("End then ArrowRight (clamped at max):", await slider.inputValue())

// rail nav
const rail = page.locator(".rail a")
console.log("rail items:", await rail.count())
await rail.nth(4).click()
await page.waitForTimeout(600)
const ch4top = await page.locator("#ch-4").evaluate((el) => el.getBoundingClientRect().top)
console.log("rail click ch-4 top:", Math.round(ch4top), "rail active:", await page.locator(".rail a.active .r-no").innerText())

// theme toggle: check chart/text colors don't break
const toggle = page.locator(".icon-btn")
await toggle.click()
await page.waitForTimeout(300)
const theme = await page.evaluate(() => document.documentElement.dataset.theme || document.documentElement.getAttribute("data-theme") || getComputedStyle(document.documentElement).getPropertyValue("--accent"))
console.log("after toggle theme attr:", theme)
// verify loss chart line color follows theme var
const stroke = await page.locator("#ch-6 svg path").nth(1).evaluate((el) => getComputedStyle(el).stroke)
console.log("loss chart path stroke after theme toggle:", stroke)
await toggle.click()

/* ---------- mobile touch ---------- */
const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await mob.goto(BASE, { waitUntil: "networkidle" })
// tap symmetry thumbnail
const mch6 = mob.locator("#ch-6")
await mch6.scrollIntoViewIfNeeded()
await mob.waitForTimeout(400)
const mthumbs = mch6.locator("button[aria-pressed]")
await mthumbs.nth(5).tap()
await mob.waitForTimeout(200)
console.log("[mobile] tap thumb5:", (await mch6.locator(".chip.accent").first().innerText()).replace(/\s+/g, " ").trim())
// tap planes cell (hover-stick check)
const mch2 = mob.locator("#ch-2")
await mch2.scrollIntoViewIfNeeded()
await mob.waitForTimeout(300)
const cell = mch2.locator("svg[aria-label^='平面']").first().locator("rect").nth(40)
const cbb2 = await cell.boundingBox()
await mob.touchscreen.tap(cbb2.x + cbb2.width / 2, cbb2.y + cbb2.height / 2)
await mob.waitForTimeout(200)
const strokeAfterTap = await cell.evaluate((el) => getComputedStyle(el).stroke)
console.log("[mobile] plane cell stroke after tap:", strokeAfterTap)
// loss chart touch: drag horizontally across chart (touch pointermove)
const mfig2 = mch6.locator(".figure").nth(1)
await mfig2.scrollIntoViewIfNeeded()
const mchart = mfig2.locator("svg").first()
const mcbb = await mchart.boundingBox()
await mob.touchscreen.tap(mcbb.x + mcbb.width * 0.8, mcbb.y + mcbb.height * 0.5)
await mob.waitForTimeout(200)
const mtip = mfig2.locator(".tip")
console.log("[mobile] tip visible after tap on chart:", (await mtip.count()) > 0 && await mtip.isVisible(), (await mtip.count()) ? (await mtip.innerText()).replace(/\s+/g, " ") : "")
// replay slider on mobile
const mfig7 = mob.locator("#ch-7 .figure").nth(1)
await mfig7.scrollIntoViewIfNeeded()
const mslider = mfig7.locator("input[type=range]")
await mslider.fill("10")
await mob.waitForTimeout(150)
console.log("[mobile] replay slider fill 10 label:", (await mfig7.locator(".mono", { hasText: "/" }).first().innerText()).trim())
const mErrors = []
mob.on("pageerror", (e) => mErrors.push(String(e)))
console.log("[mobile] errors:", JSON.stringify(mErrors))

console.log("desktop errors:", JSON.stringify(errors))
await browser.close()
console.log("DONE")
