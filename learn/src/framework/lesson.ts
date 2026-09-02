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
import L10 from "../lessons/L10"
import L11 from "../lessons/L11"
import L12 from "../lessons/L12"
import L13 from "../lessons/L13"
import Graduation from "../lessons/L99"

export interface LessonMeta {
  id: string
  num: string
  title: string
  puzzle: string
  /** 侧栏和锁课预告使用的课程阶段。 */
  phase: string
  /** 尚未解锁时也可阅读的一句收益预告，避免只看见一把锁。 */
  preview: string
}

export const LESSONS: { meta: LessonMeta; Comp: ComponentType }[] = [
  { meta: { id: "prologue", num: "序", title: "没人教过它下棋", puzzle: "它怎么会的?", phase: "先看整条链", preview: "先看见一台机器怎样从自我对弈、搜索和反馈中慢慢变强。" }, Comp: Prologue },
  { meta: { id: "l01", num: "1", title: "棋盘:81 个数", puzzle: "计算机眼里这盘棋长什么样?", phase: "读懂棋局", preview: "把棋盘、落子和判胜写成后面所有模块共用的数字语言。" }, Comp: L01 },
  { meta: { id: "l02", num: "2", title: "视角:一条铁约", puzzle: "同一句棋理,黑白要学两遍?", phase: "读懂棋局", preview: "把“我方 / 对方”的关系统一，让同一条棋理只学一种说法。" }, Comp: L02 },
  { meta: { id: "l03", num: "3", title: "旋钮:自己变准的机器", puzzle: "背棋谱,还是长旋钮?", phase: "造判断器", preview: "理解可调参数怎样让机器从结果中逐步改进判断。" }, Comp: L03 },
  { meta: { id: "l04", num: "4", title: "计票:乘和加,不多不少", puzzle: "多份证据怎样合成一个分?", phase: "造判断器", preview: "看清权重怎样给证据定音量，再把它们汇总成特征。" }, Comp: L04 },
  { meta: { id: "l05", num: "5", title: "弯折:直线画不出的形状", puzzle: "只会乘和加,画得出「弯」吗?", phase: "造判断器", preview: "理解为什么网络必须在计票之间加入弯折，才能识别复杂形状。" }, Comp: L05 },
  { meta: { id: "l07", num: "6", title: "三张平面:网络怎样读棋盘", puzzle: "一张 ±1 的面哪里不够?", phase: "造判断器", preview: "把同一棋盘拆成己方、对方和身份三张更容易学习的输入面。" }, Comp: L07 },
  { meta: { id: "l08", num: "7", title: "模板:会滑的检测器", puzzle: "怎样让局部棋形在各处复用?", phase: "造判断器", preview: "让可学习模板在棋盘各处寻找同一种局部图案，而非手写棋理。" }, Comp: L08 },
  { meta: { id: "l09", num: "8", title: "叠层:看见全盘", puzzle: "单层只看 3×3,怎么办?", phase: "造判断器", preview: "从局部模板逐层扩大视野，把小棋形组合成全盘线索。" }, Comp: L09 },
  { meta: { id: "l10", num: "9", title: "双头:一次前向两个答案", puzzle: "下哪和谁优,怎么一起答?", phase: "造判断器", preview: "同一份棋盘理解怎样分别给出落子建议和胜负倾向。" }, Comp: L10 },
  { meta: { id: "l11", num: "10", title: "搜索:再想四十遍", puzzle: "第一印象会错,怎么补救?", phase: "推演与纠错", preview: "让网络当向导，把有限思考次数花在值得推演的分支上。" }, Comp: L11 },
  { meta: { id: "l06", num: "11", title: "回摊:两种错误怎样改动所有旋钮", puzzle: "π 和 z 的错误怎样回到每颗旋钮?", phase: "推演与纠错", preview: "看见策略和价值两种错误怎样沿真实计算路径回传。" }, Comp: L06 },
  { meta: { id: "l12", num: "12", title: "飞轮:数据转成棋力", puzzle: "数据从哪来?", phase: "飞轮与验收", preview: "把一盘盘自我对弈变成可持续训练的作业与更新。" }, Comp: L12 },
  { meta: { id: "l13", num: "13", title: "竞技场:证据说话", puzzle: "损失降了就等于变强?", phase: "飞轮与验收", preview: "用控制过先后手和随机性的对战，检验变强是否可信。" }, Comp: L13 },
  { meta: { id: "graduation", num: "毕业", title: "沙盒:和它下一盘", puzzle: "全系统图", phase: "飞轮与验收", preview: "实战、诊断整条链路，并把每个零件重新接回系统。" }, Comp: Graduation },
]
