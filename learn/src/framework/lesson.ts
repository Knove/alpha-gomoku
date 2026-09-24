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
import L14 from "../lessons/L14"
import L15 from "../lessons/L15"
import L16 from "../lessons/L16"
import L17 from "../lessons/L17"
import L18 from "../lessons/L18"
import Graduation from "../lessons/L99"
import { CURRICULUM, type CurriculumUnit } from "./curriculum"

export type LessonMeta = CurriculumUnit

const COMPONENTS: Record<string, ComponentType> = {
  prologue: Prologue,
  l01: L01,
  l02: L02,
  l03: L03,
  l04: L04,
  l05: L05,
  l06: L07,
  l07: L08,
  l08: L09,
  l09: L10,
  l10: L11,
  l11: L14,
  l12: L12,
  l13: L06,
  l14: L15,
  l15: L13,
  l16: L16,
  l17: L17,
  l18: L18,
  graduation: Graduation,
}

export const LESSONS: { meta: LessonMeta; Comp: ComponentType }[] = CURRICULUM.map((meta) => {
  const Comp = COMPONENTS[meta.id]
  if (!Comp) throw new Error(`missing lesson component for ${meta.id}`)
  return { meta, Comp }
})
