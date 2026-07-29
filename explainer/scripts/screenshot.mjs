#!/usr/bin/env node
/**
 * Visual verification: screenshot the built page (via vite preview) in both
 * themes, per chapter, plus an interacted MCTS simulator.
 * Usage: node scripts/screenshot.mjs [url] [outdir]
 */
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const URL = process.argv[2] ?? "http://localhost:4173"
const OUT = process.argv[3] ?? "/tmp/exp-shots"
const CHAPTERS = ["ch-0", "ch-1", "ch-2", "ch-3", "ch-4", "ch-5", "ch-6", "ch-7"]

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()

  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("exp-theme", t)
      } catch (e) {}
    }, theme)
    await page.goto(URL, { waitUntil: "networkidle" })
    await page.waitForTimeout(900)

    // full page
    await page.screenshot({ path: `${OUT}/full-${theme}.png`, fullPage: true })

    // per chapter
    for (const id of CHAPTERS) {
      const el = page.locator(`#${id}`)
      if (await el.count()) {
        await el.scrollIntoViewIfNeeded()
        await page.waitForTimeout(450)
        await el.screenshot({ path: `${OUT}/${id}-${theme}.png` })
      }
    }

    // interact: grow the MCTS tree (20 sims), then capture the simulator
    if (theme === "light") {
      const sim = page.locator("#ch-4 .figure").first()
      await sim.scrollIntoViewIfNeeded()
      await page.waitForTimeout(400)
      const step10 = sim.getByRole("button", { name: "单步 ×10" })
      await step10.click()
      await page.waitForTimeout(250)
      await step10.click()
      await page.waitForTimeout(400)
      await sim.screenshot({ path: `${OUT}/ch4-interacted-${theme}.png` })
    }

    await page.close()
    console.log(`theme ${theme} done`)
  }

  await browser.close()
  console.log(`shots saved to ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
