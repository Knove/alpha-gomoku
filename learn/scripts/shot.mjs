/** 逐课截图:明暗两主题,供最终验收目检。node scripts/shot.mjs */
import { chromium } from "../../explainer/node_modules/playwright/index.mjs"
import { mkdirSync } from "node:fs"
import { createServer } from "node:http"

const ROOT = new URL("..", import.meta.url).pathname
const ROUTES = [
  ["prologue", "序"], ["l01", "1"], ["l02", "2"], ["l03", "3"], ["l04", "4"],
  ["l05", "5"], ["l06", "6"], ["l07", "7"], ["l08", "8"], ["l09", "9"],
  ["graduation", "毕业"],
]

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
  await page.evaluate((t) => {
    localStorage.clear()
    localStorage.setItem("exp-theme", t)
    // 全解锁,毕业沙盒可达
    localStorage.setItem("learn-progress-v1", JSON.stringify({
      unlocked: 10, quizPassed: Object.fromEntries(
        ["prologue", "l01", "l02", "l03", "l04", "l05", "l06", "l07", "l08", "l09"].map((id) => [id, true]),
      ),
    }))
  }, theme)
  // localStorage 是在 App 挂载后才写入的,而 App 只在挂载时读一次——
  // 不 reload 的话,后面 10 张全截成锁定页
  await page.reload()
  await page.waitForTimeout(300)
  for (const [route, label] of ROUTES) {
    const errors = []
    page.removeAllListeners("pageerror")
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.goto(base + "#/" + route)
    await page.waitForTimeout(route === "l04" || route === "l05" || route === "l06" || route === "l07" ? 900 : 400)
    await page.screenshot({ path: `/tmp/learn-final/${route}-${theme}.png`, fullPage: true })
    if (errors.length) console.log(`ERR ${route}(${theme}):`, errors.join("; "))
    else console.log(`ok  ${label} ${route} ${theme}`)
  }
}

await browser.close()
await vite.close()
console.log("shots in /tmp/learn-final")
