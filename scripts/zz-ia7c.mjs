// zz-ia7c.mjs — 交互实测:Ch7(晋升时间线 + arena 回放)+ 全页 chrome + 移动视口
// 目标:http://localhost:4173(vite preview)。收集 console error / pageerror。
import { chromium } from "file:///Users/knove/git/alpha-gomoku/explainer/node_modules/playwright/index.mjs"

const BASE = "http://localhost:4173"
const out = { consoleErrors: [], pageErrors: [], checks: [], notes: [] }
const ok = (name, pass, detail) => {
  out.checks.push({ name, pass: !!pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"} ${name} :: ${detail}`)
}

const browser = await chromium.launch()

function wire(page, tag) {
  page.on("console", (m) => {
    if (m.type() === "error") out.consoleErrors.push(`[${tag}] ${m.text()}`)
  })
  page.on("pageerror", (e) => out.pageErrors.push(`[${tag}] ${String(e)}`))
}

/* ================= 桌面 1680:Ch7 + chrome ================= */
const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 } })
const page = await ctx.newPage()
wire(page, "desktop")
await page.goto(BASE, { waitUntil: "networkidle" })

/* ---- Ch7 图 7-1 晋升时间线 ---- */
const ch7 = page.locator("#ch-7")
await ch7.scrollIntoViewIfNeeded()
await page.waitForTimeout(500)

const fig1 = ch7.locator(".figure").nth(0)
const cap1 = await fig1.locator(".figure-cap").innerText()
ok("7-1 caption 标注真实战报", /真实战报/.test(cap1), cap1.replace(/\s+/g, " ").slice(0, 120))

const cards = fig1.locator(".card")
const nCards = await cards.count()
ok("7-1 时间线节点数 = 4(第 0..3 轮)", nCards === 4, `count=${nCards}`)
const cardTexts = []
for (let i = 0; i < nCards; i++) cardTexts.push((await cards.nth(i).innerText()).replace(/\s+/g, " "))
console.log("cards:", JSON.stringify(cardTexts, null, 1))
ok("7-1 第0轮 首任冠军加冕", cardTexts[0]?.includes("首任冠军加冕"), cardTexts[0])
ok("7-1 第0轮 vs baseline 83%", /baseline[^]*83%/.test(cardTexts[0] ?? ""), cardTexts[0])
ok("7-1 第1轮 本轮未评", cardTexts[1]?.includes("本轮未评"), cardTexts[1])
ok("7-1 第2轮 best 易主", cardTexts[2]?.includes("best 易主"), cardTexts[2])
ok("7-1 第2轮 100% · 6胜 0负 0和", /100%\s*·\s*6胜\s*0负\s*0和/.test(cardTexts[2] ?? ""), cardTexts[2])
ok("7-1 第2轮 vs baseline 83%", /baseline[^]*83%/.test(cardTexts[2] ?? ""), cardTexts[2])
ok("7-1 第3轮 本轮未评", cardTexts[3]?.includes("本轮未评"), cardTexts[3])

/* ---- Ch7 图 7-2 arena 回放 ---- */
const fig2 = ch7.locator(".figure").nth(1)
const cap2 = await fig2.locator(".figure-cap").innerText()
ok("7-2 caption 标注真实对局+棋谱id", /真实对局/.test(cap2) && /ar_000002_000/.test(cap2), cap2.replace(/\s+/g, " ").slice(0, 140))

const chips = await fig2.locator(".chip").allInnerTexts()
console.log("chips:", chips)
ok("7-2 chips: 第 2 轮 · 晋升赛", chips.some((c) => c.includes("第 2 轮") && c.includes("晋升赛")), chips.join(" | "))
ok("7-2 chips: challenger(黑) vs best(白)", chips.some((c) => c.includes("challenger") && c.includes("best")), chips.join(" | "))

const slider = fig2.locator("input[type=range]")
const max = Number(await slider.getAttribute("max"))
const initVal = Number(await slider.inputValue())
ok("7-2 回放初始在终局(step=max=27)", max === 27 && initVal === 27, `max=${max} init=${initVal}`)

const stoneCount = () =>
  fig2.locator("svg").first().evaluate(
    (el) => [...el.querySelectorAll("circle")].filter((c) => (c.getAttribute("fill") || "").includes("url(")).length,
  )
const stepLabel = async () => (await fig2.locator(".mono", { hasText: "/" }).first().innerText()).trim()
const bannerCount = () => fig2.locator(".banner").count()

const s0 = await stoneCount()
const b0 = await bannerCount()
const bannerTxt = b0 ? (await fig2.locator(".banner").innerText()).replace(/\s+/g, " ") : ""
ok("7-2 终局:27 子", s0 === 27, `stones=${s0}`)
ok("7-2 终局 banner 黑胜+挑战者易主", b0 === 1 && bannerTxt.includes("黑胜") && bannerTxt.includes("挑战者掀翻前冠军"), bannerTxt)
const rightLbl = await fig2.locator(".flex.justify-between span").last().innerText()
ok("7-2 终局最后一手标注 黑 G4", rightLbl.includes("黑") && rightLbl.includes("G4"), rightLbl)

// 单步:滑杆到 0 / 中途 / 终局
await slider.fill("0")
await page.waitForTimeout(150)
ok("7-2 step=0:0 子 + 初始局面 + 无 banner",
  (await stoneCount()) === 0 && (await bannerCount()) === 0 && (await fig2.locator(".flex.justify-between span").last().innerText()).includes("初始局面"),
  `stones=${await stoneCount()} label=${await fig2.locator(".flex.justify-between span").last().innerText()}`)
await slider.fill("13")
await page.waitForTimeout(150)
ok("7-2 step=13:13 子 + 无 banner", (await stoneCount()) === 13 && (await bannerCount()) === 0, `stones=${await stoneCount()} label=${await stepLabel()}`)
// 键盘单步
await slider.focus()
await page.keyboard.press("ArrowRight")
await page.waitForTimeout(120)
ok("7-2 键盘 ArrowRight 单步推进 13→14", Number(await slider.inputValue()) === 14, `val=${await slider.inputValue()} stones=${await stoneCount()}`)
await page.keyboard.press("End")
await page.waitForTimeout(150)
ok("7-2 End 到终局 banner 复现", Number(await slider.inputValue()) === 27 && (await bannerCount()) === 1, `val=${await slider.inputValue()}`)

// 估值走势:点数=27,当前手高亮 r=4
const trendDots = await fig2.locator("svg[aria-label='估值走势'] circle").all()
const rs = await Promise.all(trendDots.map((c) => c.getAttribute("r")))
ok("7-2 估值走势 27 点,末点高亮 r=4", trendDots.length === 27 && rs[26] === "4", `dots=${trendDots.length} r26=${rs[26]}`)
const trendSvgText = await fig2.locator("svg[aria-label='估值走势']").evaluate((el) => el.textContent)
const fig2Text = await fig2.evaluate((el) => el.textContent)
ok("7-2 估值图标注黑方视角", trendSvgText.includes("黑优") && trendSvgText.includes("白优") && fig2Text.includes("黑方视角"), `svg含黑优=${trendSvgText.includes("黑优")} 说明含黑方视角=${fig2Text.includes("黑方视角")}`)
// 播放/暂停/速度控件存在性(仅记录,设计实现为滑杆)
const hasPlayBtn = (await fig2.locator("button").count()) > 0
out.notes.push(`7-2 回放控件形态:${hasPlayBtn ? "含按钮" : "仅滑杆(无播放/暂停/速度按钮)"}`)

/* ---- 主题切换:亮→暗→亮 + localStorage ---- */
const themeBtn = page.locator("header .icon-btn")
const dt = () => page.evaluate(() => document.documentElement.dataset.theme)
const ls = () => page.evaluate(() => localStorage.getItem("exp-theme"))
const t0 = await dt()
ok("主题:初始 light(无色彩偏好/无存储)", t0 === "light", `data-theme=${t0}`)
await themeBtn.click()
await page.waitForTimeout(120)
ok("主题:点击→dark 且写入 localStorage", (await dt()) === "dark" && (await ls()) === "dark", `data-theme=${await dt()} ls=${await ls()}`)
await themeBtn.click()
await page.waitForTimeout(120)
ok("主题:再点→light 且 localStorage 同步", (await dt()) === "light" && (await ls()) === "light", `data-theme=${await dt()} ls=${await ls()}`)
const ariaDark = await themeBtn.getAttribute("aria-label")
ok("主题:按钮 aria-label 随态更新", ariaDark === "切换为深色", `aria-label=${ariaDark}`)

/* ---- 顶部进度条 scaleX ---- */
const scaleX = () =>
  page.evaluate(() => {
    const m = getComputedStyle(document.querySelector(".progress-bar")).transform
    if (m === "none") return 0
    const a = m.match(/matrix\(([^,]+)/)
    return a ? Number(a[1]) : NaN
  })
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
await page.waitForTimeout(150)
const p0 = await scaleX()
await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }))
await page.waitForTimeout(200)
const p1 = await scaleX()
await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight / 2, behavior: "instant" }))
await page.waitForTimeout(200)
const pMid = await scaleX()
ok("进度条:顶部≈0", Math.abs(p0) < 0.02, `scaleX=${p0}`)
ok("进度条:底部≈1", Math.abs(p1 - 1) < 0.03, `scaleX=${p1}`)
ok("进度条:中部在 0.3~0.7", pMid > 0.3 && pMid < 0.7, `scaleX=${pMid}`)

/* ---- 章节锚点 + 侧轨(1680px 可见)---- */
const railVisible = await page.locator(".rail").isVisible()
ok("侧轨:1680px 宽可见", railVisible, `visible=${railVisible}`)
const railLinks = page.locator(".rail a")
const nRail = await railLinks.count()
ok("侧轨:8 个章节链接", nRail === 8, `count=${nRail}`)
await railLinks.nth(4).click() // ch-4
await page.waitForTimeout(1200) // smooth scroll
const hash = await page.evaluate(() => location.hash)
const ch4top = await page.evaluate(() => document.getElementById("ch-4")?.getBoundingClientRect().top)
const activeHref = await page.locator(".rail a.active").getAttribute("href")
ok("锚点:点击后 hash=#ch-4 且章节到顶附近", hash === "#ch-4" && ch4top !== null && Math.abs(ch4top - 64) < 90, `hash=${hash} top=${ch4top?.toFixed(0)}`)
ok("侧轨 active 跟随到 #ch-4", activeHref === "#ch-4", `active=${activeHref}`)
await page.locator("#ch-7").scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
const active2 = await page.locator(".rail a.active").getAttribute("href")
ok("侧轨 active 跟随到 #ch-7", active2 === "#ch-7", `active=${active2}`)

await ctx.close()

/* ---- 偏好深色:prefers-color-scheme ---- */
const ctxD = await browser.newContext({ viewport: { width: 1400, height: 900 }, colorScheme: "dark" })
const pageD = await ctxD.newPage()
wire(pageD, "dark-pref")
await pageD.goto(BASE, { waitUntil: "domcontentloaded" })
const dtD = await pageD.evaluate(() => document.documentElement.dataset.theme)
ok("主题:prefers-color-scheme=dark → 初始 dark", dtD === "dark", `data-theme=${dtD}`)
await ctxD.close()

/* ---- 存储优先:localStorage=dark + 浅色偏好 ---- */
const ctxS = await browser.newContext({ viewport: { width: 1400, height: 900 }, colorScheme: "light" })
const pageS = await ctxS.newPage()
wire(pageS, "stored")
await pageS.addInitScript(() => localStorage.setItem("exp-theme", "dark"))
await pageS.goto(BASE, { waitUntil: "domcontentloaded" })
const dtS = await pageS.evaluate(() => document.documentElement.dataset.theme)
ok("主题:localStorage=dark 覆盖浅色偏好", dtS === "dark", `data-theme=${dtS}`)
await ctxS.close()

/* ================= 移动视口 390×844 ================= */
const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const pageM = await ctxM.newPage()
wire(pageM, "mobile")
await pageM.goto(BASE, { waitUntil: "networkidle" })
await pageM.waitForTimeout(400)

const sw = await pageM.evaluate(() => document.documentElement.scrollWidth)
const bw = await pageM.evaluate(() => document.body.scrollWidth)
ok("移动:documentElement.scrollWidth ≤ 392", sw <= 392, `scrollWidth=${sw} body=${bw}`)

// 找出真正横向溢出的元素(忽略 overflow-x:auto/scroll 容器内部,如图 7-1 时间线)
const overflow = await pageM.evaluate(() => {
  const vw = document.documentElement.clientWidth
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (ox === "auto" || ox === "scroll") return true
    }
    return false
  }
  const bad = []
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && (r.right > vw + 2 || r.left < -2) && !inScroller(el)) {
      bad.push(`${el.tagName}.${String(el.className).split(" ")[0]} left=${r.left.toFixed(0)} right=${r.right.toFixed(0)}`)
    }
  }
  return { vw, bad: [...new Set(bad)].slice(0, 12) }
})
ok("移动:无横向溢出元素(滚动容器外)", overflow.bad.length === 0, JSON.stringify(overflow))

// 控件不被裁切:顶栏主题按钮 / 回放滑杆 / 时间线 figure 可横向滚动
const btnBox = await pageM.locator("header .icon-btn").boundingBox()
ok("移动:主题按钮完整在视口内", btnBox && btnBox.x >= 0 && btnBox.x + btnBox.width <= 390, JSON.stringify(btnBox))
await pageM.locator("#ch-7").scrollIntoViewIfNeeded()
await pageM.waitForTimeout(400)
const slBox = await pageM.locator("#ch-7 input[type=range]").boundingBox()
ok("移动:回放滑杆完整在视口内", slBox && slBox.x >= 0 && slBox.x + slBox.width <= 392, JSON.stringify(slBox))
const tlScrollable = await pageM.evaluate(() => {
  const fig = document.querySelectorAll("#ch-7 .figure")[0]
  const scroller = fig.querySelector("div")
  return scroller.scrollWidth > scroller.clientWidth && getComputedStyle(scroller).overflowX === "auto"
})
ok("移动:7-1 时间线容器可横向滚动(不挤版心)", tlScrollable, `scrollable=${tlScrollable}`)
const railM = await pageM.locator(".rail").isVisible()
ok("移动:侧轨隐藏", !railM, `visible=${railM}`)
// 滑杆在移动端可拖(fill 模拟)+ 键盘
const sliderM = pageM.locator("#ch-7 input[type=range]")
await sliderM.fill("5")
await pageM.waitForTimeout(150)
const stonesM = await pageM.locator("#ch-7 .figure").nth(1).locator("svg").first().evaluate(
  (el) => [...el.querySelectorAll("circle")].filter((c) => (c.getAttribute("fill") || "").includes("url(")).length,
)
ok("移动:滑杆推进 5 手 → 5 子", stonesM === 5, `stones=${stonesM}`)
await ctxM.close()

/* ================= reducedMotion ================= */
const ctxR = await browser.newContext({ viewport: { width: 1400, height: 900 }, reducedMotion: "reduce" })
const pageR = await ctxR.newPage()
wire(pageR, "reduced")
await pageR.goto(BASE, { waitUntil: "networkidle" })
await pageR.waitForTimeout(500)
const revealPending = await pageR.evaluate(() => document.querySelectorAll(".reveal:not(.is-in)").length)
const sb = await pageR.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)
ok("reducedMotion:首屏 reveal 全部即显", revealPending === 0, `pending=${revealPending}`)
ok("reducedMotion:scroll-behavior=auto", sb === "auto", `scroll-behavior=${sb}`)
await pageR.locator("#ch-7").scrollIntoViewIfNeeded()
await pageR.waitForTimeout(300)
await ctxR.close()

await browser.close()

console.log("\n--- console errors ---")
console.log(out.consoleErrors.length ? out.consoleErrors.join("\n") : "(none)")
console.log("--- page errors ---")
console.log(out.pageErrors.length ? out.pageErrors.join("\n") : "(none)")
const fails = out.checks.filter((c) => !c.pass)
console.log(`\n=== ${out.checks.length - fails.length}/${out.checks.length} PASS ===`)
if (fails.length) {
  console.log("FAILED:", fails.map((f) => f.name).join(" ; "))
  process.exitCode = 1
}
