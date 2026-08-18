/* zz-ia56: Playwright interaction audit for Ch5 (pi-evolution slider, temperature
 * contrast) and Ch6 (8-fold symmetry lab, real loss chart) on http://localhost:4173.
 * Light theme first, then dark theme key assertions. Collects console/pageerror.
 * Prints PASS/FAIL lines and a final JSON summary. */
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"

const require = createRequire("/Users/knove/git/alpha-gomoku/explainer/package.json")
const { chromium } = require("playwright")

const BASE = "http://localhost:4173"
const REAL_SRC = readFileSync("/Users/knove/git/alpha-gomoku/explainer/src/data/real.ts", "utf8")
const REAL = JSON.parse(REAL_SRC.slice(REAL_SRC.indexOf("= ", REAL_SRC.indexOf("export const REAL")) + 2).trim())

/* ---------- expected values, computed from baked real data ---------- */
const N = 9
const COLS = "ABCDEFGHJ"
const coord = (x, y) => `${COLS[x]}${y + 1}`

const fm = REAL.firstMovePi // [{iteration, pi, top, value}]
const expSpread = fm.map((f) => f.pi.filter((p) => p > 0.01).length)
const expHeatCount = fm.map((f) => f.pi.filter((p) => p > 0.005).length)
const expRootVal = fm.map((f) => {
  const r = Math.round(f.value * 100) / 100
  return `${r > 0 ? "+" : ""}${(r === 0 ? 0 : r).toFixed(2)}`
})
const expHeatPos = fm.map((f) => {
  const s = new Set()
  f.pi.forEach((p, i) => { if (p > 0.005) s.add(`${i % 9},${Math.floor(i / 9)}`) })
  return s
})

/* temperature contrast: replicate mulberry32(7) sampling over moves[0].pi */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function sampleFrom(pi, rand) {
  let total = 0; for (const p of pi) total += p
  let r = rand() * (total > 0 ? total : 1)
  let last = 0
  for (let i = 0; i < pi.length; i++) { if (pi[i] > 0) last = i; r -= pi[i]; if (r <= 0) return i }
  return last
}
const move0 = REAL.selfplayGame.moves[0]
const counts = new Map()
const rand = mulberry32(7)
for (let i = 0; i < 30; i++) { const a = sampleFrom(move0.pi, rand); counts.set(a, (counts.get(a) ?? 0) + 1) }
const expSamples = [...counts.entries()].map(([a, c]) => ({ x: a % 9, y: Math.floor(a / 9), pct: Math.round((c / 30) * 100) }))
let argmaxIdx = 0
for (let i = 0; i < move0.pi.length; i++) if (move0.pi[i] > move0.pi[argmaxIdx]) argmaxIdx = i
const expArgmax = { x: argmaxIdx % 9, y: Math.floor(argmaxIdx / 9) }

/* symmetry lab expectations (mirror of Ch6.tsx + game.py dihedral_transform) */
function dihedralPoint(x, y, n, k) {
  let px = x, py = y
  for (let i = 0; i < k % 4; i++) { const nx = py, ny = n - 1 - px; px = nx, py = ny }
  if (k >= 4) px = n - 1 - px
  return { x: px, y: py }
}
const DEMO_STONES = [{ x: 2, y: 2, v: 1 }, { x: 3, y: 2, v: 1 }, { x: 4, y: 2, v: 1 }, { x: 2, y: 3, v: -1 }]
const DEMO_CAND = { x: 5, y: 2 }
const expCand = Array.from({ length: 8 }, (_, k) => dihedralPoint(DEMO_CAND.x, DEMO_CAND.y, N, k))
const expStones = Array.from({ length: 8 }, (_, k) => DEMO_STONES.map((s) => ({ ...dihedralPoint(s.x, s.y, N, k), v: s.v })))

/* loss chart expectations */
const M = REAL.metrics
const CW = 760, CH = 380, PLOT = { l: 56, r: 24, t: 30, b: 46 }
const PW = CW - PLOT.l - PLOT.r, PH = CH - PLOT.t - PLOT.b, Y_MAX = 5
const xAt = (i) => PLOT.l + (i * PW) / (M.length - 1)
const yAt = (v) => PLOT.t + PH * (1 - v / Y_MAX)
const expPath = (key) => M.map((r, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(r[key]).toFixed(1)}`).join(" ")
const f3 = (v) => v.toFixed(3)

/* board geometry (must match lib/board.tsx) */
const VB = 560
const geom = (small) => { const pad = small ? VB * 0.045 : VB * 0.075; const cell = (VB - 2 * pad) / 8; return { pad, cell } }
const toPx = (pt, small) => { const { pad, cell } = geom(small); return { cx: pad + pt.x * cell, cy: pad + pt.y * cell } }

/* ---------- runner ---------- */
const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  :: " + detail}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } })
const consoleErrors = []
const pageErrors = []
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()) })
page.on("pageerror", (e) => pageErrors.push(String(e)))

await page.goto(BASE, { waitUntil: "networkidle" })

/* =============================== CH5 =============================== */
const ch5 = page.locator("#ch-5")
await ch5.scrollIntoViewIfNeeded()
await page.waitForTimeout(500)

const slider = ch5.locator("input[type=range]")
check("ch5 slider exists", (await slider.count()) === 1)
const sMin = await slider.getAttribute("min")
const sMax = await slider.getAttribute("max")
check("ch5 slider min=0", sMin === "0", `min=${sMin}`)
check(`ch5 slider max = data rounds-1 (${fm.length - 1})`, sMax === String(fm.length - 1), `max=${sMax}`)
check("ch5 slider initial = last round", (await slider.inputValue()) === String(fm.length - 1), await slider.inputValue())

const fig1 = ch5.locator(".figure").first()
const boardSvg = fig1.locator("svg").first()
const setSlider = async (v) => {
  await slider.evaluate((el, val) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
    setter.call(el, String(val))
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
  }, v)
  await page.waitForTimeout(120)
}
const roundLabel = () => fig1.locator(".mini-label", { hasText: "空局首手" }).innerText()
const heatCircles = () => boardSvg.locator("circle[style*='--heat']").all()

const seenHeatSets = []
for (let idx = 0; idx < fm.length; idx++) {
  await setSlider(idx)
  const lbl = (await roundLabel()).trim()
  check(`ch5 idx${idx} round label = 第 ${fm[idx].iteration} 轮(真实)`, lbl.includes(`第 ${fm[idx].iteration} 轮`) && lbl.includes("真实"), lbl)
  const statCards = fig1.locator(".card")
  const rootTxt = (await statCards.nth(0).locator(".stat-big").innerText()).trim()
  const spreadTxt = (await statCards.nth(1).locator(".stat-big").innerText()).trim()
  check(`ch5 idx${idx} root value = ${expRootVal[idx]}`, rootTxt === expRootVal[idx], rootTxt)
  check(`ch5 idx${idx} pi>1% spread = ${expSpread[idx]}`, spreadTxt === String(expSpread[idx]), spreadTxt)
  const circles = await heatCircles()
  check(`ch5 idx${idx} heat discs = ${expHeatCount[idx]}`, circles.length === expHeatCount[idx], `got ${circles.length}`)
  /* positions match baked pi exactly */
  const { pad, cell } = geom(false)
  const got = new Set()
  for (const c of circles) {
    const cx = Number(await c.getAttribute("cx")), cy = Number(await c.getAttribute("cy"))
    got.add(`${Math.round((cx - pad) / cell)},${Math.round((cy - pad) / cell)}`)
  }
  const exp = expHeatPos[idx]
  const missing = [...exp].filter((k) => !got.has(k))
  const extra = [...got].filter((k) => !exp.has(k))
  check(`ch5 idx${idx} heat positions match baked pi`, missing.length === 0 && extra.length === 0, `missing=${missing} extra=${extra}`)
  seenHeatSets.push([...got].sort().join(";"))
  /* TOP5 first row matches data */
  const topChips = fig1.locator(".chip")
  const firstChip = (await topChips.nth(0).innerText()).trim()
  const t0 = fm[idx].top[0]
  check(`ch5 idx${idx} TOP5 first = ${coord(t0.x, t0.y)}`, firstChip === coord(t0.x, t0.y), firstChip)
}
/* heat differs across rounds */
const distinct = new Set(seenHeatSets)
check("ch5 heat distribution changes across rounds", distinct.size === fm.length, `distinct=${distinct.size}`)
/* keyboard interaction syncs too */
await slider.focus()
await page.keyboard.press("Home")
await page.waitForTimeout(120)
check("ch5 keyboard Home -> 第 0 轮", (await roundLabel()).includes("第 0 轮"), await roundLabel())
await page.keyboard.press("ArrowRight")
await page.waitForTimeout(120)
check("ch5 ArrowRight -> 第 1 轮", (await roundLabel()).includes("第 1 轮"), await roundLabel())
await page.keyboard.press("End")
await page.waitForTimeout(120)
check("ch5 End -> last round", (await roundLabel()).includes(`第 ${fm[fm.length - 1].iteration} 轮`), await roundLabel())
/* caption honesty */
const cap51 = (await fig1.locator(".figure-cap").innerText()).replace(/\s+/g, " ")
check("ch5 fig5-1 caption declares real rounds", cap51.includes("真实") && cap51.includes("第 0 至 3 轮"), cap51.slice(0, 90))

/* ---------- Ch5 temperature contrast ---------- */
const fig2 = ch5.locator(".figure").nth(1)
const tempSvgs = fig2.locator("svg")
check("ch5 temperature: two boards", (await tempSvgs.count()) === 2, `count=${await tempSvgs.count()}`)
const leftBoard = tempSvgs.nth(0)
const rightBoard = tempSvgs.nth(1)
const { pad: sPad, cell: sCell } = geom(true)
const leftCircles = await leftBoard.locator("circle[style*='--heat']").all()
check(`ch5 tau=1 board shows ${expSamples.length} sampled points (>1)`, leftCircles.length === expSamples.length && expSamples.length > 1, `got ${leftCircles.length}, want ${expSamples.length}`)
const leftGot = []
for (const c of leftCircles) {
  const cx = Number(await c.getAttribute("cx")), cy = Number(await c.getAttribute("cy"))
  leftGot.push(`${Math.round((cx - sPad) / sCell)},${Math.round((cy - sPad) / sCell)}`)
}
const leftExpSet = new Set(expSamples.map((s) => `${s.x},${s.y}`))
check("ch5 tau=1 sampled positions match seeded sampling", leftGot.every((g) => leftExpSet.has(g)) && leftGot.length === leftExpSet.size, `got=${leftGot.sort()} want=${[...leftExpSet].sort()}`)
const rightCircles = await rightBoard.locator("circle[style*='--heat']").all()
check("ch5 tau->0 board shows exactly 1 argmax disc", rightCircles.length === 1, `got ${rightCircles.length}`)
if (rightCircles.length === 1) {
  const cx = Number(await rightCircles[0].getAttribute("cx")), cy = Number(await rightCircles[0].getAttribute("cy"))
  const at = { cx: sPad + expArgmax.x * sCell, cy: sPad + expArgmax.y * sCell }
  check(`ch5 tau->0 argmax disc at ${coord(expArgmax.x, expArgmax.y)}`, Math.abs(cx - at.cx) < 0.6 && Math.abs(cy - at.cy) < 0.6, `got ${cx.toFixed(1)},${cy.toFixed(1)} want ${at.cx.toFixed(1)},${at.cy.toFixed(1)}`)
  const label100 = await rightBoard.locator("text", { hasText: "100" }).count()
  check("ch5 tau->0 disc labelled 100(%)", label100 >= 1, `count=${label100}`)
}
const tempLabels = await fig2.locator(".mini-label").allInnerTexts()
check("ch5 temperature mini-labels present", tempLabels.some((t) => t.includes("τ = 1")) && tempLabels.some((t) => t.includes("τ → 0")), tempLabels.join(" | "))
const cap52 = (await fig2.locator(".figure-cap").innerText()).replace(/\s+/g, " ")
check("ch5 fig5-2 caption declares real pi source", cap52.includes("第 3 轮真实首手"), cap52.slice(0, 90))

/* =============================== CH6 =============================== */
const ch6 = page.locator("#ch-6")
await ch6.scrollIntoViewIfNeeded()
await page.waitForTimeout(500)

const thumbs = ch6.locator("button[aria-pressed]")
check("ch6 8 transform thumbnails", (await thumbs.count()) === 8, `count=${await thumbs.count()}`)
const fig61 = ch6.locator(".figure").first()
const mainSvg = fig61.locator("svg").first()
const { pad: mPad, cell: mCell } = geom(false)

/* stones of an svg: circles whose fill attr starts with url( ; heat: style --heat */
async function svgState(svg) {
  return await svg.evaluate((el) => {
    const stones = [], heats = []
    for (const c of el.querySelectorAll("circle")) {
      const fill = c.getAttribute("fill") || ""
      const style = c.getAttribute("style") || ""
      if (fill.startsWith("url(")) stones.push([Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))])
      else if (style.includes("--heat")) heats.push([Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))])
    }
    return { stones, heats }
  })
}
const near = (a, b, tol = 0.6) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol

/* static: every thumbnail already in sync (stones+heat at transformed cells) */
for (let k = 0; k < 8; k++) {
  const tsvg = thumbs.nth(k).locator("svg")
  const st = await svgState(tsvg)
  const expS = expStones[k].map((s) => { const p = toPx(s, true); return [p.cx, p.cy] })
  const expH = [toPx(expCand[k], true)].map((p) => [p.cx, p.cy])
  const sOk = st.stones.length === expS.length && expS.every((e) => st.stones.some((g) => near(g, e, 1.0)))
  const hOk = st.heats.length === 1 && near(st.heats[0], expH[0], 1.0)
  check(`ch6 thumb k=${k} stones+heat in sync`, sOk && hOk, `stones=${JSON.stringify(st.stones)} heats=${JSON.stringify(st.heats)} wantHeat=${JSON.stringify(expH)}`)
}
/* interactive: click each thumbnail, main view follows */
for (let k = 0; k < 8; k++) {
  await thumbs.nth(k).click()
  await page.waitForTimeout(90)
  const pressed = await thumbs.nth(k).getAttribute("aria-pressed")
  const chipK = (await fig61.locator(".chip.accent").first().innerText()).replace(/\s+/g, " ").trim()
  const chipC = (await fig61.locator(".chip", { hasText: "候选点" }).first().innerText()).replace(/\s+/g, " ").trim()
  const expC = `${coord(DEMO_CAND.x, DEMO_CAND.y)} → ${coord(expCand[k].x, expCand[k].y)}`
  check(`ch6 k=${k} pressed + k chip`, pressed === "true" && chipK.includes(`k = ${k}`), `pressed=${pressed} chip="${chipK}"`)
  check(`ch6 k=${k} candidate chip "${expC}"`, chipC.includes(expC), chipC)
  const st = await svgState(mainSvg)
  const expS = expStones[k].map((s) => { const p = toPx(s, false); return [p.cx, p.cy] })
  const expHp = toPx(expCand[k], false)
  const sOk = st.stones.length === expS.length && expS.every((e) => st.stones.some((g) => near(g, e, 1.0)))
  const hOk = st.heats.length === 1 && near(st.heats[0], [expHp.cx, expHp.cy], 1.0)
  check(`ch6 k=${k} main board stones+heat match transform`, sOk && hOk, `heats=${JSON.stringify(st.heats)} want=${expHp.cx.toFixed(1)},${expHp.cy.toFixed(1)} stones=${st.stones.length}`)
}
const cap61 = (await fig61.locator(".figure-cap").innerText()).replace(/\s+/g, " ")
check("ch6 fig6-1 caption declares teaching stand-in", cap61.includes("教学示意"), cap61.slice(0, 90))

/* ---------- Ch6 loss chart ---------- */
const lossSvg = ch6.locator('svg[viewBox="0 0 760 380"]')
check("ch6 loss chart svg exists", (await lossSvg.count()) === 1)
const paths = await lossSvg.locator("path").all()
check("ch6 loss chart has 2 line paths", paths.length === 2, `count=${paths.length}`)
if (paths.length === 2) {
  const d0 = await paths[0].getAttribute("d")
  const d1 = await paths[1].getAttribute("d")
  check("ch6 value-loss path matches real data", d0 === expPath("value_loss"), `got ${d0} want ${expPath("value_loss")}`)
  check("ch6 policy-loss path matches real data", d1 === expPath("policy_loss"), `got ${d1} want ${expPath("policy_loss")}`)
}
const svgTexts = (await lossSvg.locator("text").allTextContents()).map((t) => t ?? "")
for (let i = 0; i < M.length; i++) check(`ch6 x-axis label 第 ${i} 轮`, svgTexts.some((t) => t.trim() === `第 ${i} 轮`), svgTexts.join("|"))
for (const v of [0, 1, 2, 3, 4, 5]) check(`ch6 y-axis tick ${v}`, svgTexts.some((t) => t.trim() === String(v)), svgTexts.join("|"))
check("ch6 baseline label ln(81)", svgTexts.some((t) => t.includes("ln(81)") && t.includes("4.394")), svgTexts.join("|"))
const chipReal = await ch6.locator(".chip.accent", { hasText: "真实训练" }).count()
check("ch6 loss chart honesty chip 来自第 0–3 轮真实训练", chipReal >= 1, `count=${chipReal}`)

/* hover readings */
await lossSvg.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
const box = await lossSvg.boundingBox()
const hoverAt = async (i) => {
  const sx = box.x + (xAt(i) / CW) * box.width
  const sy = box.y + box.height * 0.5
  await page.mouse.move(sx, sy)
  await page.waitForTimeout(150)
}
await hoverAt(1)
let tip = ch6.locator(".tip")
check("ch6 hover shows tooltip", (await tip.count()) === 1, `count=${await tip.count()}`)
if ((await tip.count()) === 1) {
  const t = (await tip.innerText()).replace(/\s+/g, " ")
  const want = `第 1 轮 策略 ${f3(M[1].policy_loss)} 价值 ${f3(M[1].value_loss)} 总损失 ${f3(M[1].loss)}`
  check(`ch6 hover round1 readings = real data`, t === want, `got "${t}" want "${want}"`)
}
await hoverAt(3)
if ((await tip.count()) === 1) {
  const t = (await tip.innerText()).replace(/\s+/g, " ")
  const want = `第 3 轮 策略 ${f3(M[3].policy_loss)} 价值 ${f3(M[3].value_loss)} 总损失 ${f3(M[3].loss)}`
  check(`ch6 hover round3 readings = real data`, t === want, `got "${t}" want "${want}"`)
}
/* hover refline appears */
const vlines = await lossSvg.evaluate((el) => [...el.querySelectorAll("line")].filter((l) => l.getAttribute("x1") === l.getAttribute("x2") && Number(l.getAttribute("y2")) - Number(l.getAttribute("y1")) > 200).length)
check("ch6 hover vertical reference line", vlines >= 1, `count=${vlines}`)
await page.mouse.move(box.x - 30, box.y - 30)
await page.waitForTimeout(150)
check("ch6 tooltip hides on pointer leave", (await tip.count()) === 0, `count=${await tip.count()}`)

/* =============================== DARK THEME =============================== */
await page.evaluate(() => localStorage.setItem("exp-theme", "dark"))
await page.reload({ waitUntil: "networkidle" })
await page.waitForTimeout(400)
const themeNow = await page.evaluate(() => document.documentElement.dataset.theme)
check("dark theme applied", themeNow === "dark", themeNow)

const ch5d = page.locator("#ch-5")
await ch5d.scrollIntoViewIfNeeded()
await page.waitForTimeout(500)
const sliderD = ch5d.locator("input[type=range]")
await sliderD.evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
  setter.call(el, "2")
  el.dispatchEvent(new Event("input", { bubbles: true }))
})
await page.waitForTimeout(120)
const lblD = await ch5d.locator(".mini-label", { hasText: "空局首手" }).innerText()
check("dark: ch5 slider idx2 -> 第 2 轮", lblD.includes("第 2 轮"), lblD)
const heatD = await ch5d.locator(".figure").first().locator("svg").first().locator("circle[style*='--heat']").count()
check(`dark: ch5 idx2 heat discs = ${expHeatCount[2]}`, heatD === expHeatCount[2], `got ${heatD}`)
const heatFillD = await ch5d.locator(".figure").first().locator("circle[style*='--heat']").first().evaluate((c) => getComputedStyle(c).fill)
check("dark: heat fill resolves to a color", /^rgb/.test(heatFillD), heatFillD)

const ch6d = page.locator("#ch-6")
await ch6d.scrollIntoViewIfNeeded()
await page.waitForTimeout(500)
const thumbsD = ch6d.locator("button[aria-pressed]")
await thumbsD.nth(5).click()
await page.waitForTimeout(100)
const chipCD = (await ch6d.locator(".chip", { hasText: "候选点" }).first().innerText()).replace(/\s+/g, " ").trim()
check("dark: ch6 k=5 candidate chip", chipCD.includes(`${coord(DEMO_CAND.x, DEMO_CAND.y)} → ${coord(expCand[5].x, expCand[5].y)}`), chipCD)
const stD = await ch6d.locator(".figure").first().locator("svg").first().evaluate((el) => {
  const heats = []
  for (const c of el.querySelectorAll("circle")) if ((c.getAttribute("style") || "").includes("--heat")) heats.push([Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))])
  return heats
})
const expH5 = toPx(expCand[5], false)
check("dark: ch6 k=5 main heat at transformed cell", stD.length === 1 && near(stD[0], [expH5.cx, expH5.cy], 1.0), JSON.stringify(stD))

const lossD = ch6d.locator('svg[viewBox="0 0 760 380"]')
await lossD.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
const boxD = await lossD.boundingBox()
await page.mouse.move(boxD.x + (xAt(0) / CW) * boxD.width, boxD.y + boxD.height * 0.5)
await page.waitForTimeout(150)
const tipD = ch6d.locator(".tip")
if ((await tipD.count()) === 1) {
  const t = (await tipD.innerText()).replace(/\s+/g, " ")
  const want = `第 0 轮 策略 ${f3(M[0].policy_loss)} 价值 ${f3(M[0].value_loss)} 总损失 ${f3(M[0].loss)}`
  check("dark: ch6 hover round0 readings", t === want, `got "${t}" want "${want}"`)
} else check("dark: ch6 hover round0 readings", false, "tooltip missing")
const pathStrokeD = await lossD.locator("path").first().evaluate((p) => getComputedStyle(p).stroke)
check("dark: loss path stroke resolves", /^rgb/.test(pathStrokeD), pathStrokeD)

/* =============================== errors =============================== */
check("no console errors", consoleErrors.length === 0, consoleErrors.join(" || ").slice(0, 400))
check("no pageerrors", pageErrors.length === 0, pageErrors.join(" || ").slice(0, 400))

await browser.close()
const fails = results.filter((r) => !r.ok)
console.log(`\n===== SUMMARY: ${results.length - fails.length}/${results.length} pass, ${fails.length} fail =====`)
console.log(JSON.stringify({ fails: fails.map((f) => ({ name: f.name, detail: f.detail })), consoleErrors, pageErrors }, null, 2))
