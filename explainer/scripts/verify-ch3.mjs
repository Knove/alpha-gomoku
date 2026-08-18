// Verify Ch3 learning-path additions: prose intro, codewalk per module, snippet-vs-source fidelity
import { chromium } from "playwright"
import { readFileSync } from "node:fs"

const URL = "http://localhost:4173"
const results = []
function check(name, ok, detail = "") {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`)
}

const gamePy = readFileSync("/Users/knove/git/alpha-gomoku/alphagomoku/game.py", "utf8")
const modelPy = readFileSync("/Users/knove/git/alpha-gomoku/alphagomoku/model.py", "utf8")

const MODULES = [
  { name: "输入平面", ref: "game.py L111-117", lines: ["def encode(game: Game) -> np.ndarray:", "canon = game.canonical_board()", "return np.stack([cur, opp, color])"], src: gamePy },
  { name: "3×3 卷积 + BN + ReLU", ref: "model.py L32-36", lines: ["self.stem = nn.Sequential(", "nn.Conv2d(3, channels, 3, padding=1, bias=False)", "nn.ReLU(),"], src: modelPy },
  { name: "残差块 × 4", ref: "model.py L18-21", lines: ["def forward(self, x: torch.Tensor) -> torch.Tensor:", "return F.relu(x + h)"], src: modelPy },
  { name: "策略头 · 1×1 卷积", ref: "model.py L39-40", lines: ["self.p_conv = nn.Conv2d(channels, 2, 1, bias=False)", "self.p_bn = nn.BatchNorm2d(2)"], src: modelPy },
  { name: "策略头 · 全连接", ref: "model.py L41 + L82", lines: ["self.p_fc = nn.Linear(2 * self.n * self.n, self.n * self.n)", "probs = torch.softmax(logits, dim=-1)"], src: modelPy },
  { name: "价值头 · 1×1 卷积", ref: "model.py L43-44", lines: ["self.v_conv = nn.Conv2d(channels, 1, 1, bias=False)"], src: modelPy },
  { name: "价值头 · 全连接 + ReLU", ref: "model.py L45-46", lines: ["self.v_fc1 = nn.Linear(self.n * self.n, 64)", "self.v_fc2 = nn.Linear(64, 1)"], src: modelPy },
  { name: "价值头 · tanh", ref: "model.py L54", lines: ["v = torch.tanh(self.v_fc2(v)).squeeze(-1)"], src: modelPy },
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
await page.goto(URL, { waitUntil: "networkidle" })
await page.waitForTimeout(700)

// 1) prose intro
const ch3text = await page.locator("#ch-3").innerText()
check("NN101 标题一", ch3text.includes("先把「网络」想明白"))
check("NN101 标题二", ch3text.includes("三个名词,扫盲完就够用"))
check("NN101 通道/卷积/残差扫盲", ["通道", "卷积", "残差", "ReLU"].every((w) => ch3text.includes(w)))
check("读码路线", ch3text.includes("encode()") && ch3text.includes("forward()") && ch3text.includes("model.py L82"))

// 2) codewalk per module: click each by DOM order, verify ref + verbatim lines
for (let i = 0; i < MODULES.length; i++) {
  const m = MODULES[i]
  const g = page.locator('#ch-3 g[role="button"]').nth(i)
  await g.scrollIntoViewIfNeeded()
  await g.click()
  await page.waitForTimeout(200)
  const card = await page.locator("#ch-3 .card").innerText()
  const refOk = card.includes(m.ref)
  const linesOk = m.lines.every((l) => card.includes(l))
  // verbatim fidelity: structural lines (skip our teaching comment lines) must exist verbatim in the source
  const srcOk = m.lines.every((l) => l.startsWith("#") || m.src.includes(l))
  check(`codewalk [${m.name}] ref`, refOk, m.ref)
  check(`codewalk [${m.name}] 片段与源码一致`, linesOk && srcOk, linesOk ? "" : "片段缺失或与源码不符")
  await g.click() // unpin
  await page.waitForTimeout(120)
}

// 3) Ch2 figcap encode ref
const ch2text = await page.locator("#ch-2").innerText()
check("Ch2 图注 encode 引用", ch2text.includes("game.py L111-117"))

// 4) layout: card with codewalk doesn't overflow the figure at 1440
const layout = await page.evaluate(() => {
  const fig = document.querySelector("#ch-3 .figure")
  const card = document.querySelector("#ch-3 .card")
  if (!fig || !card) return null
  return { figH: fig.getBoundingClientRect().height, cardTop: card.getBoundingClientRect().top, figTop: fig.getBoundingClientRect().top }
})
check("图 3-1 含 codewalk 的卡不溢出", layout !== null && layout.cardTop >= layout.figTop)

await page.close()
await browser.close()
const fails = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - fails.length}/${results.length} 项通过 =====`)
if (fails.length) process.exit(1)
