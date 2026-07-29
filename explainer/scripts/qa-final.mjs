import { chromium } from "playwright"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
await page.goto("http://localhost:4173", { waitUntil: "networkidle" })

// Ch4: auto past 200?
const ch4 = page.locator("#ch-4")
await ch4.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
const btn = (name) => ch4.locator("button", { hasText: name }).first()
const sims = async () => Number((await ch4.locator(".chip.mono", { hasText: "模拟" }).innerText()).match(/(\d+)/)[1])
await btn("跑到 200").click()
await page.waitForTimeout(400)
await btn("自动").click()
await page.waitForTimeout(1500)
const s = await sims()
console.log("auto past 200: sims =", s, "(keeps running unbounded:", s > 200, ")")
// noise toggle while running
await ch4.locator("button[title='切换后搜索树重建']").click()
await page.waitForTimeout(300)
const s2 = await sims()
await page.waitForTimeout(600)
const s3 = await sims()
console.log("noise toggle while auto: sims reset to", s2, "and auto stopped:", s2 === s3)
// 跑到200 enabled again after reset?
console.log("跑到200 enabled after rebuild:", !(await btn("跑到 200").isDisabled()))

// Ch2: verify stones actually swap colors in canonical mode
const ch2 = page.locator("#ch-2")
const darkStones = async () => ch2.locator("svg[aria-label='视角切换棋盘']").evaluate((el) => {
  const layers = [...el.querySelectorAll("g")].filter((g) => g.style.transition.includes("opacity") || g.style.opacity !== "")
  return [...el.querySelectorAll("circle")].filter((c) => c.getAttribute("r") && Number(c.getAttribute("r")) > 15 && getComputedStyle(c).fill !== "rgb(0, 0, 0)").length
})
// simpler: count visible stone circles by layer opacity
const layerInfo = async () => ch2.locator("svg[aria-label='视角切换棋盘']").evaluate((el) => {
  const groups = [...el.children].filter((n) => n.tagName === "g" && n.style.opacity !== "")
  return groups.map((g) => ({ op: g.style.opacity, dark: [...g.querySelectorAll("circle")].filter((c) => c.style.fill === "var(--stone-b)").length, light: [...g.querySelectorAll("circle")].filter((c) => c.style.fill === "var(--stone-w)").length }))
})
console.log("layers objective:", JSON.stringify(await layerInfo()))
await ch2.locator(".seg-btn").nth(1).click()
await page.waitForTimeout(100)
console.log("layers after canon toggle:", JSON.stringify(await layerInfo()))

// Ch7 timeline dead elements: any button? cursor-pointer?
const ch7 = page.locator("#ch-7 .figure").first()
console.log("ch7 timeline buttons:", await ch7.locator("button").count())

// Ch5 temperature fig: static, any buttons?
console.log("ch5 buttons total:", await page.locator("#ch-5 button").count())

// Ch4 QUAnatomy negative Q bar: run noise-off to convergence and check bar widths nonzero
await btn("单步 ×10").click()
await page.waitForTimeout(200)
const quBars = await ch4.locator(".figure").nth(1).locator("div[title]").evaluateAll((els) => els.map((e) => ({ t: e.getAttribute("title"), w: e.style.width })))
console.log("QU bars:", JSON.stringify(quBars))

console.log("errors:", JSON.stringify(errors))
await browser.close()
console.log("DONE")
