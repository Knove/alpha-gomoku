// 验证 2026-07-30 严苛评审修复:散文准确性 / 初学者友好 / Ch4 引擎收敛与三拍 / 键盘可达 / 共享层
import { chromium } from "playwright"
const URL = "http://localhost:4173"
const results = []
function check(name, ok, detail = "") {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const errors = []
page.on("pageerror", (e) => errors.push(String(e)))
await page.goto(URL, { waitUntil: "networkidle" })
await page.waitForTimeout(700)

const text = (sel) => page.locator(sel).innerText()

/* ---------- Ch0 ---------- */
const ch0 = await text("#ch-0")
check("Ch0 第四章交叉引用", ch0.includes("第四章会把它彻底拆开"))
check("Ch0 AlphaZero 一句话定位", ch0.includes("不靠任何人类棋谱、只凭自我对弈从零学会下棋"))
check("Ch0 局面样本措辞", ch0.includes("真实对局留下的局面样本"))

/* ---------- Ch1 ---------- */
const ch1 = await text("#ch-1")
check("Ch1 MCTS 全称首现", ch1.includes("蒙特卡洛树搜索(MCTS,第肆章细讲)"))
check("Ch1 根噪声白话", ch1.includes("掺一点随机扰动"))
check("Ch1 无 ★", !ch1.includes("★"))
check("Ch1 图注 π/z 释义", ch1.includes("π = 搜索给出的落点分布") && ch1.includes("z = 这局最终胜负"))
check("Ch1 图注 baseline/best 释义", ch1.includes("best = 现任冠军模型"))
check("Ch1 轮/圈语义 mini-label", ch1.includes("飞轮转过 1/4 圈"))
// 重播按钮
const ch1el = page.locator("#ch-1")
await ch1el.scrollIntoViewIfNeeded()
for (let i = 0; i < 4; i++) await ch1el.locator("button", { hasText: "推动第" }).click()
await page.waitForTimeout(300)
check("Ch1 banner 诚实(83%/回弹)", (await text("#ch-1")).includes("83% 胜率") && (await text("#ch-1")).includes("回弹"))
check("Ch1 四轮后出现「从头再看」", (await ch1el.locator("button", { hasText: "从头再看" }).count()) === 1)
await ch1el.locator("button", { hasText: "从头再看" }).click()
await page.waitForTimeout(200)
check("Ch1 重播后回到待推状态", (await ch1el.locator("button", { hasText: "推动第一轮" }).count()) === 1)

/* ---------- Ch2 ---------- */
const ch2 = await text("#ch-2")
check("Ch2 活三白话定义", ch2.includes("活三:两端都空着的三连"))
check("Ch2 图注无「前向」行话", !ch2.includes("一次前向"))
// 键盘可达:Tab 到平面格,方向键移动,回车钉住
const plane0 = page.locator("#ch-2 svg[role='group']").first()
await plane0.scrollIntoViewIfNeeded()
await plane0.locator("rect[data-cell]").first().focus()
await page.keyboard.press("ArrowRight")
await page.keyboard.press("Enter")
await page.waitForTimeout(200)
const pinned = await page.evaluate(() => {
  const r = document.querySelectorAll("#ch-2 svg[role='group']")[0].querySelectorAll("rect[aria-pressed='true']")
  return r.length
})
check("Ch2 键盘方向键+回车钉住", pinned === 1)
check("Ch2 平面格 role=button 且带 aria-label", (await plane0.locator("rect[role='button'][aria-label*='坐标']").count()) === 81)

/* ---------- Ch3 ---------- */
const ch3 = await text("#ch-3")
check("Ch3 π 下一章", ch3.includes("π 要留给下一章搜索打磨后的分布"))
check("Ch3 AGZ 三百多倍", ch3.includes("三百多倍"))
check("Ch3 forward 六行", ch3.includes("forward() 六行走完主干与两个头"))
check("Ch3 双光点(策略+价值两路)", (await page.locator("#ch-3 animateMotion").count()) === 2)

/* ---------- Ch4:三拍 + 收敛 ---------- */
const ch4t = await text("#ch-4")
check("Ch4 PUCT 命名", ch4t.includes("它叫 PUCT"))
check("Ch4 噪声散文解释", ch4t.includes("Dirichlet 噪声") && ch4t.includes("75% 原先验 + 25% 噪声"))
check("Ch4 图注节点颜色语义", ch4t.includes("节点颜色是该局面的行棋方"))
check("Ch4 棋盘标注 F5 一落成五", ch4t.includes("F5(5,4) 一落成五"))
const ch4 = page.locator("#ch-4")
await ch4.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)
const btn = (n) => ch4.locator("button", { hasText: n }).first()
// 三拍互斥
check("Ch4 初始仅「选择」可按", (await btn("① 选择").isEnabled()) && (await btn("② 展开").isDisabled()) && (await btn("③ 回传").isDisabled()))
await btn("① 选择").click()
await page.waitForTimeout(120)
check("Ch4 选择后可展开", await btn("② 展开").isEnabled())
await btn("② 展开").click()
await page.waitForTimeout(120)
check("Ch4 展开后可回传", await btn("③ 回传").isEnabled())
await btn("③ 回传").click()
await page.waitForTimeout(120)
const simsNow = async () => Number((await ch4.locator(".chip.mono", { hasText: "模拟" }).innerText()).match(/(\d+)/)[1])
check("Ch4 三拍走完一次模拟", (await simsNow()) === 1)
// 跑到 200:banner 应显示 F5 收敛(占比 ≥50%)
await btn("跑到 200").click()
await page.waitForTimeout(500)
const banner = ch4.locator(".banner.accent")
check("Ch4 收敛 banner 出现", (await banner.count()) === 1)
const bt = (await banner.innerText()).replace(/\s+/g, " ")
check("Ch4 banner 收敛到 F5 且占比≥85%", bt.includes("F5") && /占比 (8[5-9]|9\d|100)%/.test(bt), bt.slice(0, 60))

/* ---------- Ch5 ---------- */
const ch5 = await text("#ch-5")
check("Ch5 argmax 定义", ch5.includes("直接选访问数最多的那一手"))
check("Ch5 温度 τ 定义", ch5.includes("温度 τ") && ch5.includes("τ=1 原样按 π 抽签"))
check("Ch5 图注平局兜底诚实声明", ch5.includes("完全平局") && ch5.includes("兜底到 A1"))
check("Ch5 图注 π 演变如实(散回)", ch5.includes("第 3 轮又散回 39 点平局"))

/* ---------- Ch6 ---------- */
const ch6 = await text("#ch-6")
check("Ch6 z 行棋方视角", ch6.includes("从该手行棋方的视角记下"))
check("Ch6 weight decay", ch6.includes("weight decay"))
check("Ch6 起点高于乱猜线解释", ch6.includes("甚至略高于乱猜线"))
check("Ch6 平移 vs 旋转点明", ch6.includes("滑到不同位置"))

/* ---------- Ch7 ---------- */
const ch7 = await text("#ch-7")
check("Ch7 阈值措辞", ch7.includes("胜率 ≥ 55%") && !ch7.includes("胜率过半"))
check("Ch7 和棋计半分", ch7.includes("和棋算半分"))
check("Ch7 baseline 冻结措辞", ch7.includes("训练开始前冻结的随机初始网络"))
check("Ch7 可比(非单调)", ch7.includes("可比的刻度") && !ch7.includes("单调可比"))
check("Ch7 图注 83% 如实", ch7.includes("粒度太粗读不出斜率"))
check("Ch7 回放角色中文名", ch7.includes("挑战者(黑) vs 冠军(白)"))

/* ---------- 共享层 ---------- */
const railOk = await page.evaluate(() => {
  const a = document.querySelector(".rail a[aria-current]")
  return a !== null || getComputedStyle(document.querySelector(".rail")).display === "none"
})
check("侧轨 aria-current(或侧轨隐藏)", railOk)
const svgGradientsOk = await page.evaluate(() => {
  const stops = [...document.querySelectorAll("#ch-0 svg stop")]
  return stops.length > 0 && stops.every((s) => (s.style.stopColor || "").includes("var("))
})
check("棋子渐变走 CSS 令牌", svgGradientsOk)

check("无 pageerror", errors.length === 0, errors.join(";").slice(0, 120))

await page.close()
await browser.close()
const fails = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - fails.length}/${results.length} 项通过 =====`)
if (fails.length) process.exit(1)
