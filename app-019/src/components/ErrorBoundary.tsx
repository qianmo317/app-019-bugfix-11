// 全局错误边界：任何页面渲染异常都显示可恢复提示，绝不整页白屏
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('页面渲染异常：', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="page" data-testid="app-error">
        <p className="error" role="alert">页面数据异常，已安全停下，不会影响已保存的方案。</p>
        <p className="note">{error.message}</p>
        <div className="actions">
          <button
            className="btn btn-primary"
            data-testid="app-error-retry"
            onClick={() => this.setState({ error: null })}
          >
            重试
          </button>
          <button className="btn" onClick={() => { window.location.hash = '#/' }}>
            回方案列表
          </button>
        </div>
      </div>
    )
  }
}
