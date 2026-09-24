import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Activity, 
  Play, 
  Square, 
  RefreshCw, 
  Trash2, 
  Shield, 
  ShieldAlert, 
  Zap, 
  Clock, 
  AlertTriangle, 
  Layers, 
  TrendingUp, 
  Search, 
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Filter,
  ArrowUpRight
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine 
} from 'recharts';

export interface ApiCallRecord {
  id: string;
  timestamp: number;
  timeStr: string;
  minuteKey: string;
  method: string;
  endpoint: string;
  symbol?: string;
  source: string;
  weight: number;
  usedWeight1m: number;
  status: number;
  durationMs: number;
  error?: string;
}

export interface MinuteStatPoint {
  minute: string;
  timestamp: number;
  requestCount: number;
  usedWeight: number;
  calcWeight: number;
  peakWeight: number;
  errorCount: number;
}

export interface WeightStatsStatus {
  isRunning: boolean;
  startTime: number | null;
  upTimeSeconds: number;
  limit1m: number;
  warningThreshold1m: number;
  currentMinute: {
    minute: string;
    requests: number;
    usedWeight: number;
    calcWeight: number;
  };
  peakWeightAllTime: number;
  totalRequests: number;
  totalWeight: number;
  minuteStats: MinuteStatPoint[];
  recentRecords: ApiCallRecord[];
  endpointBreakdown: Record<string, { count: number; weight: number; lastCalled: number }>;
}

export default function WeightStatsModule() {
  const [status, setStatus] = useState<WeightStatsStatus>({
    isRunning: false,
    startTime: null,
    upTimeSeconds: 0,
    limit1m: 2400,
    warningThreshold1m: 1800,
    currentMinute: { minute: '--:--', requests: 0, usedWeight: 0, calcWeight: 0 },
    peakWeightAllTime: 0,
    totalRequests: 0,
    totalWeight: 0,
    minuteStats: [],
    recentRecords: [],
    endpointBreakdown: {}
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'MARKET' | 'TRADE' | 'PUBLIC'>('ALL');
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const [displayCount, setDisplayCount] = useState<number>(50);
  const [showSpecsModal, setShowSpecsModal] = useState(false);
  const [chartViewMode, setChartViewMode] = useState<'BOTH' | 'WEIGHT' | 'REQUESTS'>('BOTH');
  const [timeRangeMinutes, setTimeRangeMinutes] = useState<number>(30); // 15, 30, 60, 120

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 格式化运行时长
  const formatUpTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // 获取状态数据
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/weight-stats/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.warn('Failed to fetch weight stats:', err);
    }
  };

  // 轮询管理：当组件挂载且模块启动时，保持 1.5 秒高频刷新
  useEffect(() => {
    fetchStatus();

    pollTimerRef.current = setInterval(() => {
      fetchStatus();
    }, 1500);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  // 切换运行状态 (启动 / 停止)
  const handleToggle = async () => {
    if (isToggling) return;
    setIsToggling(true);
    try {
      const nextRunning = !status.isRunning;
      const res = await fetch('/api/weight-stats/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRunning: nextRunning })
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (err) {
      console.error('Failed to toggle weight stats:', err);
    } finally {
      setIsToggling(false);
    }
  };

  // 清空统计记录
  const handleClear = async () => {
    if (window.confirm('确定要清空当前的全部权重统计数据与调用流水记录吗？')) {
      try {
        const res = await fetch('/api/weight-stats/clear', { method: 'POST' });
        if (res.ok) {
          await fetchStatus();
        }
      } catch (err) {
        console.error('Failed to clear weight stats:', err);
      }
    }
  };

  // 过滤后的逐条记录
  const filteredRecords = useMemo(() => {
    return status.recentRecords.filter(rec => {
      if (showOnlyErrors && rec.status < 400) return false;
      if (sourceFilter === 'MARKET' && !rec.source.includes('行情')) return false;
      if (sourceFilter === 'TRADE' && !rec.source.includes('交易')) return false;
      if (sourceFilter === 'PUBLIC' && !rec.source.includes('公共')) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const ep = rec.endpoint.toLowerCase();
        const sym = (rec.symbol || '').toLowerCase();
        const src = rec.source.toLowerCase();
        if (!ep.includes(q) && !sym.includes(q) && !src.includes(q)) {
          return false;
        }
      }
      return true;
    }).slice(0, displayCount);
  }, [status.recentRecords, searchTerm, sourceFilter, showOnlyErrors, displayCount]);

  // 曲线图表时间过滤
  const chartData = useMemo(() => {
    if (!status.minuteStats || status.minuteStats.length === 0) {
      return [];
    }
    const points = [...status.minuteStats];
    if (timeRangeMinutes && points.length > timeRangeMinutes) {
      return points.slice(points.length - timeRangeMinutes);
    }
    return points;
  }, [status.minuteStats, timeRangeMinutes]);

  // 计算健康状态
  const currentWeight = status.currentMinute.usedWeight || status.currentMinute.calcWeight;
  const weightPercent = Math.min(100, Math.round((currentWeight / status.limit1m) * 100));
  
  let healthBadge = {
    text: '安全运行',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    dot: 'bg-emerald-400'
  };
  if (currentWeight >= status.limit1m) {
    healthBadge = {
      text: '超频危险 (达到硬限)',
      color: 'text-rose-400 bg-rose-500/15 border-rose-500/40 animate-pulse',
      dot: 'bg-rose-500'
    };
  } else if (currentWeight >= status.warningThreshold1m) {
    healthBadge = {
      text: '水位预警 (>1800)',
      color: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
      dot: 'bg-amber-400'
    };
  }

  // 计算接口消耗排行
  const endpointRanking = useMemo(() => {
    const list = Object.entries(status.endpointBreakdown).map(([ep, item]) => ({
      endpoint: ep,
      count: item.count,
      weight: item.weight,
      lastCalled: item.lastCalled
    }));
    return list.sort((a, b) => b.weight - a.weight);
  }, [status.endpointBreakdown]);

  return (
    <div className="space-y-4 pb-12 animate-in fade-in duration-300">
      {/* 1. 顶部控制栏与主状态 */}
      <div className="bg-[#141416] border border-[#232326] rounded-xl p-4 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* 左侧：标题与技术规约说明 */}
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border transition-all ${
              status.isRunning 
                ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400 shadow-lg shadow-cyan-500/10' 
                : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-400'
            }`}>
              <BarChart2 size={24} className={status.isRunning ? 'animate-pulse' : ''} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
                  币安 API 权重与频次统计
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
                  status.isRunning ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${status.isRunning ? 'bg-emerald-400 animate-ping' : 'bg-zinc-500'}`} />
                  {status.isRunning ? '统计中 (实时记录)' : '已停止统计'}
                </span>
                {status.isRunning && (
                  <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border flex items-center gap-1 ${healthBadge.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${healthBadge.dot}`} />
                    {healthBadge.text}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
                <span>币安规范：IP 硬限 2400 权重/分钟 (1m 滑动窗口)</span>
                <span className="text-zinc-600">|</span>
                <span>响应标头：x-mbx-used-weight-1m</span>
                <button 
                  onClick={() => setShowSpecsModal(!showSpecsModal)}
                  className="text-cyan-400 hover:text-cyan-300 underline font-medium ml-1 inline-flex items-center gap-0.5"
                >
                  <Info size={12} /> 查看接口权重表
                </button>
              </p>
            </div>
          </div>

          {/* 右侧：操作按钮组 */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* 启动 / 停止 按钮 */}
            <button
              onClick={handleToggle}
              disabled={isToggling}
              className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all shadow-md active:scale-95 ${
                status.isRunning
                  ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 ring-1 ring-rose-500/30'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-black border border-emerald-400 shadow-emerald-500/20'
              }`}
            >
              {status.isRunning ? (
                <>
                  <Square size={16} className="fill-rose-300" />
                  <span>停止统计</span>
                </>
              ) : (
                <>
                  <Play size={16} className="fill-black" />
                  <span>启动统计</span>
                </>
              )}
            </button>

            {/* 清空数据 */}
            <button
              onClick={handleClear}
              className="px-3 py-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-medium flex items-center gap-1.5 transition-colors"
              title="清空已记录的流水与图表数据"
            >
              <Trash2 size={15} />
              <span>清空记录</span>
            </button>

            {/* 手动刷新 */}
            <button
              onClick={fetchStatus}
              className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition-colors"
              title="手动刷新数据"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* 币安规格参考折叠浮层 */}
        {showSpecsModal && (
          <div className="mt-4 p-3.5 bg-zinc-900/90 border border-zinc-700/60 rounded-lg text-xs space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between text-zinc-200 font-bold border-b border-zinc-800 pb-2">
              <span className="flex items-center gap-1.5 text-cyan-300">
                <Shield size={14} /> 币安合约 (USDⓈ-M Futures) 官方标准权重规范速查
              </span>
              <button 
                onClick={() => setShowSpecsModal(false)}
                className="text-zinc-500 hover:text-zinc-300 font-normal"
              >
                收起 ✕
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1 text-zinc-300">
              <div className="p-2 rounded bg-black/40 border border-zinc-800/60">
                <span className="text-zinc-500 block">K线 /klines</span>
                <span className="font-mono text-zinc-200 font-semibold">1~2 (≤500根) / 5 (1000根)</span>
              </div>
              <div className="p-2 rounded bg-black/40 border border-zinc-800/60">
                <span className="text-zinc-500 block">24小时涨跌 /ticker/24hr</span>
                <span className="font-mono text-zinc-200 font-semibold">单币对 1 / 全市场 40</span>
              </div>
              <div className="p-2 rounded bg-black/40 border border-zinc-800/60">
                <span className="text-zinc-500 block">挂单/撤单 /order</span>
                <span className="font-mono text-zinc-200 font-semibold">1 权重/次 (单次限制)</span>
              </div>
              <div className="p-2 rounded bg-black/40 border border-zinc-800/60">
                <span className="text-zinc-500 block">资金费率 /premiumIndex</span>
                <span className="font-mono text-zinc-200 font-semibold">1 权重/次</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. 核心指标 KPI 仪表盘 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 卡片 1: 当前 1 分钟权重占用 */}
        <div className="bg-[#141416] border border-[#232326] rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium flex items-center gap-1.5">
              <Activity size={14} className="text-cyan-400" />
              当前分钟已用权重
            </span>
            <span className="font-mono text-[11px] text-zinc-500">
              {status.currentMinute.minute}
            </span>
          </div>

          <div className="my-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black font-mono text-white tracking-tight">
                {currentWeight}
              </span>
              <span className="text-xs font-mono text-zinc-400">
                / {status.limit1m} 权重
              </span>
            </div>

            {/* 权重水位进度条 */}
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden mt-2 border border-zinc-700/50">
              <div 
                className={`h-full transition-all duration-500 ${
                  currentWeight >= status.limit1m ? 'bg-rose-500 animate-pulse' :
                  currentWeight >= status.warningThreshold1m ? 'bg-amber-400' :
                  'bg-gradient-to-r from-emerald-500 to-cyan-400'
                }`}
                style={{ width: `${Math.max(2, weightPercent)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/60">
            <span>占用比例: <strong className="text-zinc-200">{weightPercent}%</strong></span>
            <span>剩余可用: <strong className="text-emerald-400">{Math.max(0, status.limit1m - currentWeight)}</strong></span>
          </div>
        </div>

        {/* 卡片 2: 当前 1 分钟 API 调用频次 */}
        <div className="bg-[#141416] border border-[#232326] rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium flex items-center gap-1.5">
              <Zap size={14} className="text-amber-400" />
              当前分钟请求次数
            </span>
            <span className="font-mono text-[11px] text-zinc-500">
              {status.currentMinute.minute}
            </span>
          </div>

          <div className="my-2">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black font-mono text-white tracking-tight">
                {status.currentMinute.requests}
              </span>
              <span className="text-xs font-mono text-zinc-400">
                次 / 分钟
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-2">
              单次均摊权重: <strong className="text-zinc-200">
                {status.currentMinute.requests > 0 ? (currentWeight / status.currentMinute.requests).toFixed(1) : 0} 权重/次
              </strong>
            </p>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/60">
            <span>调用频率: <strong className="text-zinc-200">{(status.currentMinute.requests / 60).toFixed(2)} req/s</strong></span>
            <span className="text-zinc-500">滑动计算中</span>
          </div>
        </div>

        {/* 卡片 3: 运行期间历史最高峰值权重 */}
        <div className="bg-[#141416] border border-[#232326] rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium flex items-center gap-1.5">
              <TrendingUp size={14} className="text-purple-400" />
              历史峰值分钟权重
            </span>
            <span className="text-[11px] text-zinc-500">
              单分钟最高
            </span>
          </div>

          <div className="my-2">
            <div className="flex items-baseline justify-between">
              <span className={`text-2xl font-black font-mono tracking-tight ${
                status.peakWeightAllTime > status.warningThreshold1m ? 'text-amber-400' : 'text-white'
              }`}>
                {status.peakWeightAllTime}
              </span>
              <span className="text-xs font-mono text-zinc-400">
                / {status.limit1m}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 mt-2">
              峰值占额: <strong className="text-purple-300">
                {Math.round((status.peakWeightAllTime / status.limit1m) * 100)}%
              </strong>
            </p>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/60">
            <span>预警警戒线: <strong className="text-amber-400 font-mono">1800</strong></span>
            <span>硬限: <strong className="text-rose-400 font-mono">2400</strong></span>
          </div>
        </div>

        {/* 卡片 4: 累计统计与运行时长 */}
        <div className="bg-[#141416] border border-[#232326] rounded-xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium flex items-center gap-1.5">
              <Clock size={14} className="text-emerald-400" />
              模块统计时长
            </span>
            <span className="font-mono text-[11px] text-emerald-400">
              {formatUpTime(status.upTimeSeconds)}
            </span>
          </div>

          <div className="my-2 space-y-1">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-zinc-400">累计请求总数:</span>
              <span className="text-lg font-black font-mono text-white">
                {status.totalRequests.toLocaleString()} 次
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-zinc-400">累计消耗总权重:</span>
              <span className="text-lg font-black font-mono text-cyan-300">
                {status.totalWeight.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/60">
            <span>平均每分请求: <strong className="text-zinc-200">
              {status.upTimeSeconds > 60 ? (status.totalRequests / (status.upTimeSeconds / 60)).toFixed(1) : status.totalRequests}
            </strong></span>
            <span className="text-zinc-500">{status.isRunning ? '持续累计' : '已暂停'}</span>
          </div>
        </div>
      </div>

      {/* 3. 平滑曲线图区 (Smooth Charts) */}
      <div className="bg-[#141416] border border-[#232326] rounded-xl p-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#232326] pb-3 mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-cyan-400" />
            <h3 className="font-bold text-base text-white tracking-wide">
              API 调用与权重时间演进平滑曲线
            </h3>
            <span className="text-xs text-zinc-500 font-normal">
              (以分钟为单位平滑统计)
            </span>
          </div>

          {/* 筛选与视图模式 */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 时间跨度切换 */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setTimeRangeMinutes(15)}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  timeRangeMinutes === 15 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-zinc-400 hover:text-white'
                }`}
              >
                近15分
              </button>
              <button
                onClick={() => setTimeRangeMinutes(30)}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  timeRangeMinutes === 30 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-zinc-400 hover:text-white'
                }`}
              >
                近30分
              </button>
              <button
                onClick={() => setTimeRangeMinutes(60)}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  timeRangeMinutes === 60 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-zinc-400 hover:text-white'
                }`}
              >
                近1小时
              </button>
              <button
                onClick={() => setTimeRangeMinutes(120)}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  timeRangeMinutes === 120 ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-zinc-400 hover:text-white'
                }`}
              >
                全部
              </button>
            </div>

            {/* 曲线显示模式 */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setChartViewMode('BOTH')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  chartViewMode === 'BOTH' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                综合双图
              </button>
              <button
                onClick={() => setChartViewMode('WEIGHT')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  chartViewMode === 'WEIGHT' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-400 hover:text-white'
                }`}
              >
                仅权重
              </button>
              <button
                onClick={() => setChartViewMode('REQUESTS')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  chartViewMode === 'REQUESTS' ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-400 hover:text-white'
                }`}
              >
                仅频次
              </button>
            </div>
          </div>
        </div>

        {/* 当没有启动统计或尚无数据点时的空状态 */}
        {chartData.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 flex flex-col items-center justify-center space-y-3">
            <Activity size={36} className="text-zinc-600 animate-pulse" />
            <div className="text-sm font-semibold text-zinc-300">
              {status.isRunning ? '正在采集首批分钟数据点...' : '权重统计模块当前处于停止状态'}
            </div>
            <p className="text-xs text-zinc-500 max-w-md">
              {status.isRunning 
                ? '已启动统计引擎，系统正在每分钟汇聚 API 权重与调用量并绘制平滑曲线。' 
                : '根据规约，模块未启动时不消耗任何后台计算资源。请点击上方【启动统计】开始记录。'}
            </p>
            {!status.isRunning && (
              <button
                onClick={handleToggle}
                className="mt-2 px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold transition-all shadow-md"
              >
                立即启动统计
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* 图表 1: 权重平滑曲线 */}
            {(chartViewMode === 'BOTH' || chartViewMode === 'WEIGHT') && (
              <div>
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-2 px-1">
                  <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    每分钟 API 权重占用平滑曲线 (Used Weight / min)
                  </span>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-0.5 bg-rose-500 inline-block" /> 币安硬限 2400
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-0.5 bg-amber-400 inline-block" /> 预警线 1800
                    </span>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#232326" vertical={false} />
                      <XAxis 
                        dataKey="minute" 
                        stroke="#71717a" 
                        fontSize={11} 
                        tickLine={false} 
                      />
                      <YAxis 
                        stroke="#71717a" 
                        fontSize={11} 
                        tickLine={false}
                        domain={[0, (dataMax: number) => Math.max(300, Math.ceil(dataMax * 1.25))]}
                      />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as MinuteStatPoint;
                            return (
                              <div className="bg-[#18181b] border border-zinc-700 p-2.5 rounded-lg shadow-xl text-xs space-y-1">
                                <div className="font-bold text-white border-b border-zinc-800 pb-1 flex items-center justify-between gap-4">
                                  <span>时间: {label}</span>
                                  <span className="text-zinc-400">{data.requestCount} 次调用</span>
                                </div>
                                <div className="text-cyan-400 flex justify-between gap-4">
                                  <span>官方已用权重 (x-mbx):</span>
                                  <span className="font-mono font-bold">{data.usedWeight} / 2400</span>
                                </div>
                                <div className="text-zinc-400 flex justify-between gap-4">
                                  <span>单分钟测算权重:</span>
                                  <span className="font-mono">{data.calcWeight}</span>
                                </div>
                                <div className="text-purple-300 flex justify-between gap-4">
                                  <span>单分钟峰值:</span>
                                  <span className="font-mono">{data.peakWeight}</span>
                                </div>
                                <div className="text-zinc-400 flex justify-between gap-4">
                                  <span>限额占用率:</span>
                                  <span className="font-mono font-bold text-emerald-400">
                                    {Math.round((data.usedWeight / 2400) * 100)}%
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <ReferenceLine y={2400} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '2400 硬限', fill: '#ef4444', fontSize: 10, position: 'top' }} />
                      <ReferenceLine y={1800} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '1800 预警', fill: '#f59e0b', fontSize: 10, position: 'top' }} />
                      <Area 
                        type="monotone" 
                        dataKey="usedWeight" 
                        stroke="#06b6d4" 
                        strokeWidth={2.5} 
                        fillOpacity={1} 
                        fill="url(#weightGradient)" 
                        name="已用权重"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* 图表 2: API 频次平滑曲线 */}
            {(chartViewMode === 'BOTH' || chartViewMode === 'REQUESTS') && (
              <div>
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-2 px-1">
                  <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    每分钟 API 请求调用频次平滑曲线 (Requests / min)
                  </span>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    频次单位：次/分钟
                  </span>
                </div>

                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#232326" vertical={false} />
                      <XAxis 
                        dataKey="minute" 
                        stroke="#71717a" 
                        fontSize={11} 
                        tickLine={false} 
                      />
                      <YAxis 
                        stroke="#71717a" 
                        fontSize={11} 
                        tickLine={false}
                        domain={[0, (dataMax: number) => Math.max(10, Math.ceil(dataMax * 1.2))]}
                      />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as MinuteStatPoint;
                            return (
                              <div className="bg-[#18181b] border border-zinc-700 p-2.5 rounded-lg shadow-xl text-xs space-y-1">
                                <div className="font-bold text-white border-b border-zinc-800 pb-1">
                                  时间: {label}
                                </div>
                                <div className="text-amber-400 flex justify-between gap-4">
                                  <span>调用频次:</span>
                                  <span className="font-mono font-bold">{data.requestCount} 次/分</span>
                                </div>
                                <div className="text-zinc-400 flex justify-between gap-4">
                                  <span>当分平均频度:</span>
                                  <span className="font-mono">{(data.requestCount / 60).toFixed(2)} 次/秒</span>
                                </div>
                                {data.errorCount > 0 && (
                                  <div className="text-rose-400 flex justify-between gap-4">
                                    <span>异常/失败:</span>
                                    <span className="font-mono">{data.errorCount} 次</span>
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="requestCount" 
                        stroke="#f59e0b" 
                        strokeWidth={2.5} 
                        fillOpacity={1} 
                        fill="url(#reqGradient)" 
                        name="调用次数"
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. 接口权重消耗排行分布 */}
      {endpointRanking.length > 0 && (
        <div className="bg-[#141416] border border-[#232326] rounded-xl p-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-[#232326] pb-3 mb-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Layers size={16} className="text-purple-400" />
              API 接口权重消耗与调用分布排行
            </h3>
            <span className="text-xs text-zinc-500">
              共调用 {endpointRanking.length} 个不同接口
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {endpointRanking.slice(0, 9).map((item, idx) => {
              const weightShare = status.totalWeight > 0 ? Math.round((item.weight / status.totalWeight) * 100) : 0;
              return (
                <div key={item.endpoint} className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-zinc-200 truncate" title={item.endpoint}>
                      {idx + 1}. {item.endpoint}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-cyan-400 shrink-0">
                      {item.weight} 权重
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden my-2">
                    <div 
                      className="h-full bg-purple-500 rounded-full" 
                      style={{ width: `${Math.max(3, weightShare)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>调用次数: <strong className="text-zinc-300 font-mono">{item.count}</strong> 次</span>
                    <span>占比: <strong className="text-purple-300">{weightShare}%</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. 逐条记录流水明细表 */}
      <div className="bg-[#141416] border border-[#232326] rounded-xl shadow-xl overflow-hidden">
        {/* 表格标题与搜索筛选栏 */}
        <div className="p-4 border-b border-[#232326] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-emerald-400" />
            <h3 className="font-bold text-base text-white tracking-wide">
              API 请求逐条记录流水明细
            </h3>
            <span className="px-2 py-0.5 rounded bg-zinc-800 text-[11px] text-zinc-400 font-mono">
              最新 {filteredRecords.length} 条
            </span>
          </div>

          {/* 筛选与搜索 */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* 来源筛选 */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setSourceFilter('ALL')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  sourceFilter === 'ALL' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                全部来源
              </button>
              <button
                onClick={() => setSourceFilter('MARKET')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  sourceFilter === 'MARKET' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-400 hover:text-white'
                }`}
              >
                行情引擎
              </button>
              <button
                onClick={() => setSourceFilter('TRADE')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  sourceFilter === 'TRADE' ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-400 hover:text-white'
                }`}
              >
                交易/账户
              </button>
              <button
                onClick={() => setSourceFilter('PUBLIC')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  sourceFilter === 'PUBLIC' ? 'bg-purple-500/20 text-purple-300' : 'text-zinc-400 hover:text-white'
                }`}
              >
                公共代理
              </button>
            </div>

            {/* 仅错误 */}
            <button
              onClick={() => setShowOnlyErrors(!showOnlyErrors)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                showOnlyErrors 
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' 
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              仅看报错/限流
            </button>

            {/* 搜索框 */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="搜索接口 / 币对..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 w-36 sm:w-44"
              />
            </div>
          </div>
        </div>

        {/* 流水明细数据表 */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[780px]">
            <thead>
              <tr className="bg-white/5 text-[12px] text-zinc-400 uppercase font-bold tracking-wider">
                <th className="px-4 py-3 text-left w-[12%]">请求时刻</th>
                <th className="px-3 py-3 text-left w-[14%]">来源模块</th>
                <th className="px-3 py-3 text-center w-[8%]">方法</th>
                <th className="px-3 py-3 text-left w-[28%]">接口路径 (Endpoint)</th>
                <th className="px-3 py-3 text-right w-[10%]">单次权重</th>
                <th className="px-3 py-3 text-right w-[14%]">
                  <div className="flex items-center justify-end gap-1" title="币安官方响应标头 x-mbx-used-weight-1m 返回的已用总权重">
                    <span>1m 累计权重</span>
                    <Info size={11} className="text-zinc-500" />
                  </div>
                </th>
                <th className="px-3 py-3 text-center w-[7%]">状态</th>
                <th className="px-4 py-3 text-right w-[7%]">耗时</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono text-[12px]">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-500 font-sans">
                    {status.isRunning 
                      ? '暂未产生符合筛选条件的 API 请求流水' 
                      : '权重统计模块已停止。启动后将实时逐条呈现所有发往币安的 API 网络请求。'}
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => {
                  const isErr = rec.status >= 400;
                  const is429 = rec.status === 429 || rec.status === 418;
                  return (
                    <tr 
                      key={rec.id}
                      className={`hover:bg-white/[0.03] transition-colors ${
                        is429 ? 'bg-rose-500/10' : isErr ? 'bg-amber-500/5' : ''
                      }`}
                    >
                      {/* 时间 */}
                      <td className="px-4 py-2.5 text-zinc-400">
                        {rec.timeStr}
                      </td>

                      {/* 来源模块 */}
                      <td className="px-3 py-2.5 text-zinc-300 font-sans text-xs">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          rec.source.includes('行情') ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/20' :
                          rec.source.includes('交易') ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20' :
                          'bg-purple-500/15 text-purple-300 border border-purple-500/20'
                        }`}>
                          {rec.source}
                        </span>
                      </td>

                      {/* 方法 */}
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          rec.method === 'POST' ? 'bg-amber-500/20 text-amber-300' :
                          rec.method === 'DELETE' ? 'bg-rose-500/20 text-rose-300' :
                          'bg-blue-500/15 text-blue-300'
                        }`}>
                          {rec.method}
                        </span>
                      </td>

                      {/* 接口路径 */}
                      <td className="px-3 py-2.5 text-zinc-200">
                        <div className="flex items-center gap-1.5 truncate max-w-sm" title={rec.endpoint}>
                          <span className="font-semibold text-white">{rec.endpoint}</span>
                          {rec.symbol && (
                            <span className="px-1.5 py-0.2 rounded bg-white/10 text-zinc-300 text-[10px]">
                              {rec.symbol}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 单次权重 */}
                      <td className="px-3 py-2.5 text-right font-bold">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] ${
                          rec.weight >= 40 ? 'bg-amber-500/20 text-amber-300 font-black' :
                          rec.weight >= 5 ? 'bg-cyan-500/15 text-cyan-300' :
                          'text-zinc-300'
                        }`}>
                          +{rec.weight}
                        </span>
                      </td>

                      {/* 1m 累计权重 (x-mbx-used-weight-1m) */}
                      <td className="px-3 py-2.5 text-right">
                        <span className={`font-semibold ${
                          rec.usedWeight1m >= 2000 ? 'text-rose-400 font-bold' :
                          rec.usedWeight1m >= 1500 ? 'text-amber-400' :
                          'text-emerald-400'
                        }`}>
                          {rec.usedWeight1m}
                        </span>
                        <span className="text-[10px] text-zinc-500 ml-1">/2400</span>
                      </td>

                      {/* 状态码 */}
                      <td className="px-3 py-2.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                          rec.status === 200 ? 'bg-emerald-500/15 text-emerald-400' :
                          is429 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>
                          {rec.status}
                        </span>
                      </td>

                      {/* 耗时 */}
                      <td className="px-4 py-2.5 text-right text-zinc-400 text-xs">
                        {rec.durationMs}ms
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 底部条数控制器 */}
        {filteredRecords.length > 0 && (
          <div className="p-3 bg-zinc-900/60 border-t border-[#232326] flex items-center justify-between text-xs text-zinc-500">
            <span>当前显示最多 {displayCount} 条流水记录</span>
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">显示上限:</span>
              {[50, 100, 200].map(cnt => (
                <button
                  key={cnt}
                  onClick={() => setDisplayCount(cnt)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                    displayCount === cnt ? 'bg-zinc-800 text-white font-bold' : 'hover:text-zinc-300'
                  }`}
                >
                  {cnt}条
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
