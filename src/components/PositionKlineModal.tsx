import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  RefreshCw, 
  Layers, 
  BarChart2, 
  Maximize2, 
  Minimize2, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Sliders,
  DollarSign,
  Activity
} from 'lucide-react';
import { Position } from '../types';

export interface KlineCandle {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  trades: number;
  isClosed: boolean;
}

export type KlineTimeframe = '15m' | '1h' | '4h' | '1d';

interface PositionKlineModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: Position | null;
  formatPrice?: (symbol: string, price: number) => string;
  livePrices?: Record<string, any>;
}

export const PositionKlineModal: React.FC<PositionKlineModalProps> = ({
  isOpen,
  onClose,
  position,
  formatPrice,
  livePrices = {}
}) => {
  if (!isOpen || !position) return null;

  const symbol = position.symbol.toUpperCase();
  const isLong = position.side === 'BUY';
  const entryPrice = position.entryPrice || 0;

  // 周期切换：15m (系统维护的 2000 条底座), 1h (聚合), 4h (聚合), 1d (聚合)
  const [timeframe, setTimeframe] = useState<KlineTimeframe>('15m');
  const [raw15mCandles, setRaw15mCandles] = useState<KlineCandle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 画布缩放与平移状态
  const [visibleCount, setVisibleCount] = useState<number>(100); // 当前视窗展示蜡烛数量
  const [panOffset, setPanOffset] = useState<number>(0); // 距离最新一根的向左偏移量 (0 为最新)
  const [hoveredCandle, setHoveredCandle] = useState<KlineCandle | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const initialPanOffsetRef = useRef(0);

  // 拉取系统维护的 2000 条 15m K 线数据
  const fetchCandles = useCallback(async () => {
    if (!symbol) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/market/candles?symbol=${encodeURIComponent(symbol)}&limit=2000`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (data && Array.isArray(data.candles)) {
        setRaw15mCandles(data.candles);
      } else {
        throw new Error(data?.error || '返回 K 线数据异常');
      }
    } catch (err: any) {
      console.error(`Failed to fetch 15m candles for ${symbol}:`, err);
      setLoadError(err.message || '获取 K 线失败');
    } finally {
      setIsLoading(false);
    }
  }, [symbol]);

  // 打开弹窗或币对变更时加载
  useEffect(() => {
    fetchCandles();
    setPanOffset(0);
    setVisibleCount(100);
  }, [fetchCandles]);

  // 监听键盘 ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 聚合计算核心算法：将 2000 条 15m 原生 K 线聚合成 1H、4H、1D
  const displayCandles = useMemo(() => {
    if (!raw15mCandles || raw15mCandles.length === 0) return [];
    if (timeframe === '15m') return raw15mCandles;

    let intervalMs = 60 * 60 * 1000; // 1h
    if (timeframe === '4h') intervalMs = 4 * 60 * 60 * 1000;
    if (timeframe === '1d') intervalMs = 24 * 60 * 60 * 1000;

    const buckets = new Map<number, KlineCandle[]>();

    for (const c of raw15mCandles) {
      const bucketTime = Math.floor(c.openTime / intervalMs) * intervalMs;
      if (!buckets.has(bucketTime)) {
        buckets.set(bucketTime, []);
      }
      buckets.get(bucketTime)!.push(c);
    }

    const aggregated: KlineCandle[] = [];
    const sortedBucketTimes = Array.from(buckets.keys()).sort((a, b) => a - b);

    for (const bTime of sortedBucketTimes) {
      const group = buckets.get(bTime)!;
      if (group.length === 0) continue;

      const first = group[0];
      const last = group[group.length - 1];

      let high = -Infinity;
      let low = Infinity;
      let volume = 0;
      let quoteVolume = 0;
      let trades = 0;

      for (const item of group) {
        if (item.high > high) high = item.high;
        if (item.low < low) low = item.low;
        volume += item.volume;
        quoteVolume += item.quoteVolume;
        trades += item.trades;
      }

      aggregated.push({
        openTime: bTime,
        closeTime: bTime + intervalMs - 1,
        open: first.open,
        high: isFinite(high) ? high : first.open,
        low: isFinite(low) ? low : first.open,
        close: last.close,
        volume,
        quoteVolume,
        trades,
        isClosed: last.isClosed
      });
    }

    return aggregated;
  }, [raw15mCandles, timeframe]);

  // 计算均线 (MA7, MA25, MA99)
  const maLines = useMemo(() => {
    const calcMA = (period: number) => {
      const result: (number | null)[] = [];
      let sum = 0;
      for (let i = 0; i < displayCandles.length; i++) {
        sum += displayCandles[i].close;
        if (i >= period) {
          sum -= displayCandles[i - period].close;
          result.push(sum / period);
        } else if (i === period - 1) {
          result.push(sum / period);
        } else {
          result.push(null);
        }
      }
      return result;
    };
    return {
      ma7: calcMA(7),
      ma25: calcMA(25),
      ma99: calcMA(99)
    };
  }, [displayCandles]);

  // 当前实时价格
  const livePriceData = livePrices[symbol] || {};
  const currentPrice = livePriceData.lastPrice || livePriceData.markPrice || position.markPrice || entryPrice;

  // 格式化价格辅助函数
  const formatP = (val?: number) => {
    if (!val || isNaN(val)) return '-';
    if (formatPrice) return formatPrice(symbol, val);
    if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (val >= 1) return val.toFixed(4);
    return val.toFixed(6);
  };

  // 格式化时间戳
  const formatTime = (ts: number, tf: KlineTimeframe) => {
    const d = new Date(ts);
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    if (tf === '1d') return `${m}/${day}`;
    return `${m}/${day} ${h}:${min}`;
  };

  // ===================== Canvas 绘制逻辑 =====================
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (displayCandles.length === 0) {
      ctx.fillStyle = '#71717a';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(isLoading ? '加载 2000 条 K 线数据中...' : '暂无 K 线数据', width / 2, height / 2);
      return;
    }

    // 布局划分：主图 (价格+均线) 75%，副图 (成交量) 20%，底部时间轴 5%
    const rightAxisWidth = 70;
    const bottomAxisHeight = 26;
    const chartWidth = Math.max(10, width - rightAxisWidth);
    const mainChartHeight = Math.max(10, (height - bottomAxisHeight) * 0.74);
    const volChartTop = mainChartHeight + 8;
    const volChartHeight = Math.max(10, height - bottomAxisHeight - volChartTop);

    // 确定可见蜡烛窗口
    const totalCount = displayCandles.length;
    const count = Math.min(totalCount, Math.max(15, visibleCount));
    const maxOffset = Math.max(0, totalCount - count);
    const clampedOffset = Math.min(maxOffset, Math.max(0, panOffset));

    const startIndex = Math.max(0, totalCount - count - clampedOffset);
    const endIndex = Math.min(totalCount, startIndex + count);
    const visibleCandles = displayCandles.slice(startIndex, endIndex);

    if (visibleCandles.length === 0) return;

    // 计算价格极值 (包含持仓开仓价以完整展示开仓位置线)
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVolume = 0;

    for (const c of visibleCandles) {
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.low < minPrice) minPrice = c.low;
      if (c.volume > maxVolume) maxVolume = c.volume;
    }

    // 纳入持仓开仓价与当前价，使之不超出可视范围
    if (entryPrice > 0) {
      if (entryPrice > maxPrice) maxPrice = entryPrice;
      if (entryPrice < minPrice) minPrice = entryPrice;
    }
    if (currentPrice > 0) {
      if (currentPrice > maxPrice) maxPrice = currentPrice;
      if (currentPrice < minPrice) minPrice = currentPrice;
    }

    if (!isFinite(minPrice) || !isFinite(maxPrice) || minPrice === maxPrice) {
      minPrice = minPrice * 0.95 || 1;
      maxPrice = maxPrice * 1.05 || 2;
    }

    // 上下留 5% 缓冲区
    const pricePadding = (maxPrice - minPrice) * 0.06;
    maxPrice += pricePadding;
    minPrice = Math.max(0, minPrice - pricePadding);
    const priceRange = maxPrice - minPrice || 1;

    // 坐标转换工具函数
    const priceToY = (p: number) => {
      return mainChartHeight - ((p - minPrice) / priceRange) * mainChartHeight;
    };
    const yToPrice = (y: number) => {
      return minPrice + ((mainChartHeight - y) / mainChartHeight) * priceRange;
    };
    const volToY = (v: number) => {
      if (maxVolume <= 0) return volChartTop + volChartHeight;
      return volChartTop + volChartHeight - (v / maxVolume) * volChartHeight;
    };

    const candleWidth = chartWidth / visibleCandles.length;
    const bodyWidth = Math.max(1, candleWidth * 0.72);

    // 1. 绘制网格背景线与右侧价格刻度
    ctx.strokeStyle = '#232326';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = '#71717a';
    ctx.textAlign = 'left';

    const priceSteps = 5;
    for (let i = 0; i <= priceSteps; i++) {
      const p = minPrice + (priceRange / priceSteps) * i;
      const y = priceToY(p);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      // 右侧价格文字
      ctx.fillText(formatP(p), chartWidth + 6, y + 3.5);
    }

    // 绘制副图分割线
    ctx.strokeStyle = '#27272A';
    ctx.beginPath();
    ctx.moveTo(0, volChartTop);
    ctx.lineTo(width, volChartTop);
    ctx.stroke();

    // 2. 绘制成交量柱状图 (副图)
    for (let i = 0; i < visibleCandles.length; i++) {
      const c = visibleCandles[i];
      const isUp = c.close >= c.open;
      const x = i * candleWidth + candleWidth / 2;
      const barTop = volToY(c.volume);
      const barBottom = volChartTop + volChartHeight;

      ctx.fillStyle = isUp ? 'rgba(16, 185, 129, 0.45)' : 'rgba(244, 63, 94, 0.45)';
      ctx.fillRect(x - bodyWidth / 2, barTop, bodyWidth, Math.max(1, barBottom - barTop));
    }

    // 3. 绘制 K 线柱体与上下影线 (主图)
    for (let i = 0; i < visibleCandles.length; i++) {
      const c = visibleCandles[i];
      const isUp = c.close >= c.open;
      const x = i * candleWidth + candleWidth / 2;
      const color = isUp ? '#10b981' : '#f43f5e';

      const openY = priceToY(c.open);
      const closeY = priceToY(c.close);
      const highY = priceToY(c.high);
      const lowY = priceToY(c.low);

      // 上下影线
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, candleWidth * 0.12);
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // 实体
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1.5, Math.abs(openY - closeY));
      ctx.fillStyle = color;
      ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    }

    // 4. 绘制均线 (MA7, MA25, MA99)
    const drawMALine = (data: (number | null)[], color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let hasStarted = false;
      for (let i = 0; i < visibleCandles.length; i++) {
        const globalIdx = startIndex + i;
        const val = data[globalIdx];
        if (val !== null && isFinite(val)) {
          const x = i * candleWidth + candleWidth / 2;
          const y = priceToY(val);
          if (!hasStarted) {
            ctx.moveTo(x, y);
            hasStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
    };

    drawMALine(maLines.ma7, '#fbbf24'); // MA7 黄色
    drawMALine(maLines.ma25, '#c084fc'); // MA25 紫色
    drawMALine(maLines.ma99, '#38bdf8'); // MA99 蓝色

    // 5. 绘制【持仓开仓价】水平参考线 (青色 / 黄色虚线)
    if (entryPrice > 0 && entryPrice >= minPrice && entryPrice <= maxPrice) {
      const entryY = priceToY(entryPrice);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = isLong ? '#10b981' : '#f43f5e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, entryY);
      ctx.lineTo(chartWidth, entryY);
      ctx.stroke();
      ctx.restore();

      // 右侧开仓价标签
      ctx.fillStyle = isLong ? '#10b981' : '#f43f5e';
      ctx.fillRect(chartWidth + 2, entryY - 9, rightAxisWidth - 4, 18);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 9.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${isLong ? '开仓多' : '开仓空'}: ${formatP(entryPrice)}`, chartWidth + (rightAxisWidth - 2) / 2, entryY + 3.5);
    }

    // 6. 绘制【当前实时最新价 / 标记价】参考线 (白色点线)
    if (currentPrice > 0 && currentPrice >= minPrice && currentPrice <= maxPrice) {
      const liveY = priceToY(currentPrice);
      ctx.save();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, liveY);
      ctx.lineTo(chartWidth, liveY);
      ctx.stroke();
      ctx.restore();

      // 右侧当前价标签
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(chartWidth + 2, liveY - 8, rightAxisWidth - 4, 16);
      ctx.fillStyle = '#09090b';
      ctx.font = 'bold 9.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(formatP(currentPrice), chartWidth + (rightAxisWidth - 2) / 2, liveY + 3.5);
    }

    // 7. 绘制底部时间轴刻度
    ctx.strokeStyle = '#27272A';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - bottomAxisHeight);
    ctx.lineTo(width, height - bottomAxisHeight);
    ctx.stroke();

    ctx.fillStyle = '#71717a';
    ctx.font = '9.5px monospace';
    ctx.textAlign = 'center';

    const timeTickInterval = Math.max(1, Math.floor(visibleCandles.length / 6));
    for (let i = 0; i < visibleCandles.length; i += timeTickInterval) {
      const c = visibleCandles[i];
      const x = i * candleWidth + candleWidth / 2;
      ctx.fillText(formatTime(c.openTime, timeframe), x, height - 8);
    }

    // 8. 绘制十字光标 (Crosshair)
    if (mousePos && mousePos.x >= 0 && mousePos.x <= chartWidth && mousePos.y >= 0 && mousePos.y <= height - bottomAxisHeight) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#a1a1aa';
      ctx.lineWidth = 0.8;

      // 垂直十字线
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, height - bottomAxisHeight);
      ctx.stroke();

      // 水平十字线
      ctx.beginPath();
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(chartWidth, mousePos.y);
      ctx.stroke();

      ctx.restore();

      // 十字光标处的价格悬停标签
      if (mousePos.y <= mainChartHeight) {
        const hoverPrice = yToPrice(mousePos.y);
        ctx.fillStyle = '#3f3f46';
        ctx.fillRect(chartWidth + 2, mousePos.y - 8, rightAxisWidth - 4, 16);
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(formatP(hoverPrice), chartWidth + (rightAxisWidth - 2) / 2, mousePos.y + 3.5);
      }
    }

  }, [
    displayCandles,
    visibleCount,
    panOffset,
    entryPrice,
    currentPrice,
    isLong,
    maLines,
    mousePos,
    timeframe,
    isLoading
  ]);

  // 尺寸自适应与重绘
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
      drawChart();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawChart]);

  // 监听数据与状态变化触发绘制
  useEffect(() => {
    drawChart();
  }, [drawChart]);

  // 鼠标交互事件：悬停十字光标、滚轮缩放、拖拽平移
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x, y });

    // 计算悬停所在的蜡烛索引
    const rightAxisWidth = 70;
    const chartWidth = Math.max(10, rect.width - rightAxisWidth);
    if (x >= 0 && x <= chartWidth && displayCandles.length > 0) {
      const count = Math.min(displayCandles.length, Math.max(15, visibleCount));
      const maxOffset = Math.max(0, displayCandles.length - count);
      const clampedOffset = Math.min(maxOffset, Math.max(0, panOffset));
      const startIndex = Math.max(0, displayCandles.length - count - clampedOffset);
      const visibleCandles = displayCandles.slice(startIndex, startIndex + count);

      const candleWidth = chartWidth / visibleCandles.length;
      const idx = Math.floor(x / candleWidth);
      if (idx >= 0 && idx < visibleCandles.length) {
        setHoveredCandle(visibleCandles[idx]);
        setHoverIndex(startIndex + idx);
      } else {
        setHoveredCandle(null);
        setHoverIndex(null);
      }
    } else {
      setHoveredCandle(null);
      setHoverIndex(null);
    }

    // 拖拽平移
    if (isDraggingRef.current) {
      const deltaX = e.clientX - dragStartXRef.current;
      const count = Math.min(displayCandles.length, Math.max(15, visibleCount));
      const candleWidth = chartWidth / count;
      const deltaBars = Math.round(deltaX / candleWidth);
      const newOffset = initialPanOffsetRef.current + deltaBars;
      const maxOffset = Math.max(0, displayCandles.length - count);
      setPanOffset(Math.min(maxOffset, Math.max(0, newOffset)));
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    initialPanOffsetRef.current = panOffset;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setMousePos(null);
    setHoveredCandle(null);
    setHoverIndex(null);
  };

  // 滚轮缩放
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
    setVisibleCount(prev => {
      const next = Math.round(prev * zoomFactor);
      return Math.min(displayCandles.length || 200, Math.max(15, next));
    });
  };

  // 重置视窗视角
  const handleResetView = () => {
    setPanOffset(0);
    setVisibleCount(100);
  };

  // 盈亏与收益率计算
  const notional = entryPrice * position.amount;
  const livePnl = currentPrice > 0 
    ? (isLong ? (currentPrice - entryPrice) * position.amount : (entryPrice - currentPrice) * position.amount)
    : position.pnl;
  const livePnlPercent = notional > 0 ? (livePnl / notional) * 100 : position.pnlPercent;

  // 悬停蜡烛详情
  const hoverStats = useMemo(() => {
    const c = hoveredCandle || (displayCandles.length > 0 ? displayCandles[displayCandles.length - 1] : null);
    if (!c) return null;
    const change = c.close - c.open;
    const changePercent = c.open > 0 ? (change / c.open) * 100 : 0;
    const isUp = change >= 0;
    return {
      time: formatTime(c.openTime, timeframe),
      open: formatP(c.open),
      high: formatP(c.high),
      low: formatP(c.low),
      close: formatP(c.close),
      change: `${isUp ? '+' : ''}${formatP(change)}`,
      changePercent: `${isUp ? '+' : ''}${changePercent.toFixed(2)}%`,
      volume: c.volume.toLocaleString('en-US', { maximumFractionDigits: 2 }),
      quoteVolume: c.quoteVolume.toLocaleString('en-US', { maximumFractionDigits: 2 }),
      isUp
    };
  }, [hoveredCandle, displayCandles, timeframe]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-6xl h-[92vh] bg-[#0E0E10] border border-[#232326] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="px-5 py-3.5 border-b border-[#232326] bg-[#141416] flex flex-wrap items-center justify-between gap-3 shrink-0">
          
          {/* 左侧：合约与持仓基本信息 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold text-white font-mono tracking-wide">
                {symbol}
              </h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                isLong ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}>
                {isLong ? '多单 LONG' : '空单 SHORT'}
              </span>
            </div>

            <div className="h-4 w-px bg-zinc-700 hidden sm:block" />

            {/* 开仓价与当前价 */}
            <div className="flex items-center gap-3 text-xs font-mono">
              <div>
                <span className="text-zinc-500 mr-1">开仓价:</span>
                <span className="text-amber-300 font-bold">{formatP(entryPrice)}</span>
              </div>
              <div>
                <span className="text-zinc-500 mr-1">标记价:</span>
                <span className="text-white font-bold">{formatP(currentPrice)}</span>
              </div>
              <div>
                <span className="text-zinc-500 mr-1">持仓量:</span>
                <span className="text-zinc-300 font-semibold">{position.amount}</span>
              </div>
              <div>
                <span className="text-zinc-500 mr-1">未实现盈亏:</span>
                <span className={`font-bold ${livePnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {livePnl >= 0 ? '+' : ''}{livePnl.toFixed(2)} USDT ({livePnlPercent >= 0 ? '+' : ''}{livePnlPercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>

          {/* 右侧：周期切换按钮与关闭按钮 */}
          <div className="flex items-center gap-2.5">
            
            {/* 周期切换按钮 (15分 / 1小时 / 4小时 / 日线) */}
            <div className="flex items-center bg-[#1A1A1E] p-1 rounded-xl border border-zinc-800">
              {(
                [
                  { id: '15m', label: '15分钟', badge: '2000条' },
                  { id: '1h', label: '1小时', badge: '聚合' },
                  { id: '4h', label: '4小时', badge: '聚合' },
                  { id: '1d', label: '日线', badge: '聚合' }
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTimeframe(t.id);
                    setPanOffset(0);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                    timeframe === t.id
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                  }`}
                  title={`${t.label} (由系统维护的 2000 条 15m 底座实时${t.badge})`}
                >
                  <span>{t.label}</span>
                  <span className="text-[9px] opacity-75 font-mono">{t.badge}</span>
                </button>
              ))}
            </div>

            {/* 刷新按钮 */}
            <button
              type="button"
              onClick={fetchCandles}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer border border-zinc-800"
              title="重新向后台拉取 2000 根最新 K 线数据"
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin text-amber-400' : ''} />
            </button>

            {/* 视角复位 */}
            <button
              type="button"
              onClick={handleResetView}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer border border-zinc-800"
              title="复位视角 (展示最新蜡烛)"
            >
              <RotateCcw size={15} />
            </button>

            {/* 关闭按钮 (窗口上有关闭按钮) */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-rose-500/20 hover:border-rose-500/40 border border-transparent transition-all cursor-pointer ml-1"
              title="关闭窗口 (ESC)"
            >
              <X size={20} />
            </button>
          </div>

        </div>

        {/* 顶部行情数据状态指标条 (OHLCV & MA 指标) */}
        <div className="px-5 py-2 bg-[#121214] border-b border-[#1E1E22] flex flex-wrap items-center justify-between text-xs font-mono text-zinc-400 shrink-0">
          {hoverStats ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-zinc-300 font-bold">{hoverStats.time}</span>
              <div>开: <span className="text-zinc-200 font-semibold">{hoverStats.open}</span></div>
              <div>高: <span className="text-zinc-200 font-semibold">{hoverStats.high}</span></div>
              <div>低: <span className="text-zinc-200 font-semibold">{hoverStats.low}</span></div>
              <div>收: <span className="text-zinc-200 font-semibold">{hoverStats.close}</span></div>
              <div>
                涨跌: <span className={`font-bold ${hoverStats.isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {hoverStats.change} ({hoverStats.changePercent})
                </span>
              </div>
              <div>成交量: <span className="text-amber-300">{hoverStats.volume}</span></div>
              <div>成交额: <span className="text-cyan-300">{hoverStats.quoteVolume} USDT</span></div>
            </div>
          ) : (
            <span className="text-zinc-500 italic">移动光标查看具体蜡烛数据</span>
          )}

          {/* 均线图例 */}
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-amber-400 flex items-center gap-1">
              <span className="w-2 h-0.5 bg-amber-400 inline-block" /> MA7
            </span>
            <span className="text-purple-400 flex items-center gap-1">
              <span className="w-2 h-0.5 bg-purple-400 inline-block" /> MA25
            </span>
            <span className="text-sky-400 flex items-center gap-1">
              <span className="w-2 h-0.5 bg-sky-400 inline-block" /> MA99
            </span>
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-2.5 h-0.5 border-t border-dashed border-emerald-400 inline-block" /> 开仓价线
            </span>
          </div>
        </div>

        {/* 主图 Canvas 画布容器 */}
        <div ref={containerRef} className="relative flex-1 w-full bg-[#0E0E10] overflow-hidden select-none cursor-crosshair">
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            className="absolute inset-0 block w-full h-full"
          />

          {/* 加载遮罩 */}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-xs pointer-events-none">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mb-2" />
              <span className="text-sm font-mono text-zinc-300">正在获取系统维护的 2000 条 15m K线并进行聚合...</span>
            </div>
          )}

          {/* 错误提示 */}
          {loadError && !isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 pointer-events-none">
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-sm font-mono flex flex-col items-center gap-2">
                <span>⚠️ {loadError}</span>
                <button
                  type="button"
                  onClick={fetchCandles}
                  className="px-3 py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-white text-xs font-bold pointer-events-auto cursor-pointer"
                >
                  重试
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 底部信息与交互指南栏 */}
        <div className="px-5 py-2.5 border-t border-[#232326] bg-[#141416] flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-500 shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-zinc-400">
              数据源: <strong className="text-emerald-400">系统维护 2000 根 15M 权威底座</strong>
            </span>
            <span>
              当前聚合展示: <strong className="text-zinc-200">{displayCandles.length}</strong> 根蜡烛
            </span>
            <span>
              可视窗口: <strong className="text-zinc-200">{Math.min(displayCandles.length, visibleCount)}</strong> 根
            </span>
          </div>

          <div className="flex items-center gap-4 text-zinc-400">
            <span>🖱️ 鼠标滚轮: 缩放 K 线</span>
            <span>🖐️ 按住左键拖拽: 左右平移</span>
            <span>🎯 虚线标记: 开仓价与当前标记价</span>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold cursor-pointer transition-colors"
            >
              关闭窗口
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PositionKlineModal;
