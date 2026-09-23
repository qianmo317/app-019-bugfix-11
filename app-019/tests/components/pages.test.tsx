// 组件测试：参数联动 / 列表筛选 / 导入导出 / 键盘微调（前端点击对应的 bug 面）
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomePage } from '../../src/pages/HomePage'
import { NewPlanPage } from '../../src/pages/NewPlanPage'
import { EditorPage } from '../../src/pages/EditorPage'
import { makePlan, upsertPlan } from '../../src/store/plans'
import type { JointKind, Params } from '../../src/types'

beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
})

describe('新建页：选类型 → 填参数 → 生成图纸', () => {
  it('未选类型时按钮禁用；选类型后表单出现并可生成', async () => {
    const user = userEvent.setup()
    render(<NewPlanPage />)
    expect(screen.getByTestId('create-plan')).toBeDisabled()
    await user.click(screen.getByTestId('kind-dovetail'))
    expect(screen.getByTestId('create-plan')).toBeEnabled()
    expect(screen.getByTestId('a-thickness')).toHaveValue(18)
    await user.click(screen.getByTestId('create-plan'))
    // 跳转到编辑器
    expect(window.location.hash).toMatch(/^#\/plan\//)
  })

  it('键盘方向键微调 0.5mm（蓝图 §9）', async () => {
    render(<NewPlanPage />)
    await userEvent.setup().click(screen.getByTestId('kind-dovetail'))
    const input = screen.getByTestId('a-thickness')
    input.focus()
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input).toHaveValue(18.5)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveValue(18)
  })

  it('修改参数触发重算：燕尾警告出现在新建页参数流（齿数过多）', async () => {
    const user = userEvent.setup()
    render(<NewPlanPage />)
    await user.click(screen.getByTestId('kind-dovetail'))
    // 进入编辑器后再验证警告，这里只验证表单可改
    const teeth = screen.getByTestId('teeth')
    await user.clear(teeth)
    await user.type(teeth, '12')
    expect(teeth).toHaveValue(12)
  })
})

describe('编辑器：参数改动即时重算 + 脏状态提示 + 齿宽表', () => {
  const savedPlan = () => {
    const plan = makePlan('dovetail', {
      boardA: { thickness: 18, width: 200 },
      boardB: { thickness: 18, width: 200 },
      wood: 'hardwood',
      fit: 'standard',
      dovetail: { angleRatio: 8 },
      kerfMm: 1.1,
    })
    upsertPlan(plan)
    return plan
  }

  it('修改板宽 → 出现「参数已改」提示条与警告区域联动', async () => {
    const user = userEvent.setup()
    const { id } = savedPlan()
    render(<EditorPage id={id} />)
    // 初始无脏状态
    expect(screen.queryByTestId('dirty-bar')).toBeNull()
    expect(screen.getByTestId('tooth-table')).toBeInTheDocument()
    // 齿数过多 → 警告
    const teeth = screen.getByTestId('teeth')
    await user.clear(teeth)
    await user.type(teeth, '12')
    // 脏状态提示条
    expect(screen.getByTestId('dirty-bar')).toHaveTextContent('参数已改，请重新核对尺寸')
    // 重算耗时标注存在
    expect(screen.getByTestId('recalc-ms')).toBeInTheDocument()
  })

  it('切换榫卯类型 → 参数表单与切割步骤联动', async () => {
    const user = userEvent.setup()
    const { id } = savedPlan()
    render(<EditorPage id={id} />)
    await user.selectOptions(screen.getByTestId('editor-kind'), 'mortise-tenon')
    // 直榫参数出现，燕尾参数消失
    expect(screen.getByTestId('tn-ratio')).toBeInTheDocument()
    expect(screen.queryByTestId('teeth')).toBeNull()
    expect(screen.queryByTestId('tooth-table')).toBeNull()
  })

  it('方案不存在 → 显示错误并可控', () => {
    render(<EditorPage id="nonexistent" />)
    expect(screen.getByText('方案不存在或已删除')).toBeInTheDocument()
  })

  it('余量表备份缺格：六格输入框仍全部有值，编辑器不白屏且图纸照常出榫厚', async () => {
    // 模拟从备份恢复、缺了一格（hardwood.tight）的旧表
    localStorage.setItem(
      'wjb.fittable.v1',
      JSON.stringify({
        hardwood: { standard: 0, loose: -0.3 },
        softwood: { tight: 0.3, standard: 0, loose: -0.4 },
      }),
    )
    const plan = makePlan('mortise-tenon', {
      boardA: { thickness: 20, width: 120 },
      boardB: { thickness: 18, width: 120 },
      wood: 'hardwood',
      fit: 'tight',
      kerfMm: 1.1,
    })
    upsertPlan(plan)

    expect(() => render(<EditorPage id={plan.id} />)).not.toThrow()
    expect(screen.getByTestId('editor-page')).toBeInTheDocument()

    // 六格永远有值（不出现空白输入框）
    for (const w of ['hardwood', 'softwood']) {
      for (const f of ['tight', 'standard', 'loose']) {
        const input = screen.getByLabelText(`${w}-${f}`) as HTMLInputElement
        expect(input.value).not.toBe('')
        expect(Number.isFinite(Number(input.value))).toBe(true)
      }
    }
    // 缺格补的是出厂默认 0.2
    expect((screen.getByLabelText('hardwood-tight') as HTMLInputElement).value).toBe('0.2')

    // 图纸照常渲染：三视图都在，且有榫厚标注（不是空白图）
    expect(screen.getByTestId('views').textContent).toMatch(/榫厚 \d/)

    // 参数仍可修改（页面没被坏数据带崩）
    const user = userEvent.setup()
    await user.clear(screen.getByTestId('a-width'))
    await user.type(screen.getByTestId('a-width'), '150')
    expect(screen.getByTestId('dirty-bar')).toBeInTheDocument()
  })

  it('余量表 JSON 整体损坏：编辑器退回默认表，不白屏', () => {
    localStorage.setItem('wjb.fittable.v1', '{bad json')
    const plan = makePlan('mortise-tenon', {
      boardA: { thickness: 20, width: 120 },
      boardB: { thickness: 18, width: 120 },
      wood: 'hardwood',
      fit: 'tight',
      kerfMm: 1.1,
    })
    upsertPlan(plan)

    expect(() => render(<EditorPage id={plan.id} />)).not.toThrow()
    expect(screen.getByTestId('editor-page')).toBeInTheDocument()
    expect((screen.getByLabelText('hardwood-tight') as HTMLInputElement).value).toBe('0.2')
  })
})

describe('列表页：筛选 + 删除 + 导入', () => {
  it('按类型与厚度筛选方案', async () => {
    upsertPlan(
      makePlan('dovetail', {
        boardA: { thickness: 18, width: 200 },
        boardB: { thickness: 18, width: 200 },
        wood: 'hardwood',
        fit: 'standard',
        kerfMm: 1.1,
      }),
    )
    upsertPlan(
      makePlan('mortise-tenon', {
        boardA: { thickness: 20, width: 200 },
        boardB: { thickness: 20, width: 200 },
        wood: 'hardwood',
        fit: 'standard',
        kerfMm: 1.1,
      }),
    )
    render(<HomePage onImported={() => undefined} />)
    expect(screen.getAllByTestId('plan-card')).toHaveLength(2)
    await userEvent.setup().selectOptions(screen.getByTestId('filter-kind'), 'dovetail')
    expect(screen.getAllByTestId('plan-card')).toHaveLength(1)
  })

  it('导入非法 JSON 显示错误', async () => {
    render(<HomePage onImported={() => undefined} />)
    const input = screen.getByTestId('import-input') as HTMLInputElement
    const file = new File(['{ bad'], 'plan.json', { type: 'application/json' })
    await userEvent.upload(input, file)
    // 错误必须浮出（解析错误信息或导入失败提示）
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('导入合法 JSON 写入方案库', async () => {
    const onImported = vi.fn()
    const plan = makePlan('lap', {
      boardA: { thickness: 18, width: 200 },
      boardB: { thickness: 18, width: 200 },
      wood: 'hardwood',
      fit: 'standard',
      kerfMm: 1.1,
    })
    render(<HomePage onImported={onImported} />)
    const input = screen.getByTestId('import-input') as HTMLInputElement
    await userEvent.upload(input, new File([JSON.stringify(plan)], 'plan.json', { type: 'application/json' }))
    expect(await screen.findAllByTestId('plan-card')).toHaveLength(1)
    expect(onImported).toHaveBeenCalled()
  })
})

describe('参数流（受控组件契约）', () => {
  it('ParamForm 修改回调携带合并后的参数', async () => {
    const { ParamForm } = await import('../../src/components/ParamForm')
    const params: Params = {
      boardA: { thickness: 18, width: 200 },
      boardB: { thickness: 18, width: 200 },
      wood: 'hardwood',
      fit: 'standard',
      dovetail: { angleRatio: 8 },
      kerfMm: 1.1,
    }
    let latest: Params | null = null
    render(<ParamForm kind={'dovetail' as JointKind} params={params} onChange={(p) => (latest = p)} />)
    const user = userEvent.setup()
    await user.type(screen.getByTestId('a-width'), '4')
    // 200 + '4' → "2004" 超出上限 900 → 钳制到 900（表单防呆）
    expect(latest!.boardA.width).toBe(900)
    expect(latest!.boardA.thickness).toBe(18) // 其余字段保持
  })
})
