import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Bell, 
  RefreshCw, 
  Trash2, 
  Search, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Zap,
  Copy,
  Check,
  ClipboardList
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Position } from '../types';
import { matchSymbolWithPositions } from '../utils/entryVerification';

export interface AlertLogItem {
  id: number;
  trigger_time: number | string;
  symbol: string;
  board_name: string;
  change_val: string;
  volume_15m: number | null;
}

interface BoardRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSymbol?: (symbol: string) => void;
  positions?: Position[];
}

export default function BoardRecordModal({ isOpen, onClose, onSelectSymbol, positions = [] }: BoardRecordModalProps) {
  const [alertLogs, setAlertLogs] = useState<AlertLogItem[]>([]);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [dateFilter, setDateFilter] = useState<string>('');
  const [boardFilter, setBoardFilter] = useState<string>('');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [copiedSymbol, setCopiedSymbol] = useState<string | null>(null);

  const ITEMS_PER_PAGE = 15;

  const fetchAlertLogs = useCallback(async () => {
    setIsFetching(true);
    try {
      let url = '/api/alert-logs';
      const params = new URLSearchParams();
      if (dateFilter) params.append('date', dateFilter);
      if (boardFilter) params.append('boardName', boardFilter);
      const queryStr = params.toString();
      if (queryStr) url += `?${queryStr}`;

      const res = await fetch(url);
      if (res.ok) {
        const list: AlertLogItem[] = await res.json();
        setAlertLogs(list);
      }
    } catch (err) {
      console.error('Failed to fetch alert logs in modal:', err);
    } finally {
      setIsFetching(false);
    }
  }, [dateFilter, boardFilter]);

  // 当弹窗打开或筛选条件变化时拉取数据
  useEffect(() => {
    if (isOpen) {
      fetchAlertLogs();
      setCurrentPage(1);
    }
  }, [isOpen, fetchAlertLogs]);

  // 监听 ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleClearAlertLogs = async () => {
    if (!window.confirm('您确定要清空数据库中的全部历史榜单报警记录吗？此操作不可恢复。')) return;
    try {
      const res = await fetch('/api/alert-logs/clear', { method: 'POST' });
      if (res.ok) {
        setAlertLogs([]);
        setCurrentPage(1);
      }
    } catch (err) {
      console.error('Failed to clear alert logs:', err);
    }
  };

  const handleCopySymbol = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(sym);
    setCopiedSymbol(sym);
    setTimeout(() => {
      setCopiedSymbol(null);
    }, 1500);
  };

  // 前端合约名称模糊搜索过滤
  const filteredLogs = alertLogs.filter(log => {
    if (!searchKeyword.trim()) return true;
    const kw = searchKeyword.trim().toUpperCase();
    return log.symbol.toUpperCase().includes(kw);
  });

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));
  const currentLogs = filteredLogs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const formatTriggerTime = (time: number | string) => {
    try {
      const d = typeof time === 'string' && !isNaN(Number(time)) ? new Date(Number(time)) : new Date(time);
      if (isNaN(d.getTime())) return String(time);
      return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch {
      return String(time);
    }
  };

  const getBoardBadge = (boardName: string) => {
    if (boardName.includes('涨幅')) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <TrendingUp size={11} />
          {boardName}
        </span>
      );
    }
    if (boardName.includes('跌幅')) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
          <TrendingDown size={11} />
          {boardName}
        </span>
      );
    }
    if (boardName.includes('放量')) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
          <Zap size={11} />
          {boardName}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <Activity size={11} />
        {boardName}
      </span>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
          {/* Modal Card */}
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            className="w-full max-w-5xl max-h-[90vh] bg-[#141416] border border-[#27272B] rounded-2xl shadow-2xl flex flex-col overflow-hidden select-none"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#232326] bg-[#18181B]/70 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm shadow-amber-500/10">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-bold text-white tracking-wide">榜单记录</h2>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold font-mono">
                      历史价格报警
                    </span>
                    <span className="text-xs text-zinc-500 font-mono hidden sm:inline">
                      ({filteredLogs.length} 条)
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    展示监控系统在各扫描周期（15m / 4h / 1h放量）中触发并归档的价格警报与榜单异动
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-[#202024] hover:bg-[#2A2A30] text-zinc-400 hover:text-white border border-[#2D2D33] flex items-center justify-center transition-colors cursor-pointer"
                  title="关闭 (Esc)"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Filter & Action Toolbar */}
            <div className="p-4 border-b border-[#232326] bg-[#161619] flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* 日期过滤 */}
                <div className="flex items-center gap-2 bg-[#1C1C20] px-3 py-1.5 rounded-lg border border-[#2B2B30]">
                  <Calendar size={13} className="text-zinc-500" />
                  <span className="text-[11px] text-zinc-500 font-medium">日期:</span>
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={e => {
                      setDateFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-transparent text-xs text-zinc-200 outline-none cursor-pointer"
                  />
                  {dateFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        setDateFilter('');
                        setCurrentPage(1);
                      }}
                      className="text-[10px] text-zinc-500 hover:text-white px-1 font-bold cursor-pointer transition-colors"
                      title="清除日期筛选"
                    >
                      清除
                    </button>
                  )}
                </div>

                {/* 榜单过滤 */}
                <div className="flex items-center gap-2 bg-[#1C1C20] px-3 py-1.5 rounded-lg border border-[#2B2B30]">
                  <span className="text-[11px] text-zinc-500 font-medium">榜单:</span>
                  <select
                    value={boardFilter}
                    onChange={e => {
                      setBoardFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-transparent text-xs text-zinc-200 outline-none border-none cursor-pointer focus:outline-none"
                  >
                    <option value="" className="bg-[#1C1C20] text-zinc-300">全部榜单</option>
                    <option value="15分钟涨幅榜" className="bg-[#1C1C20] text-emerald-400">15分钟涨幅榜</option>
                    <option value="15分钟跌幅榜" className="bg-[#1C1C20] text-rose-400">15分钟跌幅榜</option>
                    <option value="15分钟振幅榜" className="bg-[#1C1C20] text-amber-400">15分钟振幅榜</option>
                    <option value="4小时涨幅榜" className="bg-[#1C1C20] text-emerald-400">4小时涨幅榜</option>
                    <option value="4小时跌幅榜" className="bg-[#1C1C20] text-rose-400">4小时跌幅榜</option>
                    <option value="4小时振幅榜" className="bg-[#1C1C20] text-amber-400">4小时振幅榜</option>
                    <option value="1小时放量榜" className="bg-[#1C1C20] text-cyan-400">1小时放量榜</option>
                    <option value="24小时涨幅榜" className="bg-[#1C1C20] text-emerald-400">24小时涨幅榜</option>
                    <option value="24小时跌幅榜" className="bg-[#1C1C20] text-rose-400">24小时跌幅榜</option>
                  </select>
                </div>

                {/* 币种名称快速检索 */}
                <div className="flex items-center gap-2 bg-[#1C1C20] px-3 py-1.5 rounded-lg border border-[#2B2B30]">
                  <Search size={13} className="text-zinc-500" />
                  <input
                    type="text"
                    placeholder="检索币种 (如 AKE, BTC...)"
                    value={searchKeyword}
                    onChange={e => {
                      setSearchKeyword(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-transparent text-xs text-zinc-200 placeholder-zinc-600 outline-none w-36 sm:w-44"
                  />
                  {searchKeyword && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchKeyword('');
                        setCurrentPage(1);
                      }}
                      className="text-[10px] text-zinc-500 hover:text-white px-1 font-bold cursor-pointer transition-colors"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={fetchAlertLogs}
                  disabled={isFetching}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202024] hover:bg-[#28282E] text-zinc-200 border border-[#2E2E35] text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  <RefreshCw size={13} className={isFetching ? "animate-spin text-amber-400" : "text-zinc-400"} />
                  <span>刷新</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearAlertLogs}
                  disabled={alertLogs.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/30 hover:bg-red-900/40 text-red-400 border border-red-900/40 text-xs font-semibold transition-colors disabled:opacity-30 cursor-pointer active:scale-95"
                  title="清空所有历史报警记录"
                >
                  <Trash2 size={13} />
                  <span>清理全部</span>
                </button>
              </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[56vh]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-[#17171A] border-b border-[#232326]">
                  <tr className="text-[11px] uppercase tracking-wider text-zinc-400">
                    <th className="px-5 py-3 font-semibold w-12 text-center">#</th>
                    <th className="px-5 py-3 font-semibold">触发时间</th>
                    <th className="px-5 py-3 font-semibold">合约名称</th>
                    <th className="px-5 py-3 font-semibold">所属榜单</th>
                    <th className="px-5 py-3 font-semibold">涨跌幅 / 异动量</th>
                    <th className="px-5 py-3 font-semibold">周期成交额</th>
                    {onSelectSymbol && <th className="px-5 py-3 font-semibold text-right">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#212126] text-xs">
                  {currentLogs.length === 0 ? (
                    <tr>
                      <td colSpan={onSelectSymbol ? 7 : 6} className="px-5 py-16 text-center text-zinc-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Bell size={28} className="text-zinc-600 opacity-60" />
                          <p className="text-sm font-medium text-zinc-400">暂无符合条件的榜单报警记录</p>
                          <p className="text-xs text-zinc-600">
                            当监控辅助程序执行扫描并检测到涨跌幅、振幅或放量达到报警阈值时，记录将自动在此归档
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    currentLogs.map((log, idx) => {
                      const rowNum = (currentPage - 1) * ITEMS_PER_PAGE + idx + 1;
                      const isGain = log.board_name.includes('涨幅');
                      const isLoss = log.board_name.includes('跌幅');
                      const isSpike = log.board_name.includes('放量');
                      const isHolding = log.symbol && positions.length > 0 ? matchSymbolWithPositions(log.symbol, positions).hasPosition : false;

                      return (
                        <tr
                          key={log.id || `${log.symbol}-${idx}`}
                          className="hover:bg-[#1A1A1E] transition-colors group"
                        >
                          <td className="px-5 py-3.5 text-center text-zinc-600 font-mono text-xs">
                            {rowNum}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-zinc-400 text-xs whitespace-nowrap">
                            {formatTriggerTime(log.trigger_time)}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold text-sm tracking-wide ${isHolding ? 'text-[#d946ef]' : 'text-zinc-100'}`}>
                                {log.symbol}
                              </span>
                              {isHolding && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-[#d946ef]/20 text-[#d946ef] border border-[#d946ef]/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                  持仓中
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => handleCopySymbol(log.symbol, e)}
                                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 p-1 rounded transition-opacity"
                                title="复制合约名称"
                              >
                                {copiedSymbol === log.symbol ? (
                                  <Check size={12} className="text-emerald-400" />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            {getBoardBadge(log.board_name)}
                          </td>
                          <td className="px-5 py-3.5 font-mono font-bold text-sm whitespace-nowrap">
                            <span
                              className={
                                isGain 
                                  ? 'text-emerald-400' 
                                  : isLoss 
                                    ? 'text-rose-400' 
                                    : isSpike 
                                      ? 'text-cyan-400' 
                                      : 'text-amber-400'
                              }
                            >
                              {log.change_val}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 font-mono text-zinc-300 text-xs whitespace-nowrap">
                            {log.volume_15m ? `${(log.volume_15m / 10000).toFixed(2)} 万` : '--'}
                          </td>
                          {onSelectSymbol && (
                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectSymbol(log.symbol);
                                  onClose();
                                }}
                                className="opacity-0 group-hover:opacity-100 px-2.5 py-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded transition-all cursor-pointer"
                              >
                                同步交易
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer & Pagination */}
            <div className="px-6 py-3.5 border-t border-[#232326] bg-[#18181B] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-zinc-500 font-mono">
                共 <span className="text-zinc-300 font-semibold">{filteredLogs.length}</span> 条记录
                {filteredLogs.length > 0 && (
                  <span className="ml-2">
                    (显示第 {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredLogs.length)} 条)
                  </span>
                )}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg bg-[#202024] hover:bg-[#28282E] text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-[#202024] border border-[#2B2B30] transition-colors cursor-pointer"
                    title="首页"
                  >
                    <ChevronsLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg bg-[#202024] hover:bg-[#28282E] text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-[#202024] border border-[#2B2B30] transition-colors cursor-pointer"
                    title="上一页"
                  >
                    <ChevronLeft size={14} />
                  </button>

                  <span className="px-3 py-1 text-xs font-mono text-zinc-300 bg-[#202024] border border-[#2B2B30] rounded-lg">
                    {currentPage} / {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg bg-[#202024] hover:bg-[#28282E] text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-[#202024] border border-[#2B2B30] transition-colors cursor-pointer"
                    title="下一页"
                  >
                    <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg bg-[#202024] hover:bg-[#28282E] text-zinc-400 hover:text-white disabled:opacity-30 disabled:hover:bg-[#202024] border border-[#2B2B30] transition-colors cursor-pointer"
                    title="末页"
                  >
                    <ChevronsRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
