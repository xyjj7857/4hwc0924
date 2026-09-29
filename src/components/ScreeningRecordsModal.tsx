import React, { useState, useMemo } from 'react';
import { 
  X, 
  Download, 
  Trash2, 
  RefreshCw, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  FileSpreadsheet,
  TrendingUp,
  Zap,
  ArrowUpDown
} from 'lucide-react';

export interface ScreeningRecord {
  id: string;
  scanTime: number; // 毫秒时间戳
  scanTimeStr: string; // 格式化时间字符串 YYYY-MM-DD HH:mm:ss
  cycleStr: string; // 对应4H周期，如 "04:00~08:00 (4H)"
  symbol: string; // 币对名称，如 "SOONUSDT"
  currentPrice: number;
  open4h: number;
  changePercent: number; // 4H涨跌幅%
  closePos: number; // 收位%
  volume4h: number; // 4H成交额 (USDT)
  volume24h: number; // 24H成交额 (USDT)
  volumeRatio: number; // 量比 (前12K量比)
  maxGainPastK: number; // 前6K高%
  fundingRate: number; // 资金费率%
  settlementCycle: string; // 结算周期如 "8h"
  filterSummary: string; // 触发时生效的筛选门槛摘要
  isOrdered: boolean; // 是否下单
  orderStatus: 'ORDERED' | 'NOT_ORDERED' | 'SKIPPED' | 'FAILED';
  orderReason: string; // 下单详情或未下单原因
  orderId?: string;
}

interface ScreeningRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: ScreeningRecord[];
  onClearRecords: () => Promise<void>;
  onRefreshRecords: () => Promise<void>;
  onManualTriggerScan?: () => Promise<void>;
  formatPrice?: (symbol: string, price: number) => string;
}

export const ScreeningRecordsModal: React.FC<ScreeningRecordsModalProps> = ({
  isOpen,
  onClose,
  records,
  onClearRecords,
  onRefreshRecords,
  onManualTriggerScan,
  formatPrice
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [orderFilter, setOrderFilter] = useState<'ALL' | 'ORDERED' | 'NOT_ORDERED'>('ALL');
  const [isClearing, setIsClearing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isManualScanning, setIsManualScanning] = useState(false);

  // 格式化金额 (万 / 亿)
  const formatVolume = (val?: number) => {
    if (!val || isNaN(val) || val <= 0) return '0';
    if (val >= 100000000) return `${(val / 100000000).toFixed(2)}亿`;
    if (val >= 10000) return `${(val / 10000).toFixed(1)}万`;
    return val.toFixed(0);
  };

  // 格式化价格
  const formatPriceVal = (symbol: string, price?: number) => {
    if (!price || price <= 0) return '0.00';
    if (formatPrice) return formatPrice(symbol, price);
    if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  // 过滤后的记录
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // 搜索币种
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toUpperCase();
        if (!r.symbol.toUpperCase().includes(term)) return false;
      }
      // 下单过滤
      if (orderFilter === 'ORDERED' && !r.isOrdered) return false;
      if (orderFilter === 'NOT_ORDERED' && r.isOrdered) return false;
      return true;
    });
  }, [records, searchTerm, orderFilter]);

  // 统计信息
  const stats = useMemo(() => {
    const total = records.length;
    const ordered = records.filter(r => r.isOrdered).length;
    const notOrdered = total - ordered;
    const symbolsSet = new Set(records.map(r => r.symbol));
    return {
      total,
      ordered,
      notOrdered,
      uniqueSymbols: symbolsSet.size
    };
  }, [records]);

  // 导出 CSV 下载
  const handleExportCSV = () => {
    if (records.length === 0) return;

    const headers = [
      '记录ID',
      '扫描时间',
      '4H周期',
      '币对',
      '当前价',
      '4H开盘价',
      '4H涨跌幅(%)',
      '收位(%)',
      '4H成交额(USDT)',
      '24H成交额(USDT)',
      '量比',
      '前K最高涨幅(%)',
      '资金费率(%)',
      '结算周期',
      '筛选门槛快照',
      '是否下单',
      '下单状态',
      '下单结果或未下单原因',
      '订单ID'
    ];

    const rows = filteredRecords.map(r => [
      `"${r.id}"`,
      `"${r.scanTimeStr}"`,
      `"${r.cycleStr}"`,
      `"${r.symbol}"`,
      r.currentPrice,
      r.open4h,
      r.changePercent.toFixed(2),
      r.closePos.toFixed(1),
      r.volume4h.toFixed(0),
      r.volume24h.toFixed(0),
      r.volumeRatio.toFixed(2),
      r.maxGainPastK.toFixed(2),
      (r.fundingRate * 100).toFixed(4),
      `"${r.settlementCycle}"`,
      `"${(r.filterSummary || '').replace(/"/g, '""')}"`,
      r.isOrdered ? '是' : '否',
      `"${r.orderStatus}"`,
      `"${(r.orderReason || '').replace(/"/g, '""')}"`,
      `"${r.orderId || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    link.setAttribute('href', url);
    link.setAttribute('download', `4H筛选扫描记录_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClear = async () => {
    if (window.confirm('确定要清空全部 4H 筛选扫描历史记录吗？清空后将无法恢复。')) {
      setIsClearing(true);
      try {
        await onClearRecords();
      } finally {
        setIsClearing(false);
      }
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshRecords();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleManualScan = async () => {
    if (!onManualTriggerScan) return;
    setIsManualScanning(true);
    try {
      await onManualTriggerScan();
    } finally {
      setIsManualScanning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-7xl h-[92vh] max-h-[920px] bg-[#121316] border border-white/15 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-200 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-500/15 via-white/[0.03] to-transparent border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shadow-md shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  4小时筛选扫描历史记录
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                  每周期自动留存
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                  未开自动亦记录
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                记录每个 4H 周期扫描时刻满足筛选条件的币对详细指标快照、是否下单及原因，支持下载导出
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 立即即时测试扫描 */}
            {onManualTriggerScan && (
              <button
                type="button"
                onClick={handleManualScan}
                disabled={isManualScanning}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 text-xs font-semibold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                title="立即对全市场执行一次当前筛选条件即时扫描并计入记录"
              >
                <Zap className={`w-3.5 h-3.5 text-cyan-400 ${isManualScanning ? 'animate-spin' : ''}`} />
                <span>{isManualScanning ? '正在扫描...' : '即时扫描记录'}</span>
              </button>
            )}

            {/* 刷新 */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all cursor-pointer"
              title="刷新记录数据"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            {/* 导出 CSV 下载 */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredRecords.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold transition-all cursor-pointer shadow-sm shadow-emerald-500/10 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              title="下载导出为 CSV 表格 (支持 Excel / Numbers 直接打开)"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>下载表单 ({filteredRecords.length})</span>
            </button>

            {/* 清空记录 */}
            <button
              type="button"
              onClick={handleClear}
              disabled={isClearing || records.length === 0}
              className="p-2 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all cursor-pointer disabled:opacity-40"
              title="清空所有记录"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white transition-all cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 统计指标与搜索筛选栏 */}
        <div className="px-5 py-3 bg-white/[0.02] border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* 统计 Badge */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-white/10 text-zinc-300 font-mono">
              总计命中: <strong className="text-white font-bold">{stats.total}</strong> 条
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-mono flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>已下单: <strong>{stats.ordered}</strong></span>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-white/10 text-zinc-400 font-mono flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span>未下单: <strong>{stats.notOrdered}</strong></span>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/25 text-purple-300 font-mono">
              去重币种: <strong>{stats.uniqueSymbols}</strong> 个
            </span>
          </div>

          {/* 过滤控制栏 */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* 状态过滤 Tab */}
            <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setOrderFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  orderFilter === 'ALL' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                全部 ({stats.total})
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter('ORDERED')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  orderFilter === 'ORDERED' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                仅已下单 ({stats.ordered})
              </button>
              <button
                type="button"
                onClick={() => setOrderFilter('NOT_ORDERED')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  orderFilter === 'NOT_ORDERED' ? 'bg-zinc-700/60 text-zinc-200 font-bold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                仅未下单 ({stats.notOrdered})
              </button>
            </div>

            {/* 搜索框 */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索币对 (如 SOON)..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 w-44 sm:w-56"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 记录数据表格 */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          {filteredRecords.length === 0 ? (
            <div className="h-full min-h-[350px] flex flex-col items-center justify-center text-center p-8 text-zinc-500">
              <FileSpreadsheet className="w-12 h-12 text-zinc-700 mb-3 stroke-[1.2]" />
              <p className="text-base font-semibold text-zinc-400">暂无筛选扫描历史记录</p>
              <p className="text-xs text-zinc-600 mt-1 max-w-md">
                系统会在每个 4H 周期结算扫描时刻自动检测满足条件的币对并记录在此处。即使不开启“自动”下单，筛选结果也会完整留存。
              </p>
              {onManualTriggerScan && (
                <button
                  type="button"
                  onClick={handleManualScan}
                  disabled={isManualScanning}
                  className="mt-4 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>立即执行一次即时扫描</span>
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-[#16171b] border-b border-white/10 z-10 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 whitespace-nowrap">扫描时刻 / 周期</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">币对</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">当前价 / 开盘</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">4H涨幅</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">收位</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">4H成交额</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">24H成交额</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">量比</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">前K高</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">资金费率</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">是否下单</th>
                  <th className="py-2.5 px-4 whitespace-nowrap min-w-[200px]">下单结果 / 未下单原因</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">门槛快照</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-[12px]">
                {filteredRecords.map((r) => {
                  const isGainPositive = r.changePercent >= 0;
                  const isRatePositive = r.fundingRate > 0;
                  return (
                    <tr 
                      key={r.id}
                      className="hover:bg-white/[0.03] transition-colors"
                    >
                      {/* 扫描时刻 / 周期 */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-zinc-300">
                        <div className="font-bold text-white text-[12px]">{r.scanTimeStr}</div>
                        {r.cycleStr && (
                          <div className="text-[10px] text-zinc-500 font-sans mt-0.5">{r.cycleStr}</div>
                        )}
                      </td>

                      {/* 币对 */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-bold text-[14px] text-[#ff8a65] tracking-wide">
                          {r.symbol.replace('USDT', '')}
                        </span>
                        <span className="text-[10px] text-zinc-500 ml-0.5">USDT</span>
                      </td>

                      {/* 当前价 / 开盘 */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="font-bold text-emerald-300 text-[13px]">
                          {formatPriceVal(r.symbol, r.currentPrice)}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          开盘: {formatPriceVal(r.symbol, r.open4h)}
                        </div>
                      </td>

                      {/* 4H涨跌幅 */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold text-[13.5px]">
                        <span className={isGainPositive ? 'text-emerald-400' : 'text-red-400'}>
                          {isGainPositive ? '+' : ''}{r.changePercent.toFixed(2)}%
                        </span>
                      </td>

                      {/* 收位 */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span className="font-bold text-cyan-300">
                          {r.closePos.toFixed(1)}%
                        </span>
                      </td>

                      {/* 4H成交额 */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap text-zinc-200">
                        <span className="font-bold text-emerald-300">{formatVolume(r.volume4h)}</span>
                        <span className="text-[10px] text-zinc-500 ml-0.5">USDT</span>
                      </td>

                      {/* 24H成交额 */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap text-zinc-400">
                        <span>{formatVolume(r.volume24h)}</span>
                      </td>

                      {/* 量比 */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold">
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[11px]">
                          {r.volumeRatio.toFixed(2)}x
                        </span>
                      </td>

                      {/* 前K高 */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold">
                        <span className={r.maxGainPastK > 0 ? 'text-emerald-300' : 'text-zinc-400'}>
                          {r.maxGainPastK > 0 ? '+' : ''}{r.maxGainPastK.toFixed(2)}%
                        </span>
                      </td>

                      {/* 资金费率 */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold">
                        <span className={isRatePositive ? 'text-amber-400' : 'text-cyan-400'}>
                          {isRatePositive ? '+' : ''}{(r.fundingRate * 100).toFixed(4)}%
                        </span>
                        <span className="text-[10px] text-zinc-500 ml-1 font-sans">
                          ({r.settlementCycle || '8h'})
                        </span>
                      </td>

                      {/* 是否下单 */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {r.isOrdered ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-sans font-bold text-[11px] shadow-sm shadow-emerald-500/10">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>已下单</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-white/10 font-sans font-medium text-[11px]">
                            <Clock className="w-3 h-3 text-zinc-500" />
                            <span>未下单</span>
                          </span>
                        )}
                      </td>

                      {/* 下单结果 / 未下单原因 */}
                      <td className="py-2.5 px-4 font-sans text-xs whitespace-normal max-w-md">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`${
                            r.isOrdered 
                              ? 'text-emerald-300 font-semibold' 
                              : r.orderReason.includes('未开启自动') 
                                ? 'text-zinc-400' 
                                : 'text-amber-300/90'
                          }`}>
                            {r.orderReason || (r.isOrdered ? '已下单成功' : '未触发下单')}
                          </span>
                          {r.orderId && (
                            <span className="text-[10px] text-zinc-500 font-mono px-1 py-0.2 rounded bg-black/40 border border-white/10" title="币安委托单号">
                              ID: {r.orderId}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 筛选门槛快照 */}
                      <td className="py-2.5 px-3 font-sans text-[11px] text-zinc-500 whitespace-nowrap max-w-xs truncate" title={r.filterSummary}>
                        {r.filterSummary || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 底部信息栏 */}
        <div className="px-5 py-2.5 bg-[#141518] border-t border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs text-zinc-500">
          <div className="flex items-center gap-3">
            <span>
              显示 <strong className="text-zinc-300">{filteredRecords.length}</strong> / <strong className="text-zinc-400">{records.length}</strong> 条记录
            </span>
            <span className="text-zinc-700">丨</span>
            <span className="text-zinc-400">
              数据自动保存在本地数据库，支持离线回溯
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={filteredRecords.length === 0}
              className="px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 font-bold transition-all disabled:opacity-40"
            >
              导出此表单 (.csv)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-all"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
