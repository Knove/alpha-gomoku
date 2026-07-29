import { Chrome } from "./components/Chrome"
import Ch0 from "./chapters/Ch0"
import Ch1 from "./chapters/Ch1"
import Ch2 from "./chapters/Ch2"
import Ch3 from "./chapters/Ch3"
import Ch4 from "./chapters/Ch4"
import Ch5 from "./chapters/Ch5"
import Ch6 from "./chapters/Ch6"
import Ch7 from "./chapters/Ch7"

const RAIL = [
  { id: "ch-0", no: "序", label: "英雄区" },
  { id: "ch-1", no: "壹", label: "飞轮" },
  { id: "ch-2", no: "贰", label: "棋盘与视角" },
  { id: "ch-3", no: "叁", label: "网络" },
  { id: "ch-4", no: "肆", label: "MCTS" },
  { id: "ch-5", no: "伍", label: "自我对弈" },
  { id: "ch-6", no: "陆", label: "训练" },
  { id: "ch-7", no: "柒", label: "竞技场" },
]

function Divider() {
  return (
    <div className="divider-stars" aria-hidden>
      <i />
      <i />
      <i />
    </div>
  )
}

export default function App() {
  return (
    <div id="top">
      <Chrome rail={RAIL} />
      <main id="main">
        <Ch0 />
        <Divider />
        <Ch1 />
        <Divider />
        <Ch2 />
        <Divider />
        <Ch3 />
        <Divider />
        <Ch4 />
        <Divider />
        <Ch5 />
        <Divider />
        <Ch6 />
        <Divider />
        <Ch7 />
      </main>
      <footer className="prose-col" style={{ padding: "3rem 1.5rem 4rem" }}>
        <hr className="hairline-hr" />
        <p className="mini-label" style={{ textAlign: "center" }}>
          ALPHA-GOMOKU · 原理交互课 —— 页面数据来自 data/runs/demo 真实训练快照;
          设计语言与《两种智能:AlphaGo 与大语言模型》同源。
        </p>
      </footer>
    </div>
  )
}
