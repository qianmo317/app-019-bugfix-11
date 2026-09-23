// 配合余量表：六格永远有值；坏数据 / 缺格一律回退出厂默认且不抛错
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_FIT_TABLE,
  FITS,
  WOODS,
  cloneDefaultTable,
  fitDelta,
  loadFitTable,
  normalizeFitTable,
  saveFitTable,
} from '../../src/lib/fit'
import { computeJoint } from '../../src/lib/calc'
import type { Joint } from '../../src/types'

const KEY = 'wjb.fittable.v1'

function writeStored(v: unknown) {
  localStorage.setItem(KEY, typeof v === 'string' ? v : JSON.stringify(v))
}

beforeEach(() => {
  localStorage.clear()
})

describe('正常路径', () => {
  it('首次使用（无存储）→ 返回出厂默认表', () => {
    expect(loadFitTable()).toEqual(DEFAULT_FIT_TABLE)
  })

  it('完整合法的表 → 原值保留', () => {
    const t = cloneDefaultTable()
    t.hardwood.tight = 0.25
    writeStored(t)
    expect(loadFitTable()).toEqual(t)
  })

  it('返回的表是独立副本，改动不污染出厂常量', () => {
    const t = loadFitTable()
    t.hardwood.tight = 9
    expect(DEFAULT_FIT_TABLE.hardwood.tight).toBe(0.2)
    expect(cloneDefaultTable().hardwood.tight).toBe(0.2)
  })
})

describe('缺格逐格补默认（六格永远有数）', () => {
  it('只缺一个格子（备份表少一格）→ 该格补默认，其余保留', () => {
    const partial = {
      hardwood: { tight: 0.25, standard: 0 /* loose 缺失 */ },
      softwood: { tight: 0.3, standard: 0, loose: -0.4 },
    }
    writeStored(partial)
    const t = loadFitTable()
    expect(t.hardwood.loose).toBe(DEFAULT_FIT_TABLE.hardwood.loose) // -0.3
    expect(t.hardwood.tight).toBe(0.25) // 自定义值保留
    expect(t.softwood).toEqual(DEFAULT_FIT_TABLE.softwood)
  })

  it('整行缺失 → 整行补默认', () => {
    writeStored({ hardwood: { tight: 0.1, standard: 0, loose: -0.1 } })
    const t = loadFitTable()
    expect(t.hardwood.loose).toBe(-0.1)
    expect(t.softwood).toEqual(DEFAULT_FIT_TABLE.softwood)
  })

  it('任何形态的输入经 normalize 后六格都是有限数字', () => {
    const cases: unknown[] = [
      null,
      undefined,
      42,
      'x',
      [],
      {},
      { hardwood: null },
      { hardwood: 7, softwood: 'x' },
      { hardwood: { tight: 'x', standard: NaN, loose: null }, softwood: {} },
      { hardwood: { tight: Infinity, standard: 1 / 0, loose: -Infinity } },
      { hardwood: { tight: 0.2 }, softwood: { standard: 0 } },
    ]
    for (const c of cases) {
      const t = normalizeFitTable(c)
      for (const w of WOODS) {
        for (const f of FITS) {
          expect(Number.isFinite(t[w][f]), `${w}/${f}`).toBe(true)
        }
      }
    }
  })
})

describe('坏数据不崩页面（回退默认表，继续可用）', () => {
  it('损坏的 JSON → 不抛错，返回出厂默认表', () => {
    writeStored('{bad json')
    expect(() => loadFitTable()).not.toThrow()
    expect(loadFitTable()).toEqual(DEFAULT_FIT_TABLE)
  })

  it('根节点是非法 JSON 值（null/数字）→ 回退默认', () => {
    writeStored('null')
    expect(loadFitTable()).toEqual(DEFAULT_FIT_TABLE)
    writeStored('123')
    expect(loadFitTable()).toEqual(DEFAULT_FIT_TABLE)
  })

  it('localStorage 抛错（隐私模式等）→ 不抛错，返回默认表', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => loadFitTable()).not.toThrow()
    expect(loadFitTable()).toEqual(DEFAULT_FIT_TABLE)
    spy.mockRestore()
  })
})

describe('保存与查表', () => {
  it('saveFitTable 落盘前补全缺格', () => {
    saveFitTable({ hardwood: { tight: 0.1 }, softwood: {} } as never)
    expect(loadFitTable()).toEqual({
      hardwood: { tight: 0.1, standard: 0, loose: -0.3 },
      softwood: DEFAULT_FIT_TABLE.softwood,
    })
  })

  it('fitDelta 对坏表逐格回落默认值', () => {
    expect(fitDelta(null as never, 'hardwood', 'tight')).toBe(0.2)
    expect(fitDelta({ hardwood: { tight: undefined } } as never, 'hardwood', 'tight')).toBe(0.2)
    expect(fitDelta(cloneDefaultTable(), 'softwood', 'loose')).toBe(-0.4)
  })
})

describe('直榫出图链路：坏余量表不产生 NaN', () => {
  const joint: Joint = {
    kind: 'mortise-tenon',
    params: {
      boardA: { thickness: 20, width: 120 },
      boardB: { thickness: 18, width: 120 },
      wood: 'hardwood',
      fit: 'tight',
      kerfMm: 1.1,
    },
    notes: [],
  }

  it('存储里是坏 JSON → 榫厚/肩宽/榫宽仍是有效数字（默认紧配 +0.2 → 6.9）', () => {
    writeStored('{bad json')
    const r = computeJoint(joint)
    expect(r.tenon!.tenonThickness).toBe(6.9)
    expect(Number.isFinite(r.tenon!.shoulder)).toBe(true)
    expect(Number.isFinite(r.tenon!.tenonWidth)).toBe(true)
  })

  it('存储里只缺 hardwood.tight 一格 → 该格取默认 0.2，结果与默认表一致', () => {
    writeStored({ hardwood: { standard: 0, loose: -0.3 }, softwood: cloneDefaultTable().softwood })
    const r = computeJoint(joint)
    expect(r.tenon!.tenonThickness).toBe(6.9)
  })
})
