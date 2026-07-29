// QA Ch4 MCTS simulator
import { chromium } from "playwright"
const BASE = "http://localhost:4173"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
await page.goto(BASE, { waitUntil: "networkidle" })
const ch4 = page.locator("#ch-4")
await ch4.scrollIntoViewIfNeeded()
await page.waitForTimeout(500)

const simsChip = ch4.locator(".chip.mono", { hasText: "模拟" })
const sims = async () => Number((await simsChip.innerText()).match(/(\d+)/)[1])
const btn = (name) => ch4.locator("button", { hasText: name }).first()
const readout = async () => (await ch4.locator(".mono").filter({ hasText: /模拟|单步/ }).last().innerText()).slice(0, 80)

console.log("initial sims:", await sims())
console.log("initial readout:", await readout())

// step x1
await btn("单步 ×1").click()
await page.waitForTimeout(120)
console.log("after x1 sims (expect 1):", await sims())

// step x10
await btn("单步 ×10").click()
await page.waitForTimeout(150)
console.log("after x10 sims (expect 11):", await sims())

// QUAnatomy should appear at >=10 sims (fig 4-2)
const quText = (await ch4.locator(".figure").nth(1).innerText()).replace(/\s+/g, " ").slice(0, 120)
console.log("fig4-2 at 11 sims:", quText)

// rapid x1 clicks x20
for (let i = 0; i < 20; i++) await btn("单步 ×1").click()
await page.waitForTimeout(300)
console.log("after 20 rapid x1 sims (expect 31):", await sims())

// banner appears at >=50? run x10 twice more
await btn("单步 ×10").click(); await btn("单步 ×10").click()
await page.waitForTimeout(300)
console.log("sims now (expect 51):", await sims())
console.log("banner present (expect 1):", await ch4.locator(".banner.accent").count())

// auto play
await btn("自动").click()
await page.waitForTimeout(1200)
const s1 = await sims()
console.log("auto running label:", (await ch4.locator("button", { hasText: "暂停" }).count()), "sims after ~1.2s:", s1)
await page.waitForTimeout(1000)
const s2 = await sims()
console.log("sims still increasing:", s2 > s1, s2)
// pause
await ch4.locator("button", { hasText: "暂停" }).click()
await page.waitForTimeout(400)
const s3 = await sims()
await page.waitForTimeout(500)
const s4 = await sims()
console.log("paused: sims frozen:", s3 === s4, s3)

// run to 200
await btn("跑到 200").click()
await page.waitForTimeout(400)
console.log("after 跑到200 sims:", await sims())
console.log("跑到200 disabled at 200:", await ch4.locator("button:disabled", { hasText: "200" }).count())

// boundary: single steps beyond 200?
console.log("单步×1 disabled at 200:", await btn("单步 ×1").isDisabled())
console.log("单步×10 disabled at 200:", await btn("单步 ×10").isDisabled())
await btn("单步 ×10").click()
await page.waitForTimeout(300)
console.log("after x10 past 200, sims:", await sims())
console.log("跑到200 label/disabled now:", await ch4.locator("button", { hasText: "200" }).first().isDisabled())

// tree svg renders?
const treeNodes = await ch4.locator("svg[aria-label='MCTS 搜索树'] circle").count()
console.log("tree node circles:", treeNodes)

// reset
await btn("重置").click()
await page.waitForTimeout(200)
console.log("after reset sims (expect 0):", await sims())
console.log("after reset readout:", await readout())
console.log("fig4-2 after reset:", (await ch4.locator(".figure").nth(1).innerText()).replace(/\s+/g, " ").slice(0, 60))

// noise toggle
const noiseBtn = ch4.locator("button[title='切换后搜索树重建']")
console.log("noise initial:", await noiseBtn.innerText())
await noiseBtn.click()
await page.waitForTimeout(200)
console.log("noise after toggle:", await noiseBtn.innerText(), "sims:", await sims())
await noiseBtn.click()
await page.waitForTimeout(200)
console.log("noise toggled back:", await noiseBtn.innerText())

// auto + step simultaneously (stress)
await btn("自动").click()
for (let i = 0; i < 10; i++) await btn("单步 ×10").click()
await page.waitForTimeout(300)
const sBefore = await sims()
await ch4.locator("button", { hasText: "暂停" }).click()
await page.waitForTimeout(300)
console.log("stress auto+steps sims:", sBefore, "errors so far:", errors.length)

// keyboard: focus 单步×1, press Enter
await btn("单步 ×1").focus()
await page.keyboard.press("Enter")
await page.waitForTimeout(150)
console.log("keyboard Enter stepped:", await sims() > sBefore)

console.log("errors:", JSON.stringify(errors))
await browser.close()
console.log("DONE")
