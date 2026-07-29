import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
// scroll to ch-2
const el = await page.$('#ch-2')
if (!el) { console.log('NO #ch-2'); process.exit(1) }
await el.scrollIntoViewIfNeeded()
await page.waitForTimeout(1500)
// find the perspective figure svg with aria-label
const svg = await page.$('svg[aria-label="视角切换棋盘"]')
if (svg) {
  await svg.screenshot({ path: '/tmp/ch2_board.png' })
  const box = await svg.boundingBox()
  console.log('board svg box:', JSON.stringify(box))
  // count star dots: circles with small r in that svg
  const dots = await svg.$$eval('circle', cs => cs.map(c => ({ r: c.getAttribute('r'), fill: getComputedStyle(c).fill })))
  console.log('circles:', JSON.stringify(dots))
} else {
  console.log('NO board svg found')
}
await page.screenshot({ path: '/tmp/ch2_full.png', fullPage: false })
await browser.close()
