// QA Ch4 MCTS simulator(三拍相位按钮版)
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
const readout = async () => (await ch4.locator(".mono").filter({ hasText: /模拟|选择|展开|回传/ }).last().innerText()).slice(0, 90)
// 三拍走完一次完整模拟
const fullSim = async () => {
  await btn("① 选择").click()
  await btn("② 展开").click()
  await btn("③ 回传").click()
}

console.log("initial sims:", await sims())
console.log("initial readout:", await readout())

// 相位按钮互斥:初始只有「① 选择」可按
console.log("phase gating: 选择 enabled:", await btn("① 选择").isEnabled(),
  "| 展开 disabled:", await btn("② 展开").isDisabled(),
  "| 回传 disabled:", await btn("③ 回传").isDisabled())

// 相位走拍:选择 → 展开 → 回传
await btn("① 选择").click()
await page.waitForTimeout(120)
console.log("after 选择 readout:", await readout())
console.log("after 选择 sims (expect 0):", await sims())
await btn("② 展开").click()
await page.waitForTimeout(120)
console.log("after 展开 readout:", await readout())
await btn("③ 回传").click()
await page.waitForTimeout(120)
console.log("after 回传 sims (expect 1):", await sims())

// step x10
await btn("模拟 ×10").click()
await page.waitForTimeout(150)
console.log("after x10 sims (expect 11):", await sims())

// QUAnatomy should appear at >=10 sims (fig 4-2)
const quText = (await ch4.locator(".figure").nth(1).innerText()).replace(/\s+/g, " ").slice(0, 120)
console.log("fig4-2 at 11 sims:", quText)

// rapid full sims x20
for (let i = 0; i < 20; i++) await fullSim()
await page.waitForTimeout(300)
console.log("after 20 rapid full sims (expect 31):", await sims())

// banner appears at >=50? run x10 twice more
await btn("模拟 ×10").click(); await btn("模拟 ×10").click()
await page.waitForTimeout(300)
const s51 = await sims()
console.log("sims now (expect 51):", s51)
console.log("banner present (expect 1):", await ch4.locator(".banner.accent").count())
const bannerText = (await ch4.locator(".banner.accent").innerText()).replace(/\s+/g, " ")
console.log("banner text:", bannerText.slice(0, 80))
console.log("banner converged on F5 (expect true):", bannerText.includes("F5"))

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

// boundary: steps beyond 200 still allowed
console.log("模拟×10 disabled at 200:", await btn("模拟 ×10").isDisabled())
await btn("模拟 ×10").click()
await page.waitForTimeout(300)
console.log("after x10 past 200, sims:", await sims())
console.log("跑到200 disabled now:", await ch4.locator("button", { hasText: "200" }).first().isDisabled())

// F5 dominance at 200+ ( convergence sanity: F5 should hold >85% )
const topRow = await ch4.locator(".chip", { hasText: "F5" }).first().count()
console.log("F5 chip present in root bars:", topRow > 0)

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
const noiseBtn = ch4.locator("button[title*='搜索树重建']")
console.log("noise initial:", await noiseBtn.innerText())
await noiseBtn.click()
await page.waitForTimeout(200)
console.log("noise after toggle:", await noiseBtn.innerText(), "sims:", await sims())
await noiseBtn.click()
await page.waitForTimeout(200)
console.log("noise toggled back:", await noiseBtn.innerText())

// auto + step simultaneously (stress)
await btn("自动").click()
for (let i = 0; i < 10; i++) await btn("模拟 ×10").click()
await page.waitForTimeout(300)
const sBefore = await sims()
await ch4.locator("button", { hasText: "暂停" }).click()
await page.waitForTimeout(300)
console.log("stress auto+steps sims:", sBefore, "errors so far:", errors.length)

// keyboard: focus ① 选择, press Enter → 进入展开相位(sims 不变)
await btn("① 选择").focus()
await page.keyboard.press("Enter")
await page.waitForTimeout(150)
console.log("keyboard Enter selects (sims unchanged, 展开 enabled):", (await sims()) === sBefore, await btn("② 展开").isEnabled())
await page.keyboard.press("Enter") // 展开 focused? no—focus 移至哪并不重要,直接点
await btn("② 展开").click()
await btn("③ 回传").click()
await page.waitForTimeout(150)
console.log("keyboard-assisted full sim stepped:", (await sims()) > sBefore)

console.log("errors:", JSON.stringify(errors))
await browser.close()
console.log("DONE")
