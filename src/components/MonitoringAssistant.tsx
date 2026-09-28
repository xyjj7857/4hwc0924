/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Play, 
  Square, 
  Settings, 
  Volume2, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  AlertCircle,
  Upload,
  Pause,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Activity,
  Zap,
  HelpCircle,
  ClipboardList,
  Trash2,
  Music,
  ArrowUpDown,
  Info,
  Lock,
  ListOrdered,
  BarChart2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TradeLog, Position } from '../types';
import BoardRecordModal from './BoardRecordModal';
import { matchSymbolWithPositions } from '../utils/entryVerification';
import { useMarketPrices } from '../context/MarketPriceContext';

// --- Types ---

interface Config {
  yMin: number;
  ySec: number;
  m1: number; // 24h volume threshold
  n1: number; // 15m volume threshold
  gainThreshold: number;
  lossThreshold: number;
  amplitudeThreshold: number;
  enableAlertTimeout: boolean;
  alertTimeoutSeconds: number;
  volumeKCount?: number;
  gainKCount?: number;
  // Legacy compatibility fields
  xMin?: number;
  xSec?: number;
  m?: number;
  n?: number;
}

interface SymbolData {
  symbol: string;
  volume24h: number;
  volume15m: number;
  openPrice: number;
  lastPrice: number;
  change: number;
  highChange?: number;
  change24h: number;
  amplitude?: number;
  high?: number;
  low?: number;
  closePos?: number;
  fundingRate?: number;
  fundingIntervalHours?: number;
  settlementCycle?: string;
  nextFundingTime?: number;
  listingOpen?: number;
  listingTime?: number;
  historicalHigh?: number;
  historicalLow?: number;
  highTime?: number;
  lowTime?: number;
  laterExtreme?: 'high' | 'low' | 'same';
  candlesCount?: number;
  minVolumePastK?: number;
  volumeRatioPastK?: number;
  maxGainPastK_standard?: number;
  maxGainPastK_high?: number;
  past15mCandles?: Array<{
    kIndex: number;
    openTime: number;
    closeTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    change: number;
    highChange: number;
  }>;
}

interface FundingRateData {
  symbol: string;
  fundingRate: number;
  settlementCycle: string;
  volume24h: number;
  nextFundingTime?: number;
  fetchedAt?: number;
}

interface ScanResult {
  gainers: SymbolData[];
  losers: SymbolData[];
  amplitude15m: SymbolData[];
  gainers24h: SymbolData[];
  losers24h: SymbolData[];
  timestamp: number;
}

interface MonitoringAssistantProps {
  apiConfig: { apiKey: string; apiSecret: string; baseUrl: string };
  isConnected: boolean;
  onSelectSymbol: (symbol: string) => void;
  addLog: (message: string, type?: TradeLog['type']) => void;
  onSwitchToTrade: () => void;
  isMuted?: boolean;
  positions?: Position[];
}

const TRANSLATIONS = {
  title: "币安永续监控",
  subtitle: "Binance Futures Monitor",
  parameterConfig: "参数配置",
  cycleSettleTitle: "15M周期结算与筛选参数",
  settleTime: "周期结算时刻 (分:秒)",
  vol24hM: "24h成交额门槛 (USDT)",
  vol15mN: "15m成交额门槛 (USDT)",
  alertThreshold: "报警阈值",
  gainThreshold: "涨幅阈值 (%)",
  lossThreshold: "跌幅阈值 (%)",
  amplitudeThreshold: "振幅阈值 (%)",
  voiceAlerts: "语音报警",
  stopAnnouncement: "停止播报",
  gainAlertSound: "涨幅报警音 (MP3)",
  lossAlertSound: "跌幅报警音 (MP3)",
  amplitudeAlertSound: "振幅报警音 (MP3)",
  uploaded: "已上传",
  clickToUpload: "点击上传",
  fundingRateLeaderboard: "资金费率排行榜",
  gainer15m: "15分钟涨幅榜",
  loser15m: "15分钟跌幅榜",
  amplitude15m: "15分钟振幅榜",
  gainer24h: "24小时涨幅榜",
  loser24h: "24小时跌幅榜",
  tableSymbol: "币种",
  tableRate: "费率",
  tableCycle: "周期",
  table24hVol: "24h成交额（万）",
  table15mVol: "15m成交额（万）",
  tableGain: "涨幅",
  tableLoss: "跌幅",
  tableHighGain: "高涨幅",
  tableHighLoss: "高跌幅",
  tableFundingCycle: "资金费率(周期)",
  tablePrice: "推送当前价",
  tableOpenPrice: "15m开盘价",
  tableExtremes: "全历史高低",
  gainModeStandard: "常规模式",
  gainModeHigh: "高涨幅模式",
  tableAmplitude: "振幅",
  volumeKCount: "量k 根数 (USDT最低成交额)",
  gainKCount: "涨跌k 根数 (最大涨幅)",
  tableVolumeRatio: "量比",
  loading: "加载中...",
  currentTime: "当前时间",
  symbolsUnit: "币种",
  apiError: "API 错误",
  recentScanStats: "最近结算统计",
  totalSymbols: "总币种",
  passed15m: "达标币对",
  triggerGainAlert: "触发涨幅警报！",
  triggerLossAlert: "触发跌幅警报！",
  triggerAmpAlert: "触发振幅警报！",
  alertBannerSub: "当前榜单中已有币种超过设定的阈值。",
  dismissAlert: "我知道了",
  waitingScan: "等待结算结果...",
  stopProgram: "停止程序",
  startProgram: "启动程序",
  settleCountdown: "15分钟结算倒计时",
  tableClosePos: "收位",
};

// 方案A：收位纯数值与状态色
const getClosePosStyle = (val?: number) => {
  if (val === undefined || isNaN(val)) return 'text-zinc-500';
  if (val >= 80) return 'text-emerald-400 font-bold'; // >= 80% 翠绿高亮 (高位强势)
  if (val >= 60) return 'text-emerald-300 font-semibold'; // 60~80% 偏强多头
  if (val >= 40) return 'text-zinc-300 font-medium'; // 40~60% 中位均衡
  if (val >= 20) return 'text-amber-400 font-medium'; // 20~40% 偏弱
  return 'text-rose-400 font-bold'; // <= 20% 暗红 (低位弱势)
};

const getClosePosTag = (val?: number) => {
  if (val === undefined || isNaN(val)) return '--';
  if (val >= 80) return '高位';
  if (val >= 60) return '偏强';
  if (val >= 40) return '中位';
  if (val >= 20) return '偏弱';
  return '低位';
};

export default function MonitoringAssistant({ 
  apiConfig,
  isConnected,
  onSelectSymbol,
  addLog,
  onSwitchToTrade,
  isMuted = false,
  positions = []
}: MonitoringAssistantProps) {
  const t = TRANSLATIONS;
  const { prices: livePrices, monitoring15m: sse15m, triggerCycleScan15m, fundingRates: contextFundingRates } = useMarketPrices();

  // --- Helper for checking holding position ---
  const isHoldingPosition = useCallback((symbol: string) => {
    if (!symbol || !positions || positions.length === 0) return false;
    return matchSymbolWithPositions(symbol, positions).hasPosition;
  }, [positions]);

  // --- State ---
  const [isRunning, setIsRunning] = useState(false);
  const [config, setConfig] = useState<Config>({
    yMin: 14,
    ySec: 30,
    m1: 15000000,
    n1: 3000000,
    gainThreshold: 5,
    lossThreshold: 5,
    amplitudeThreshold: 8,
    enableAlertTimeout: true,
    alertTimeoutSeconds: 15,
  });

  const [results, setResults] = useState<ScanResult | null>(null);
  const [fundingRates, setFundingRates] = useState<FundingRateData[]>([]);
  const [fundingPage, setFundingPage] = useState<number>(1);
  const [isFetchingFunding, setIsFetchingFunding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isBoardRecordOpen, setIsBoardRecordOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [phaseCountdown, setPhaseCountdown] = useState<string>('00:00');
  const [dataEngine, setDataEngine] = useState<any>(null);
  const [scanStats, setScanStats] = useState<{
    lastScanTime: string;
    totalTickers: number;
    passed24h?: number;
    passed15m: number;
  } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isScanningManual, setIsScanningManual] = useState(false);
  
  const [audioFiles, setAudioFiles] = useState<{ gain: string | null; loss: string | null; amp: string | null }>({
    gain: null,
    loss: null,
    amp: null,
  });
  const [audioMeta, setAudioMeta] = useState<{
    gain?: { name: string; size?: number };
    loss?: { name: string; size?: number };
    amp?: { name: string; size?: number };
  }>({});
  const [uploadingType, setUploadingType] = useState<'gain' | 'loss' | 'amp' | null>(null);
  const [previewingType, setPreviewingType] = useState<'gain' | 'loss' | 'amp' | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [isAlerting, setIsAlerting] = useState(false);
  const [activeAlert, setActiveAlert] = useState<'gain' | 'loss' | 'amp' | null>(null);

  // --- 区域 1 折叠状态持久化控制 ---
  const [isArea1Collapsed, setIsArea1Collapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('area1_collapsed_15m');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const toggleArea1Collapse = useCallback(() => {
    setIsArea1Collapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('area1_collapsed_15m', String(next));
      } catch {}
      return next;
    });
  }, []);

  // --- 区域 2 各个榜单模块的独立向上折叠状态控制 ---
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('area2_collapsed_modules_15m');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    return {};
  });

  const toggleModuleCollapse = useCallback((moduleId: string) => {
    setCollapsedModules(prev => {
      const next = { ...prev, [moduleId]: !prev[moduleId] };
      try {
        localStorage.setItem('area2_collapsed_modules_15m', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const collapseAllModules = () => {
    const all = {
      gainers15m: true,
      losers15m: true,
      amplitude15m: true,
      gainers24h: true,
      losers24h: true,
    };
    setCollapsedModules(all);
    try {
      localStorage.setItem('area2_collapsed_modules_15m', JSON.stringify(all));
    } catch {}
  };

  const expandAllModules = () => {
    setCollapsedModules({});
    try {
      localStorage.removeItem('area2_collapsed_modules_15m');
    } catch {}
  };

  // --- 自定义 量k 数量 (默认 12 条，取当前未完结 15m 前 N 根完整 K 线的最低交易额 USDT) ---
  const [volumeKCount, setVolumeKCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('monitor_15m_volume_k_count');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 30) return parsed;
      }
    } catch {}
    return 12;
  });

  const handleUpdateVolumeKCount = useCallback(async (val: number) => {
    const clamped = Math.max(1, Math.min(30, val));
    setVolumeKCount(clamped);
    try {
      localStorage.setItem('monitor_15m_volume_k_count', String(clamped));
    } catch {}
    try {
      await fetch('/api/monitoring/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volumeKCount: clamped })
      });
    } catch (err) {
      console.error('Failed to sync volumeKCount to server:', err);
    }
  }, []);

  // --- 自定义 涨跌k 数量 (默认 6 条，取当前未完结 15m 前 M 根完结 K 线的最大涨幅) ---
  const [gainKCount, setGainKCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('monitor_15m_gain_k_count');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 30) return parsed;
      }
    } catch {}
    return 6;
  });

  const handleUpdateGainKCount = useCallback(async (val: number) => {
    const clamped = Math.max(1, Math.min(30, val));
    setGainKCount(clamped);
    try {
      localStorage.setItem('monitor_15m_gain_k_count', String(clamped));
    } catch {}
    try {
      await fetch('/api/monitoring/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gainKCount: clamped })
      });
    } catch (err) {
      console.error('Failed to sync gainKCount to server:', err);
    }
  }, []);

  // --- 涨跌幅计算模式：'standard' (常规模式：基准为15m开盘价) 或 'high' (高涨幅模式：基准为当前价) ---
  const [gainMode, setGainMode] = useState<'standard' | 'high'>(() => {
    try {
      const saved = localStorage.getItem('monitor_15m_gain_mode');
      if (saved === 'high' || saved === 'standard') return saved;
    } catch {}
    return 'standard';
  });

  const toggleGainMode = useCallback((mode: 'standard' | 'high') => {
    setGainMode(mode);
    try {
      localStorage.setItem('monitor_15m_gain_mode', mode);
    } catch {}
  }, []);

  // --- 排序方案状态：方案1、固定（默认，排序不发生变化） | 方案2、排序（随涨跌幅实时重排序） ---
  const [sortScheme, setSortScheme] = useState<'fixed' | 'dynamic'>(() => {
    try {
      const saved = localStorage.getItem('monitor_15m_sort_scheme');
      if (saved === 'dynamic' || saved === 'fixed') return saved;
    } catch {}
    return 'fixed';
  });

  const toggleSortScheme = useCallback((scheme: 'fixed' | 'dynamic') => {
    setSortScheme(scheme);
    try {
      localStorage.setItem('monitor_15m_sort_scheme', scheme);
    } catch {}
  }, []);

  // 价格通用格式化辅助函数
  const formatPriceVal = useCallback((price?: number | null) => {
    if (price === undefined || price === null || isNaN(price) || price === 0) return '--';
    const abs = Math.abs(price);
    if (abs >= 1000) {
      return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (abs >= 1) return price.toFixed(4);
    if (abs >= 0.01) return price.toFixed(5);
    if (abs >= 0.0001) return price.toFixed(6);
    return price.toFixed(8);
  }, []);

  // 格式化涨跌幅文本
  const formatChangeText = useCallback((val?: number | null) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00%';
    const prefix = val > 0 ? '+' : '';
    return `${prefix}${val.toFixed(2)}%`;
  }, []);

  // 聚合当前币种的最新显示数据（实时推送当前价、15m开盘价、资金费率、结算周期、常规涨幅、高涨幅、量k、涨跌k）
  const getSymbolDisplayData = useCallback((item: SymbolData) => {
    const livePriceObj = livePrices[item.symbol];
    const currentPrice = (livePriceObj && livePriceObj.lastPrice > 0) ? livePriceObj.lastPrice : (item.lastPrice || 0);
    const openPrice = item.openPrice || 0;

    // 常规涨跌幅: (当前价 - 15m开盘价) / 15m开盘价 * 100
    let standardChange = item.change;
    if (currentPrice > 0 && openPrice > 0) {
      standardChange = ((currentPrice - openPrice) / openPrice) * 100;
    }

    // 高涨幅模式: (当前价 - 15m开盘价) / 当前价 * 100
    let highGain = item.highChange !== undefined ? item.highChange : standardChange;
    if (currentPrice > 0 && openPrice > 0) {
      highGain = ((currentPrice - openPrice) / currentPrice) * 100;
    }

    const effectiveChange = gainMode === 'high' ? highGain : standardChange;

    // 资金费率与结算周期
    let fundingRate = item.fundingRate;
    let settlementCycle = item.settlementCycle;
    if (fundingRate === undefined || !settlementCycle) {
      const found = fundingRates.find(f => f.symbol === item.symbol) || contextFundingRates?.find(f => f.symbol === item.symbol);
      if (found) {
        if (fundingRate === undefined) fundingRate = found.fundingRate;
        if (!settlementCycle) settlementCycle = found.settlementCycle;
      }
    }

    // 历史最高/最低价与后出标记
    let historicalHigh = item.historicalHigh || 0;
    let historicalLow = item.historicalLow || 0;
    let highTime = item.highTime || 0;
    let lowTime = item.lowTime || 0;
    let laterExtreme = item.laterExtreme || 'same';

    if (currentPrice > 0) {
      if (historicalHigh === 0 || currentPrice > historicalHigh) {
        historicalHigh = currentPrice;
        highTime = Date.now();
        laterExtreme = 'high';
      }
      if (historicalLow === 0 || currentPrice < historicalLow) {
        historicalLow = currentPrice;
        lowTime = Date.now();
        laterExtreme = 'low';
      }
    }

    // 动态计算 量k 指标（当前未完结 15m 成交额 / 前 volumeKCount 根完整K线最低成交额）
    const current15mVolume = item.volume15m || 0;
    let minVolumePastK = item.minVolumePastK || 0;
    let volumeRatioPastK = item.volumeRatioPastK || 0;

    if (item.past15mCandles && item.past15mCandles.length > 0) {
      const volCandles = item.past15mCandles.slice(0, Math.max(1, volumeKCount));
      const validVols = volCandles.map(c => c.volume).filter(v => v > 0);
      if (validVols.length > 0) {
        minVolumePastK = Math.min(...validVols);
        volumeRatioPastK = minVolumePastK > 0 ? (current15mVolume / minVolumePastK) : 0;
      }
    } else if (minVolumePastK > 0) {
      volumeRatioPastK = current15mVolume / minVolumePastK;
    }

    // 动态计算 涨跌k 指标（当前未完结 15m K线前的 gainKCount 根完结K线的最大涨幅）
    let maxGainPastK = gainMode === 'high' ? (item.maxGainPastK_high ?? 0) : (item.maxGainPastK_standard ?? 0);
    if (item.past15mCandles && item.past15mCandles.length > 0) {
      const gainCandles = item.past15mCandles.slice(0, Math.max(1, gainKCount));
      const validGains = gainCandles.map(c => gainMode === 'high' ? c.highChange : c.change);
      if (validGains.length > 0) {
        maxGainPastK = Math.max(...validGains);
      }
    }

    // 动态计算 当前K线高低价与收位 (方案 A)
    let currentHigh = item.high || currentPrice;
    let currentLow = item.low || currentPrice;
    if (currentPrice > 0) {
      if (currentHigh <= 0 || currentPrice > currentHigh) currentHigh = currentPrice;
      if (currentLow <= 0 || currentPrice < currentLow) currentLow = currentPrice;
    }
    let closePos = item.closePos;
    if (currentHigh > currentLow && currentPrice > 0) {
      closePos = Math.min(100, Math.max(0, ((currentPrice - currentLow) / (currentHigh - currentLow)) * 100));
    } else if (closePos === undefined) {
      closePos = 50.0;
    }

    return {
      currentPrice,
      openPrice,
      standardChange,
      highGain,
      effectiveChange,
      high: currentHigh,
      low: currentLow,
      closePos,
      fundingRate: fundingRate !== undefined ? fundingRate : 0,
      settlementCycle: settlementCycle || '8h',
      listingOpen: item.listingOpen || 0,
      listingTime: item.listingTime || 0,
      historicalHigh,
      historicalLow,
      highTime,
      lowTime,
      laterExtreme,
      candlesCount: item.candlesCount || 0,
      currentVolume: current15mVolume,
      minVolumePastK,
      volumeRatioPastK,
      maxGainPastK
    };
  }, [livePrices, gainMode, fundingRates, contextFundingRates, volumeKCount, gainKCount]);

  // 依据当前模式与排序方案展示 15M 各榜单
  const displayGainers = useMemo(() => {
    if (!results?.gainers || results.gainers.length === 0) return [];
    if (sortScheme === 'fixed') return results.gainers;
    return [...results.gainers].sort((a, b) => {
      const changeA = getSymbolDisplayData(a).effectiveChange;
      const changeB = getSymbolDisplayData(b).effectiveChange;
      return changeB - changeA;
    });
  }, [results?.gainers, sortScheme, getSymbolDisplayData]);

  const displayLosers = useMemo(() => {
    if (!results?.losers || results.losers.length === 0) return [];
    if (sortScheme === 'fixed') return results.losers;
    return [...results.losers].sort((a, b) => {
      const changeA = getSymbolDisplayData(a).effectiveChange;
      const changeB = getSymbolDisplayData(b).effectiveChange;
      return changeA - changeB;
    });
  }, [results?.losers, sortScheme, getSymbolDisplayData]);

  const displayAmplitude = useMemo(() => {
    if (!results?.amplitude15m || results.amplitude15m.length === 0) return [];
    if (sortScheme === 'fixed') return results.amplitude15m;
    return [...results.amplitude15m].sort((a, b) => (b.amplitude || 0) - (a.amplitude || 0));
  }, [results?.amplitude15m, sortScheme]);

  const displayGainers24h = useMemo(() => {
    if (!results?.gainers24h || results.gainers24h.length === 0) return [];
    if (sortScheme === 'fixed') return results.gainers24h;
    return [...results.gainers24h].sort((a, b) => b.change24h - a.change24h);
  }, [results?.gainers24h, sortScheme]);

  const displayLosers24h = useMemo(() => {
    if (!results?.losers24h || results.losers24h.length === 0) return [];
    if (sortScheme === 'fixed') return results.losers24h;
    return [...results.losers24h].sort((a, b) => a.change24h - b.change24h);
  }, [results?.losers24h, sortScheme]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Load persistent audio settings from server on mount
  useEffect(() => {
    const loadAudioSettings = async () => {
      try {
        const res = await fetch("/api/audio-settings");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.audios) {
            const files: any = {};
            const meta: any = {};
            (['gain', 'loss', 'amp'] as const).forEach(key => {
              if (data.audios[key]) {
                files[key] = data.audios[key].url;
                meta[key] = { name: data.audios[key].name, size: data.audios[key].size };
              }
            });
            setAudioFiles(prev => ({ ...prev, ...files }));
            setAudioMeta(prev => ({ ...prev, ...meta }));
          }
        }
      } catch (err) {
        console.warn("Failed to load audio settings:", err);
      }
    };
    loadAudioSettings();
  }, []);

  // --- Audio Logic ---

  const handleFileUpload = (type: 'gain' | 'loss' | 'amp', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let alertLabel = '上涨';
    if (type === 'loss') alertLabel = '下跌';
    if (type === 'amp') alertLabel = '振幅';

    setUploadingType(type);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const base64Data = dataUrl.split(',')[1];
        
        const res = await fetch("/api/audio-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            name: file.name,
            size: file.size,
            data: base64Data
          })
        });

        if (res.ok) {
          const result = await res.json();
          if (result.success) {
            setAudioFiles(prev => ({ ...prev, [type]: result.url }));
            setAudioMeta(prev => ({ ...prev, [type]: { name: file.name, size: file.size } }));
            addLog(`[语音报警] 「${alertLabel}」警报音频已成功上传并永久保存在服务器中`, 'SUCCESS');
          } else {
            throw new Error(result.error || "Upload failed");
          }
        } else {
          throw new Error(`Server returned ${res.status}`);
        }
      } catch (err: any) {
        console.error("Audio upload error:", err);
        addLog(`[语音报警] 「${alertLabel}」上传出错: ${err?.message || err}`, 'ERROR');
      } finally {
        setUploadingType(null);
      }
    };
    reader.onerror = () => {
      setUploadingType(null);
      addLog(`[语音报警] 读取本地文件失败`, 'ERROR');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteAudio = async (type: 'gain' | 'loss' | 'amp', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    let alertLabel = '上涨';
    if (type === 'loss') alertLabel = '下跌';
    if (type === 'amp') alertLabel = '振幅';

    try {
      if (previewingType === type && previewAudioRef.current) {
        previewAudioRef.current.pause();
        setPreviewingType(null);
      }
      const res = await fetch(`/api/audio/${type}`, { method: "DELETE" });
      if (res.ok) {
        setAudioFiles(prev => ({ ...prev, [type]: null }));
        setAudioMeta(prev => {
          const next = { ...prev };
          delete next[type];
          return next;
        });
        addLog(`[语音报警] 已删除「${alertLabel}」服务器警报音频`, 'INFO');
      }
    } catch (err: any) {
      console.error("Delete audio error:", err);
      addLog(`[语音报警] 删除失败: ${err?.message || err}`, 'ERROR');
    }
  };

  const handleTogglePreview = (type: 'gain' | 'loss' | 'amp', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const url = audioFiles[type];
    if (!url) return;

    if (previewingType === type) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
      }
      setPreviewingType(null);
    } else {
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio();
      }
      previewAudioRef.current.src = url;
      previewAudioRef.current.muted = isMuted;
      previewAudioRef.current.onended = () => setPreviewingType(null);
      previewAudioRef.current.onerror = () => setPreviewingType(null);
      previewAudioRef.current.play().catch(e => {
        console.warn("Preview playback failed:", e);
        setPreviewingType(null);
      });
      setPreviewingType(type);
    }
  };

  const alertTimerRef = useRef<any>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    return () => {
      if (alertTimerRef.current) {
        clearTimeout(alertTimerRef.current);
      }
    };
  }, []);

  const stopAlert = useCallback(() => {
    setIsAlerting(false);
    setActiveAlert(null);
    
    const pauseAudio = () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        } catch (e) {
          console.error("Failed to pause audio:", e);
        }
      }
    };

    if (playPromiseRef.current) {
      playPromiseRef.current
        .then(() => {
          pauseAudio();
          playPromiseRef.current = null;
        })
        .catch(() => {
          pauseAudio();
          playPromiseRef.current = null;
        });
    } else {
      pauseAudio();
    }

    if (alertTimerRef.current) {
      clearTimeout(alertTimerRef.current);
      alertTimerRef.current = null;
    }
  }, []);

  const triggerAlert = useCallback((type: 'gain' | 'loss' | 'amp') => {
    if (audioFiles[type] && !isAlerting) {
      setActiveAlert(type);
      setIsAlerting(true);
      if (audioRef.current) {
        audioRef.current.src = audioFiles[type]!;
        audioRef.current.loop = true;
        audioRef.current.muted = isMuted;
        
        const promise = audioRef.current.play();
        playPromiseRef.current = promise;
        
        promise
          .then(() => {
            if (playPromiseRef.current === promise) {
              playPromiseRef.current = null;
            }
          })
          .catch(err => {
            console.warn("Audio play failed or was interrupted:", err);
            if (playPromiseRef.current === promise) {
              playPromiseRef.current = null;
            }
          });
      }

      if (alertTimerRef.current) {
        clearTimeout(alertTimerRef.current);
      }

      if (config.enableAlertTimeout) {
        alertTimerRef.current = setTimeout(() => {
          stopAlert();
          let alertLabel = '价格上涨';
          if (type === 'loss') alertLabel = '价格下跌';
          if (type === 'amp') alertLabel = '15m振幅';
          addLog(`[系统] 警报持续时间已达 ${config.alertTimeoutSeconds} 秒，自动完成清除本次警报音和特效`, 'INFO');
        }, config.alertTimeoutSeconds * 1000);
      }
    }
  }, [audioFiles, isAlerting, isMuted, config.enableAlertTimeout, config.alertTimeoutSeconds, stopAlert, addLog]);

  // --- Sync State from Backend / SSE ---

  const lastSeenResultTimestamp = useRef<number>(-1);

  // Sync with SSE updates from MarketPriceContext
  useEffect(() => {
    if (sse15m) {
      setIsRunning(Boolean(sse15m.isRunning));
      if (sse15m.config) {
        setConfig(sse15m.config);
        if (sse15m.config.volumeKCount && !localStorage.getItem('monitor_15m_volume_k_count')) {
          setVolumeKCount(sse15m.config.volumeKCount);
        }
        if (sse15m.config.gainKCount && !localStorage.getItem('monitor_15m_gain_k_count')) {
          setGainKCount(sse15m.config.gainKCount);
        }
      }
      if (sse15m.scanStats) setScanStats(sse15m.scanStats);
      if (sse15m.results) setResults(sse15m.results);
      if (sse15m.fundingRates) setFundingRates(sse15m.fundingRates);
      if (sse15m.phaseCountdown) setPhaseCountdown(sse15m.phaseCountdown);
      if (sse15m.dataEngine) setDataEngine(sse15m.dataEngine);
    }
  }, [sse15m]);

  useEffect(() => {
    if (contextFundingRates && contextFundingRates.length > 0) {
      setFundingRates(contextFundingRates);
    }
  }, [contextFundingRates]);

  // Initial status fetch on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/monitoring/status");
        if (res.ok) {
          const text = await res.text();
          if (!text || text.trim().startsWith('<')) return;
          const data = JSON.parse(text);
          setIsRunning(data.isRunning);
          if (data.config) {
            setConfig(data.config);
            if (data.config.volumeKCount && !localStorage.getItem('monitor_15m_volume_k_count')) {
              setVolumeKCount(data.config.volumeKCount);
            }
            if (data.config.gainKCount && !localStorage.getItem('monitor_15m_gain_k_count')) {
              setGainKCount(data.config.gainKCount);
            }
          }
          setScanStats(data.scanStats);
          setResults(data.results);
          setFundingRates(data.fundingRates || []);
          setPhaseCountdown(data.phase2Countdown || data.phaseCountdown || '00:00');
          if (data.dataEngine) setDataEngine(data.dataEngine);
        }
      } catch (err) {
        // Ignore
      }
    };
    fetchStatus();
  }, []);

  // Live ticking clock & countdown calculation
  useEffect(() => {
    const clockInterval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      const targetMin = config.yMin ?? 14;
      const targetSec = config.ySec ?? 30;
      const curMin = now.getMinutes() % 15;
      const curSec = now.getSeconds();
      const currentSecondsInCycle = curMin * 60 + curSec;
      const targetSecondsInCycle = targetMin * 60 + targetSec;

      let remaining = targetSecondsInCycle - currentSecondsInCycle;
      if (remaining < 0) remaining += 15 * 60;

      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      setPhaseCountdown(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(clockInterval);
  }, [config.yMin, config.ySec]);

  // Check alert conditions when results update
  useEffect(() => {
    if (results && results.timestamp && results.timestamp !== lastSeenResultTimestamp.current) {
      lastSeenResultTimestamp.current = results.timestamp;
      
      const maxGain = results.gainers && results.gainers.length > 0 ? results.gainers[0].change : 0;
      const maxLoss = results.losers && results.losers.length > 0 ? Math.abs(results.losers[0].change) : 0;
      const maxAmplitude = results.amplitude15m && results.amplitude15m.length > 0 ? (results.amplitude15m[0].amplitude || 0) : 0;

      let alertTriggered = false;
      if (maxGain >= config.gainThreshold) {
        triggerAlert('gain');
        alertTriggered = true;
      }
      if (maxLoss >= config.lossThreshold) {
        if (!alertTriggered) {
          triggerAlert('loss');
          alertTriggered = true;
        }
      }
      if (maxAmplitude >= config.amplitudeThreshold) {
        if (!alertTriggered) {
          triggerAlert('amp');
          alertTriggered = true;
        }
      }
    }
  }, [results, config, triggerAlert]);

  const updateConfig = async (updatedConfig: Config) => {
    setConfig(updatedConfig);
    try {
      await fetch("/api/monitoring/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig)
      });
    } catch (err) {
      console.error("Failed to sync config:", err);
    }
  };

  const toggleRunning = async () => {
    try {
      const res = await fetch("/api/monitoring/toggle", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setIsRunning(data.isRunning);
        addLog(data.isRunning ? '[扫描监控] 15m 实时监控程序已在服务器启动...' : '[扫描监控] 15m 监控程序已被用户手动中止。', data.isRunning ? 'SUCCESS' : 'INFO');
      }
    } catch (err) {
      console.error("Failed to toggle running state:", err);
    }
  };

  const triggerCycleScanManual = async () => {
    if (isScanningManual) return;
    setIsScanningManual(true);
    addLog('[监控看板] 触发手动指令：开始立即结算 15m 周期量化榜单...', 'INFO');
    try {
      const data = await triggerCycleScan15m();
      if (data && data.results) {
        setResults(data.results);
        setScanStats(data.scanStats);
        addLog(`[监控看板] 15m 周期结算完成，榜单已极速刷新！`, 'SUCCESS');
      }
    } catch (err) {
      console.error("Failed manual scan:", err);
      addLog(`[监控看板] 手动结算异常: ${err}`, 'ERROR');
    } finally {
      setIsScanningManual(false);
    }
  };

  const fetchFundingRates = async () => {
    setIsFetchingFunding(true);
    addLog('[资金费率] 手动刷新资金费率中...', 'INFO');
    try {
      const res = await fetch("/api/monitoring/funding/refresh", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setFundingRates(data.fundingRates || []);
        addLog('[资金费率] 资金费率更新成功！', 'SUCCESS');
      }
    } catch (err) {
      console.error("Failed to refresh funding rates:", err);
      addLog(`[资金费率] 刷新异常: ${err}`, 'ERROR');
    } finally {
      setIsFetchingFunding(false);
    }
  };

  const copyToClipboard = async (text: string): Promise<boolean> => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('Modern clipboard API failed, trying fallback...', err);
      }
    }

    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.top = "-9999px";
      textArea.style.left = "-9999px";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error('Fallback copy failed:', err);
      return false;
    }
  };

  const handleRowClick = async (symbol: string) => {
    const success = await copyToClipboard(symbol);
    if (success) {
      addLog(`[剪贴板] 已成功将合约 "${symbol}" 复制到剪贴板`, 'SUCCESS');
    } else {
      addLog(`[剪贴板] 复制失败，请手动选择复制合约 "${symbol}"`, 'ERROR');
    }
    onSelectSymbol(symbol);
    onSwitchToTrade();
  };

  const formatVolume = (vol: number) => {
    const value = (vol / 10000).toFixed(2);
    return `${value}`;
  };

  const renderCycleBadge = (cycleStr: string) => {
    const c = (cycleStr || '').toLowerCase().trim();
    let badgeStyle = 'bg-zinc-800/80 text-zinc-300 border-zinc-700/80';
    let dotStyle = 'bg-zinc-400';

    if (c.includes('1h')) {
      badgeStyle = 'bg-amber-500/15 text-amber-300 border-amber-400/40 shadow-sm shadow-amber-500/10 group-hover:bg-amber-500/25 group-hover:border-amber-400/60';
      dotStyle = 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]';
    } else if (c.includes('2h')) {
      badgeStyle = 'bg-teal-500/15 text-teal-300 border-teal-400/40 shadow-sm shadow-teal-500/10 group-hover:bg-teal-500/25 group-hover:border-teal-400/60';
      dotStyle = 'bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.8)]';
    } else if (c.includes('4h')) {
      badgeStyle = 'bg-purple-500/15 text-purple-300 border-purple-400/40 shadow-sm shadow-purple-500/10 group-hover:bg-purple-500/25 group-hover:border-purple-400/60';
      dotStyle = 'bg-purple-400 shadow-[0_0_6px_rgba(192,132,252,0.8)]';
    } else if (c.includes('8h')) {
      badgeStyle = 'bg-sky-500/15 text-sky-300 border-sky-400/40 shadow-sm shadow-sky-500/10 group-hover:bg-sky-500/25 group-hover:border-sky-400/60';
      dotStyle = 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]';
    } else if (c.includes('12h') || c.includes('24h')) {
      badgeStyle = 'bg-rose-500/15 text-rose-300 border-rose-400/40 shadow-sm shadow-rose-500/10 group-hover:bg-rose-500/25 group-hover:border-rose-400/60';
      dotStyle = 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.8)]';
    }

    return (
      <span 
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[13px] font-mono font-bold border transition-all duration-150 select-none ${badgeStyle}`}
        title={`${cycleStr} 结算周期`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotStyle}`} />
        <span>{cycleStr}</span>
      </span>
    );
  };

  const renderBoardCard = ({
    moduleId,
    title,
    icon,
    themeColor,
    dataList,
    valueType,
    is24h = false,
    helpManual
  }: {
    moduleId: 'gainers15m' | 'losers15m' | 'amplitude15m' | 'gainers24h' | 'losers24h';
    title: string;
    icon: React.ReactNode;
    themeColor: 'emerald' | 'red' | 'amber';
    dataList: SymbolData[];
    valueType: 'gain' | 'loss' | 'amplitude' | 'change24h_gain' | 'change24h_loss';
    is24h?: boolean;
    helpManual: React.ReactNode;
  }) => {
    const isCollapsed = Boolean(collapsedModules[moduleId]);
    const topItem = dataList && dataList.length > 0 ? dataList[0] : null;
    const topData = topItem ? getSymbolDisplayData(topItem) : null;

    let topPreviewVal = '--';
    if (topData) {
      if (valueType === 'gain') topPreviewVal = formatChangeText(topData.effectiveChange);
      else if (valueType === 'loss') topPreviewVal = formatChangeText(topData.effectiveChange);
      else if (valueType === 'amplitude') topPreviewVal = `${(topItem?.amplitude || 0).toFixed(2)}%`;
      else if (valueType === 'change24h_gain') topPreviewVal = `+${(topItem?.change24h || 0).toFixed(2)}%`;
      else if (valueType === 'change24h_loss') topPreviewVal = `${(topItem?.change24h || 0).toFixed(2)}%`;
    }

    const themeBorder = themeColor === 'red' ? 'border-red-500/30' : themeColor === 'amber' ? 'border-amber-500/30' : 'border-emerald-500/30';
    const themeBgIcon = themeColor === 'red' ? 'bg-red-500/10 text-red-500 border-red-500/20' : themeColor === 'amber' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    const themeTitleColor = themeColor === 'red' ? 'text-red-400' : themeColor === 'amber' ? 'text-amber-400' : 'text-emerald-400';

    return (
      <section className="bg-[#141416]/60 rounded-2xl border border-white/10 overflow-hidden shadow-xl transition-all">
        {/* Module Header */}
        <div 
          onClick={() => toggleModuleCollapse(moduleId)}
          className="px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] border-b border-white/5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shadow-md shrink-0 ${themeBgIcon}`}>
              {icon}
            </div>
            <h2 className={`text-base sm:text-lg font-bold tracking-tight font-sans ${themeTitleColor}`}>
              {title}
            </h2>

            {/* Collapsed TOP 1 summary badge */}
            {isCollapsed && topItem && (
              <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono">
                <span className="text-zinc-400 font-bold">TOP1:</span>
                <span className="text-white font-bold">{topItem.symbol.replace('USDT', '')}</span>
                <span className={`font-bold ${themeTitleColor}`}>{topPreviewVal}</span>
              </div>
            )}

            {/* Help Manual Button */}
            <div className="relative group/help flex items-center" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-help focus:outline-none flex items-center justify-center"
                title={`${title}说明书`}
              >
                <HelpCircle className="w-4 h-4 text-zinc-300 stroke-[2.2]" />
              </button>
              {helpManual}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-500 uppercase font-bold tracking-wider font-mono bg-white/5 px-2 py-0.5 rounded">
              TOP 5
            </span>
            <button
              type="button"
              className="p-1 text-zinc-400 hover:text-white transition-colors"
              title={isCollapsed ? "展开模块" : "向上折叠模块"}
            >
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Module Content */}
        {!isCollapsed && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[880px]">
              <thead>
                <tr className="bg-white/[0.02] text-[13px] text-gray-400 uppercase font-bold tracking-wider border-b border-white/5">
                  <th className="px-3 py-3 text-left w-[10%]">{t.tableSymbol}</th>
                  <th className="px-2 py-3 text-right w-[10%]">{t.tablePrice}</th>
                  <th className="px-2 py-3 text-right w-[10%]">{is24h ? '24h开盘价' : t.tableOpenPrice}</th>
                  <th className="px-2 py-3 text-right w-[16%]">
                    <div className="flex items-center justify-end gap-1">
                      <span>{t.tableExtremes}</span>
                      <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">
                        全历史
                      </span>
                    </div>
                  </th>
                  <th className="px-2 py-3 text-center w-[11%]">{t.tableFundingCycle}</th>
                  <th className="px-2 py-3 text-right w-[13%]">
                    <div className="flex items-center justify-end gap-1" title={is24h ? '24小时总成交额' : `当前未完结15m成交额 / 前${volumeKCount}根完整K线最低成交额比值`}>
                      <span>{is24h ? '24h成交额' : t.table15mVol}</span>
                      {!is24h && (
                        <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                          量比(前{volumeKCount}K)
                        </span>
                      )}
                    </div>
                  </th>
                  <th className="px-2 py-3 text-right w-[9%]">
                    <div className="flex items-center justify-end gap-1 cursor-help" title="收位：当前价在整根当前未完结K线高低区间的百分位置&#10;公式：(当前价 - 最低价) ÷ (最高价 - 最低价) × 100%">
                      <span>收位</span>
                      <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
                        K线位
                      </span>
                    </div>
                  </th>
                  <th className="px-3 py-3 text-right w-[21%]">
                    <div className="flex items-center justify-end gap-1 flex-wrap">
                      <span>
                        {valueType === 'amplitude'
                          ? t.tableAmplitude
                          : is24h
                            ? (valueType === 'change24h_gain' ? '24h涨幅' : '24h跌幅')
                            : (gainMode === 'high' ? t.tableHighGain : t.tableGain)}
                      </span>
                      {!is24h && (
                        <>
                          <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300" title={`前${gainKCount}根完结K线最大涨幅`}>
                            前{gainKCount}K高
                          </span>
                          <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-white/10 text-zinc-300">
                            {gainMode === 'high' ? '现价分母' : '开盘分母'}
                          </span>
                        </>
                      )}
                      <span className={`text-[10px] font-normal px-1 py-0.5 rounded ${sortScheme === 'fixed' ? 'bg-purple-500/20 text-purple-300' : 'bg-indigo-500/20 text-indigo-300'}`}>
                        {sortScheme === 'fixed' ? '固定' : '实时排序'}
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <AnimatePresence mode="popLayout">
                  {dataList.map((item, idx) => {
                    const isHolding = isHoldingPosition(item.symbol);
                    const data = getSymbolDisplayData(item);
                    
                    let shouldHighlight = false;
                    if (isAlerting) {
                      if (valueType === 'gain' && data.effectiveChange >= config.gainThreshold) shouldHighlight = true;
                      if (valueType === 'loss' && Math.abs(data.effectiveChange) >= config.lossThreshold) shouldHighlight = true;
                      if (valueType === 'amplitude' && (item.amplitude || 0) >= config.amplitudeThreshold) shouldHighlight = true;
                    }

                    let mainValueText = '';
                    let mainValueColor = 'text-emerald-400';
                    if (valueType === 'gain') {
                      mainValueText = formatChangeText(data.effectiveChange);
                      mainValueColor = 'text-emerald-400';
                    } else if (valueType === 'loss') {
                      mainValueText = formatChangeText(data.effectiveChange);
                      mainValueColor = 'text-red-400';
                    } else if (valueType === 'amplitude') {
                      mainValueText = `${(item.amplitude || 0).toFixed(2)}%`;
                      mainValueColor = 'text-amber-400';
                    } else if (valueType === 'change24h_gain') {
                      mainValueText = `+${(item.change24h || 0).toFixed(2)}%`;
                      mainValueColor = 'text-emerald-400';
                    } else if (valueType === 'change24h_loss') {
                      mainValueText = `${(item.change24h || 0).toFixed(2)}%`;
                      mainValueColor = 'text-red-400';
                    }

                    return (
                      <motion.tr 
                        key={item.symbol} 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: idx * 0.04 }}
                        className={`transition-all group cursor-pointer border-l-4 ${
                          shouldHighlight 
                            ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500 shadow-[inset_0_0_12px_rgba(16,185,129,0.3)] animate-pulse font-bold' 
                            : 'hover:bg-white/5 border-transparent'
                        }`}
                        title="点击同步交易与复制合约"
                        onClick={() => handleRowClick(item.symbol)}
                      >
                        {/* 1. 币种 */}
                        <td className="px-3 py-3 text-left">
                          <div className="flex items-center">
                            <span className={`font-bold text-[18px] sm:text-[20px] ${
                              isHolding 
                                ? 'text-[#d946ef]' 
                                : (shouldHighlight ? 'text-emerald-400' : 'text-zinc-200 group-hover:text-emerald-400')
                            } transition-colors uppercase font-sans`}>
                              {item.symbol.replace('USDT', '')}
                            </span>
                            {isHolding && (
                              <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 bg-[#d946ef]/20 text-[#d946ef] border border-[#d946ef]/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                持仓
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 2. 推送当前价 */}
                        <td className="px-2 py-3 text-right font-mono text-[15px] sm:text-[16px] font-bold text-zinc-100 group-hover:text-white transition-colors">
                          {formatPriceVal(data.currentPrice)}
                        </td>

                        {/* 3. 周期开盘价 */}
                        <td className="px-2 py-3 text-right font-mono text-[14px] sm:text-[15px] font-medium text-zinc-400">
                          {formatPriceVal(data.openPrice)}
                        </td>

                        {/* 4. 上线开盘 / 历史最高 / 历史最低 与 后出极值标记 */}
                        <td className="px-2 py-2 text-right">
                          <div className="flex flex-col items-end gap-0.5 font-mono text-[12px] sm:text-[13px] leading-tight">
                            <div className="flex items-center gap-1.5 justify-end" title="币对上线首根K线开盘价">
                              <span className="text-[10px] text-zinc-500 font-sans font-medium">上线开盘</span>
                              <span className="font-semibold text-zinc-300">
                                {data.listingOpen > 0 ? formatPriceVal(data.listingOpen) : '--'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 justify-end">
                              <span className="text-[10px] text-zinc-500 font-sans font-medium">历史高</span>
                              <span className={`font-semibold ${data.laterExtreme === 'high' ? 'text-emerald-400 font-bold' : 'text-zinc-300'}`}>
                                {data.historicalHigh > 0 ? formatPriceVal(data.historicalHigh) : '--'}
                              </span>
                              {data.laterExtreme === 'high' ? (
                                <span 
                                  className="text-[9px] font-sans font-bold px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0 whitespace-nowrap shadow-sm"
                                  title="上线以来后创出历史最高价（多头结构）"
                                >
                                  后创高 ▲
                                </span>
                              ) : (
                                <span className="w-1" />
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 justify-end">
                              <span className="text-[10px] text-zinc-500 font-sans font-medium">历史低</span>
                              <span className={`font-semibold ${data.laterExtreme === 'low' ? 'text-red-400 font-bold' : 'text-zinc-400'}`}>
                                {data.historicalLow > 0 ? formatPriceVal(data.historicalLow) : '--'}
                              </span>
                              {data.laterExtreme === 'low' ? (
                                <span 
                                  className="text-[9px] font-sans font-bold px-1 py-0.2 rounded bg-red-500/20 text-red-300 border border-red-500/40 shrink-0 whitespace-nowrap shadow-sm"
                                  title="上线以来后创出历史最低价（空头结构）"
                                >
                                  后创低 ▼
                                </span>
                              ) : (
                                <span className="w-1" />
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 5. 资金费率 (周期) */}
                        <td className="px-2 py-3 text-center">
                          <div className="inline-flex items-center gap-1 font-mono text-[13px] sm:text-[14px]">
                            <span className={`font-bold ${data.fundingRate > 0 ? 'text-amber-300' : data.fundingRate < 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                              {data.fundingRate > 0 ? '+' : ''}{data.fundingRate.toFixed(4)}%
                            </span>
                            <span className="text-zinc-500 text-xs font-normal">
                              ({data.settlementCycle})
                            </span>
                          </div>
                        </td>

                        {/* 6. 成交额 & 量比 */}
                        <td className={`px-2 py-3 text-right font-mono ${shouldHighlight ? 'text-emerald-300' : 'text-emerald-400'}`}>
                          <div className="text-[14px] sm:text-[16px] font-bold leading-tight">
                            {formatVolume(is24h ? (item.volume24h || 0) : data.currentVolume)}
                          </div>
                          {!is24h ? (
                            <div 
                              className="flex items-center justify-end gap-1 mt-1 text-[11px] font-mono cursor-help"
                              title={`当前未完结15m成交额: ${formatVolume(data.currentVolume)} 万 USDT\n前${volumeKCount}根完结15m K线最低成交额: ${formatVolume(data.minVolumePastK)} 万 USDT\n比值 (当前/前${volumeKCount}K最低) = ${data.volumeRatioPastK > 0 ? data.volumeRatioPastK.toFixed(2) : '--'}倍`}
                            >
                              <span className="text-zinc-500 text-[10px]">量比:</span>
                              <span className={`px-1.5 py-0.2 rounded text-[11px] font-bold transition-all ${
                                data.volumeRatioPastK >= 2.0 
                                  ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-sm' 
                                  : data.volumeRatioPastK >= 1.0 
                                    ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40' 
                                    : 'bg-white/5 text-zinc-400 border border-white/10'
                              }`}>
                                {data.volumeRatioPastK > 0 ? `${data.volumeRatioPastK.toFixed(2)}x` : '--'}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-zinc-500 font-sans mt-0.5">24h累计</div>
                          )}
                        </td>

                        {/* 7. 收位 (方案 A: 纯数值 + 状态色) */}
                        <td className="px-2 py-3 text-right font-mono">
                          <div 
                            className="flex flex-col items-end justify-center cursor-help"
                            title={`当前价在K线中的位置 (收位)\n当前价: ${formatPriceVal(data.currentPrice)}\n最高价: ${formatPriceVal(data.high)}\n最低价: ${formatPriceVal(data.low)}\n收位: ${data.closePos.toFixed(2)}% (${data.closePos >= 80 ? '高位极强' : data.closePos >= 60 ? '偏强多头' : data.closePos >= 40 ? '中位均衡' : data.closePos >= 20 ? '偏弱下探' : '低位探底'})\n计算公式: (现价 - 最低) ÷ (最高 - 最低) × 100%`}
                          >
                            <span className={`text-[15px] sm:text-[16px] leading-tight ${getClosePosStyle(data.closePos)}`}>
                              {data.closePos.toFixed(1)}%
                            </span>
                            <span className="text-[10px] text-zinc-500 font-sans leading-none mt-0.5">
                              {getClosePosTag(data.closePos)}
                            </span>
                          </div>
                        </td>

                        {/* 8. 涨跌幅 / 振幅 & 前K最大涨幅 */}
                        <td className="px-3 py-3 text-right">
                          <div className="flex flex-col items-end">
                            <div className={`flex items-center justify-end gap-1 ${mainValueColor} font-bold text-[18px] sm:text-[20px] font-mono leading-tight`}>
                              {mainValueText}
                              <ChevronRight className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all ${mainValueColor}`} />
                            </div>
                            {!is24h ? (
                              <div 
                                className="flex items-center justify-end gap-1 mt-1 text-[11px] font-mono text-zinc-400 cursor-help"
                                title={`当前未完结K线前的${gainKCount}根完结K线最大涨幅 (${gainMode === 'high' ? '高涨幅模式' : '常规模式'})`}
                              >
                                <span className="text-zinc-500 text-[10px]">前{gainKCount}K高:</span>
                                <span className={`font-bold ${data.maxGainPastK > 0 ? 'text-emerald-300' : 'text-zinc-400'}`}>
                                  {formatChangeText(data.maxGainPastK)}
                                </span>
                              </div>
                            ) : (
                              <div className="text-[10px] text-zinc-500 font-sans mt-0.5">
                                24h全天变化
                              </div>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
                {(!dataList || dataList.length === 0) && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-600 italic text-[16px] font-medium">
                      {t.waitingScan}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="text-gray-100 font-sans selection:bg-red-500/30 min-h-[calc(100vh-170px)] flex flex-col gap-6">
      <audio ref={audioRef} />

      {/* Main Grid: Responsive 2-column or full width */}
      <div className="flex flex-col lg:flex-row gap-6 items-start w-full">
        
        {/* ========================================================================= */}
        {/* 区域 1：监控控制面板 (可向左折叠) */}
        {/* ========================================================================= */}
        {isArea1Collapsed ? (
          <>
            {/* 桌面端折叠窄条 (向右展开) */}
            <div className="hidden lg:flex flex-col items-center w-14 shrink-0 bg-[#141416]/80 rounded-2xl border border-white/10 p-2.5 py-4 shadow-xl sticky top-4 transition-all group select-none">
              <button
                type="button"
                onClick={() => setIsArea1Collapsed(false)}
                className="w-9 h-9 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-md group hover:scale-105 active:scale-95"
                title="向右展开控制面板与资金费率（区域1）"
              >
                <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <div className="my-4 flex flex-col items-center gap-2">
                <span 
                  className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} 
                  title={isRunning ? "程序运行中" : "程序未启动"} 
                />
                <span 
                  className={`w-2 h-2 rounded-full ${dataEngine?.markPriceActive ? 'bg-purple-400' : 'bg-amber-400'}`} 
                  title="资金费率引擎状态" 
                />
              </div>

              <button
                type="button"
                onClick={() => setIsArea1Collapsed(false)}
                className="flex-1 flex flex-col items-center justify-center py-6 cursor-pointer text-zinc-400 hover:text-emerald-300 transition-colors"
                title="点击向右展开区域1"
              >
                <span className="[writing-mode:vertical-rl] text-xs tracking-widest font-bold uppercase select-none">
                  区域 1 · 控制中心 & 资金费率
                </span>
              </button>
            </div>

            {/* 移动端折叠横条 */}
            <div className="lg:hidden w-full bg-[#141416]/80 border border-white/10 rounded-xl p-3 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
                <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                <span>区域1 · 控制中心与资金费率 (已向左收起)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsArea1Collapsed(false)}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>展开</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          <div className="w-full lg:w-[380px] xl:w-[410px] shrink-0 flex flex-col space-y-5 animate-in fade-in slide-in-from-left-2 duration-150">
            {/* 区域1 头部控制栏：向左折叠按钮 */}
            <div className="bg-[#141416]/90 px-4 py-2.5 rounded-xl border border-white/10 flex items-center justify-between text-xs shadow-md">
              <span className="font-bold text-zinc-300 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                <span>区域 1 · 控制中心与资金费率</span>
              </span>
              <button
                type="button"
                onClick={() => setIsArea1Collapsed(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white border border-white/10 transition-all cursor-pointer font-bold text-xs group active:scale-95"
                title="向左折叠收起整个左侧区域"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-emerald-400 group-hover:-translate-x-0.5 transition-transform" />
                <span>向左折叠</span>
              </button>
            </div>
          
          {showSettings ? (
            <>
              {/* Config Card */}
              <section className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex-1 flex flex-col min-h-[400px]">
                <div className="px-5 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-gray-400" />
                    <h2 className="font-bold text-sm uppercase tracking-wider">{t.parameterConfig}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsArea1Collapsed(true)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white border border-white/10 text-xs transition-all cursor-pointer"
                    title="向左折叠"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-emerald-400" />
                    <span>向左折叠</span>
                  </button>
                </div>
                <div className="p-5 space-y-6 flex-1 overflow-y-auto">
                  
                  {/* Settlement Config */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {t.cycleSettleTitle}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.settleTime}</label>
                        <div className="flex gap-1 items-center">
                          <input 
                            type="number" 
                            value={config.yMin} 
                            onChange={e => updateConfig({...config, yMin: parseInt(e.target.value) || 0})}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-center focus:border-emerald-500 outline-none font-mono"
                          />
                          <span className="text-gray-600">:</span>
                          <input 
                            type="number" 
                            value={config.ySec} 
                            onChange={e => updateConfig({...config, ySec: parseInt(e.target.value) || 0})}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-center focus:border-emerald-500 outline-none font-mono"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.vol24hM}</label>
                        <input 
                          type="number" 
                          value={config.m1} 
                          onChange={e => updateConfig({...config, m1: parseInt(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:border-emerald-500 outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <label className="text-[10px] text-gray-400 block">{t.vol15mN}</label>
                        <input 
                          type="number" 
                          value={config.n1} 
                          onChange={e => updateConfig({...config, n1: parseInt(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:border-emerald-500 outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.volumeKCount}</label>
                        <div className="flex gap-1 items-center">
                          <input 
                            type="number" 
                            min="1"
                            max="30"
                            value={volumeKCount} 
                            onChange={e => handleUpdateVolumeKCount(parseInt(e.target.value) || 1)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-center text-cyan-300 font-bold focus:border-cyan-500 outline-none font-mono"
                          />
                          <span className="text-[10px] text-zinc-500">根</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.gainKCount}</label>
                        <div className="flex gap-1 items-center">
                          <input 
                            type="number" 
                            min="1"
                            max="30"
                            value={gainKCount} 
                            onChange={e => handleUpdateGainKCount(parseInt(e.target.value) || 1)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-center text-emerald-300 font-bold focus:border-emerald-500 outline-none font-mono"
                          />
                          <span className="text-[10px] text-zinc-500">根</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Thresholds */}
                  <div className="space-y-3 pt-4 border-t border-white/5">
                    <h3 className="text-xs font-bold text-gray-400 uppercase">{t.alertThreshold}</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.gainThreshold}</label>
                        <input 
                          type="number" 
                          step="0.1"
                          value={config.gainThreshold} 
                          onChange={e => updateConfig({...config, gainThreshold: parseFloat(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-emerald-500 font-bold focus:border-emerald-500 outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.lossThreshold}</label>
                        <input 
                          type="number" 
                          step="0.1"
                          value={config.lossThreshold} 
                          onChange={e => updateConfig({...config, lossThreshold: parseFloat(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-red-500 font-bold focus:border-red-500 outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.amplitudeThreshold}</label>
                        <input 
                          type="number" 
                          step="0.1"
                          value={config.amplitudeThreshold} 
                          onChange={e => updateConfig({...config, amplitudeThreshold: parseFloat(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-amber-500 font-bold focus:border-amber-500 outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Alert Duration Control */}
                  <div className="space-y-3 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-gray-400 uppercase">警报时间控制</h3>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input 
                          type="checkbox"
                          checked={config.enableAlertTimeout}
                          onChange={e => {
                            const enabled = e.target.checked;
                            updateConfig({...config, enableAlertTimeout: enabled});
                            addLog(`[系统] 警报持续时间限制已${enabled ? '开启' : '关闭'}`, 'INFO');
                          }}
                          className="rounded border-white/10 text-blue-500 focus:ring-blue-500/30 w-3.5 h-3.5 bg-black/40 cursor-pointer accent-blue-500"
                        />
                        <span className="text-[10px] text-zinc-400 font-medium font-sans">限制持续时间</span>
                      </label>
                    </div>
                    {config.enableAlertTimeout && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">警报持续秒数 (秒)</label>
                        <input 
                          type="number" 
                          min="1"
                          max="3600"
                          value={config.alertTimeoutSeconds} 
                          onChange={e => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val > 0) {
                              updateConfig({...config, alertTimeoutSeconds: val});
                            }
                          }}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-blue-400 font-bold focus:border-blue-500 outline-none font-mono"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Audio Upload Card */}
              <section className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                <div className="px-5 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-gray-400" />
                    <h2 className="font-bold text-sm uppercase tracking-wider">{t.voiceAlerts}</h2>
                  </div>
                  {isAlerting && (
                    <button 
                      onClick={stopAlert}
                      className="flex items-center gap-1.5 px-3 py-1 bg-red-500 text-white rounded-lg text-xs font-bold animate-pulse cursor-pointer"
                    >
                      <Pause className="w-3 h-3 fill-current" />
                      {t.stopAnnouncement}
                    </button>
                  )}
                </div>
                <div className="p-5 space-y-4">
                  {/* Gain Audio */}
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400 flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> {t.gainAlertSound}
                    </label>
                    {audioFiles.gain ? (
                      <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Music className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-emerald-200 truncate max-w-[140px] sm:max-w-[180px]">
                              {audioMeta.gain?.name || '已上传涨幅报警音'}
                            </div>
                            <span className="text-[10px] text-emerald-400/80 font-mono">服务器永久生效</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleTogglePreview('gain', e)}
                            className={`p-1.5 rounded-lg border text-xs transition-colors flex items-center justify-center ${
                              previewingType === 'gain'
                                ? 'bg-emerald-500 text-black border-emerald-400 animate-pulse'
                                : 'bg-white/10 text-gray-200 border-white/10 hover:bg-white/20'
                            }`}
                            title={previewingType === 'gain' ? '停止试听' : '试听音频'}
                          >
                            {previewingType === 'gain' ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                          </button>
                          <label
                            className="p-1.5 rounded-lg border border-white/10 bg-white/10 text-gray-200 hover:bg-white/20 transition-colors cursor-pointer flex items-center justify-center"
                            title="重新上传替换"
                          >
                            <input
                              type="file"
                              accept=".mp3,.wav,.ogg,.m4a"
                              onChange={(e) => handleFileUpload('gain', e)}
                              className="sr-only"
                            />
                            <Upload className="w-3.5 h-3.5" />
                          </label>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteAudio('gain', e)}
                            className="p-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors flex items-center justify-center"
                            title="删除此音频"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="relative group cursor-pointer block">
                        <input 
                          type="file" 
                          accept=".mp3,.wav,.ogg,.m4a" 
                          onChange={e => handleFileUpload('gain', e)}
                          className="sr-only"
                        />
                        <div className="p-3 border-2 border-dashed rounded-xl border-white/10 group-hover:border-emerald-500/40 bg-white/[0.02] group-hover:bg-emerald-500/[0.03] flex items-center justify-center gap-2 transition-all">
                          {uploadingType === 'gain' ? (
                            <>
                              <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
                              <span className="text-xs text-emerald-400 font-medium">正在保存到服务器...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 text-gray-500 group-hover:text-emerald-400 transition-colors" />
                              <span className="text-xs text-gray-400 group-hover:text-gray-200 font-medium">点击上传音频 (支持 MP3/WAV, 永久有效)</span>
                            </>
                          )}
                        </div>
                      </label>
                    )}
                  </div>

                  {/* Loss Audio */}
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400 flex items-center gap-2">
                      <TrendingDown className="w-3.5 h-3.5 text-red-500" /> {t.lossAlertSound}
                    </label>
                    {audioFiles.loss ? (
                      <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Music className="w-4 h-4 text-red-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-red-200 truncate max-w-[140px] sm:max-w-[180px]">
                              {audioMeta.loss?.name || '已上传跌幅报警音'}
                            </div>
                            <span className="text-[10px] text-red-400/80 font-mono">服务器永久生效</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleTogglePreview('loss', e)}
                            className={`p-1.5 rounded-lg border text-xs transition-colors flex items-center justify-center ${
                              previewingType === 'loss'
                                ? 'bg-red-500 text-white border-red-400 animate-pulse'
                                : 'bg-white/10 text-gray-200 border-white/10 hover:bg-white/20'
                            }`}
                            title={previewingType === 'loss' ? '停止试听' : '试听音频'}
                          >
                            {previewingType === 'loss' ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                          </button>
                          <label
                            className="p-1.5 rounded-lg border border-white/10 bg-white/10 text-gray-200 hover:bg-white/20 transition-colors cursor-pointer flex items-center justify-center"
                            title="重新上传替换"
                          >
                            <input
                              type="file"
                              accept=".mp3,.wav,.ogg,.m4a"
                              onChange={(e) => handleFileUpload('loss', e)}
                              className="sr-only"
                            />
                            <Upload className="w-3.5 h-3.5" />
                          </label>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteAudio('loss', e)}
                            className="p-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors flex items-center justify-center"
                            title="删除此音频"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="relative group cursor-pointer block">
                        <input 
                          type="file" 
                          accept=".mp3,.wav,.ogg,.m4a" 
                          onChange={e => handleFileUpload('loss', e)}
                          className="sr-only"
                        />
                        <div className="p-3 border-2 border-dashed rounded-xl border-white/10 group-hover:border-red-500/40 bg-white/[0.02] group-hover:bg-red-500/[0.03] flex items-center justify-center gap-2 transition-all">
                          {uploadingType === 'loss' ? (
                            <>
                              <RefreshCw className="w-4 h-4 text-red-400 animate-spin" />
                              <span className="text-xs text-red-400 font-medium">正在保存到服务器...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 text-gray-500 group-hover:text-red-400 transition-colors" />
                              <span className="text-xs text-gray-400 group-hover:text-gray-200 font-medium">点击上传音频 (支持 MP3/WAV, 永久有效)</span>
                            </>
                          )}
                        </div>
                      </label>
                    )}
                  </div>

                  {/* Amplitude Audio */}
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400 flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-amber-500" /> {t.amplitudeAlertSound}
                    </label>
                    {audioFiles.amp ? (
                      <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Music className="w-4 h-4 text-amber-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-amber-200 truncate max-w-[140px] sm:max-w-[180px]">
                              {audioMeta.amp?.name || '已上传振幅报警音'}
                            </div>
                            <span className="text-[10px] text-amber-400/80 font-mono">服务器永久生效</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleTogglePreview('amp', e)}
                            className={`p-1.5 rounded-lg border text-xs transition-colors flex items-center justify-center ${
                              previewingType === 'amp'
                                ? 'bg-amber-500 text-black border-amber-400 animate-pulse'
                                : 'bg-white/10 text-gray-200 border-white/10 hover:bg-white/20'
                            }`}
                            title={previewingType === 'amp' ? '停止试听' : '试听音频'}
                          >
                            {previewingType === 'amp' ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                          </button>
                          <label
                            className="p-1.5 rounded-lg border border-white/10 bg-white/10 text-gray-200 hover:bg-white/20 transition-colors cursor-pointer flex items-center justify-center"
                            title="重新上传替换"
                          >
                            <input
                              type="file"
                              accept=".mp3,.wav,.ogg,.m4a"
                              onChange={(e) => handleFileUpload('amp', e)}
                              className="sr-only"
                            />
                            <Upload className="w-3.5 h-3.5" />
                          </label>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteAudio('amp', e)}
                            className="p-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors flex items-center justify-center"
                            title="删除此音频"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="relative group cursor-pointer block">
                        <input 
                          type="file" 
                          accept=".mp3,.wav,.ogg,.m4a" 
                          onChange={e => handleFileUpload('amp', e)}
                          className="sr-only"
                        />
                        <div className="p-3 border-2 border-dashed rounded-xl border-white/10 group-hover:border-amber-500/40 bg-white/[0.02] group-hover:bg-amber-500/[0.03] flex items-center justify-center gap-2 transition-all">
                          {uploadingType === 'amp' ? (
                            <>
                              <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                              <span className="text-xs text-amber-400 font-medium">正在保存到服务器...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 text-gray-500 group-hover:text-amber-400 transition-colors" />
                              <span className="text-xs text-gray-400 group-hover:text-gray-200 font-medium">点击上传音频 (支持 MP3/WAV, 永久有效)</span>
                            </>
                          )}
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              </section>
            </>
          ) : (
            /* Funding Rate Ranking Card */
            (() => {
              const totalFundingPages = Math.max(1, Math.ceil(fundingRates.length / 8));
              const safeFundingPage = Math.min(fundingPage, totalFundingPages);
              const paginatedFundingRates = fundingRates.slice((safeFundingPage - 1) * 8, safeFundingPage * 8);
              return (
                <section className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden flex flex-col flex-1 min-h-[350px] shadow-2xl">
                  <div className="px-5 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-yellow-500" />
                      <h2 className="font-bold text-[21px] uppercase tracking-wider">{t.fundingRateLeaderboard}</h2>
                      <button 
                        onClick={fetchFundingRates}
                        disabled={isFetchingFunding}
                        className="p-1 hover:bg-white/10 active:bg-white/25 rounded-md transition-colors cursor-pointer group flex items-center justify-center"
                        title="手动刷新"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 group-hover:text-yellow-500 transition-all ${isFetchingFunding ? 'animate-spin text-yellow-500' : ''}`} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {fundingRates.length > 0 && (
                        <div className="flex items-center gap-1.5 text-[18px] font-mono">
                          <button
                            onClick={() => setFundingPage(p => Math.max(1, p - 1))}
                            disabled={safeFundingPage <= 1}
                            className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 text-zinc-300 transition-colors cursor-pointer"
                          >
                            &lt;
                          </button>
                          <span className="text-zinc-400 text-[16.5px] font-bold">
                            {safeFundingPage} / {totalFundingPages}
                          </span>
                          <button
                            onClick={() => setFundingPage(p => Math.min(totalFundingPages, p + 1))}
                            disabled={safeFundingPage >= totalFundingPages}
                            className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 text-zinc-300 transition-colors cursor-pointer"
                          >
                            &gt;
                          </button>
                          <span className="text-[15px] text-zinc-500 font-bold ml-0.5">
                            (Top {fundingRates.length})
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsArea1Collapsed(true)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white border border-white/10 text-xs font-sans font-medium transition-all cursor-pointer group ml-1"
                        title="向左折叠收起整个区域1"
                      >
                        <ChevronLeft className="w-3.5 h-3.5 text-emerald-400 group-hover:-translate-x-0.5 transition-transform" />
                        <span>向左折叠</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#161619] z-10 shadow-sm border-b border-white/5">
                        <tr className="text-[15px] text-gray-500 uppercase font-bold tracking-wider">
                          <th className="px-3 py-3 w-[20%] text-left">{t.tableSymbol}</th>
                          <th className="px-2 py-3 w-[18%] text-center">{t.tableRate}</th>
                          <th className="px-2 py-3 w-[16%] text-center">{t.tableCycle}</th>
                          <th className="px-2 py-3 w-[23%] text-center">倒计时（分钟）</th>
                          <th className="px-3 py-3 w-[23%] text-right">{t.table24hVol}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {paginatedFundingRates.map((item) => {
                          const isHolding = isHoldingPosition(item.symbol);
                          return (
                            <tr 
                              key={item.symbol} 
                              className="hover:bg-white/5 transition-colors group cursor-pointer"
                              title="点击快速交易"
                              onClick={() => handleRowClick(item.symbol)}
                            >
                              <td className="px-3 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[17px] ${isHolding ? 'text-[#d946ef]' : 'text-zinc-100 group-hover:text-yellow-500'} transition-colors`}>
                                    {item.symbol.replace('USDT', '')}
                                  </span>
                                  {isHolding && (
                                    <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 bg-[#d946ef]/20 text-[#d946ef] border border-[#d946ef]/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                      持仓中
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-3 text-center">
                                <span className={`text-[17px] font-sans font-bold ${item.fundingRate > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                  {item.fundingRate > 0 ? '+' : ''}{item.fundingRate.toFixed(2)}%
                                </span>
                              </td>
                              <td className="px-2 py-3 text-center">
                                <div className="flex justify-center">
                                  {renderCycleBadge(item.settlementCycle)}
                                </div>
                              </td>
                              <td className="px-2 py-3 text-center">
                                <span className="text-[17px] font-sans font-bold text-emerald-500">
                                  {item.nextFundingTime
                                    ? `${Math.max(0, (item.nextFundingTime - (currentTime ? currentTime.getTime() : (item.fetchedAt || Date.now()))) / (60 * 1000)).toFixed(1)}`
                                    : '--'}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-right">
                                <span className="text-[17px] font-sans font-bold text-emerald-500">{formatVolume(item.volume24h)}</span>
                              </td>
                            </tr>
                          );
                        })}
                        {fundingRates.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center text-gray-600 italic text-[17px]">
                              {isRunning ? t.loading : '程序未启动：请先点击下方开启程序'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })()
          )}

          {/* Controls Card */}
          <section className="bg-white/5 rounded-2xl border border-white/10 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-3 rounded-xl border transition-all duration-300 cursor-pointer ${
                  showSettings 
                    ? 'bg-red-500/15 border-red-500/50 text-red-500' 
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
                title={t.parameterConfig}
              >
                <Settings className={`w-5 h-5 ${showSettings ? 'rotate-90' : ''} transition-transform duration-300`} />
              </button>

              <button
                onClick={toggleRunning}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all duration-300 cursor-pointer ${
                  isRunning 
                    ? 'bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500/20' 
                    : 'bg-green-600 text-white shadow-lg shadow-green-900/20 hover:bg-green-500 hover:-translate-y-0.5'
                }`}
              >
                {isRunning ? <Square className="w-4 h-4 fill-current animate-pulse" /> : <Play className="w-4 h-4 fill-current shrink-0" />}
                {isRunning ? t.stopProgram : t.startProgram}
              </button>
            </div>

            {dataEngine && (
              <div className="bg-white/5 px-3.5 py-2 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${dataEngine.klineStreamsActive > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span className="text-zinc-300 font-medium">WS 实时数据引擎</span>
                  <span className="text-zinc-600">|</span>
                  <span className="text-zinc-400">活跃合约: <span className="text-emerald-400 font-mono font-bold">{dataEngine.universeCount}</span></span>
                </div>
                <div className="flex items-center gap-3 text-zinc-400">
                  <span>15m WS流: <span className="text-zinc-200 font-mono font-bold">{dataEngine.klineStreamsActive} 组</span></span>
                  <span>资金费率WS: <span className={`font-bold ${dataEngine.markPriceActive ? "text-emerald-400" : "text-amber-400"}`}>{dataEngine.markPriceActive ? "实时连接" : "连接中"}</span></span>
                </div>
              </div>
            )}

            <div className="bg-white/5 px-4 py-3 rounded-xl border border-white/10 flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[11px] text-gray-400 font-medium tracking-tight">{t.settleCountdown}</span>
                <span className="text-2xl font-mono font-bold text-emerald-400 mt-0.5">{phaseCountdown}</span>
              </div>
              <button
                onClick={triggerCycleScanManual}
                disabled={isScanningManual}
                className="flex items-center gap-2 text-xs bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95 text-emerald-300 font-bold px-4 py-2.5 rounded-xl border border-emerald-500/30 transition-all cursor-pointer shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanningManual ? 'animate-spin' : ''}`} />
                <span>立即结算榜单</span>
              </button>
            </div>
          </section>

          {/* Status Card */}
          <section className="bg-white/5 rounded-2xl border border-white/10 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-gray-500 animate-spin" style={{ animationDuration: '4s' }} />
                <div>
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{t.currentTime}</p>
                  <p className="text-base font-mono font-bold text-zinc-300 mt-0.5">{currentTime.toLocaleTimeString()}</p>
                </div>
              </div>

              {/* 榜单记录 按钮组件 */}
              <button
                type="button"
                onClick={() => setIsBoardRecordOpen(true)}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#1C1C20] hover:bg-[#25252B] text-zinc-200 hover:text-amber-300 border border-[#2F2F36] hover:border-amber-500/50 shadow-sm shadow-black/40 transition-all duration-200 cursor-pointer active:scale-95 group select-none"
                title="点击查看历史价格警报与榜单记录"
              >
                <div className="w-5 h-5 rounded-lg bg-amber-500/15 group-hover:bg-amber-500/25 flex items-center justify-center text-amber-400 transition-colors">
                  <ClipboardList size={13} />
                </div>
                <span className="text-xs font-bold tracking-wide">榜单记录</span>
              </button>
            </div>

            {apiError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-xs shadow-inner animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p className="font-semibold">{t.apiError}: {apiError}</p>
              </div>
            )}

            {scanStats && (
              <div className="pt-4 border-t border-white/5 space-y-2.5 animate-in slide-in-from-bottom-2">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">{t.recentScanStats} ({scanStats.lastScanTime})</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-black/20 p-2 rounded-lg text-center border border-white/5">
                    <p className="text-[9px] text-gray-500 font-bold">{t.totalSymbols}</p>
                    <p className="text-xs font-mono font-bold text-zinc-300 mt-1">{scanStats.totalTickers}</p>
                  </div>
                  <div className="bg-black/20 p-2 rounded-lg text-center border border-white/5">
                    <p className="text-[9px] text-gray-500 font-bold">{t.passed15m}</p>
                    <p className="text-xs font-mono font-bold text-emerald-500 mt-1">{scanStats.passed15m}</p>
                  </div>
                </div>
              </div>
            )}
          </section>

        </div>
        )}

        {/* ========================================================================= */}
        {/* 区域 2：行情异动与榜单监控 (纵向排列，每个模块支持向上折叠) */}
        {/* ========================================================================= */}
        <div className="flex-1 min-w-0 w-full flex flex-col space-y-5">
          
          {/* 区域2 顶部工具栏：模式切换 + 排序方案 + 量k + 涨跌k + 全部展开 / 全部折叠 */}
          <div className="bg-[#141416]/90 px-4 py-2.5 rounded-xl border border-white/10 flex items-center justify-between flex-wrap gap-3 text-xs shadow-md">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-zinc-200 text-sm">区域 2 · 行情异动与榜单监控</span>
              <span className="text-zinc-500 font-mono text-xs hidden sm:inline">(共 5 个榜单 · 纵向排列)</span>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* 折叠/展开控制区 按钮 */}
              <button
                type="button"
                onClick={toggleArea1Collapse}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 text-zinc-300 hover:text-white border border-white/10 transition-all font-medium text-xs cursor-pointer flex items-center gap-1.5"
                title={isArea1Collapsed ? "向右展开左侧控制区" : "向左折叠隐藏左侧控制区以获得更宽广的看盘视野"}
              >
                {isArea1Collapsed ? <ChevronRight className="w-3.5 h-3.5 text-emerald-400" /> : <ChevronLeft className="w-3.5 h-3.5 text-emerald-400" />}
                <span>{isArea1Collapsed ? '展开控制区' : '向左折叠'}</span>
              </button>

              {/* 涨幅计算模式切换 */}
              <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner">
                <span className="text-zinc-400 text-xs px-2 font-medium flex items-center gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
                  模式:
                </span>
                <button
                  type="button"
                  onClick={() => toggleGainMode('standard')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    gainMode === 'standard'
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="常规模式：以15m开盘价为分母 (当前价 - 15m开盘价) ÷ 15m开盘价 × 100%"
                >
                  常规模式
                </button>
                <button
                  type="button"
                  onClick={() => toggleGainMode('high')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    gainMode === 'high'
                      ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="高涨幅模式：以推送当前价为分母 (当前价 - 15m开盘价) ÷ 当前价 × 100%"
                >
                  高涨幅模式
                </button>
                {/* 模式说明悬浮提示 */}
                <div className="relative group/mode-tip ml-1">
                  <span className="cursor-help text-zinc-400 hover:text-zinc-200 p-0.5 inline-block">
                    <Info className="w-3.5 h-3.5 text-zinc-400" />
                  </span>
                  <div className="absolute right-0 top-full mt-2 hidden group-hover/mode-tip:block z-50 w-72 p-3 rounded-xl bg-[#121316] border border-white/20 shadow-2xl text-[11px] text-zinc-300 pointer-events-none leading-relaxed">
                    <p className="font-bold text-white mb-1.5 pb-1 border-b border-white/10">涨跌幅计算模式说明</p>
                    <p className="mb-1"><strong className="text-emerald-400">常规模式：</strong>(当前价 - 15m开盘价) ÷ 15m开盘价 × 100%（传统交易所行情基准）</p>
                    <p><strong className="text-cyan-400">高涨幅模式：</strong>(当前价 - 15m开盘价) ÷ 当前价 × 100%（以推送现价为基准）</p>
                  </div>
                </div>
              </div>

              {/* 排序方案切换：方案1、固定（默认） | 方案2、排序 */}
              <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner">
                <span className="text-zinc-400 text-xs px-2 font-medium flex items-center gap-1">
                  <ListOrdered className="w-3.5 h-3.5 text-emerald-400" />
                  排序方案:
                </span>
                <button
                  type="button"
                  onClick={() => toggleSortScheme('fixed')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    sortScheme === 'fixed'
                      ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/40 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="方案1·固定：排序不发生变化，保持入榜固定排位，仅数值实时更新（默认方案）"
                >
                  <Lock className="w-3 h-3 text-emerald-300" />
                  <span>方案1·固定</span>
                  <span className="text-[10px] text-emerald-300/80 font-normal">(默认)</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSortScheme('dynamic')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    sortScheme === 'dynamic'
                      ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/40 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="方案2·排序：随涨跌幅或高涨跌幅变化，实时重新对榜单排位进行排序"
                >
                  <ArrowUpDown className="w-3 h-3 text-emerald-300" />
                  <span>方案2·排序</span>
                </button>
                {/* 排序说明悬浮提示 */}
                <div className="relative group/sort-tip ml-1">
                  <span className="cursor-help text-zinc-400 hover:text-zinc-200 p-0.5 inline-block">
                    <Info className="w-3.5 h-3.5 text-zinc-400" />
                  </span>
                  <div className="absolute right-0 top-full mt-2 hidden group-hover/sort-tip:block z-50 w-72 p-3 rounded-xl bg-[#121316] border border-white/20 shadow-2xl text-[11px] text-zinc-300 pointer-events-none leading-relaxed">
                    <p className="font-bold text-white mb-1.5 pb-1 border-b border-white/10">榜单排序方案说明</p>
                    <p className="mb-1"><strong className="text-emerald-300">方案1·固定（默认）：</strong>涨跌幅或高涨跌幅数值发生变动时，行排位固定不跳动，保持上轮结算顺序。</p>
                    <p><strong className="text-emerald-300">方案2·排序：</strong>涨跌幅或高涨跌幅数值发生变动时，实时动态重新排序排位。</p>
                  </div>
                </div>
              </div>

              {/* 量k 自定义根数控制 */}
              <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner">
                <span className="text-zinc-400 text-xs px-2 font-medium flex items-center gap-1" title="自定义量k数量：取当前未完结15M K线前的N根完整K线最低交易额(USDT)计算成交额比值">
                  <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
                  量k:
                </span>
                <div className="flex items-center gap-1 pr-1">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={volumeKCount}
                    onChange={e => handleUpdateVolumeKCount(parseInt(e.target.value) || 1)}
                    className="w-12 bg-black/60 border border-white/10 rounded px-1.5 py-0.5 text-xs text-center font-mono text-cyan-300 font-bold focus:border-cyan-500 outline-none"
                  />
                  <span className="text-[11px] text-zinc-500">根</span>
                </div>
                {/* 量k 悬浮说明 */}
                <div className="relative group/volk-tip">
                  <span className="cursor-help text-zinc-400 hover:text-zinc-200 p-0.5 inline-block">
                    <Info className="w-3 h-3 text-cyan-400/80" />
                  </span>
                  <div className="absolute right-0 top-full mt-2 hidden group-hover/volk-tip:block z-50 w-72 p-3 rounded-xl bg-[#121316] border border-white/20 shadow-2xl text-[11px] text-zinc-300 pointer-events-none leading-relaxed">
                    <p className="font-bold text-white mb-1.5 pb-1 border-b border-white/10 flex items-center gap-1 text-cyan-300">
                      <BarChart2 className="w-3.5 h-3.5" />
                      量k 说明 (默认12条完整15M K线)
                    </p>
                    <p className="mb-1 text-zinc-300">• 取当前未完结 15m K 线之前的 <strong className="text-cyan-300">{volumeKCount} 根</strong>完整 15m K 线的最低交易额 (USDT计价)。</p>
                    <p className="text-zinc-300">• 在 15m 成交额单元格实时展示：<span className="text-cyan-300 font-mono font-bold">当前未完结成交额 ÷ 前{volumeKCount}根最低成交额</span> 的比值。</p>
                  </div>
                </div>
              </div>

              {/* 涨跌k 自定义根数控制 */}
              <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner">
                <span className="text-zinc-400 text-xs px-2 font-medium flex items-center gap-1" title="自定义涨跌k数量：取当前未完结15M K线前的N根完结K线按当前模式计算的最大涨幅">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  涨跌k:
                </span>
                <div className="flex items-center gap-1 pr-1">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={gainKCount}
                    onChange={e => handleUpdateGainKCount(parseInt(e.target.value) || 1)}
                    className="w-12 bg-black/60 border border-white/10 rounded px-1.5 py-0.5 text-xs text-center font-mono text-emerald-300 font-bold focus:border-emerald-500 outline-none"
                  />
                  <span className="text-[11px] text-zinc-500">根</span>
                </div>
                {/* 涨跌k 悬浮说明 */}
                <div className="relative group/gaink-tip">
                  <span className="cursor-help text-zinc-400 hover:text-zinc-200 p-0.5 inline-block">
                    <Info className="w-3 h-3 text-emerald-400/80" />
                  </span>
                  <div className="absolute right-0 top-full mt-2 hidden group-hover/gaink-tip:block z-50 w-72 p-3 rounded-xl bg-[#121316] border border-white/20 shadow-2xl text-[11px] text-zinc-300 pointer-events-none leading-relaxed">
                    <p className="font-bold text-white mb-1.5 pb-1 border-b border-white/10 flex items-center gap-1 text-emerald-300">
                      <TrendingUp className="w-3.5 h-3.5" />
                      涨跌k 说明 (默认6条完结15M K线)
                    </p>
                    <p className="mb-1 text-zinc-300">• 取当前未完结 15m K 线之前的 <strong className="text-emerald-300">{gainKCount} 根</strong>完结 15m K 线的最大涨幅。</p>
                    <p className="text-zinc-300">• 计算参照当前选取的模式（<strong className="text-emerald-300">常规模式</strong>或<strong className="text-cyan-300">高涨幅模式</strong>）实时计算并在涨跌幅处展示。</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={expandAllModules}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 text-zinc-300 hover:text-white border border-white/10 transition-all font-medium text-xs cursor-pointer"
                  title="一键展开全部榜单模块"
                >
                  全部展开
                </button>
                <button
                  type="button"
                  onClick={collapseAllModules}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 text-zinc-300 hover:text-white border border-white/10 transition-all font-medium text-xs cursor-pointer"
                  title="一键向上折叠全部榜单模块"
                >
                  全部折叠
                </button>
              </div>
            </div>
          </div>

          {/* Alert Banner */}
          <AnimatePresence>
            {isAlerting && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`p-4 rounded-2xl border flex items-center justify-between shadow-2xl ${
                  activeAlert === 'gain' 
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                    : activeAlert === 'loss'
                    ? 'bg-red-500/10 border-red-500/50 text-red-400'
                    : 'bg-amber-500/10 border-amber-500/50 text-amber-400'
                }`}
              >
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-6 h-6 animate-bounce shrink-0" />
                  <div>
                    <p className="font-bold text-sm">
                      {activeAlert === 'gain' 
                        ? t.triggerGainAlert 
                        : activeAlert === 'loss'
                        ? t.triggerLossAlert 
                        : t.triggerAmpAlert}
                    </p>
                    <p className="text-xs opacity-80 mt-0.5">{t.alertBannerSub}</p>
                  </div>
                </div>
                <button 
                  onClick={stopAlert}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  {t.dismissAlert}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 1. 15分钟涨幅榜 */}
          {renderBoardCard({
            moduleId: 'gainers15m',
            title: t.gainer15m,
            icon: <TrendingUp className="w-5 h-5 text-emerald-500 animate-pulse" />,
            themeColor: 'emerald',
            dataList: displayGainers,
            valueType: 'gain',
            helpManual: (
              <div className="absolute left-0 top-full mt-2 hidden group-hover/help:block z-50 w-80 sm:w-96 p-4 rounded-2xl bg-[#121316]/98 border border-emerald-500/40 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_20px_rgba(16,185,129,0.25)] backdrop-blur-xl text-left pointer-events-none transition-all">
                <div className="flex items-center gap-2 pb-2.5 mb-2.5 border-b border-white/10">
                  <div className="w-6 h-6 rounded-md bg-emerald-500/20 flex items-center justify-center border border-emerald-500/40">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <span className="font-bold text-sm text-emerald-300 tracking-wide">15分钟涨幅榜 · 说明书</span>
                </div>
                <div className="space-y-2.5 text-xs text-zinc-300 leading-relaxed">
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                      1. 刷新周期与时刻
                    </div>
                    <div className="text-zinc-400 pl-3 space-y-1">
                      <p>• <span className="text-zinc-200 font-medium">基准周期：</span>以 15 分钟为一个完整周期（00, 15, 30, 45 分）。</p>
                      <p>• <span className="text-zinc-200 font-medium">周期结算：</span>在每根 15m K 线的第 <span className="text-emerald-300 font-semibold">{config.yMin ?? 14}分{String(config.ySec ?? 30).padStart(2, '0')}秒</span> 实时结算并更新榜单。</p>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                      2. 筛选门槛与计算公式
                    </div>
                    <div className="text-zinc-400 pl-3 space-y-1">
                      <p>• <span className="text-zinc-200 font-medium">成交额门槛：</span>24h成交额 ≥ {formatVolume(config.m1)} USDT 且 15m成交额 ≥ {formatVolume(config.n1)} USDT。</p>
                      <p>• <span className="text-zinc-200 font-medium">常规模式：</span><span className="text-emerald-300 font-mono font-bold">(当前最新价 - 15m开盘价) ÷ 15m开盘价 × 100%</span>。</p>
                      <p>• <span className="text-zinc-200 font-medium">高涨幅模式：</span><span className="text-cyan-300 font-mono font-bold">(当前最新价 - 15m开盘价) ÷ 当前最新价 × 100%</span>。</p>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                      3. 量k 与 涨跌k 动态指标
                    </div>
                    <div className="text-zinc-400 pl-3 space-y-1">
                      <p>• <span className="text-zinc-200 font-medium">量k (默认12根)：</span>取当前未完结15m K线前 {volumeKCount} 根完整K线的最低成交额(USDT)，在成交额处展示「当前未完结成交额 ÷ 前{volumeKCount}根最低成交额」的比值。</p>
                      <p>• <span className="text-zinc-200 font-medium">涨跌k (默认6根)：</span>取当前未完结15m K线前 {gainKCount} 根完结K线在当前模式下的最大涨幅并展示。</p>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                      4. 快速交易与持仓识别
                    </div>
                    <p className="text-zinc-400 pl-3">
                      持仓中的币对自动显示紫色 <span className="text-[#d946ef] font-bold">[持仓中]</span> 标签并将币名标为亮紫色；点击任意行联动切换至交易看板并复制合约。
                    </p>
                  </div>
                </div>
              </div>
            )
          })}

          {/* 2. 15分钟跌幅榜 */}
          {renderBoardCard({
            moduleId: 'losers15m',
            title: t.loser15m,
            icon: <TrendingDown className="w-5 h-5 text-red-500 animate-pulse" />,
            themeColor: 'red',
            dataList: displayLosers,
            valueType: 'loss',
            helpManual: (
              <div className="absolute left-0 top-full mt-2 hidden group-hover/help:block z-50 w-80 sm:w-96 p-4 rounded-2xl bg-[#121316]/98 border border-red-500/40 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_20px_rgba(239,68,68,0.25)] backdrop-blur-xl text-left pointer-events-none transition-all">
                <div className="flex items-center gap-2 pb-2.5 mb-2.5 border-b border-white/10">
                  <div className="w-6 h-6 rounded-md bg-red-500/20 flex items-center justify-center border border-red-500/40">
                    <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                  </div>
                  <span className="font-bold text-sm text-red-300 tracking-wide">15分钟跌幅榜 · 说明书</span>
                </div>
                <div className="space-y-2.5 text-xs text-zinc-300 leading-relaxed">
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                      1. 刷新周期与时刻
                    </div>
                    <div className="text-zinc-400 pl-3 space-y-1">
                      <p>• <span className="text-zinc-200 font-medium">基准周期：</span>以 15 分钟为一个完整周期（00, 15, 30, 45 分）。</p>
                      <p>• <span className="text-zinc-200 font-medium">周期结算：</span>在每根 15m K 线的第 <span className="text-red-300 font-semibold">{config.yMin ?? 14}分{String(config.ySec ?? 30).padStart(2, '0')}秒</span> 实时结算并更新榜单。</p>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                      2. 筛选门槛与计算公式
                    </div>
                    <div className="text-zinc-400 pl-3 space-y-1">
                      <p>• <span className="text-zinc-200 font-medium">成交额门槛：</span>24h成交额 ≥ {formatVolume(config.m1)} USDT 且 15m成交额 ≥ {formatVolume(config.n1)} USDT。</p>
                      <p>• <span className="text-zinc-200 font-medium">常规模式：</span><span className="text-red-300 font-mono font-bold">(当前最新价 - 15m开盘价) ÷ 15m开盘价 × 100%</span>。</p>
                      <p>• <span className="text-zinc-200 font-medium">高跌幅模式：</span><span className="text-red-400 font-mono font-bold">(当前最新价 - 15m开盘价) ÷ 当前最新价 × 100%</span>。</p>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                      3. 量k 与 涨跌k 动态指标
                    </div>
                    <div className="text-zinc-400 pl-3 space-y-1">
                      <p>• <span className="text-zinc-200 font-medium">量k (默认12根)：</span>取当前未完结15m K线前 {volumeKCount} 根完整K线的最低成交额(USDT)，实时展示比值。</p>
                      <p>• <span className="text-zinc-200 font-medium">涨跌k (默认6根)：</span>取当前未完结15m K线前 {gainKCount} 根完结K线在当前模式下的最大涨幅并展示。</p>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                      4. 快速交易与持仓识别
                    </div>
                    <p className="text-zinc-400 pl-3">
                      持仓中的币对自动显示紫色 <span className="text-[#d946ef] font-bold">[持仓中]</span> 标签并将币名标为亮紫色；点击任意行联动切换至交易看板并复制合约。
                    </p>
                  </div>
                </div>
              </div>
            )
          })}

          {/* 3. 15分钟振幅榜 */}
          {renderBoardCard({
            moduleId: 'amplitude15m',
            title: t.amplitude15m,
            icon: <Activity className="w-5 h-5 text-amber-500 animate-pulse" />,
            themeColor: 'amber',
            dataList: displayAmplitude,
            valueType: 'amplitude',
            helpManual: (
              <div className="absolute left-0 top-full mt-2 hidden group-hover/help:block z-50 w-80 sm:w-96 p-4 rounded-2xl bg-[#121316]/98 border border-amber-500/40 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_20px_rgba(245,158,11,0.25)] backdrop-blur-xl text-left pointer-events-none transition-all">
                <div className="flex items-center gap-2 pb-2.5 mb-2.5 border-b border-white/10">
                  <div className="w-6 h-6 rounded-md bg-amber-500/20 flex items-center justify-center border border-amber-500/40">
                    <Activity className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <span className="font-bold text-sm text-amber-300 tracking-wide">15分钟振幅榜 · 说明书</span>
                </div>
                <div className="space-y-2.5 text-xs text-zinc-300 leading-relaxed">
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                      1. 刷新周期与时刻
                    </div>
                    <div className="text-zinc-400 pl-3 space-y-1">
                      <p>• <span className="text-zinc-200 font-medium">基准周期：</span>以 15 分钟为一个完整周期（00, 15, 30, 45 分）。</p>
                      <p>• <span className="text-zinc-200 font-medium">周期结算：</span>在每根 15m K 线的第 <span className="text-amber-300 font-semibold">{config.yMin ?? 14}分{String(config.ySec ?? 30).padStart(2, '0')}秒</span> 实时结算并更新榜单。</p>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                      2. 筛选门槛与计算公式
                    </div>
                    <div className="text-zinc-400 pl-3 space-y-1">
                      <p>• <span className="text-zinc-200 font-medium">成交额门槛：</span>24h成交额 ≥ {formatVolume(config.m1)} USDT 且 15m成交额 ≥ {formatVolume(config.n1)} USDT。</p>
                      <p>• <span className="text-zinc-200 font-medium">计算公式：</span><span className="text-amber-300 font-mono font-bold">(15m最高价 - 15m最低价) ÷ 15m最低价 × 100%</span>。</p>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                      3. 量k 与 涨跌k 动态指标
                    </div>
                    <div className="text-zinc-400 pl-3 space-y-1">
                      <p>• <span className="text-zinc-200 font-medium">量k (默认12根)：</span>取当前未完结15m K线前 {volumeKCount} 根完整K线的最低成交额(USDT)，实时展示比值。</p>
                      <p>• <span className="text-zinc-200 font-medium">涨跌k (默认6根)：</span>取当前未完结15m K线前 {gainKCount} 根完结K线在当前模式下的最大涨幅并展示。</p>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                      4. 快速交易与持仓识别
                    </div>
                    <p className="text-zinc-400 pl-3">
                      持仓中的币对自动显示紫色 <span className="text-[#d946ef] font-bold">[持仓中]</span> 标签并将币名标为亮紫色；点击任意行联动切换至交易看板并复制合约。
                    </p>
                  </div>
                </div>
              </div>
            )
          })}

          {/* 4. 24小时涨幅榜 */}
          {renderBoardCard({
            moduleId: 'gainers24h',
            title: t.gainer24h,
            icon: <TrendingUp className="w-5 h-5 text-emerald-400" />,
            themeColor: 'emerald',
            dataList: displayGainers24h,
            valueType: 'change24h_gain',
            is24h: true,
            helpManual: (
              <div className="absolute left-0 top-full mt-2 hidden group-hover/help:block z-50 w-80 sm:w-96 p-4 rounded-2xl bg-[#121316]/98 border border-emerald-500/40 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_20px_rgba(16,185,129,0.25)] backdrop-blur-xl text-left pointer-events-none transition-all">
                <div className="flex items-center gap-2 pb-2.5 mb-2.5 border-b border-white/10">
                  <div className="w-6 h-6 rounded-md bg-emerald-500/20 flex items-center justify-center border border-emerald-500/40">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <span className="font-bold text-sm text-emerald-300 tracking-wide">24小时涨幅榜 · 说明书</span>
                </div>
                <div className="space-y-2.5 text-xs text-zinc-300 leading-relaxed">
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                      1. 统计周期与门槛
                    </div>
                    <div className="text-zinc-400 pl-3 space-y-1">
                      <p>• <span className="text-zinc-200 font-medium">统计周期：</span>滚动 24 小时。</p>
                      <p>• <span className="text-zinc-200 font-medium">成交额门槛：</span>24h成交额 ≥ {formatVolume(config.m1)} USDT。</p>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                      2. 排序规则
                    </div>
                    <p className="text-zinc-400 pl-3">
                      按 24h 涨幅降序排列，展示 TOP 5 标的。支持资金费率展示与一键联动下单。
                    </p>
                  </div>
                </div>
              </div>
            )
          })}

          {/* 5. 24小时跌幅榜 */}
          {renderBoardCard({
            moduleId: 'losers24h',
            title: t.loser24h,
            icon: <TrendingDown className="w-5 h-5 text-red-400" />,
            themeColor: 'red',
            dataList: displayLosers24h,
            valueType: 'change24h_loss',
            is24h: true,
            helpManual: (
              <div className="absolute left-0 top-full mt-2 hidden group-hover/help:block z-50 w-80 sm:w-96 p-4 rounded-2xl bg-[#121316]/98 border border-red-500/40 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_20px_rgba(239,68,68,0.25)] backdrop-blur-xl text-left pointer-events-none transition-all">
                <div className="flex items-center gap-2 pb-2.5 mb-2.5 border-b border-white/10">
                  <div className="w-6 h-6 rounded-md bg-red-500/20 flex items-center justify-center border border-red-500/40">
                    <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                  </div>
                  <span className="font-bold text-sm text-red-300 tracking-wide">24小时跌幅榜 · 说明书</span>
                </div>
                <div className="space-y-2.5 text-xs text-zinc-300 leading-relaxed">
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                      1. 统计周期与门槛
                    </div>
                    <div className="text-zinc-400 pl-3 space-y-1">
                      <p>• <span className="text-zinc-200 font-medium">统计周期：</span>滚动 24 小时。</p>
                      <p>• <span className="text-zinc-200 font-medium">成交额门槛：</span>24h成交额 ≥ {formatVolume(config.m1)} USDT。</p>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                      2. 排序规则
                    </div>
                    <p className="text-zinc-400 pl-3">
                      按 24h 跌幅升序排列（跌幅最大排前），展示 TOP 5 标的。支持资金费率展示与一键联动下单。
                    </p>
                  </div>
                </div>
              </div>
            )
          })}

        </div>

      </div>

      {/* 历史榜单记录弹窗 */}
      <BoardRecordModal
        isOpen={isBoardRecordOpen}
        onClose={() => setIsBoardRecordOpen(false)}
        onSelectSymbol={handleRowClick}
        positions={positions}
      />
    </div>
  );
}
