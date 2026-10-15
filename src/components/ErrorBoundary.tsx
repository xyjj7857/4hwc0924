import React, { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: any;
}

// @ts-ignore
export class ErrorBoundary extends (React.Component as new (...args: any[]) => any) {
  constructor(props: Props) {
    super(props);
    (this as any).state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  handleReset = () => {
    (this as any).setState({ hasError: false, error: null });
  };

  render() {
    if ((this as any).state.hasError) {
      return (
        <div className="p-4 rounded-xl bg-[#1A1A1E] border border-red-500/40 text-zinc-300 text-xs flex flex-col items-center justify-center gap-3 my-2 shadow-lg">
          <div className="flex items-center gap-2 text-red-400 font-bold">
            <AlertTriangle size={18} />
            <span>{(this as any).props.fallbackTitle || '组件加载出现异常，已安全隔离以防黑屏'}</span>
          </div>
          <p className="text-zinc-500 font-mono text-[11px] max-w-lg text-center truncate">
            {(this as any).state.error?.message || '未知渲染错误'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="px-4 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white font-bold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw size={14} />
            <span>重新加载</span>
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export default ErrorBoundary;
