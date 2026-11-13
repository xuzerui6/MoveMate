/**
 * RouteErrorBoundary —— 单页级的错误兜底（与全站 ErrorBoundary 分工）。
 *
 * 全站边界的问题是任何一页渲染/加载出错都整页报废、且只能整页刷新恢复。
 * 局详情页套一层本组件后：本页出错只降级成本页的一块重试面板（原地重试 =
 * 重新挂载本页），不牵连其他页面；resetKey（局 id）变化时自动复位，
 * 从一个局跳到另一个局不会把上一个局的错误带过去。
 */
import React from 'react';

interface Props {
  resetKey?: string;
  onBack?: () => void;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  attempt: number;
  seenResetKey?: string;
}

class RouteErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, attempt: 0, seenResetKey: props.resetKey };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.seenResetKey) {
      return { hasError: false, seenResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[RouteErrorBoundary] 页面渲染错误:', error, info);
  }

  private retry = (): void => {
    this.setState((s) => ({ hasError: false, attempt: s.attempt + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="game-detail-page">
          <div className="empty-state">
            <h3>这一页刚才没打开</h3>
            <p>可能是网络抖了一下，或者刚更新完版本。再试一次就好。</p>
            <button className="btn btn--primary" onClick={this.retry}>再试一次</button>
            {this.props.onBack && (
              <button className="btn btn--secondary" onClick={this.props.onBack}>回组局列表</button>
            )}
          </div>
        </div>
      );
    }
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}

export default RouteErrorBoundary;
