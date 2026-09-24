import React, { useState, useMemo } from 'react';
import { Terminal, FileText, Search, X, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { TradeLog, TradeLogCategory } from '../types';

export function detectTradeLogInfo(log: TradeLog): {
  isTrade: boolean;
  category: TradeLogCategory;
  symbol?: string;
} {
  const msg = log.message || '';

  // 1. Extract Symbol if present
  let symbol = log.symbol;
  if (!symbol) {
    const symMatch = msg.match(/([a-zA-Z0-9\u4e00-\u9fa5]+USDT)/i);
    if (symMatch) {
      symbol = symMatch[1].toUpperCase();
    }
  }

  // 2. Explicit category
  if (log.category) {
    return { isTrade: true, category: log.category, symbol };
  }

  // 3. 平仓 (Close Position)
  if (
    /持仓已平|平仓成交价|平仓委托|市价平仓|步骤2完成.*持仓已平|检测到持仓单平仓完成|已平仓|全流程平仓出场/i.test(msg)
  ) {
    return { isTrade: true, category: 'CLOSE', symbol };
  }

  // 4. 风控触发 (Risk Triggered)
  if (
    /风控.*触发|风控全流程启动|风控全流程|自愈风控|时间风控.*超时|止盈风控.*触发|止损风控.*触发|触及止盈|触及止损|已达最大设定持仓时间|超时触发/i.test(msg)
  ) {
    return { isTrade: true, category: 'RISK_TRIGGER', symbol };
  }

  // 5. 风控设置 (Risk Setting)
  if (
    /风控设置|风控配置|风控策略|专属风控|保存.*风控|同步.*风控|主动风控.*参数|已为持仓激活时间风控|重置.*风控/i.test(msg)
  ) {
    return { isTrade: true, category: 'RISK_SETTING', symbol };
  }

  // 6. 开仓 (Open Position)
  if (
    /订单成交|下单成功|正在发送 .* 订单|快捷.*(做多|做空|买入|卖出)|市价做多|市价做空|限价做多|限价做空|成功开仓|开多|开空/i.test(msg) ||
    log.type === 'TRADE'
  ) {
    return { isTrade: true, category: 'OPEN', symbol };
  }

  return { isTrade: false, category: 'OPEN', symbol };
}

interface LogsModuleProps {
  logs: TradeLog[];
  tradeLogs: TradeLog[];
  isAutoCleanLogs: boolean;
  setIsAutoCleanLogs: (val: boolean) => void;
  autoCleanHours: number;
  setAutoCleanHours: (val: number) => void;
  onClearLogs: () => void;
  onClearTradeLogs: () => void;
  onAddLog: (message: string, type?: TradeLog['type']) => void;
}

export const LogsModule: React.FC<LogsModuleProps> = ({
  logs,
  tradeLogs,
  isAutoCleanLogs,
  setIsAutoCleanLogs,
  autoCleanHours,
  setAutoCleanHours,
  onClearLogs,
  onClearTradeLogs,
  onAddLog
}) => {
  const [activeTab, setActiveTab] = useState<'system' | 'trade'>('system');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | TradeLogCategory>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 200;

  // Filtered trade logs for the trade tab
  const filteredTradeLogs = useMemo(() => {
    // Combine tradeLogs with any detected trade logs from logs (deduplicated by id)
    const seen = new Set<string>();
    const combined: Array<TradeLog & { detectedCategory: TradeLogCategory; detectedSymbol?: string }> = [];

    // Prioritize direct tradeLogs
    for (const item of tradeLogs) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        const info = detectTradeLogInfo(item);
        combined.push({
          ...item,
          detectedCategory: item.category || info.category,
          detectedSymbol: item.symbol || info.symbol
        });
      }
    }

    // Extract trade logs from system logs stream
    for (const item of logs) {
      if (!seen.has(item.id)) {
        const info = detectTradeLogInfo(item);
        if (info.isTrade) {
          seen.add(item.id);
          combined.push({
            ...item,
            detectedCategory: item.category || info.category,
            detectedSymbol: item.symbol || info.symbol
          });
        }
      }
    }

    // Sort by timestamp DESC (newest first)
    combined.sort((a, b) => b.timestamp - a.timestamp);

    // Apply filters
    return combined.filter(item => {
      // 1. Category Filter
      if (selectedCategory !== 'ALL' && item.detectedCategory !== selectedCategory) {
        return false;
      }

      // 2. Keyword / Symbol Search
      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        const matchesMsg = item.message.toLowerCase().includes(query);
        const matchesSymbol = item.detectedSymbol ? item.detectedSymbol.toLowerCase().includes(query) : false;
        const matchesType = item.type.toLowerCase().includes(query);
        
        let categoryName = '';
        if (item.detectedCategory === 'OPEN') categoryName = '开仓';
        else if (item.detectedCategory === 'CLOSE') categoryName = '平仓';
        else if (item.detectedCategory === 'RISK_SETTING') categoryName = '风控设置';
        else if (item.detectedCategory === 'RISK_TRIGGER') categoryName = '风控触发';
        const matchesCategoryName = categoryName.includes(query);

        return matchesMsg || matchesSymbol || matchesType || matchesCategoryName;
      }

      return true;
    });
  }, [logs, tradeLogs, selectedCategory, searchTerm]);

  // Total pages
  const totalPages = Math.max(1, Math.ceil(filteredTradeLogs.length / pageSize));

  // Current page items
  const paginatedTradeLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTradeLogs.slice(start, start + pageSize);
  }, [filteredTradeLogs, currentPage, pageSize]);

  // Handle Tab Switch
  const handleTabChange = (tab: 'system' | 'trade') => {
    setActiveTab(tab);
    if (tab === 'trade') {
      setCurrentPage(1);
    }
  };

  // Helper for category badge styling
  const renderCategoryBadge = (category: TradeLogCategory) => {
    switch (category) {
      case 'OPEN':
        return (
          <span className="px-2 py-0.5 rounded text-[15px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
            开仓
          </span>
        );
      case 'CLOSE':
        return (
          <span className="px-2 py-0.5 rounded text-[15px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0">
            平仓
          </span>
        );
      case 'RISK_SETTING':
        return (
          <span className="px-2 py-0.5 rounded text-[15px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 shrink-0">
            风控设置
          </span>
        );
      case 'RISK_TRIGGER':
        return (
          <span className="px-2 py-0.5 rounded text-[15px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
            风控触发
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <section className="financial-card flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Header with Switcher in Red Box Position */}
      <div className="p-2.5 border-b border-[#232326] flex flex-wrap items-center justify-between gap-2 bg-[#1C1C1E]/30 shrink-0">
        <div className="flex items-center gap-2">
          {/* Tab Switcher */}
          <div className="flex items-center bg-[#141416] p-0.5 border border-[#232326] rounded-md">
            <button
              id="tab-btn-system-logs"
              onClick={() => handleTabChange('system')}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                activeTab === 'system'
                  ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Terminal size={13} className={activeTab === 'system' ? 'text-blue-400' : 'text-zinc-500'} />
              系统日志
            </button>
            <button
              id="tab-btn-trade-logs"
              onClick={() => handleTabChange('trade')}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                activeTab === 'trade'
                  ? 'bg-amber-600/30 text-amber-400 border border-amber-500/40 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <FileText size={13} className={activeTab === 'trade' ? 'text-amber-400' : 'text-zinc-500'} />
              交易日志
              {filteredTradeLogs.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === 'trade' ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {filteredTradeLogs.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {activeTab === 'system' ? (
            <>
              {/* 自动清理配置 */}
              <div className="flex items-center gap-1.5 bg-[#141416]/50 border border-[#232326] rounded-md px-2 py-1">
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input
                    id="auto-clean-logs-checkbox"
                    type="checkbox"
                    checked={isAutoCleanLogs}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setIsAutoCleanLogs(enabled);
                      onAddLog(`[系统] 自动清理日志已${enabled ? '开启' : '关闭'}`, 'INFO');
                    }}
                    className="rounded border-[#232326] text-blue-500 focus:ring-blue-500/30 w-3.5 h-3.5 bg-black/40 cursor-pointer accent-blue-500"
                  />
                  <span className="text-[10px] text-zinc-400 font-medium">自动清理</span>
                </label>
                {isAutoCleanLogs && (
                  <div className="flex items-center gap-1 border-l border-[#232326] pl-1.5 ml-0.5">
                    <input
                      id="auto-clean-logs-hours-input"
                      type="number"
                      min="1"
                      max="720"
                      value={autoCleanHours}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val > 0) {
                          setAutoCleanHours(val);
                        }
                      }}
                      className="w-9 text-[10px] bg-black/40 text-center text-zinc-300 border border-[#232326] rounded h-4.5 focus:ring-1 focus:ring-blue-500/30 focus:outline-none font-sans"
                    />
                    <span className="text-[10px] text-zinc-500">小时前</span>
                  </div>
                )}
              </div>

              <button
                id="btn-clear-system-logs"
                onClick={() => {
                  onClearLogs();
                  onAddLog('[系统] 手动清空系统日志', 'INFO');
                }}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer px-1.5 py-0.5"
              >
                清除日志
              </button>
            </>
          ) : (
            <button
              id="btn-clear-trade-logs"
              onClick={() => {
                if (window.confirm('确定要清空交易日志记录吗？')) {
                  onClearTradeLogs();
                  onAddLog('[交易日志] 已清空交易日志记录', 'INFO');
                }
              }}
              className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors cursor-pointer px-1.5 py-0.5 flex items-center gap-1"
            >
              <Trash2 size={11} />
              清空交易日志
            </button>
          )}
        </div>
      </div>

      {/* Trade Logs Subheader: Keyword Search & Category Filter */}
      {activeTab === 'trade' && (
        <div className="p-2 border-b border-[#232326] bg-[#141416]/50 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Keyword & Symbol Search Box */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              id="trade-log-search-input"
              type="text"
              placeholder="按币对名称 (如 BTCUSDT) 或关键字检索..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-7 pr-7 py-1 text-xs bg-black/40 border border-[#232326] rounded text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 font-sans"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto text-[11px] select-none py-0.5">
            <button
              onClick={() => { setSelectedCategory('ALL'); setCurrentPage(1); }}
              className={`px-2 py-0.5 rounded transition-colors ${
                selectedCategory === 'ALL'
                  ? 'bg-zinc-700 text-white font-medium'
                  : 'bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => { setSelectedCategory('OPEN'); setCurrentPage(1); }}
              className={`px-2 py-0.5 rounded transition-colors ${
                selectedCategory === 'OPEN'
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-medium'
                  : 'bg-zinc-900/60 text-zinc-400 hover:text-emerald-400'
              }`}
            >
              开仓
            </button>
            <button
              onClick={() => { setSelectedCategory('CLOSE'); setCurrentPage(1); }}
              className={`px-2 py-0.5 rounded transition-colors ${
                selectedCategory === 'CLOSE'
                  ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40 font-medium'
                  : 'bg-zinc-900/60 text-zinc-400 hover:text-blue-400'
              }`}
            >
              平仓
            </button>
            <button
              onClick={() => { setSelectedCategory('RISK_SETTING'); setCurrentPage(1); }}
              className={`px-2 py-0.5 rounded transition-colors ${
                selectedCategory === 'RISK_SETTING'
                  ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 font-medium'
                  : 'bg-zinc-900/60 text-zinc-400 hover:text-purple-400'
              }`}
            >
              风控设置
            </button>
            <button
              onClick={() => { setSelectedCategory('RISK_TRIGGER'); setCurrentPage(1); }}
              className={`px-2 py-0.5 rounded transition-colors ${
                selectedCategory === 'RISK_TRIGGER'
                  ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40 font-medium'
                  : 'bg-zinc-900/60 text-zinc-400 hover:text-amber-400'
              }`}
            >
              风控触发
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area (Yellow Box in Screenshot) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 font-mono text-[16.5px] space-y-2.5 custom-scrollbar bg-black/20">
        {activeTab === 'system' ? (
          /* System Logs Mode */
          logs.length === 0 ? (
            <div className="text-zinc-700 italic text-[15px]">等待系统操作...</div>
          ) : (
            logs.slice(0, 200).map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 leading-relaxed border-l-2 border-transparent hover:border-zinc-800 pl-1.5 transition-colors text-[16.5px]"
              >
                <span className="text-zinc-600 shrink-0 text-[15px]">
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </span>
                <span
                  className={`font-bold shrink-0 text-[15px] ${
                    log.type === 'SUCCESS'
                      ? 'text-emerald-500'
                      : log.type === 'ERROR'
                      ? 'text-red-500'
                      : log.type === 'TRADE'
                      ? 'text-blue-500'
                      : log.type === 'WARN'
                      ? 'text-amber-500'
                      : 'text-zinc-400'
                  }`}
                >
                  {log.type}
                </span>
                <span className="text-zinc-300 break-all flex-1 text-[16.5px]">{log.message}</span>
              </div>
            ))
          )
        ) : (
          /* Trade Logs Mode */
          paginatedTradeLogs.length === 0 ? (
            <div className="py-8 text-center text-zinc-500 space-y-1">
              <FileText size={28} className="mx-auto text-zinc-700 mb-2" />
              <div className="text-sm">
                {searchTerm || selectedCategory !== 'ALL'
                  ? '未检索到符合条件的交易日志记录'
                  : '暂无交易日志'}
              </div>
              <div className="text-[15px] text-zinc-600">
                系统将在开仓、平仓、风控设置以及风控触发时自动生成交易日志
              </div>
            </div>
          ) : (
            paginatedTradeLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2 leading-relaxed border-l-2 border-transparent hover:border-amber-500/40 pl-1.5 py-0.5 rounded-sm hover:bg-zinc-900/30 transition-colors text-[16.5px]"
              >
                <span className="text-zinc-500 shrink-0 text-[15px] mt-0.5">
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </span>

                {/* Category Badge */}
                {renderCategoryBadge(log.detectedCategory)}

                {/* Detected Symbol Tag */}
                {log.detectedSymbol && (
                  <span className="px-1.5 py-0.5 rounded text-[15px] bg-zinc-800/80 text-zinc-300 font-mono border border-zinc-700/50 shrink-0">
                    {log.detectedSymbol}
                  </span>
                )}

                {/* Log Type */}
                <span
                  className={`font-bold shrink-0 text-[15px] mt-0.5 ${
                    log.type === 'SUCCESS'
                      ? 'text-emerald-400'
                      : log.type === 'ERROR'
                      ? 'text-red-400'
                      : log.type === 'TRADE'
                      ? 'text-blue-400'
                      : log.type === 'WARN'
                      ? 'text-amber-400'
                      : 'text-zinc-400'
                  }`}
                >
                  {log.type}
                </span>

                {/* Message */}
                <span className="text-zinc-200 break-all flex-1 text-[16.5px]">{log.message}</span>
              </div>
            ))
          )
        )}
      </div>

      {/* Pagination Footer for Trade Logs (at bottom of yellow box area) */}
      {activeTab === 'trade' && filteredTradeLogs.length > 0 && (
        <div className="p-2 border-t border-[#232326] bg-[#141416]/80 flex items-center justify-between text-xs text-zinc-400 shrink-0 select-none">
          <div className="text-[11px] text-zinc-500">
            共 <span className="text-amber-400 font-semibold">{filteredTradeLogs.length}</span> 条记录
            <span className="ml-2 text-zinc-600">(每页 {pageSize} 条)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              id="trade-log-prev-page"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-2 py-0.5 rounded border border-[#232326] bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed text-[11px] flex items-center gap-1 transition-colors"
            >
              <ChevronLeft size={12} />
              上一页
            </button>

            <span className="text-[11px] font-mono px-1.5 text-zinc-300">
              {currentPage} / {totalPages}
            </span>

            <button
              id="trade-log-next-page"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-2 py-0.5 rounded border border-[#232326] bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed text-[11px] flex items-center gap-1 transition-colors"
            >
              下一页
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
