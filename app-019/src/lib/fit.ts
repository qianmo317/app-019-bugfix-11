// 配合余量经验值表（可编辑，来源：木工经验值，非标准规范）
import type { Fit, Wood } from '../types'

/**
 * 榫厚修正表（mm）：
 * 紧配合 → 正过盈（装的时候要敲，胶合面压力大）
 * 标准配合 → 不增减（榫厚 = 料厚/3）
 * 松配合 → 负偏差（留胶层，适合吸水膨胀大的软木）
 */
export type FitTable = Record<Wood, Record<Fit, number>>

export const WOODS: Wood[] = ['hardwood', 'softwood']
export const FITS: Fit[] = ['tight', 'standard', 'loose']

export const DEFAULT_FIT_TABLE: FitTable = {
  hardwood: { tight: 0.2, standard: 0, loose: -0.3 },
  softwood: { tight: 0.3, standard: 0, loose: -0.4 },
}

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

/** 出厂默认表的独立副本（避免调用方改到常量） */
export function cloneDefaultTable(): FitTable {
  return {
    hardwood: { ...DEFAULT_FIT_TABLE.hardwood },
    softwood: { ...DEFAULT_FIT_TABLE.softwood },
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null
}

/**
 * 逐格清洗任意来源的数据：缺格 / 非数字 / NaN / 结构不对，
 * 该格一律按出厂默认补齐，保证返回的表六格永远是有效数字。
 */
export function normalizeFitTable(input: unknown): FitTable {
  const root = asRecord(input)
  const table = cloneDefaultTable()
  for (const wood of WOODS) {
    const row = asRecord(root?.[wood])
    if (!row) continue
    for (const fit of FITS) {
      const v = row[fit]
      if (typeof v === 'number' && Number.isFinite(v)) {
        table[wood][fit] = v
      }
    }
  }
  return table
}

/**
 * 读取余量表：任何异常（存储不可用、JSON 损坏、结构缺失）都退回出厂默认表，
 * 绝不向调用方抛错——渲染期调用也不能把编辑器带崩。
 */
export function loadFitTable(): FitTable {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return cloneDefaultTable()
    return normalizeFitTable(JSON.parse(raw) as unknown)
  } catch {
    return cloneDefaultTable()
  }
}

/** 保存前同样逐格清洗，落盘的永远是六格完整的有效表 */
export function saveFitTable(t: FitTable): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeFitTable(t)))
}

/** 查表：表本身异常时该格回落出厂默认，保证直榫计算拿到的永远是数字 */
export function fitDelta(table: FitTable, wood: Wood, fit: Fit): number {
  const v = table?.[wood]?.[fit]
  return typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_FIT_TABLE[wood][fit]
}
