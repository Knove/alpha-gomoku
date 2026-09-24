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
const ALL_IDS = ROUTES.map(([id]) => id)

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
  await page.evaluate(({ ids, theme }) => {
    localStorage.clear()
    localStorage.setItem("exp-theme", theme)
    // 全部章节按当前 contentVersion=1 标记完成，毕业沙盒可达。
    localStorage.setItem("learn-progress-v4", JSON.stringify({
      version: 4,
      completed: Object.fromEntries(ids.map((id) => [id, { contentVersion: 1, completedAt: 1 }])),
    }))
  }, { ids: ALL_IDS, theme })
  // localStorage 是在 App 挂载后才写入的,而 App 只在挂载时读一次——
  // 不 reload 的话,后面全截成锁定页
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
