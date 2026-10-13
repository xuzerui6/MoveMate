/**
 * ErrorBoundary —— 捕获子组件渲染错误，防止白屏
 */
import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] 组件渲染错误:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="ui-components-errorboundary-inline-0">
          <div className="ui-components-errorboundary-inline-1">😵</div>
          <h2 className="ui-components-errorboundary-inline-2">
            页面加载出错
          </h2>
          <p className="ui-components-errorboundary-inline-3">
            {this.state.error?.message || '发生了未知错误，请刷新页面重试'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = '/';
            }}
            className="ui-components-errorboundary-inline-4"
          >
            返回首页
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
