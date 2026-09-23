// 配合余量经验值表（可编辑，来源：木工经验值，非标准规范）
import type { Fit, Wood } from '../types'

/**
 * 榫厚修正表（mm）：
 * 紧配合 → 正过盈（装的时候要敲，胶合面压力大）
 * 标准配合 → 不增减（榫厚 = 料厚/3）
 * 松配合 → 负偏差（留胶层，适合吸水膨胀大的软木）
 */
export type FitTable = Record<Wood, Record<Fit, number>>

export const DEFAULT_FIT_TABLE: FitTable = Object.freeze({
  hardwood: Object.freeze({ tight: 0.2, standard: 0, loose: -0.3 }),
  softwood: Object.freeze({ tight: 0.3, standard: 0, loose: -0.4 }),
})

export const FIT_LABEL: Record<Fit, string> = {
  tight: '紧',
  standard: '标准',
  loose: '松',
}

export const WOOD_LABEL: Record<Wood, string> = {
  softwood: '软木',
  hardwood: '硬木',
}

const STORAGE_KEY = 'wjb.fittable.v1'
const WOODS: Wood[] = ['hardwood', 'softwood']
const FITS: Fit[] = ['tight', 'standard', 'loose']

function cloneDefaults(): FitTable {
  return {
    hardwood: { ...DEFAULT_FIT_TABLE.hardwood },
    softwood: { ...DEFAULT_FIT_TABLE.softwood },
  }
}

/**
 * 逐格校验：任何一格缺失/不是有限数，都用出厂默认值补上。
 * 保证六格（2 木种 × 3 配合）永远有数，NaN/字符串/null 不会漏进计算与输入框。
 */
export function normalizeFitTable(data: unknown): FitTable {
  const out = cloneDefaults()
  if (data && typeof data === 'object') {
    const src = data as Partial<Record<Wood, Partial<Record<Fit, unknown>>>>
    for (const w of WOODS) {
      for (const f of FITS) {
        const v = src[w]?.[f]
        if (typeof v === 'number' && Number.isFinite(v)) {
          out[w][f] = v
        }
      }
    }
  }
  return out
}

/**
 * 读余量表：
 * - 无数据 → 出厂默认表
 * - JSON 损坏 / 结构异常 → 整体回退出厂默认表
 * - 只缺个别格 → 逐格补默认值，其余用户值保留
 * 读入后会把修好的表写回 localStorage（自愈），存储不可用时静默忽略，
 * 保证任何坏数据都不会把编辑器带崩。
 */
export function loadFitTable(): FitTable {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return cloneDefaults()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    const fallback = cloneDefaults()
    persistFitTable(fallback)
    return fallback
  }

  const table = normalizeFitTable(parsed)
  // 原始数据缺格/带脏值时写回，使缺格永久补上
  if (JSON.stringify(table) !== raw) persistFitTable(table)
  return table
}

function persistFitTable(t: FitTable): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t))
  } catch {
    // 隐私模式/配额满等情况下存储不可用：本次会话仍可用内存中的表
  }
}

export function saveFitTable(t: FitTable): void {
  // 保存入口同样归一化，持久化的表永远六格齐全
  persistFitTable(normalizeFitTable(t))
}

export function fitDelta(table: FitTable, wood: Wood, fit: Fit): number {
  const v = table?.[wood]?.[fit]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
