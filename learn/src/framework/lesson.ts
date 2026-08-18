import type { ComponentType } from "react"
import Prologue from "../lessons/L00"
import L01 from "../lessons/L01"
import L02 from "../lessons/L02"
import L03 from "../lessons/L03"
import L04 from "../lessons/L04"
import L05 from "../lessons/L05"
import L06 from "../lessons/L06"
import L07 from "../lessons/L07"
import L08 from "../lessons/L08"
import L09 from "../lessons/L09"
import Graduation from "../lessons/L99"

export interface LessonMeta {
  id: string
  num: string
  title: string
  puzzle: string
}

export const LESSONS: { meta: LessonMeta; Comp: ComponentType }[] = [
  { meta: { id: "prologue", num: "序", title: "没人教过它下棋", puzzle: "它怎么会的?" }, Comp: Prologue },
  { meta: { id: "l01", num: "1", title: "棋盘:81 个数", puzzle: "计算机眼里这盘棋长什么样?" }, Comp: L01 },
  { meta: { id: "l02", num: "2", title: "视角:一条铁约", puzzle: "同一句棋理,黑白要学两遍?" }, Comp: L02 },
  { meta: { id: "l03", num: "3", title: "三张平面", puzzle: "一张 ±1 的面哪里不够?" }, Comp: L03 },
  { meta: { id: "l04", num: "4", title: "模板:会滑的检测器", puzzle: "怎么白送它「三连要堵」?" }, Comp: L04 },
  { meta: { id: "l05", num: "5", title: "叠层:看见全盘", puzzle: "单层只看 3×3,怎么办?" }, Comp: L05 },
  { meta: { id: "l06", num: "6", title: "双头:一次前向两个答案", puzzle: "下哪和谁优,怎么一起答?" }, Comp: L06 },
  { meta: { id: "l07", num: "7", title: "搜索:再想四十遍", puzzle: "第一印象会错,怎么补救?" }, Comp: L07 },
  { meta: { id: "l08", num: "8", title: "飞轮:数据转成棋力", puzzle: "数据从哪来?" }, Comp: L08 },
  { meta: { id: "l09", num: "9", title: "竞技场:证据说话", puzzle: "损失降了就等于变强?" }, Comp: L09 },
  { meta: { id: "graduation", num: "毕业", title: "沙盒:和它下一盘", puzzle: "全系统图" }, Comp: Graduation },
]
