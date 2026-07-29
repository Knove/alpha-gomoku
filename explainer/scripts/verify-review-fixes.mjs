// Comprehensive re-verification of all 26 review fixes
import { chromium } from "playwright"

const URL = "http://localhost:4173"
const results = []
function check(name, ok, detail = "") {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`)
}
function lum(r, g, b) {
  const f = (c) => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrast(c1, c2) {
  const l1 = lum(...c1), l2 = lum(...c2)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}
function parseRgb(s) {
  const m = s.match(/(\d+),\s*(\d+),\s*(\d+)/)
  return m ? [+m[1], +m[2], +m[3]] : null
}

const browser = await chromium.launch()

// ---------- default theme (light), 1440 ----------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.goto(URL, { waitUntil: "networkidle" })
  await page.waitForTimeout(700)

  // [0] Ch3 formula uses p, not π; TL;DR bridges p→π
  const ch3text = await page.locator("#ch-3").innerText()
  check("[0] Ch3 公式符号 p", /p_i|pi =|p\s*=/.test(ch3text) || ch3text.includes("p = e"), "formula shows p")
  check("[0] Ch3 小结 p→π 桥接", ch3text.includes("网络的原始输出记作 p"))
  check("[0] Ch3 不再有裸 π 公式", !ch3text.includes("π_i"))

  // [6] softmax annotation mentions 81 points + masking
  check("[6] softmax 注解 81 点+屏蔽", ch3text.includes("81 个交叉点") && ch3text.includes("屏蔽"))

  // [7] gauge note says 搜索根估值
  check("[7] gauge 小注口径", ch3text.includes("由搜索根估值"))

  // [13] module g aria-pressed toggles
  const mod = page.locator('#ch-3 g[role="button"]').first()
  await mod.scrollIntoViewIfNeeded()
  await mod.click()
  await page.waitForTimeout(200)
  check("[13] 模块 aria-pressed", (await mod.getAttribute("aria-pressed")) === "true")
  await mod.click() // unpin

  // [1] Ch4 tree grows beyond depth 1 after 200 sims
  const runBtn = page.locator("#ch-4 button", { hasText: "跑到 200" })
  await runBtn.scrollIntoViewIfNeeded()
  await runBtn.click()
  await page.waitForTimeout(600)
  const depths = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('#ch-4 svg[aria-label="MCTS 搜索树"] circle')]
    return cs.map((c) => (+c.getAttribute("cy") - 40) / 62).filter((d) => d >= 0)
  })
  const maxDepth = Math.max(...depths)
  check("[1] Ch4 搜索树深度 ≥2", maxDepth >= 2, `maxDepth=${maxDepth}`)
  const strip = await page.locator("#ch-4").innerText()
  check("[1] 最近模拟路径多层", strip.includes(" → "), "path has multiple edges")

  // [12] noise toggle aria-label
  const noiseBtn = page.locator('#ch-4 button[aria-label*="根噪声"]')
  check("[12] 根噪声开关 aria-label", (await noiseBtn.count()) === 1)

  // [19] 蒙特卡洛 note
  const ch4text = await page.locator("#ch-4").innerText()
  check("[19] 蒙特卡洛词源注", ch4text.includes("用大量随机试验来估计"))

  // [11] Ch2 seg aria-pressed
  const segBtns = page.locator("#ch-2 .seg-btn")
  const ap = await segBtns.evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed")))
  check("[11] 视角切换 aria-pressed", ap.includes("true") && ap.includes("false"), ap.join("/"))

  // [8] Ch2 pin on click (touch analog)
  const rect = page.locator('#ch-2 svg[aria-label="平面 0 · 己方子"] rect').first()
  await rect.scrollIntoViewIfNeeded()
  await rect.click({ force: true })
  await page.mouse.move(20, 20) // pointerleave
  await page.waitForTimeout(250)
  const pinned = await page.evaluate(() => {
    const rs = [...document.querySelectorAll("#ch-2 svg rect")]
    return rs.some((r) => (r.getAttribute("style") || "").includes("var(--accent)"))
  })
  check("[8] 点按钉住联动高亮", pinned)

  // [25] Ch1 总损失
  const ch1text = await page.locator("#ch-1").innerText()
  check("[25] 总损失统一", ch1text.includes("总损失"))
  // [18] 方位词
  check("[18] 方位词", ch1text.includes("下面这台飞轮"))
  // [21] 按钮无多余空格
  await page.locator("#ch-1 button", { hasText: "推动第一轮" }).click()
  await page.waitForTimeout(250)
  const pushLabel = await page.locator("#ch-1 .btn.primary").innerText()
  check("[21] 按钮文案", pushLabel.replace(/\s/g, "") === "推动第二轮", JSON.stringify(pushLabel))

  // [16]/[17]/[20] Ch0
  const ch0text = await page.locator("#ch-0").innerText()
  check("[16] 负号 U+2212", ch0text.includes("−1") && !/[-]1 必败/.test(ch0text))
  check("[17] 根估值 3 位小数", ch0text.includes("+0.468"))
  check("[20] 跳过 I 说明", ch0text.includes("跳过 I"))

  // Ch3 gauge shows same 3-dp value
  check("[17] Ch3 同值 3 位小数", ch3text.includes("+0.468"))

  // [15] quotes: no 『 anywhere; 「己方」 present
  const bodyText = await page.evaluate(() => document.body.innerText)
  check("[15] 无双角引号", !bodyText.includes("『"))
  check("[15] 角引号在场", bodyText.includes("「己方」"))

  // [5] Ch7 尾声
  const ch7text = await page.locator("#ch-7").innerText()
  check("[5] 尾声措辞", ch7text.includes("标注「真实」的数字都来自你的真实训练"))

  // [23] Ch6 thumbnail inner board hidden from AT
  const hiddenBoard = await page.locator('#ch-6 button span[aria-hidden="true"] svg').count()
  check("[23] 缩略图嵌套 img 降噪", hiddenBoard >= 8, `${hiddenBoard} hidden boards`)

  // [22] theme svg aria-hidden
  const svgHidden = await page.locator(".icon-btn svg").first().getAttribute("aria-hidden")
  check("[22] 主题 svg aria-hidden", svgHidden === "true")

  // [14] skip link: fresh page → first Tab must land on it, and it becomes visible on focus
  await page.goto(URL, { waitUntil: "networkidle" })
  await page.waitForTimeout(500)
  const skip = page.locator("a.skip-link")
  await page.keyboard.press("Tab")
  await page.waitForTimeout(250)
  const skipInfo = await page.evaluate(() => {
    const a = document.querySelector("a.skip-link")
    const main = document.getElementById("main")
    return {
      exists: !!a,
      href: a?.getAttribute("href"),
      main: !!main,
      transform: a ? getComputedStyle(a).transform : "",
      focused: document.activeElement === a,
    }
  })
  check("[14] skip link", skipInfo.exists && skipInfo.href === "#main" && skipInfo.main && skipInfo.focused && skipInfo.transform === "none", JSON.stringify(skipInfo))

  // [24] board coord fill
  const coordFill = await page.evaluate(() => {
    const g = document.querySelector("#ch-0 svg g[font-family]")
    if (!g) return null
    const t = [...document.querySelectorAll("#ch-0 svg text")].find((t) => /^[A-HJ]$/.test(t.textContent.trim()))
    return t ? getComputedStyle(t).fill : null
  })
  check("[24] 棋盘坐标色", coordFill === "rgb(91, 86, 71)", coordFill ?? "n/a")

  // [10] --fg-faint vs --card-sunken contrast
  const tokens = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    return { faint: cs.getPropertyValue("--fg-faint").trim(), sunken: cs.getPropertyValue("--card-sunken").trim() }
  })
  const faintRgb = parseRgb(await page.evaluate((c) => {
    const el = document.createElement("div")
    el.style.color = c
    document.body.appendChild(el)
    const v = getComputedStyle(el).color
    el.remove()
    return v
  }, tokens.faint))
  const sunkenRgb = parseRgb(await page.evaluate((c) => {
    const el = document.createElement("div")
    el.style.color = c
    document.body.appendChild(el)
    const v = getComputedStyle(el).color
    el.remove()
    return v
  }, tokens.sunken))
  const ratio10 = contrast(faintRgb, sunkenRgb)
  check("[10] --fg-faint 对比度 ≥4.5", ratio10 >= 4.5, `${tokens.faint} on ${tokens.sunken} = ${ratio10.toFixed(2)}`)

  await page.close()
}

// ---------- dark theme ----------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.addInitScript(() => { try { localStorage.setItem("exp-theme", "dark") } catch (e) {} })
  await page.goto(URL, { waitUntil: "networkidle" })
  await page.waitForTimeout(500)

  // [4] dark .btn.primary contrast
  const ratio4 = await page.evaluate(() => {
    const btn = document.querySelector(".btn.primary")
    if (!btn) return 0
    const bg = getComputedStyle(btn).backgroundColor
    const fg = getComputedStyle(btn).color
    const lum = (r, g, b) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const p = (s) => s.match(/(\d+),\s*(\d+),\s*(\d+)/).slice(1).map(Number)
    const [l1, l2] = [lum(...p(bg)), lum(...p(fg))]
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  })
  check("[4] 暗色主按钮对比度 ≥4.5", ratio4 >= 4.5, `ratio=${ratio4.toFixed(2)}`)

  // [9] reduced-motion flow-dash
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(500)
  await page.locator("#ch-1 button", { hasText: "推动第一轮" }).click()
  await page.waitForTimeout(300)
  const anim = await page.evaluate(() => {
    const p = document.querySelector("#ch-1 path.flow-dash")
    return p ? getComputedStyle(p).animationName : "NO-ELEMENT"
  })
  check("[9] reduced-motion flow-dash 静止", anim === "none", anim)

  await page.close()
}

// ---------- 360px viewport ----------
{
  const page = await browser.newPage({ viewport: { width: 360, height: 740 } })
  await page.goto(URL, { waitUntil: "networkidle" })
  await page.waitForTimeout(600)

  // [2] theme button within viewport; mini-label hidden
  const top = await page.evaluate(() => {
    const btn = document.querySelector(".icon-btn").getBoundingClientRect()
    const lbl = document.querySelector(".topbar .mini-label")
    return { right: btn.right, left: btn.left, lblDisplay: lbl ? getComputedStyle(lbl).display : "none" }
  })
  check("[2] 360px 主题按钮可达", top.right <= 360 && top.left >= 0, JSON.stringify(top))
  check("[2] 360px 顶栏标语隐藏", top.lblDisplay === "none")

  // [3] Ch3 arch svg keeps 640px with horizontal scroll (scroll container is the outer overflow-x:auto div)
  const svgW = await page.evaluate(() => {
    const svg = document.querySelector('#ch-3 svg[role="group"]')
    const outer = svg?.parentElement?.parentElement
    return {
      w: svg?.getBoundingClientRect().width ?? 0,
      overflowX: outer ? getComputedStyle(outer).overflowX : "",
      scrollable: outer ? outer.scrollWidth > outer.clientWidth : false,
    }
  })
  check("[3] 360px 图3-1 横滚可读", svgW.w >= 600 && svgW.scrollable, JSON.stringify(svgW))

  await page.close()
}

await browser.close()
const fails = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - fails.length}/${results.length} 项通过 =====`)
if (fails.length) {
  console.log("FAILURES:", fails.map((f) => f.name).join(" | "))
  process.exit(1)
}
