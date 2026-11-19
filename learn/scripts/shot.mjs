/** 逐课截图:明暗两主题,供最终验收目检。node scripts/shot.mjs */
import { chromium } from "../../explainer/node_modules/playwright/index.mjs"
import { mkdirSync } from "node:fs"
import { createServer } from "node:http"

const ROOT = new URL("..", import.meta.url).pathname
const ROUTES = [
  ["prologue", "序"],
  ...Array.from({ length: 18 }, (_, i) => {
    const n = i + 1
    return [`l${String(n).padStart(2, "0")}`, String(n)]
  }),
  ["graduation", "毕业"],
]
/** 会懒加载真权重或运行搜索的课，截图前多等一会。 */
const SLOW = new Set(["l07", "l08", "l09", "l10", "l11", "graduation"])
const STAGE_ENDS = new Set(["l02", "l06", "l11", "l15", "graduation"])
/** 截图要逐课取景；显式准备完整测试进度，不能靠绕过门户或改 URL 跳课。 */
const FULL_PROGRESS = JSON.stringify({
  version: 1,
  mastered: Object.fromEntries(ROUTES.map(([id]) => [id, {
    passedAt: "2026-11-04T00:00:00.000Z",
    evidence: ["截图夹具：课程已通过", "截图夹具：阶段已通过", "截图夹具：仅用于视觉验收"],
    nextAction: "视觉验收",
    scope: STAGE_ENDS.has(id) ? "stage" : "lesson",
  }])),
})

const vite = await (await import("vite")).createServer({
  root: ROOT, logLevel: "error", server: { port: 5197 },
})
await vite.listen()
const base = "http://localhost:5197/"

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
mkdirSync("/tmp/learn-final", { recursive: true })

for (const theme of ["light", "dark"]) {
  await page.goto(base)
  await page.waitForTimeout(200)
  await page.evaluate(({ theme, progress }) => {
    localStorage.clear()
    localStorage.setItem("exp-theme", theme)
    localStorage.setItem("alpha-gomoku-learn/progress/v1", progress)
  }, { theme, progress: FULL_PROGRESS })
  // 主题在首次渲染前读取；写入后 reload 一次，让整轮截图使用同一主题。
  await page.reload()
  await page.waitForTimeout(300)
  for (const [route, label] of ROUTES) {
    const errors = []
    page.removeAllListeners("pageerror")
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.goto(base + "#/" + route)
    await page.waitForTimeout(SLOW.has(route) ? 900 : 400)
    await page.screenshot({ path: `/tmp/learn-final/${route}-${theme}.png`, fullPage: true })
    if (errors.length) console.log(`ERR ${route}(${theme}):`, errors.join("; "))
    else console.log(`ok  ${label} ${route} ${theme}`)
  }
}

await browser.close()
await vite.close()
console.log("shots in /tmp/learn-final")
