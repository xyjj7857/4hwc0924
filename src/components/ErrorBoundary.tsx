import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B0E14] text-zinc-200 flex flex-col items-center justify-center p-6 font-sans">
          <div className="max-w-xl w-full bg-[#141416] border border-red-500/40 rounded-2xl p-8 shadow-2xl shadow-red-500/10 space-y-6">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
                <AlertTriangle size={28} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">程序运行发生非致命异常</h1>
                <p className="text-xs text-zinc-400 mt-0.5">界面已启用全局安全沙箱防护，防止黑屏崩溃</p>
              </div>
            </div>

            <div className="bg-[#0D0D0E] p-4 rounded-xl border border-zinc-800 text-xs font-mono space-y-2">
              <div className="text-rose-400 font-semibold">
                {this.state.error?.name || 'Error'}: {this.state.error?.message || '未知错误'}
              </div>
              {this.state.error?.stack && (
                <div className="max-h-40 overflow-y-auto text-zinc-500 text-[11px] whitespace-pre-wrap custom-scrollbar">
                  {this.state.error.stack.split('\n').slice(0, 5).join('\n')}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('app_active_main_tab');
                  } catch {}
                  window.location.reload();
                }}
                className="text-xs text-zinc-400 hover:text-zinc-200 underline transition-colors cursor-pointer"
              >
                清理临时缓存并刷新
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:brightness-110 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>立即刷新恢复</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
