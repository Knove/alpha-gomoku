/** 逐课截图:明暗两主题,供最终验收目检。node scripts/shot.mjs */
import { chromium } from "../../explainer/node_modules/playwright/index.mjs"
import { mkdirSync } from "node:fs"
import { createServer } from "node:http"

const ROOT = new URL("..", import.meta.url).pathname
const ROUTES = [
  ["prologue", "序"], ["l01", "1"], ["l02", "2"], ["l03", "3"], ["l04", "4"],
  ["l05", "5"], ["l06", "6"], ["l07", "7"], ["l08", "8"], ["l09", "9"],
  ["l10", "10"], ["l11", "11"], ["l12", "12"], ["l13", "13"], ["graduation", "毕业"],
]
/** 懒加载真权重的课(截图前多等一会):新 l04 计票课 + 旧 l04-l07 挪成的 l08-l11 */
const SLOW = new Set(["l04", "l08", "l09", "l10", "l11"])
const ALL_IDS = ROUTES.map(([r]) => r).filter((r) => r !== "graduation")

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
    // 全解锁,毕业沙盒可达(进度 key 是 v2:课程 15 条,cap = 14)
    localStorage.setItem("learn-progress-v2", JSON.stringify({
      unlocked: 14, quizPassed: Object.fromEntries(ids.map((id) => [id, true])),
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
