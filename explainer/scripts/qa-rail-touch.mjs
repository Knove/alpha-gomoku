import { chromium } from "playwright"
const browser = await chromium.launch()
// rail active-state after full scroll
const wide = await browser.newPage({ viewport: { width: 1700, height: 950 } })
await wide.goto("http://localhost:4173", { waitUntil: "networkidle" })
const sb = await wide.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)
console.log("html scroll-behavior:", sb)
await wide.locator(".rail a").nth(4).click()
await wide.waitForTimeout(2500)
console.log("after 2.5s ch-4 top:", Math.round(await wide.locator("#ch-4").evaluate((el) => el.getBoundingClientRect().top)),
  "active:", await wide.locator(".rail a.active .r-no").innerText(),
  "hash:", await wide.evaluate(() => location.hash))
await wide.close()

// touch drag on loss chart
const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await mob.goto("http://localhost:4173", { waitUntil: "networkidle" })
const mfig2 = mob.locator("#ch-6 .figure").nth(1)
await mfig2.scrollIntoViewIfNeeded()
await mob.waitForTimeout(400)
const mchart = mfig2.locator("svg").first()
const mcbb = await mchart.boundingBox()
// simulate horizontal drag with touchscreen via CDP: use page.touchscreen? playwright touchscreen only has tap.
// Use manual pointer events via dispatching touch through mouse? Use CDP Input.dispatchTouchEvent.
const cdp = await mob.context().newCDPSession(mob)
const y = mcbb.y + mcbb.height * 0.5
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mcbb.x + mcbb.width * 0.2, y }] })
for (let i = 1; i <= 10; i++) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: mcbb.x + mcbb.width * (0.2 + 0.06 * i), y }] })
  await mob.waitForTimeout(30)
}
const mtip = mfig2.locator(".tip")
console.log("[mobile] during drag tip:", (await mtip.count()) > 0 && await mtip.isVisible(), (await mtip.count()) ? (await mtip.innerText()).replace(/\s+/g, " ") : "")
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
await mob.waitForTimeout(200)
console.log("[mobile] after touchend tip visible:", (await mtip.count()) > 0 && await mtip.isVisible())
await browser.close()
console.log("DONE")
