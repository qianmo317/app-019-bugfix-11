// 错误边界：子组件渲染抛错时显示可恢复提示，而不是整页白屏
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '../../src/components/ErrorBoundary'

function Boom(): never {
  throw new Error('模拟渲染崩溃')
}

describe('ErrorBoundary', () => {
  it('正常渲染子组件', () => {
    render(
      <ErrorBoundary>
        <div data-testid="ok">内容</div>
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('ok')).toBeInTheDocument()
    expect(screen.queryByTestId('app-error')).toBeNull()
  })

  it('子组件抛错 → 捕获并展示兜底 UI，不白屏', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('app-error')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByTestId('app-error-retry')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('点「重试」后错误状态清除，可重新渲染子树', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let shouldThrow = true
    function MaybeBoom() {
      if (shouldThrow) throw new Error('临时错误')
      return <div data-testid="recovered">恢复</div>
    }
    const { rerender } = render(
      <ErrorBoundary>
        <MaybeBoom />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('app-error')).toBeInTheDocument()
    // 下一帧子树不再抛错后点重试，错误状态清除并正常渲染
    shouldThrow = false
    screen.getByTestId('app-error-retry').click()
    rerender(
      <ErrorBoundary>
        <MaybeBoom />
      </ErrorBoundary>,
    )
    expect(screen.getByTestId('recovered')).toBeInTheDocument()
    expect(screen.queryByTestId('app-error')).toBeNull()
    spy.mockRestore()
  })
})
