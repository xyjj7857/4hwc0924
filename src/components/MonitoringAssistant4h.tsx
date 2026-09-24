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
  ListOrdered
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
  m1: number; // 24h volume threshold for 4h scan
  n1: number; // 4h volume threshold for 4h scan
  volumeSpikeX: number; // Spike multiplier (e.g. 5x)
  volumeSpikeC: number; // 24h volume threshold for spike scan
  volumeSpikeMinute: number; // minute of the hour to trigger spike scan (e.g. 50)
  gainThreshold: number;
  lossThreshold: number;
  amplitudeThreshold: number;
  enableAlertTimeout: boolean;
  alertTimeoutSeconds: number;
  settleMin?: number;
  settleSec?: number;
  minVolume24h?: number;
  minVolumeCycle?: number;
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
}

interface VolumeSpikeData {
  symbol: string;
  ratio: number;
  current1hVol?: number;
  currVolume?: number;
  prev1hVol?: number;
  prevVolume?: number;
  volume24h?: number;
  change: number;
  highChange?: number;
  openPrice?: number;
  lastPrice?: number;
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
}

interface FundingRateData {
  symbol: string;
  fundingRate: number;
  settlementCycle: string;
  volume24h: number;
  nextFundingTime?: number;
  fetchedAt?: number;
}

interface FourHourBoards {
  gainers: SymbolData[];
  losers: SymbolData[];
  amplitude15m: SymbolData[];
  updatedAt?: number;
}

interface SpikeAnd24hBoards {
  volumeSpike: VolumeSpikeData[];
  gainers24h: SymbolData[];
  losers24h: SymbolData[];
  spikeAlertSymbols?: string[];
  updatedAt?: number;
}

interface MonitoringAssistant4hProps {
  apiConfig: { apiKey: string; apiSecret: string; baseUrl: string };
  isConnected: boolean;
  onSelectSymbol: (symbol: string) => void;
  addLog: (message: string, type?: TradeLog['type']) => void;
  onSwitchToTrade: () => void;
  isMuted?: boolean;
  positions?: Position[];
}

const TRANSLATIONS = {
  title: "4H级监控辅助",
  subtitle: "Binance Futures 4H Monitor",
  parameterConfig: "参数配置",
  cycleSettleTitle: "4H周期结算与筛选参数",
  settleTime: "周期结算时刻 (分:秒)",
  vol24hM: "24h成交额门槛 (USDT)",
  vol4hN: "4h成交额门槛 (USDT)",
  volumeSpikeConfigTitle: "1小时放量异动参数",
  volumeSpikeX: "放量倍数 X (倍)",
  volumeSpikeC: "24h成交额门槛 C (USDT)",
  volumeSpikeMinute: "放量扫描时刻 (每小时第几分)",
  alertThreshold: "报警阈值",
  gainThreshold: "涨幅阈值 (%)",
  lossThreshold: "跌幅阈值 (%)",
  amplitudeThreshold: "振幅阈值 (%)",
  voiceAlerts: "语音报警",
  stopAnnouncement: "停止播报",
  gainAlertSound: "涨幅报警音 (MP3)",
  lossAlertSound: "跌幅报警音 (MP3)",
  amplitudeAlertSound: "振幅报警音 (MP3)",
  spikeAlertSound: "放量报警音 (MP3)",
  fundingRateLeaderboard: "资金费率排行榜",
  gainer4h: "4小时涨幅榜",
  loser4h: "4小时跌幅榜",
  amplitude4h: "4小时振幅榜",
  volumeSpike1h: "1小时放量榜",
  gainer24h: "24小时涨幅榜",
  loser24h: "24小时跌幅榜",
  tableSymbol: "币种",
  tableLivePrice: "当前价",
  tableOpenPrice: "4H开盘价",
  tableFundingCycle: "资金费率(周期)",
  tableRate: "费率",
  tableCycle: "周期",
  table24hVol: "24h成交额（万）",
  table4hVol: "4h成交额（万）",
  tableSpikeRatio: "放量倍数",
  table1hChange: "1h涨跌幅",
  tableGain: "涨幅",
  tableLoss: "跌幅",
  tableHighGain: "高涨幅",
  tableHighLoss: "高跌幅",
  gainModeStandard: "常规模式",
  gainModeHigh: "高涨幅模式",
  tableAmplitude: "振幅",
  loading: "加载中...",
  currentTime: "当前时间",
  symbolsUnit: "币种",
  apiError: "API 错误",
  recentScanStats: "最近结算统计",
  totalSymbols: "总币种",
  passed4h: "达标币对",
  triggerGainAlert: "触发4H涨幅警报！",
  triggerLossAlert: "触发4H跌幅警报！",
  triggerAmpAlert: "触发4H振幅警报！",
  triggerSpikeAlert: "触发1H放量警报！",
  alertBannerSub: "当前榜单中已有币种达到预设警报阈值。",
  dismissAlert: "我知道了",
  waitingScan: "等待结算结果...",
  stopProgram: "停止程序",
  startProgram: "启动程序",
  settleCountdown: "4小时结算倒计时",
};

export default function MonitoringAssistant4h({ 
  apiConfig,
  isConnected,
  onSelectSymbol,
  addLog,
  onSwitchToTrade,
  isMuted = false,
  positions = []
}: MonitoringAssistant4hProps) {
  const t = TRANSLATIONS;
  const { 
    prices: livePrices, 
    monitoring4h: sse4h, 
    triggerCycleScan4h, 
    triggerVolumeSpikeScan4h,
    fundingRates: contextFundingRates
  } = useMarketPrices();

  // Helper for checking holding positions
  const isHoldingPosition = useCallback((symbol: string) => {
    if (!symbol || !positions || positions.length === 0) return false;
    return matchSymbolWithPositions(symbol, positions).hasPosition;
  }, [positions]);

  // State
  const [isRunning, setIsRunning] = useState(false);
  const [config, setConfig] = useState<Config>({
    yMin: 58,
    ySec: 30,
    m1: 30000000,
    n1: 10000000,
    volumeSpikeX: 5.0,
    volumeSpikeC: 10000000,
    volumeSpikeMinute: 50,
    gainThreshold: 10,
    lossThreshold: 10,
    amplitudeThreshold: 15,
    enableAlertTimeout: true,
    alertTimeoutSeconds: 15,
  });

  const [fourHourBoards, setFourHourBoards] = useState<FourHourBoards>({
    gainers: [],
    losers: [],
    amplitude15m: [],
  });

  const [spikeAnd24hBoards, setSpikeAnd24hBoards] = useState<SpikeAnd24hBoards>({
    volumeSpike: [],
    gainers24h: [],
    losers24h: [],
    spikeAlertSymbols: [],
  });

  const [fundingRates, setFundingRates] = useState<FundingRateData[]>([]);
  const [fundingPage, setFundingPage] = useState<number>(1);
  const [isFetchingFunding, setIsFetchingFunding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isBoardRecordOpen, setIsBoardRecordOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cycleCountdown, setCycleCountdown] = useState<string>('00:00:00');
  const [dataEngine, setDataEngine] = useState<any>(null);
  const [scanStats, setScanStats] = useState<{
    lastScanTime: string;
    totalTickers: number;
    passed24h?: number;
    passed15m?: number;
  } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isScanning4hManual, setIsScanning4hManual] = useState(false);
  const [isScanningSpikeManual, setIsScanningSpikeManual] = useState(false);

  // 区域1向左折叠状态 (默认收起)
  const [isArea1Collapsed, setIsArea1Collapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('area1_collapsed_4h');
      return saved !== null ? saved === 'true' : true; // 默认收起
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('area1_collapsed_4h', String(isArea1Collapsed));
    } catch {}
  }, [isArea1Collapsed]);

  // 区域2各模块向上折叠状态
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('area2_collapsed_modules_4h');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleModuleCollapse = (id: string) => {
    setCollapsedModules(prev => {
      const updated = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem('area2_collapsed_modules_4h', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const collapseAllModules = () => {
    const all: Record<string, boolean> = {
      gainers4h: true,
      losers4h: true,
      amplitude4h: true,
      volumeSpike1h: true,
      gainers24h: true,
      losers24h: true,
    };
    setCollapsedModules(all);
    try {
      localStorage.setItem('area2_collapsed_modules_4h', JSON.stringify(all));
    } catch {}
  };

  const expandAllModules = () => {
    setCollapsedModules({});
    try {
      localStorage.removeItem('area2_collapsed_modules_4h');
    } catch {}
  };

  // 涨跌幅计算模式：'standard' (常规模式：基准为4H开盘价) 或 'high' (高涨幅模式：基准为当前价)
  // 公式：
  // 常规模式 = (当前价 - 4H开盘价) / 4H开盘价 × 100%
  // 高涨幅模式 = (当前价 - 4H开盘价) / 当前价 × 100%
  const [gainMode, setGainMode] = useState<'standard' | 'high'>(() => {
    try {
      const saved = localStorage.getItem('monitor_4h_gain_mode');
      if (saved === 'high' || saved === 'standard') return saved;
    } catch {}
    return 'standard';
  });

  const toggleGainMode = useCallback((mode: 'standard' | 'high') => {
    setGainMode(mode);
    try {
      localStorage.setItem('monitor_4h_gain_mode', mode);
    } catch {}
  }, []);

  // 排序方案状态：方案1、固定（默认，排序不发生变化） | 方案2、排序（随涨跌幅实时重排序）
  const [sortScheme, setSortScheme] = useState<'fixed' | 'dynamic'>(() => {
    try {
      const saved = localStorage.getItem('monitor_4h_sort_scheme');
      if (saved === 'dynamic' || saved === 'fixed') return saved;
    } catch {}
    return 'fixed'; // 默认方案1：固定
  });

  const toggleSortScheme = useCallback((scheme: 'fixed' | 'dynamic') => {
    setSortScheme(scheme);
    try {
      localStorage.setItem('monitor_4h_sort_scheme', scheme);
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

  // 格式化涨跌幅文本（杜绝 +-1.00% 格式错误）
  const formatChangeText = useCallback((val?: number | null) => {
    if (val === undefined || val === null || isNaN(val)) return '0.00%';
    const prefix = val > 0 ? '+' : '';
    return `${prefix}${val.toFixed(2)}%`;
  }, []);

  // 聚合当前币种的最新显示数据（实时推送当前价、未完结4H开盘价、资金费率、结算周期、常规涨幅、高涨幅、历史最高最低价）
  const getSymbolDisplayData = useCallback((item: SymbolData) => {
    const livePriceObj = livePrices[item.symbol];
    const currentPrice = (livePriceObj && livePriceObj.lastPrice > 0) ? livePriceObj.lastPrice : (item.lastPrice || 0);
    const openPrice = item.openPrice || 0;

    // 常规涨跌幅: (当前价 - 4H开盘价) / 4H开盘价 * 100
    let standardChange = item.change;
    if (currentPrice > 0 && openPrice > 0) {
      standardChange = ((currentPrice - openPrice) / openPrice) * 100;
    }

    // 高涨幅模式: (当前价 - 4H开盘价) / 当前价 * 100
    let highGain = item.highChange !== undefined ? item.highChange : standardChange;
    if (currentPrice > 0 && openPrice > 0) {
      highGain = ((currentPrice - openPrice) / currentPrice) * 100;
    }

    const effectiveChange = gainMode === 'high' ? highGain : standardChange;

    // 资金费率与结算周期 (来自实时订阅或全市场缓存)
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

    return {
      currentPrice,
      openPrice,
      standardChange,
      highGain,
      effectiveChange,
      fundingRate: fundingRate !== undefined ? fundingRate : 0,
      settlementCycle: settlementCycle || '8h',
      listingOpen: item.listingOpen || 0,
      listingTime: item.listingTime || 0,
      historicalHigh,
      historicalLow,
      highTime,
      lowTime,
      laterExtreme,
      candlesCount: item.candlesCount || 0
    };
  }, [livePrices, gainMode, fundingRates, contextFundingRates]);

  // 聚合 1H 放量币对的实时信息
  const getSpikeDisplayData = useCallback((item: VolumeSpikeData) => {
    const livePriceObj = livePrices[item.symbol];
    const currentPrice = (livePriceObj && livePriceObj.lastPrice > 0) ? livePriceObj.lastPrice : (item.lastPrice || 0);
    let fundingRate = item.fundingRate;
    let settlementCycle = item.settlementCycle;
    if (fundingRate === undefined || !settlementCycle) {
      const found = fundingRates.find(f => f.symbol === item.symbol) || contextFundingRates?.find(f => f.symbol === item.symbol);
      if (found) {
        if (fundingRate === undefined) fundingRate = found.fundingRate;
        if (!settlementCycle) settlementCycle = found.settlementCycle;
      }
    }

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

    return {
      currentPrice,
      openPrice: item.openPrice || 0,
      fundingRate: fundingRate !== undefined ? fundingRate : 0,
      settlementCycle: settlementCycle || '8h',
      listingOpen: item.listingOpen || 0,
      listingTime: item.listingTime || 0,
      historicalHigh,
      historicalLow,
      highTime,
      lowTime,
      laterExtreme,
      candlesCount: item.candlesCount || 0
    };
  }, [livePrices, fundingRates, contextFundingRates]);

  // 聚合 24H 榜单币对的实时信息
  const get24hDisplayData = useCallback((item: SymbolData) => {
    const livePriceObj = livePrices[item.symbol];
    const currentPrice = (livePriceObj && livePriceObj.lastPrice > 0) ? livePriceObj.lastPrice : (item.lastPrice || 0);
    let fundingRate = item.fundingRate;
    let settlementCycle = item.settlementCycle;
    if (fundingRate === undefined || !settlementCycle) {
      const found = fundingRates.find(f => f.symbol === item.symbol) || contextFundingRates?.find(f => f.symbol === item.symbol);
      if (found) {
        if (fundingRate === undefined) fundingRate = found.fundingRate;
        if (!settlementCycle) settlementCycle = found.settlementCycle;
      }
    }

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

    return {
      currentPrice,
      openPrice: item.openPrice || 0,
      fundingRate: fundingRate !== undefined ? fundingRate : 0,
      settlementCycle: settlementCycle || '8h',
      listingOpen: item.listingOpen || 0,
      listingTime: item.listingTime || 0,
      historicalHigh,
      historicalLow,
      highTime,
      lowTime,
      laterExtreme,
      candlesCount: item.candlesCount || 0
    };
  }, [livePrices, fundingRates, contextFundingRates]);

  // 依据当前模式与排序方案展示 4H 榜单
  // 方案1、固定：排序不发生变化，保持入榜固定排位，仅数值实时更新（默认方案）
  // 方案2、排序：随涨跌幅或高涨幅变动实时重新排序排位
  const displayGainers = useMemo(() => {
    if (!fourHourBoards.gainers || fourHourBoards.gainers.length === 0) return [];
    if (sortScheme === 'fixed') {
      return fourHourBoards.gainers;
    }
    return [...fourHourBoards.gainers].sort((a, b) => {
      const changeA = getSymbolDisplayData(a).effectiveChange;
      const changeB = getSymbolDisplayData(b).effectiveChange;
      return changeB - changeA;
    });
  }, [fourHourBoards.gainers, sortScheme, getSymbolDisplayData]);

  const displayLosers = useMemo(() => {
    if (!fourHourBoards.losers || fourHourBoards.losers.length === 0) return [];
    if (sortScheme === 'fixed') {
      return fourHourBoards.losers;
    }
    return [...fourHourBoards.losers].sort((a, b) => {
      const changeA = getSymbolDisplayData(a).effectiveChange;
      const changeB = getSymbolDisplayData(b).effectiveChange;
      return changeA - changeB;
    });
  }, [fourHourBoards.losers, sortScheme, getSymbolDisplayData]);

  // Audio state
  const [audioFiles, setAudioFiles] = useState<{ gain: string | null; loss: string | null; amp: string | null; spike: string | null }>({
    gain: null,
    loss: null,
    amp: null,
    spike: null,
  });
  const [audioMeta, setAudioMeta] = useState<{
    gain?: { name: string; size?: number };
    loss?: { name: string; size?: number };
    amp?: { name: string; size?: number };
    spike?: { name: string; size?: number };
  }>({});
  const [uploadingType, setUploadingType] = useState<'gain' | 'loss' | 'amp' | 'spike' | null>(null);
  const [previewingType, setPreviewingType] = useState<'gain' | 'loss' | 'amp' | 'spike' | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [isAlerting, setIsAlerting] = useState(false);
  const [activeAlert, setActiveAlert] = useState<'gain' | 'loss' | 'amp' | 'spike' | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = isMuted;
    if (previewAudioRef.current) previewAudioRef.current.muted = isMuted;
  }, [isMuted]);

  // Load persistent audio settings
  useEffect(() => {
    const loadAudioSettings = async () => {
      try {
        const res = await fetch("/api/audio-settings");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.audios) {
            const files: any = {};
            const meta: any = {};
            (['gain', 'loss', 'amp', 'spike'] as const).forEach(key => {
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

  const handleFileUpload = (type: 'gain' | 'loss' | 'amp' | 'spike', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let alertLabel = '4H上涨';
    if (type === 'loss') alertLabel = '4H下跌';
    if (type === 'amp') alertLabel = '4H振幅';
    if (type === 'spike') alertLabel = '1H放量';

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

  const handleDeleteAudio = async (type: 'gain' | 'loss' | 'amp' | 'spike', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    let alertLabel = '4H上涨';
    if (type === 'loss') alertLabel = '4H下跌';
    if (type === 'amp') alertLabel = '4H振幅';
    if (type === 'spike') alertLabel = '1H放量';

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

  const handleTogglePreview = (type: 'gain' | 'loss' | 'amp' | 'spike', e?: React.MouseEvent) => {
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

  const triggerAlert = useCallback((type: 'gain' | 'loss' | 'amp' | 'spike') => {
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
          let alertLabel = '4H价格上涨';
          if (type === 'loss') alertLabel = '4H价格下跌';
          if (type === 'amp') alertLabel = '4H振幅';
          if (type === 'spike') alertLabel = '1H放量';
          addLog(`[系统] 警报持续时间已达 ${config.alertTimeoutSeconds} 秒，自动完成清除本次警报音和特效`, 'INFO');
        }, config.alertTimeoutSeconds * 1000);
      }
    }
  }, [audioFiles, isAlerting, isMuted, config.enableAlertTimeout, config.alertTimeoutSeconds, stopAlert, addLog]);

  // Sync with SSE updates from MarketPriceContext
  useEffect(() => {
    if (sse4h) {
      if (typeof sse4h.isRunning === 'boolean') {
        setIsRunning(Boolean(sse4h.isRunning));
      }
      if (sse4h.config) setConfig(sse4h.config);
      if (sse4h.scanStats) setScanStats(sse4h.scanStats);

      // Support sse4h.results (from server getFullResults4h()) or direct fourHourBoards/spikeAnd24hBoards
      if (sse4h.results) {
        setFourHourBoards({
          gainers: sse4h.results.gainers || [],
          losers: sse4h.results.losers || [],
          amplitude15m: sse4h.results.amplitude15m || [],
          updatedAt: sse4h.results.fourHourUpdatedAt || sse4h.results.timestamp || Date.now()
        });
        setSpikeAnd24hBoards({
          volumeSpike: sse4h.results.volumeSpike || [],
          gainers24h: sse4h.results.gainers24h || [],
          losers24h: sse4h.results.losers24h || [],
          spikeAlertSymbols: sse4h.results.spikeAlertSymbols || [],
          updatedAt: sse4h.results.volumeSpikeUpdatedAt || sse4h.results.timestamp || Date.now()
        });
      } else {
        if (sse4h.fourHourBoards) setFourHourBoards(sse4h.fourHourBoards);
        if (sse4h.spikeAnd24hBoards) setSpikeAnd24hBoards(sse4h.spikeAnd24hBoards);
      }

      if (sse4h.fundingRates && sse4h.fundingRates.length > 0) {
        setFundingRates(sse4h.fundingRates);
      }
      if (sse4h.dataEngine) setDataEngine(sse4h.dataEngine);
    }
  }, [sse4h]);

  // Synchronize funding rates from MarketPriceContext real-time SSE stream
  useEffect(() => {
    if (contextFundingRates && contextFundingRates.length > 0) {
      setFundingRates(contextFundingRates);
    }
  }, [contextFundingRates]);

  // Initial status fetch on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/monitoring-4h/status");
        if (res.ok) {
          const text = await res.text();
          if (!text || text.trim().startsWith('<')) return;
          const data = JSON.parse(text);
          setIsRunning(data.isRunning);
          if (data.config) setConfig(data.config);
          setScanStats(data.scanStats);
          if (data.results) {
            setFourHourBoards({
              gainers: data.results.gainers || [],
              losers: data.results.losers || [],
              amplitude15m: data.results.amplitude15m || [],
              updatedAt: data.results.fourHourUpdatedAt || 0
            });
            setSpikeAnd24hBoards({
              volumeSpike: data.results.volumeSpike || [],
              gainers24h: data.results.gainers24h || [],
              losers24h: data.results.losers24h || [],
              spikeAlertSymbols: data.results.spikeAlertSymbols || [],
              updatedAt: data.results.volumeSpikeUpdatedAt || 0
            });
          }
          setFundingRates(data.fundingRates || []);
          if (data.dataEngine) setDataEngine(data.dataEngine);
        }
      } catch (err) {
        // Ignore
      }
    };
    fetchStatus();
  }, []);

  // Live clock & 4H cycle countdown calculation (single source of truth matching 15M architecture)
  useEffect(() => {
    const updateTick = () => {
      const now = new Date();
      setCurrentTime(now);

      const hoursInBlock = now.getHours() % 4;
      const totalSecondsInCycle = hoursInBlock * 3600 + now.getMinutes() * 60 + now.getSeconds();
      
      const targetMin = config.yMin ?? config.settleMin ?? 58;
      const targetSec = config.ySec ?? config.settleSec ?? 30;
      // Target is at 3 hours + targetMin minutes + targetSec
      const targetSeconds = (3 * 3600) + (targetMin * 60) + targetSec;

      let diff = targetSeconds - totalSecondsInCycle;
      if (diff < 0) diff += 4 * 3600;

      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setCycleCountdown(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };

    updateTick();
    const clockInterval = setInterval(updateTick, 1000);
    return () => clearInterval(clockInterval);
  }, [config.yMin, config.ySec, config.settleMin, config.settleSec]);

  const lastAlert4hTime = useRef<number>(-1);
  const lastAlertSpikeTime = useRef<number>(-1);

  // 4H alerts check
  useEffect(() => {
    if (!fourHourBoards || !fourHourBoards.updatedAt || fourHourBoards.updatedAt === lastAlert4hTime.current) return;
    lastAlert4hTime.current = fourHourBoards.updatedAt;
    
    const maxGain = fourHourBoards.gainers && fourHourBoards.gainers.length > 0 ? fourHourBoards.gainers[0].change : 0;
    const maxLoss = fourHourBoards.losers && fourHourBoards.losers.length > 0 ? Math.abs(fourHourBoards.losers[0].change) : 0;
    const maxAmplitude = fourHourBoards.amplitude15m && fourHourBoards.amplitude15m.length > 0 ? (fourHourBoards.amplitude15m[0].amplitude || 0) : 0;

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
  }, [fourHourBoards, config.gainThreshold, config.lossThreshold, config.amplitudeThreshold, triggerAlert]);

  // 1H spike alerts check
  useEffect(() => {
    if (!spikeAnd24hBoards || !spikeAnd24hBoards.updatedAt || spikeAnd24hBoards.updatedAt === lastAlertSpikeTime.current) return;
    lastAlertSpikeTime.current = spikeAnd24hBoards.updatedAt;

    const maxSpike = spikeAnd24hBoards.volumeSpike && spikeAnd24hBoards.volumeSpike.length > 0 ? spikeAnd24hBoards.volumeSpike[0].ratio : 0;
    const hasSpikeAlert = (spikeAnd24hBoards.spikeAlertSymbols && spikeAnd24hBoards.spikeAlertSymbols.length > 0) || (maxSpike >= (config.volumeSpikeX ?? 5));
    if (hasSpikeAlert) {
      triggerAlert('spike');
    }
  }, [spikeAnd24hBoards, config.volumeSpikeX, triggerAlert]);

  const updateConfig = async (updatedConfig: Config) => {
    setConfig(updatedConfig);
    try {
      await fetch("/api/monitoring-4h/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConfig)
      });
    } catch (err) {
      console.error("Failed to sync 4H config:", err);
    }
  };

  const toggleRunning = async () => {
    try {
      const willStart = !isRunning;
      if (willStart) {
        addLog('[4H监控] 启动 4H 周期量化引擎，正在对全量 500+ 合约进行即时扫描与刷新...', 'INFO');
      } else {
        addLog('[4H监控] 正在停止 4H 周期量化监控程序...', 'INFO');
      }

      const res = await fetch("/api/monitoring-4h/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRunning: willStart })
      });

      if (res.ok) {
        const data = await res.json();
        setIsRunning(Boolean(data.isRunning));

        // 立即响应并更新全部榜单
        if (data.results || data.fourHourBoards) {
          const resObj = data.results || {};
          setFourHourBoards({
            gainers: resObj.gainers || data.fourHourBoards?.gainers || [],
            losers: resObj.losers || data.fourHourBoards?.losers || [],
            amplitude15m: resObj.amplitude15m || data.fourHourBoards?.amplitude15m || [],
            updatedAt: resObj.fourHourUpdatedAt || data.fourHourBoards?.updatedAt || Date.now()
          });
          setSpikeAnd24hBoards({
            volumeSpike: resObj.volumeSpike || data.spikeAnd24hBoards?.volumeSpike || [],
            gainers24h: resObj.gainers24h || data.spikeAnd24hBoards?.gainers24h || [],
            losers24h: resObj.losers24h || data.spikeAnd24hBoards?.losers24h || [],
            spikeAlertSymbols: resObj.spikeAlertSymbols || data.spikeAnd24hBoards?.spikeAlertSymbols || [],
            updatedAt: resObj.volumeSpikeUpdatedAt || data.spikeAnd24hBoards?.updatedAt || Date.now()
          });
          if (data.scanStats) {
            setScanStats(data.scanStats);
          }
        }

        if (data.isRunning) {
          addLog('[4H监控] 4H 监控程序已成功启动！所有榜单已根据当前量化规则完成即时扫描与刷新。', 'SUCCESS');
        } else {
          addLog('[4H监控] 4H 监控程序已被用户手动中止。', 'INFO');
        }
      }
    } catch (err) {
      console.error("Failed to toggle running state:", err);
      addLog(`[4H监控] 启停程序异常: ${err}`, 'ERROR');
    }
  };

  const triggerCycleScanManual = async () => {
    if (isScanning4hManual) return;
    setIsScanning4hManual(true);
    addLog('[4H看板] 触发手动指令：开始立即结算 4H 周期量化榜单...', 'INFO');
    try {
      const data = await triggerCycleScan4h();
      if (data && (data.results || data.fourHourBoards)) {
        const results = data.results || {};
        setFourHourBoards({
          gainers: results.gainers || data.fourHourBoards?.gainers || [],
          losers: results.losers || data.fourHourBoards?.losers || [],
          amplitude15m: results.amplitude15m || data.fourHourBoards?.amplitude15m || [],
          updatedAt: results.fourHourUpdatedAt || data.fourHourBoards?.updatedAt || Date.now()
        });
        if (results.volumeSpike || data.spikeAnd24hBoards) {
          setSpikeAnd24hBoards({
            volumeSpike: results.volumeSpike || data.spikeAnd24hBoards?.volumeSpike || [],
            gainers24h: results.gainers24h || data.spikeAnd24hBoards?.gainers24h || [],
            losers24h: results.losers24h || data.spikeAnd24hBoards?.losers24h || [],
            spikeAlertSymbols: results.spikeAlertSymbols || data.spikeAnd24hBoards?.spikeAlertSymbols || [],
            updatedAt: results.volumeSpikeUpdatedAt || data.spikeAnd24hBoards?.updatedAt || Date.now()
          });
        }
        if (data.scanStats) {
          setScanStats(data.scanStats);
        }
        addLog(`[4H看板] 4H 周期结算完成，榜单已极速刷新！`, 'SUCCESS');
      }
    } catch (err) {
      console.error("Failed manual 4h scan:", err);
      addLog(`[4H看板] 手动结算异常: ${err}`, 'ERROR');
    } finally {
      setIsScanning4hManual(false);
    }
  };

  const triggerVolumeSpikeManual = async () => {
    if (isScanningSpikeManual) return;
    setIsScanningSpikeManual(true);
    addLog('[4H看板] 触发手动指令：开始立即扫描 1小时放量榜与24小时榜单...', 'INFO');
    try {
      const data = await triggerVolumeSpikeScan4h();
      if (data && (data.results || data.spikeAnd24hBoards)) {
        const results = data.results || {};
        setSpikeAnd24hBoards({
          volumeSpike: results.volumeSpike || data.spikeAnd24hBoards?.volumeSpike || [],
          gainers24h: results.gainers24h || data.spikeAnd24hBoards?.gainers24h || [],
          losers24h: results.losers24h || data.spikeAnd24hBoards?.losers24h || [],
          spikeAlertSymbols: results.spikeAlertSymbols || data.spikeAnd24hBoards?.spikeAlertSymbols || [],
          updatedAt: results.volumeSpikeUpdatedAt || data.spikeAnd24hBoards?.updatedAt || Date.now()
        });
        addLog(`[4H看板] 1小时放量与24小时榜单极速更新！`, 'SUCCESS');
      }
    } catch (err) {
      console.error("Failed volume spike scan:", err);
      addLog(`[4H看板] 放量扫描异常: ${err}`, 'ERROR');
    } finally {
      setIsScanningSpikeManual(false);
    }
  };

  const fetchFundingRates = async () => {
    setIsFetchingFunding(true);
    addLog('[资金费率] 手动刷新资金费率中...', 'INFO');
    try {
      const res = await fetch("/api/monitoring-4h/funding/refresh", { method: "POST" });
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

  return (
    <div className="text-gray-100 font-sans selection:bg-red-500/30 min-h-[calc(100vh-170px)] flex flex-col gap-6">
      <audio ref={audioRef} />

      <div className="flex flex-col lg:flex-row gap-5 mt-1 flex-1 items-start w-full transition-all">
        
        {/* ========================================================================= */}
        {/* 区域 1：控制中心 & 资金费率 (可向左折叠，默认收起) */}
        {/* ========================================================================= */}
        {isArea1Collapsed ? (
          <>
            {/* 桌面端折叠窄条 (向右展开) */}
            <div className="hidden lg:flex flex-col items-center w-14 shrink-0 bg-[#141416]/80 rounded-2xl border border-white/10 p-2.5 py-4 shadow-xl sticky top-4 transition-all group select-none">
              <button
                type="button"
                onClick={() => setIsArea1Collapsed(false)}
                className="w-9 h-9 rounded-xl bg-purple-500/15 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-md group hover:scale-105"
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
                className="flex-1 flex flex-col items-center justify-center py-6 cursor-pointer text-zinc-400 hover:text-purple-300 transition-colors"
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
                <span>区域1 · 控制中心与资金费率 (已收起)</span>
              </div>
              <button
                type="button"
                onClick={() => setIsArea1Collapsed(false)}
                className="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <span>展开</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          /* 展开状态的区域1 */
          <div className="w-full lg:w-[420px] xl:w-[440px] shrink-0 flex flex-col space-y-5">
            {/* 区域1 头部控制栏：向左收起按钮 */}
            <div className="bg-[#141416]/90 px-4 py-2.5 rounded-xl border border-white/10 flex items-center justify-between text-xs shadow-md">
              <span className="font-bold text-zinc-300 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                <span>区域 1 · 控制中心与资金费率</span>
              </span>
              <button
                type="button"
                onClick={() => setIsArea1Collapsed(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white border border-white/10 transition-all cursor-pointer font-bold text-xs"
                title="向左收起区域1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>向左收起</span>
              </button>
            </div>
          
          {showSettings ? (
            <>
              {/* Config Card */}
              <section className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex-1 flex flex-col min-h-[400px]">
                <div className="px-5 py-4 border-b border-white/10 bg-white/5 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-gray-400" />
                  <h2 className="font-bold text-sm uppercase tracking-wider">{t.parameterConfig}</h2>
                </div>
                <div className="p-5 space-y-6 flex-1 overflow-y-auto">
                  
                  {/* Settlement Config */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-purple-400 uppercase flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
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
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-center focus:border-purple-500 outline-none font-mono"
                          />
                          <span className="text-gray-600">:</span>
                          <input 
                            type="number" 
                            value={config.ySec} 
                            onChange={e => updateConfig({...config, ySec: parseInt(e.target.value) || 0})}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-center focus:border-purple-500 outline-none font-mono"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.vol24hM}</label>
                        <input 
                          type="number" 
                          value={config.m1} 
                          onChange={e => updateConfig({...config, m1: parseInt(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:border-purple-500 outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <label className="text-[10px] text-gray-400 block">{t.vol4hN}</label>
                        <input 
                          type="number" 
                          value={config.n1} 
                          onChange={e => updateConfig({...config, n1: parseInt(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:border-purple-500 outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Volume Spike Config */}
                  <div className="space-y-3 pt-4 border-t border-white/5">
                    <h3 className="text-xs font-bold text-cyan-400 uppercase flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      {t.volumeSpikeConfigTitle}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.volumeSpikeX}</label>
                        <input 
                          type="number" 
                          step="0.1"
                          value={config.volumeSpikeX} 
                          onChange={e => updateConfig({...config, volumeSpikeX: parseFloat(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-cyan-400 font-bold focus:border-cyan-500 outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-400 block">{t.volumeSpikeMinute}</label>
                        <input 
                          type="number" 
                          min="0"
                          max="59"
                          value={config.volumeSpikeMinute} 
                          onChange={e => updateConfig({...config, volumeSpikeMinute: parseInt(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-center focus:border-cyan-500 outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <label className="text-[10px] text-gray-400 block">{t.volumeSpikeC}</label>
                        <input 
                          type="number" 
                          value={config.volumeSpikeC} 
                          onChange={e => updateConfig({...config, volumeSpikeC: parseInt(e.target.value) || 0})}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:border-cyan-500 outline-none font-mono"
                        />
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
                            addLog(`[系统] 4H警报持续时间限制已${enabled ? '开启' : '关闭'}`, 'INFO');
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

                  {/* Spike Audio */}
                  <div className="space-y-2">
                    <label className="text-xs text-gray-400 flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-cyan-400" /> {t.spikeAlertSound}
                    </label>
                    {audioFiles.spike ? (
                      <div className="p-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Music className="w-4 h-4 text-cyan-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-cyan-200 truncate max-w-[140px] sm:max-w-[180px]">
                              {audioMeta.spike?.name || '已上传放量报警音'}
                            </div>
                            <span className="text-[10px] text-cyan-400/80 font-mono">服务器永久生效</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleTogglePreview('spike', e)}
                            className={`p-1.5 rounded-lg border text-xs transition-colors flex items-center justify-center ${
                              previewingType === 'spike'
                                ? 'bg-cyan-500 text-black border-cyan-400 animate-pulse'
                                : 'bg-white/10 text-gray-200 border-white/10 hover:bg-white/20'
                            }`}
                            title={previewingType === 'spike' ? '停止试听' : '试听音频'}
                          >
                            {previewingType === 'spike' ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                          </button>
                          <label
                            className="p-1.5 rounded-lg border border-white/10 bg-white/10 text-gray-200 hover:bg-white/20 transition-colors cursor-pointer flex items-center justify-center"
                            title="重新上传替换"
                          >
                            <input
                              type="file"
                              accept=".mp3,.wav,.ogg,.m4a"
                              onChange={(e) => handleFileUpload('spike', e)}
                              className="sr-only"
                            />
                            <Upload className="w-3.5 h-3.5" />
                          </label>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteAudio('spike', e)}
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
                          onChange={e => handleFileUpload('spike', e)}
                          className="sr-only"
                        />
                        <div className="p-3 border-2 border-dashed rounded-xl border-white/10 group-hover:border-cyan-500/40 bg-white/[0.02] group-hover:bg-cyan-500/[0.03] flex items-center justify-center gap-2 transition-all">
                          {uploadingType === 'spike' ? (
                            <>
                              <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                              <span className="text-xs text-cyan-400 font-medium">正在保存到服务器...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-colors" />
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
                    ? 'bg-purple-500/15 border-purple-500/50 text-purple-400' 
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
                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/50 hover:bg-purple-500/20' 
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-900/20 hover:brightness-110 hover:-translate-y-0.5'
                }`}
              >
                {isRunning ? <Square className="w-4 h-4 fill-current animate-pulse" /> : <Play className="w-4 h-4 fill-current shrink-0" />}
                {isRunning ? t.stopProgram : t.startProgram}
              </button>
            </div>

            {dataEngine && (
              <div className="bg-white/5 px-3.5 py-2 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${dataEngine.klineStreamsActive > 0 ? 'bg-purple-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span className="text-zinc-300 font-medium">WS 实时数据引擎</span>
                  <span className="text-zinc-600">|</span>
                  <span className="text-zinc-400">活跃合约: <span className="text-purple-400 font-mono font-bold">{dataEngine.universeCount}</span></span>
                </div>
                <div className="flex items-center gap-3 text-zinc-400">
                  <span>数据流: <span className="text-zinc-200 font-mono font-bold">15m流聚合 (未订阅4H流)</span></span>
                  <span>资金费率WS: <span className={`font-bold ${dataEngine.markPriceActive ? "text-emerald-400" : "text-amber-400"}`}>{dataEngine.markPriceActive ? "实时连接" : "连接中"}</span></span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 p-3 rounded-xl border border-white/10 flex flex-col justify-between">
                <span className="text-[10px] text-gray-400 font-medium tracking-tight">{t.settleCountdown}</span>
                <span className="text-xl font-mono font-bold text-purple-400 my-1">{cycleCountdown}</span>
                <button
                  onClick={triggerCycleScanManual}
                  disabled={isScanning4hManual}
                  className="flex items-center justify-center gap-1.5 text-[11px] bg-purple-500/15 hover:bg-purple-500/25 active:scale-95 text-purple-300 font-bold py-1.5 rounded-lg border border-purple-500/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanning4hManual ? 'animate-spin' : ''}`} />
                  <span>立即结算4H</span>
                </button>
              </div>

              <div className="bg-white/5 p-3 rounded-xl border border-white/10 flex flex-col justify-between">
                <span className="text-[10px] text-gray-400 font-medium tracking-tight">1小时放量与24h榜</span>
                <span className="text-xs font-mono font-bold text-cyan-400 my-1">每小时 {config.volumeSpikeMinute} 分刷新</span>
                <button
                  onClick={triggerVolumeSpikeManual}
                  disabled={isScanningSpikeManual}
                  className="flex items-center justify-center gap-1.5 text-[11px] bg-cyan-500/15 hover:bg-cyan-500/25 active:scale-95 text-cyan-300 font-bold py-1.5 rounded-lg border border-cyan-500/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Zap className={`w-3 h-3 ${isScanningSpikeManual ? 'animate-spin' : ''}`} />
                  <span>立即扫描放量</span>
                </button>
              </div>
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
                    <p className="text-[9px] text-gray-500 font-bold">{t.passed4h}</p>
                    <p className="text-xs font-mono font-bold text-purple-400 mt-1">{scanStats.passed15m || 0}</p>
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
          
          {/* 区域2 顶部工具栏：模式切换 + 全部展开 / 全部折叠 */}
          <div className="bg-[#141416]/90 px-4 py-2.5 rounded-xl border border-white/10 flex items-center justify-between flex-wrap gap-3 text-xs shadow-md">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span className="font-bold text-zinc-200 text-sm">区域 2 · 行情异动与榜单监控</span>
              <span className="text-zinc-500 font-mono text-xs hidden sm:inline">(共 6 个榜单 · 纵向排列)</span>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* 涨幅计算模式切换 */}
              <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner">
                <span className="text-zinc-400 text-xs px-2 font-medium flex items-center gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5 text-purple-400" />
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
                  title="常规模式：以4H开盘价为分母 (当前价 - 4H开盘价) ÷ 4H开盘价 × 100%"
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
                  title="高涨幅模式：以推送当前价为分母 (当前价 - 4H开盘价) ÷ 当前价 × 100%"
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
                    <p className="mb-1"><strong className="text-emerald-400">常规模式：</strong>(当前价 - 4H开盘价) ÷ 4H开盘价 × 100%（传统交易所行情基准）</p>
                    <p><strong className="text-cyan-400">高涨幅模式：</strong>(当前价 - 4H开盘价) ÷ 当前价 × 100%（以推送现价为基准）</p>
                  </div>
                </div>
              </div>

              {/* 排序方案切换：方案1、固定（默认） | 方案2、排序 */}
              <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner">
                <span className="text-zinc-400 text-xs px-2 font-medium flex items-center gap-1">
                  <ListOrdered className="w-3.5 h-3.5 text-purple-400" />
                  排序方案:
                </span>
                <button
                  type="button"
                  onClick={() => toggleSortScheme('fixed')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    sortScheme === 'fixed'
                      ? 'bg-purple-500/25 text-purple-200 border border-purple-500/40 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="方案1·固定：排序不发生变化，保持入榜固定排位，仅数值实时更新（默认方案）"
                >
                  <Lock className="w-3 h-3 text-purple-300" />
                  <span>方案1·固定</span>
                  <span className="text-[10px] text-purple-300/80 font-normal">(默认)</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleSortScheme('dynamic')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    sortScheme === 'dynamic'
                      ? 'bg-purple-500/25 text-purple-200 border border-purple-500/40 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="方案2·排序：随涨跌幅或高涨跌幅变化，实时重新对榜单排位进行排序"
                >
                  <ArrowUpDown className="w-3 h-3 text-purple-300" />
                  <span>方案2·排序</span>
                </button>
                {/* 排序说明悬浮提示 */}
                <div className="relative group/sort-tip ml-1">
                  <span className="cursor-help text-zinc-400 hover:text-zinc-200 p-0.5 inline-block">
                    <Info className="w-3.5 h-3.5 text-zinc-400" />
                  </span>
                  <div className="absolute right-0 top-full mt-2 hidden group-hover/sort-tip:block z-50 w-72 p-3 rounded-xl bg-[#121316] border border-white/20 shadow-2xl text-[11px] text-zinc-300 pointer-events-none leading-relaxed">
                    <p className="font-bold text-white mb-1.5 pb-1 border-b border-white/10">榜单排序方案说明</p>
                    <p className="mb-1"><strong className="text-purple-300">方案1·固定（默认）：</strong>涨跌幅或高涨跌幅数值发生变动时，行排位固定不跳动，保持上轮结算顺序。</p>
                    <p><strong className="text-purple-300">方案2·排序：</strong>涨跌幅或高涨跌幅数值发生变动时，实时动态重新排序排位。</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={expandAllModules}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 text-zinc-300 hover:text-white border border-white/10 transition-all font-medium text-xs cursor-pointer"
                  title="一键展开全部 6 个榜单模块"
                >
                  全部展开
                </button>
                <button
                  type="button"
                  onClick={collapseAllModules}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 text-zinc-300 hover:text-white border border-white/10 transition-all font-medium text-xs cursor-pointer"
                  title="一键向上折叠全部 6 个榜单模块"
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
                    : activeAlert === 'spike'
                    ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
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
                        : activeAlert === 'spike'
                        ? t.triggerSpikeAlert
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

          {/* 纵向排列的 6 个榜单模块 (每个均支持向上折叠) */}
          <div className="flex flex-col space-y-4">
            
            {/* 1. 4小时涨幅榜 */}
            <section className="bg-[#141416]/60 rounded-2xl border border-white/10 overflow-hidden shadow-xl transition-all">
              <div 
                onClick={() => toggleModuleCollapse('gainers4h')}
                className="px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] border-b border-white/5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20 shadow-md shrink-0">
                    <TrendingUp className="w-5 h-5 text-emerald-500 animate-pulse" />
                  </div>
                  <h2 className="text-[20px] sm:text-[22px] font-bold text-emerald-500 tracking-tight whitespace-nowrap">
                    {gainMode === 'high' ? '4小时高涨幅榜' : t.gainer4h}
                  </h2>

                  {/* 模式标签 */}
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                    gainMode === 'high' 
                      ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300' 
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  }`}>
                    {gainMode === 'high' ? '高涨幅模式' : '常规模式'}
                  </span>

                  {/* 排序方案标签 (可点击切换) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSortScheme(sortScheme === 'fixed' ? 'dynamic' : 'fixed');
                    }}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1 transition-all cursor-pointer ${
                      sortScheme === 'fixed'
                        ? 'bg-purple-500/15 border-purple-500/30 text-purple-300 hover:bg-purple-500/25'
                        : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25'
                    }`}
                    title="点击切换排序方案：方案1·固定(默认) / 方案2·排序"
                  >
                    {sortScheme === 'fixed' ? <Lock className="w-2.5 h-2.5" /> : <ArrowUpDown className="w-2.5 h-2.5" />}
                    <span>{sortScheme === 'fixed' ? '方案1:固定' : '方案2:排序'}</span>
                  </button>

                  {/* 说明书 */}
                  <div className="relative group/gain4h-help flex items-center" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="p-1 rounded-full text-white hover:text-emerald-300 hover:bg-white/10 transition-all cursor-help focus:outline-none flex items-center justify-center"
                      title="4小时涨幅榜说明书"
                      aria-label="4小时涨幅榜说明书"
                    >
                      <HelpCircle className="w-5 h-5 text-white stroke-[2.3] drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                    </button>

                    <div className="absolute left-0 top-full mt-2 hidden group-hover/gain4h-help:block z-50 w-80 sm:w-96 p-4 rounded-2xl bg-[#121316]/98 border border-emerald-500/40 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_20px_rgba(16,185,129,0.25)] backdrop-blur-xl text-left pointer-events-none transition-all">
                      <div className="flex items-center gap-2 pb-2.5 mb-2.5 border-b border-white/10">
                        <div className="w-6 h-6 rounded-md bg-emerald-500/20 flex items-center justify-center border border-emerald-500/40">
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <span className="font-bold text-sm text-emerald-300 tracking-wide">4小时涨幅榜 · 说明书</span>
                      </div>
                      
                      <div className="space-y-2.5 text-xs text-zinc-300 leading-relaxed">
                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                            1. 刷新周期与时刻
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-zinc-200 font-medium">基准周期：</span>以 4 小时为一个完整周期（00:00, 04:00, 08:00, 12:00, 16:00, 20:00 等）。</p>
                            <p>• <span className="text-zinc-200 font-medium">周期结算时刻：</span>在每根 4h K 线倒计时的 <span className="text-emerald-300 font-semibold">{config.yMin ?? 58}分{String(config.ySec ?? 30).padStart(2, '0')}秒</span> 实时结算。</p>
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                            2. 筛选门槛与计算公式
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-zinc-200 font-medium">成交额门槛：</span>24h成交额 ≥ {formatVolume(config.m1)} USDT 且 4h成交额 ≥ {formatVolume(config.n1)} USDT。</p>
                            <p>• <span className="text-zinc-200 font-medium">常规涨幅：</span><span className="text-emerald-300 font-mono font-bold">(当前价 - 4h开盘价) ÷ 4h开盘价 × 100%</span>。</p>
                            <p>• <span className="text-cyan-300 font-medium">高涨幅模式：</span><span className="text-cyan-300 font-mono font-bold">(当前价 - 4h开盘价) ÷ 当前价 × 100%</span>。</p>
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                            3. 异动标签与警报机制
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-emerald-400 font-medium">涨幅警报：</span>当 4h 涨幅 ≥ {config.gainThreshold}% 时，触发涨幅警报与语音播报。</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {collapsedModules.gainers4h && displayGainers.length > 0 && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono font-bold text-emerald-400">
                      <span>TOP1: {displayGainers[0].symbol.replace('USDT', '')}</span>
                      <span>{formatChangeText(getSymbolDisplayData(displayGainers[0]).effectiveChange)}</span>
                    </span>
                  )}
                  <span className="text-[13px] text-gray-500 uppercase font-bold tracking-widest font-mono">Top 5</span>
                  <button
                    type="button"
                    className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white transition-colors"
                    title={collapsedModules.gainers4h ? "展开模块" : "向上折叠模块"}
                  >
                    {collapsedModules.gainers4h ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              {!collapsedModules.gainers4h && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[850px]">
                    <thead>
                      <tr className="bg-white/5 text-[14px] text-gray-400 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3 text-left w-[15%]">{t.tableSymbol}</th>
                        <th className="px-3 py-3 text-right w-[12%]">{t.tableLivePrice}</th>
                        <th className="px-3 py-3 text-right w-[12%]">{t.tableOpenPrice}</th>
                        <th className="px-3 py-3 text-right w-[20%]">
                          <div className="flex items-center justify-end gap-1" title="币对上线以来的开盘价、全历史最高/最低价，并标记后创出的极值方向">
                            <span>上线开盘 / 历史高低</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              全历史
                            </span>
                          </div>
                        </th>
                        <th className="px-3 py-3 text-center w-[14%]">{t.tableFundingCycle}</th>
                        <th className="px-3 py-3 text-right w-[13%]">{t.table4hVol}</th>
                        <th className="px-4 py-3 text-right w-[14%]">
                          <div className="flex items-center justify-end gap-1">
                            <span>{gainMode === 'high' ? t.tableHighGain : t.tableGain}</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-white/10 text-zinc-300">
                              {gainMode === 'high' ? '现价分母' : '开盘分母'}
                            </span>
                            <span className={`text-[10px] font-normal px-1 py-0.5 rounded ${sortScheme === 'fixed' ? 'bg-purple-500/20 text-purple-300' : 'bg-indigo-500/20 text-indigo-300'}`}>
                              {sortScheme === 'fixed' ? '固定' : '实时排序'}
                            </span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                        {displayGainers.map((item, idx) => {
                          const isHolding = isHoldingPosition(item.symbol);
                          const data = getSymbolDisplayData(item);
                          const shouldHighlight = isAlerting && data.effectiveChange >= config.gainThreshold;
                          return (
                            <motion.tr 
                              key={item.symbol} 
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ delay: idx * 0.05 }}
                              className={`transition-all group cursor-pointer border-l-4 ${
                                shouldHighlight 
                                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500 shadow-[inset_0_0_12px_rgba(16,185,129,0.3)] animate-pulse font-bold' 
                                  : 'hover:bg-white/5 border-transparent'
                              }`}
                              title="点击同步交易"
                              onClick={() => handleRowClick(item.symbol)}
                            >
                              {/* 1. 币种 */}
                              <td className="px-4 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[19px] sm:text-[21px] ${
                                    isHolding 
                                      ? 'text-[#d946ef]' 
                                      : (shouldHighlight ? 'text-emerald-400' : 'text-zinc-200 group-hover:text-emerald-400')
                                  } transition-colors uppercase font-sans`}>
                                    {item.symbol.replace('USDT', '')}
                                  </span>
                                  {isHolding && (
                                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 bg-[#d946ef]/20 text-[#d946ef] border border-[#d946ef]/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                      持仓中
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 2. 推送当前价 */}
                              <td className="px-3 py-3 text-right font-mono text-[16px] font-bold text-zinc-100 group-hover:text-white transition-colors">
                                {formatPriceVal(data.currentPrice)}
                              </td>

                              {/* 3. 4H开盘价 */}
                              <td className="px-3 py-3 text-right font-mono text-[15px] font-medium text-zinc-400">
                                {formatPriceVal(data.openPrice)}
                              </td>

                              {/* 4. 上线开盘 / 历史最高/最低价 与 后出极值标记 */}
                              <td className="px-3 py-2 text-right">
                                <div className="flex flex-col items-end gap-0.5 font-mono text-[13px] leading-tight">
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
                              <td className="px-3 py-3 text-center">
                                <div className="inline-flex items-center gap-1 font-mono text-[14px]">
                                  <span className={`font-bold ${data.fundingRate > 0 ? 'text-amber-300' : data.fundingRate < 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                    {data.fundingRate > 0 ? '+' : ''}{data.fundingRate.toFixed(4)}%
                                  </span>
                                  <span className="text-zinc-500 text-xs font-normal">
                                    ({data.settlementCycle})
                                  </span>
                                </div>
                              </td>

                              {/* 6. 4H成交额 */}
                              <td className={`px-3 py-3 text-right font-mono text-[16px] font-bold ${shouldHighlight ? 'text-emerald-300' : 'text-emerald-500'}`}>
                                {formatVolume(item.volume15m)}
                              </td>

                              {/* 7. 涨幅 */}
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 text-emerald-400 font-bold text-[19px] sm:text-[21px] font-mono">
                                  {formatChangeText(data.effectiveChange)}
                                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-emerald-400" />
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!displayGainers || displayGainers.length === 0) && (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 2. 4小时跌幅榜 */}
            <section className="bg-[#141416]/60 rounded-2xl border border-white/10 overflow-hidden shadow-xl transition-all">
              <div 
                onClick={() => toggleModuleCollapse('losers4h')}
                className="px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] border-b border-white/5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center border border-red-500/20 shadow-md shrink-0">
                    <TrendingDown className="w-5 h-5 text-red-500 animate-pulse" />
                  </div>
                  <h2 className="text-[20px] sm:text-[22px] font-bold text-red-500 tracking-tight whitespace-nowrap">
                    {gainMode === 'high' ? '4小时高跌幅榜' : t.loser4h}
                  </h2>

                  {/* 模式标签 */}
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                    gainMode === 'high' 
                      ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300' 
                      : 'bg-red-500/15 border-red-500/30 text-red-400'
                  }`}>
                    {gainMode === 'high' ? '高跌幅模式' : '常规模式'}
                  </span>

                  {/* 排序方案标签 (可点击切换) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSortScheme(sortScheme === 'fixed' ? 'dynamic' : 'fixed');
                    }}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1 transition-all cursor-pointer ${
                      sortScheme === 'fixed'
                        ? 'bg-purple-500/15 border-purple-500/30 text-purple-300 hover:bg-purple-500/25'
                        : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25'
                    }`}
                    title="点击切换排序方案：方案1·固定(默认) / 方案2·排序"
                  >
                    {sortScheme === 'fixed' ? <Lock className="w-2.5 h-2.5" /> : <ArrowUpDown className="w-2.5 h-2.5" />}
                    <span>{sortScheme === 'fixed' ? '方案1:固定' : '方案2:排序'}</span>
                  </button>

                  {/* 说明书 */}
                  <div className="relative group/loss4h-help flex items-center" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="p-1 rounded-full text-white hover:text-red-300 hover:bg-white/10 transition-all cursor-help focus:outline-none flex items-center justify-center"
                      title="4小时跌幅榜说明书"
                      aria-label="4小时跌幅榜说明书"
                    >
                      <HelpCircle className="w-5 h-5 text-white stroke-[2.3] drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                    </button>

                    <div className="absolute left-0 top-full mt-2 hidden group-hover/loss4h-help:block z-50 w-80 sm:w-96 p-4 rounded-2xl bg-[#121316]/98 border border-red-500/40 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_20px_rgba(239,68,68,0.25)] backdrop-blur-xl text-left pointer-events-none transition-all">
                      <div className="flex items-center gap-2 pb-2.5 mb-2.5 border-b border-white/10">
                        <div className="w-6 h-6 rounded-md bg-red-500/20 flex items-center justify-center border border-red-500/40">
                          <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                        </div>
                        <span className="font-bold text-sm text-red-300 tracking-wide">4小时跌幅榜 · 说明书</span>
                      </div>
                      
                      <div className="space-y-2.5 text-xs text-zinc-300 leading-relaxed">
                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                            1. 刷新周期与时刻
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-zinc-200 font-medium">基准周期：</span>以 4 小时为一个完整周期。</p>
                            <p>• <span className="text-zinc-200 font-medium">周期结算时刻：</span>在每根 4h K 线倒计时的 <span className="text-red-300 font-semibold">{config.yMin ?? 58}分{String(config.ySec ?? 30).padStart(2, '0')}秒</span> 实时结算。</p>
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                            2. 筛选门槛与计算公式
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-zinc-200 font-medium">成交额门槛：</span>24h成交额 ≥ {formatVolume(config.m1)} USDT 且 4h成交额 ≥ {formatVolume(config.n1)} USDT。</p>
                            <p>• <span className="text-zinc-200 font-medium">常规跌幅：</span><span className="text-red-300 font-mono font-bold">(当前价 - 4h开盘价) ÷ 4h开盘价 × 100%</span>。</p>
                            <p>• <span className="text-cyan-300 font-medium">高跌幅模式：</span><span className="text-cyan-300 font-mono font-bold">(当前价 - 4h开盘价) ÷ 当前价 × 100%</span>。</p>
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                            3. 异动标签与警报机制
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-red-400 font-medium">跌幅警报：</span>当 4h 跌幅绝对值 ≥ {config.lossThreshold}% 时，触发跌幅警报与语音播报。</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {collapsedModules.losers4h && displayLosers.length > 0 && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-xs font-mono font-bold text-red-400">
                      <span>TOP1: {displayLosers[0].symbol.replace('USDT', '')}</span>
                      <span>{formatChangeText(getSymbolDisplayData(displayLosers[0]).effectiveChange)}</span>
                    </span>
                  )}
                  <span className="text-[13px] text-gray-500 uppercase font-bold tracking-widest font-mono">Top 5</span>
                  <button
                    type="button"
                    className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white transition-colors"
                    title={collapsedModules.losers4h ? "展开模块" : "向上折叠模块"}
                  >
                    {collapsedModules.losers4h ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              {!collapsedModules.losers4h && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[850px]">
                    <thead>
                      <tr className="bg-white/5 text-[14px] text-gray-400 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3 text-left w-[15%]">{t.tableSymbol}</th>
                        <th className="px-3 py-3 text-right w-[12%]">{t.tableLivePrice}</th>
                        <th className="px-3 py-3 text-right w-[12%]">{t.tableOpenPrice}</th>
                        <th className="px-3 py-3 text-right w-[20%]">
                          <div className="flex items-center justify-end gap-1" title="币对上线以来的开盘价、全历史最高/最低价，并标记后创出的极值方向">
                            <span>上线开盘 / 历史高低</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              全历史
                            </span>
                          </div>
                        </th>
                        <th className="px-3 py-3 text-center w-[14%]">{t.tableFundingCycle}</th>
                        <th className="px-3 py-3 text-right w-[13%]">{t.table4hVol}</th>
                        <th className="px-4 py-3 text-right w-[14%]">
                          <div className="flex items-center justify-end gap-1">
                            <span>{gainMode === 'high' ? t.tableHighLoss : t.tableLoss}</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-white/10 text-zinc-300">
                              {gainMode === 'high' ? '现价分母' : '开盘分母'}
                            </span>
                            <span className={`text-[10px] font-normal px-1 py-0.5 rounded ${sortScheme === 'fixed' ? 'bg-purple-500/20 text-purple-300' : 'bg-indigo-500/20 text-indigo-300'}`}>
                              {sortScheme === 'fixed' ? '固定' : '实时排序'}
                            </span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                        {displayLosers.map((item, idx) => {
                          const isHolding = isHoldingPosition(item.symbol);
                          const data = getSymbolDisplayData(item);
                          const shouldHighlight = isAlerting && Math.abs(data.effectiveChange) >= config.lossThreshold;
                          return (
                            <motion.tr 
                              key={item.symbol} 
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ delay: idx * 0.05 }}
                              className={`transition-all group cursor-pointer border-l-4 ${
                                shouldHighlight 
                                  ? 'bg-red-500/20 hover:bg-red-500/30 border-red-500 shadow-[inset_0_0_12px_rgba(239,68,68,0.3)] animate-pulse font-bold' 
                                  : 'hover:bg-white/5 border-transparent'
                              }`}
                              title="点击同步交易"
                              onClick={() => handleRowClick(item.symbol)}
                            >
                              {/* 1. 币种 */}
                              <td className="px-4 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[19px] sm:text-[21px] ${
                                    isHolding 
                                      ? 'text-[#d946ef]' 
                                      : (shouldHighlight ? 'text-red-400' : 'text-zinc-200 group-hover:text-red-400')
                                  } transition-colors uppercase font-sans`}>
                                    {item.symbol.replace('USDT', '')}
                                  </span>
                                  {isHolding && (
                                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 bg-[#d946ef]/20 text-[#d946ef] border border-[#d946ef]/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                      持仓中
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 2. 推送当前价 */}
                              <td className="px-3 py-3 text-right font-mono text-[16px] font-bold text-zinc-100 group-hover:text-white transition-colors">
                                {formatPriceVal(data.currentPrice)}
                              </td>

                              {/* 3. 4H开盘价 */}
                              <td className="px-3 py-3 text-right font-mono text-[15px] font-medium text-zinc-400">
                                {formatPriceVal(data.openPrice)}
                              </td>

                              {/* 4. 上线开盘 / 历史最高/最低价 与 后出极值标记 */}
                              <td className="px-3 py-2 text-right">
                                <div className="flex flex-col items-end gap-0.5 font-mono text-[13px] leading-tight">
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
                              <td className="px-3 py-3 text-center">
                                <div className="inline-flex items-center gap-1 font-mono text-[14px]">
                                  <span className={`font-bold ${data.fundingRate > 0 ? 'text-amber-300' : data.fundingRate < 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                    {data.fundingRate > 0 ? '+' : ''}{data.fundingRate.toFixed(4)}%
                                  </span>
                                  <span className="text-zinc-500 text-xs font-normal">
                                    ({data.settlementCycle})
                                  </span>
                                </div>
                              </td>

                              {/* 6. 4H成交额 */}
                              <td className={`px-3 py-3 text-right font-mono text-[16px] font-bold ${shouldHighlight ? 'text-red-300' : 'text-emerald-500'}`}>
                                {formatVolume(item.volume15m)}
                              </td>

                              {/* 7. 跌幅 */}
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 text-red-500 font-bold text-[19px] sm:text-[21px] font-mono">
                                  {formatChangeText(data.effectiveChange)}
                                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-red-500" />
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!displayLosers || displayLosers.length === 0) && (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 3. 4小时振幅榜 */}
            <section className="bg-[#141416]/60 rounded-2xl border border-white/10 overflow-hidden shadow-xl transition-all">
              <div 
                onClick={() => toggleModuleCollapse('amplitude4h')}
                className="px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] border-b border-white/5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center border border-amber-500/20 shadow-md shrink-0">
                    <Activity className="w-5 h-5 text-amber-500 animate-pulse" />
                  </div>
                  <h2 className="text-[20px] sm:text-[22px] font-bold text-amber-500 tracking-tight whitespace-nowrap">{t.amplitude4h}</h2>

                  {/* 说明书 */}
                  <div className="relative group/amp4h-help flex items-center" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="p-1 rounded-full text-white hover:text-amber-300 hover:bg-white/10 transition-all cursor-help focus:outline-none flex items-center justify-center"
                      title="4小时振幅榜说明书"
                      aria-label="4小时振幅榜说明书"
                    >
                      <HelpCircle className="w-5 h-5 text-white stroke-[2.3] drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                    </button>

                    <div className="absolute left-0 top-full mt-2 hidden group-hover/amp4h-help:block z-50 w-80 sm:w-96 p-4 rounded-2xl bg-[#121316]/98 border border-amber-500/40 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_20px_rgba(245,158,11,0.25)] backdrop-blur-xl text-left pointer-events-none transition-all">
                      <div className="flex items-center gap-2 pb-2.5 mb-2.5 border-b border-white/10">
                        <div className="w-6 h-6 rounded-md bg-amber-500/20 flex items-center justify-center border border-amber-500/40">
                          <Activity className="w-3.5 h-3.5 text-amber-400" />
                        </div>
                        <span className="font-bold text-sm text-amber-300 tracking-wide">4小时振幅榜 · 说明书</span>
                      </div>
                      
                      <div className="space-y-2.5 text-xs text-zinc-300 leading-relaxed">
                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                            1. 刷新周期与时刻
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-zinc-200 font-medium">基准周期：</span>以 4 小时为一个完整周期。</p>
                            <p>• <span className="text-zinc-200 font-medium">周期结算时刻：</span>在每根 4h K 线倒计时的 <span className="text-amber-300 font-semibold">{config.yMin ?? 58}分{String(config.ySec ?? 30).padStart(2, '0')}秒</span> 实时结算。</p>
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                            2. 筛选门槛与计算公式
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-zinc-200 font-medium">成交额门槛：</span>24h成交额 ≥ {formatVolume(config.m1)} USDT 且 4h成交额 ≥ {formatVolume(config.n1)} USDT。</p>
                            <p>• <span className="text-zinc-200 font-medium">计算公式：</span><span className="text-amber-300 font-mono font-bold">(4h最高价 - 4h最低价) ÷ 4h开盘价 × 100%</span>。</p>
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                            3. 异动标签与警报机制
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-amber-400 font-medium">振幅警报：</span>当 4h 振幅 ≥ {config.amplitudeThreshold}% 时，触发振幅警报与语音播报。</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {collapsedModules.amplitude4h && fourHourBoards.amplitude15m?.length > 0 && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs font-mono font-bold text-amber-400">
                      <span>TOP1: {fourHourBoards.amplitude15m[0].symbol.replace('USDT', '')}</span>
                      <span>{(fourHourBoards.amplitude15m[0].amplitude || 0).toFixed(2)}%</span>
                    </span>
                  )}
                  <span className="text-[13px] text-gray-500 uppercase font-bold tracking-widest font-mono">Top 5</span>
                  <button
                    type="button"
                    className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white transition-colors"
                    title={collapsedModules.amplitude4h ? "展开模块" : "向上折叠模块"}
                  >
                    {collapsedModules.amplitude4h ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              {!collapsedModules.amplitude4h && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[850px]">
                    <thead>
                      <tr className="bg-white/5 text-[14px] text-gray-400 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3 text-left w-[15%]">{t.tableSymbol}</th>
                        <th className="px-3 py-3 text-right w-[12%]">{t.tableLivePrice}</th>
                        <th className="px-3 py-3 text-right w-[12%]">{t.tableOpenPrice}</th>
                        <th className="px-3 py-3 text-right w-[20%]">
                          <div className="flex items-center justify-end gap-1" title="币对上线以来的开盘价、全历史最高/最低价，并标记后创出的极值方向">
                            <span>上线开盘 / 历史高低</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              全历史
                            </span>
                          </div>
                        </th>
                        <th className="px-3 py-3 text-center w-[14%]">{t.tableFundingCycle}</th>
                        <th className="px-3 py-3 text-right w-[13%]">{t.table4hVol}</th>
                        <th className="px-4 py-3 text-right w-[14%]">{t.tableAmplitude}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                        {fourHourBoards.amplitude15m?.map((item, idx) => {
                          const isHolding = isHoldingPosition(item.symbol);
                          const data = getSymbolDisplayData(item);
                          const shouldHighlight = isAlerting && (item.amplitude || 0) >= config.amplitudeThreshold;
                          return (
                            <motion.tr 
                              key={item.symbol + '_amp'} 
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ delay: idx * 0.05 }}
                              className={`transition-all group cursor-pointer border-l-4 ${
                                shouldHighlight 
                                  ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500 shadow-[inset_0_0_12px_rgba(245,158,11,0.3)] animate-pulse font-bold' 
                                  : 'hover:bg-white/5 border-transparent'
                              }`}
                              title="点击同步交易"
                              onClick={() => handleRowClick(item.symbol)}
                            >
                              {/* 1. 币种 */}
                              <td className="px-4 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[19px] sm:text-[21px] ${
                                    isHolding 
                                      ? 'text-[#d946ef]' 
                                      : (shouldHighlight ? 'text-amber-400' : 'text-zinc-200 group-hover:text-amber-400')
                                  } transition-colors uppercase font-sans`}>
                                    {item.symbol.replace('USDT', '')}
                                  </span>
                                  {isHolding && (
                                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 bg-[#d946ef]/20 text-[#d946ef] border border-[#d946ef]/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                      持仓中
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 2. 推送当前价 */}
                              <td className="px-3 py-3 text-right font-mono text-[16px] font-bold text-zinc-100 group-hover:text-white transition-colors">
                                {formatPriceVal(data.currentPrice)}
                              </td>

                              {/* 3. 4H开盘价 */}
                              <td className="px-3 py-3 text-right font-mono text-[15px] font-medium text-zinc-400">
                                {formatPriceVal(data.openPrice)}
                              </td>

                              {/* 4. 上线开盘 / 历史最高/最低价 与 后出极值标记 */}
                              <td className="px-3 py-2 text-right">
                                <div className="flex flex-col items-end gap-0.5 font-mono text-[13px] leading-tight">
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
                              <td className="px-3 py-3 text-center">
                                <div className="inline-flex items-center gap-1 font-mono text-[14px]">
                                  <span className={`font-bold ${data.fundingRate > 0 ? 'text-amber-300' : data.fundingRate < 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                    {data.fundingRate > 0 ? '+' : ''}{data.fundingRate.toFixed(4)}%
                                  </span>
                                  <span className="text-zinc-500 text-xs font-normal">
                                    ({data.settlementCycle})
                                  </span>
                                </div>
                              </td>

                              {/* 6. 4H成交额 */}
                              <td className={`px-3 py-3 text-right font-mono text-[16px] font-bold ${shouldHighlight ? 'text-amber-300' : 'text-emerald-500'}`}>
                                {formatVolume(item.volume15m)}
                              </td>

                              {/* 7. 振幅 */}
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 text-amber-500 font-bold text-[19px] sm:text-[21px] font-mono">
                                  {(item.amplitude || 0).toFixed(2)}%
                                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-amber-500" />
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!fourHourBoards || !fourHourBoards.amplitude15m || fourHourBoards.amplitude15m.length === 0) && (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            
            {/* 4. 1小时放量榜 */}
            <section className="bg-[#141416]/60 rounded-2xl border border-white/10 overflow-hidden shadow-xl transition-all">
              <div 
                onClick={() => toggleModuleCollapse('spike1h')}
                className="px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] border-b border-white/5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 bg-cyan-500/10 rounded-lg flex items-center justify-center border border-cyan-500/20 shadow-md shrink-0">
                    <Zap className="w-5 h-5 text-cyan-400 animate-pulse" />
                  </div>
                  <h2 className="text-[20px] sm:text-[22px] font-bold text-cyan-400 tracking-tight whitespace-nowrap">{t.volumeSpike1h}</h2>
                  
                  {/* 说明书 */}
                  <div className="relative group/spike-help flex items-center" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="p-1 rounded-full text-white hover:text-cyan-300 hover:bg-white/10 transition-all cursor-help focus:outline-none flex items-center justify-center"
                      title="1小时放量榜说明书"
                      aria-label="1小时放量榜说明书"
                    >
                      <HelpCircle className="w-5 h-5 text-white stroke-[2.3] drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                    </button>

                    <div className="absolute left-0 top-full mt-2 hidden group-hover/spike-help:block z-50 w-80 sm:w-96 p-4 rounded-2xl bg-[#121316]/98 border border-cyan-500/40 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_20px_rgba(6,182,212,0.25)] backdrop-blur-xl text-left pointer-events-none transition-all">
                      <div className="flex items-center gap-2 pb-2.5 mb-2.5 border-b border-white/10">
                        <div className="w-6 h-6 rounded-md bg-cyan-500/20 flex items-center justify-center border border-cyan-500/40">
                          <Zap className="w-3.5 h-3.5 text-cyan-400" />
                        </div>
                        <span className="font-bold text-sm text-cyan-300 tracking-wide">1小时放量榜 · 说明书</span>
                      </div>
                      
                      <div className="space-y-2.5 text-xs text-zinc-300 leading-relaxed">
                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"></span>
                            1. 刷新周期与时刻
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-zinc-200 font-medium">自动刷新时刻：</span>每小时的第 <span className="text-cyan-300 font-semibold">{config.volumeSpikeMinute} 分钟</span> 自动扫描。</p>
                            <p>• <span className="text-zinc-200 font-medium">手动立即刷新：</span>点击右上角【立即扫描放量】按钮即可触发。</p>
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"></span>
                            2. 筛选门槛与计算公式
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-zinc-200 font-medium">初筛门槛：</span>全市场 24h 成交额 ＞ {formatVolume(config.volumeSpikeC)} USDT 的币对。</p>
                            <p>• <span className="text-zinc-200 font-medium">放量倍数：</span><span className="text-cyan-300 font-mono font-bold">当前未收盘 1h 成交额 ÷ 前一根已收盘 1h 成交额</span>。</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {collapsedModules.spike1h && spikeAnd24hBoards?.volumeSpike && spikeAnd24hBoards.volumeSpike.length > 0 && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-xs font-mono font-bold text-cyan-400">
                      <span>TOP1: {spikeAnd24hBoards.volumeSpike[0].symbol.replace('USDT', '')}</span>
                      <span>{spikeAnd24hBoards.volumeSpike[0].ratio.toFixed(2)}倍</span>
                    </span>
                  )}
                  <span className="text-[13px] text-gray-500 uppercase font-bold tracking-widest font-mono">Top 5</span>
                  <button
                    type="button"
                    className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white transition-colors"
                    title={collapsedModules.spike1h ? "展开模块" : "向上折叠模块"}
                  >
                    {collapsedModules.spike1h ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              {!collapsedModules.spike1h && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[850px]">
                    <thead>
                      <tr className="bg-white/5 text-[14px] text-gray-400 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3 text-left w-[15%]">{t.tableSymbol}</th>
                        <th className="px-3 py-3 text-right w-[12%]">{t.tableLivePrice}</th>
                        <th className="px-3 py-3 text-right w-[12%]">{t.tableOpenPrice}</th>
                        <th className="px-3 py-3 text-right w-[20%]">
                          <div className="flex items-center justify-end gap-1" title="币对上线以来的开盘价、全历史最高/最低价，并标记后创出的极值方向">
                            <span>上线开盘 / 历史高低</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              全历史
                            </span>
                          </div>
                        </th>
                        <th className="px-3 py-3 text-center w-[14%]">{t.tableFundingCycle}</th>
                        <th className="px-3 py-3 text-center w-[13%]">{t.tableSpikeRatio}</th>
                        <th className="px-4 py-3 text-right w-[14%]">{t.table1hChange}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                        {spikeAnd24hBoards?.volumeSpike?.map((item, idx) => {
                          const isHolding = isHoldingPosition(item.symbol);
                          const data = getSpikeDisplayData(item);
                          const isSurge = item.ratio >= (config.volumeSpikeX ?? 5);
                          return (
                            <motion.tr 
                              key={item.symbol + '_spike'}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ delay: idx * 0.05 }}
                              className={`hover:bg-white/5 transition-colors group cursor-pointer ${
                                isSurge ? 'bg-cyan-500/10 hover:bg-cyan-500/15' : ''
                              }`}
                              title="点击同步交易"
                              onClick={() => handleRowClick(item.symbol)}
                            >
                              {/* 1. 币种 */}
                              <td className="px-4 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[19px] sm:text-[21px] ${
                                    isHolding 
                                      ? 'text-[#d946ef]' 
                                      : 'text-zinc-200 group-hover:text-cyan-400'
                                  } transition-colors uppercase font-sans`}>
                                    {item.symbol.replace('USDT', '')}
                                  </span>
                                  {isHolding && (
                                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 bg-[#d946ef]/20 text-[#d946ef] border border-[#d946ef]/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                      持仓中
                                    </span>
                                  )}
                                  {isSurge && (
                                    <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded">
                                      放量
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 2. 推送当前价 */}
                              <td className="px-3 py-3 text-right font-mono text-[16px] font-bold text-zinc-100 group-hover:text-white transition-colors">
                                {formatPriceVal(data.currentPrice)}
                              </td>

                              {/* 3. 4H开盘价 */}
                              <td className="px-3 py-3 text-right font-mono text-[15px] font-medium text-zinc-400">
                                {formatPriceVal(data.openPrice)}
                              </td>

                              {/* 4. 上线开盘 / 历史最高/最低价 与 后出极值标记 */}
                              <td className="px-3 py-2 text-right">
                                <div className="flex flex-col items-end gap-0.5 font-mono text-[13px] leading-tight">
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
                              <td className="px-3 py-3 text-center">
                                <div className="inline-flex items-center gap-1 font-mono text-[14px]">
                                  <span className={`font-bold ${data.fundingRate > 0 ? 'text-amber-300' : data.fundingRate < 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                    {data.fundingRate > 0 ? '+' : ''}{data.fundingRate.toFixed(4)}%
                                  </span>
                                  <span className="text-zinc-500 text-xs font-normal">
                                    ({data.settlementCycle})
                                  </span>
                                </div>
                              </td>

                              {/* 6. 放量倍数 */}
                              <td className="px-3 py-3 text-center font-mono text-[18px] font-bold text-cyan-400">
                                {item.ratio.toFixed(2)}倍
                              </td>

                              {/* 7. 1H涨跌 */}
                              <td className="px-4 py-3 text-right">
                                <div className={`flex items-center justify-end gap-1 font-bold text-[19px] sm:text-[21px] font-mono ${
                                  item.change >= 0 ? 'text-emerald-400' : 'text-red-400'
                                }`}>
                                  {formatChangeText(item.change)}
                                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-cyan-400" />
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!spikeAnd24hBoards?.volumeSpike || spikeAnd24hBoards.volumeSpike.length === 0) && (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 5. 24小时涨幅榜 */}
            <section className="bg-[#141416]/60 rounded-2xl border border-white/10 overflow-hidden shadow-xl transition-all">
              <div 
                onClick={() => toggleModuleCollapse('gainers24h')}
                className="px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] border-b border-white/5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20 shadow-md shrink-0">
                    <TrendingUp className="w-5 h-5 text-emerald-500 animate-pulse" />
                  </div>
                  <h2 className="text-[20px] sm:text-[22px] font-bold text-emerald-500 tracking-tight whitespace-nowrap">{t.gainer24h}</h2>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {collapsedModules.gainers24h && spikeAnd24hBoards?.gainers24h && spikeAnd24hBoards.gainers24h.length > 0 && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono font-bold text-emerald-400">
                      <span>TOP1: {spikeAnd24hBoards.gainers24h[0].symbol.replace('USDT', '')}</span>
                      <span>+{spikeAnd24hBoards.gainers24h[0].change24h.toFixed(2)}%</span>
                    </span>
                  )}
                  <span className="text-[13px] text-gray-500 uppercase font-bold tracking-widest font-mono">Top 5</span>
                  <button
                    type="button"
                    className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white transition-colors"
                    title={collapsedModules.gainers24h ? "展开模块" : "向上折叠模块"}
                  >
                    {collapsedModules.gainers24h ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              {!collapsedModules.gainers24h && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[850px]">
                    <thead>
                      <tr className="bg-white/5 text-[14px] text-gray-400 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3 text-left w-[15%]">{t.tableSymbol}</th>
                        <th className="px-3 py-3 text-right w-[12%]">{t.tableLivePrice}</th>
                        <th className="px-3 py-3 text-right w-[12%]">{t.tableOpenPrice}</th>
                        <th className="px-3 py-3 text-right w-[20%]">
                          <div className="flex items-center justify-end gap-1" title="币对上线以来的开盘价、全历史最高/最低价，并标记后创出的极值方向">
                            <span>上线开盘 / 历史高低</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              全历史
                            </span>
                          </div>
                        </th>
                        <th className="px-3 py-3 text-center w-[14%]">{t.tableFundingCycle}</th>
                        <th className="px-3 py-3 text-right w-[13%]">{t.table24hVol}</th>
                        <th className="px-4 py-3 text-right w-[14%]">{t.tableGain}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                        {spikeAnd24hBoards?.gainers24h?.map((item, idx) => {
                          const isHolding = isHoldingPosition(item.symbol);
                          const data = getSymbolDisplayData(item);
                          return (
                            <motion.tr 
                              key={item.symbol + '_24h'}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ delay: idx * 0.05 }}
                              className="hover:bg-white/5 transition-colors group cursor-pointer"
                              title="点击同步交易"
                              onClick={() => handleRowClick(item.symbol)}
                            >
                              {/* 1. 币种 */}
                              <td className="px-4 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[19px] sm:text-[21px] ${
                                    isHolding 
                                      ? 'text-[#d946ef]' 
                                      : 'text-zinc-200 group-hover:text-emerald-500'
                                  } transition-colors uppercase font-sans`}>
                                    {item.symbol.replace('USDT', '')}
                                  </span>
                                  {isHolding && (
                                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 bg-[#d946ef]/20 text-[#d946ef] border border-[#d946ef]/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                      持仓中
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 2. 推送当前价 */}
                              <td className="px-3 py-3 text-right font-mono text-[16px] font-bold text-zinc-100 group-hover:text-white transition-colors">
                                {formatPriceVal(data.currentPrice)}
                              </td>

                              {/* 3. 4H开盘价 */}
                              <td className="px-3 py-3 text-right font-mono text-[15px] font-medium text-zinc-400">
                                {formatPriceVal(data.openPrice)}
                              </td>

                              {/* 4. 上线开盘 / 历史最高/最低价 与 后出极值标记 */}
                              <td className="px-3 py-2 text-right">
                                <div className="flex flex-col items-end gap-0.5 font-mono text-[13px] leading-tight">
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
                              <td className="px-3 py-3 text-center">
                                <div className="inline-flex items-center gap-1 font-mono text-[14px]">
                                  <span className={`font-bold ${data.fundingRate > 0 ? 'text-amber-300' : data.fundingRate < 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                    {data.fundingRate > 0 ? '+' : ''}{data.fundingRate.toFixed(4)}%
                                  </span>
                                  <span className="text-zinc-500 text-xs font-normal">
                                    ({data.settlementCycle})
                                  </span>
                                </div>
                              </td>

                              {/* 6. 24H成交额 */}
                              <td className="px-3 py-3 text-right font-mono text-[16px] font-bold text-emerald-500">
                                {formatVolume(item.volume24h)}
                              </td>

                              {/* 7. 24H涨幅 */}
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 text-emerald-500 font-bold text-[19px] sm:text-[21px] font-mono">
                                  +{item.change24h.toFixed(2)}%
                                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-emerald-500" />
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!spikeAnd24hBoards || spikeAnd24hBoards.gainers24h.length === 0) && (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 6. 24小时跌幅榜 */}
            <section className="bg-[#141416]/60 rounded-2xl border border-white/10 overflow-hidden shadow-xl transition-all">
              <div 
                onClick={() => toggleModuleCollapse('losers24h')}
                className="px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] border-b border-white/5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center border border-red-500/20 shadow-md shrink-0">
                    <TrendingDown className="w-5 h-5 text-red-500 animate-pulse" />
                  </div>
                  <h2 className="text-[20px] sm:text-[22px] font-bold text-red-500 tracking-tight whitespace-nowrap">{t.loser24h}</h2>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {collapsedModules.losers24h && spikeAnd24hBoards?.losers24h && spikeAnd24hBoards.losers24h.length > 0 && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-xs font-mono font-bold text-red-400">
                      <span>TOP1: {spikeAnd24hBoards.losers24h[0].symbol.replace('USDT', '')}</span>
                      <span>{spikeAnd24hBoards.losers24h[0].change24h.toFixed(2)}%</span>
                    </span>
                  )}
                  <span className="text-[13px] text-gray-500 uppercase font-bold tracking-widest font-mono">Top 5</span>
                  <button
                    type="button"
                    className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white transition-colors"
                    title={collapsedModules.losers24h ? "展开模块" : "向上折叠模块"}
                  >
                    {collapsedModules.losers24h ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              {!collapsedModules.losers24h && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[850px]">
                    <thead>
                      <tr className="bg-white/5 text-[14px] text-gray-400 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3 text-left w-[15%]">{t.tableSymbol}</th>
                        <th className="px-3 py-3 text-right w-[12%]">{t.tableLivePrice}</th>
                        <th className="px-3 py-3 text-right w-[12%]">{t.tableOpenPrice}</th>
                        <th className="px-3 py-3 text-right w-[20%]">
                          <div className="flex items-center justify-end gap-1" title="币对上线以来的开盘价、全历史最高/最低价，并标记后创出的极值方向">
                            <span>上线开盘 / 历史高低</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              全历史
                            </span>
                          </div>
                        </th>
                        <th className="px-3 py-3 text-center w-[14%]">{t.tableFundingCycle}</th>
                        <th className="px-3 py-3 text-right w-[13%]">{t.table24hVol}</th>
                        <th className="px-4 py-3 text-right w-[14%]">{t.tableLoss}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                        {spikeAnd24hBoards?.losers24h?.map((item, idx) => {
                          const isHolding = isHoldingPosition(item.symbol);
                          const data = getSymbolDisplayData(item);
                          return (
                            <motion.tr 
                              key={item.symbol + '_24h_loser'}
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ delay: idx * 0.05 }}
                              className="hover:bg-white/5 transition-colors group cursor-pointer"
                              title="点击同步交易"
                              onClick={() => handleRowClick(item.symbol)}
                            >
                              {/* 1. 币种 */}
                              <td className="px-4 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[19px] sm:text-[21px] ${
                                    isHolding 
                                      ? 'text-[#d946ef]' 
                                      : 'text-zinc-200 group-hover:text-red-500'
                                  } transition-colors uppercase font-sans`}>
                                    {item.symbol.replace('USDT', '')}
                                  </span>
                                  {isHolding && (
                                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 bg-[#d946ef]/20 text-[#d946ef] border border-[#d946ef]/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                      持仓中
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 2. 推送当前价 */}
                              <td className="px-3 py-3 text-right font-mono text-[16px] font-bold text-zinc-100 group-hover:text-white transition-colors">
                                {formatPriceVal(data.currentPrice)}
                              </td>

                              {/* 3. 4H开盘价 */}
                              <td className="px-3 py-3 text-right font-mono text-[15px] font-medium text-zinc-400">
                                {formatPriceVal(data.openPrice)}
                              </td>

                              {/* 4. 上线开盘 / 历史最高/最低价 与 后出极值标记 */}
                              <td className="px-3 py-2 text-right">
                                <div className="flex flex-col items-end gap-0.5 font-mono text-[13px] leading-tight">
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
                              <td className="px-3 py-3 text-center">
                                <div className="inline-flex items-center gap-1 font-mono text-[14px]">
                                  <span className={`font-bold ${data.fundingRate > 0 ? 'text-amber-300' : data.fundingRate < 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                    {data.fundingRate > 0 ? '+' : ''}{data.fundingRate.toFixed(4)}%
                                  </span>
                                  <span className="text-zinc-500 text-xs font-normal">
                                    ({data.settlementCycle})
                                  </span>
                                </div>
                              </td>

                              {/* 6. 24H成交额 */}
                              <td className="px-2 py-3 text-right font-mono text-[16px] font-bold text-emerald-500">
                                {formatVolume(item.volume24h)}
                              </td>

                              {/* 7. 24H跌幅 */}
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 text-red-500 font-bold text-[19px] sm:text-[21px] font-mono">
                                  {item.change24h.toFixed(2)}%
                                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-red-500" />
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!spikeAnd24hBoards || spikeAnd24hBoards.losers24h.length === 0) && (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

          </div>
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
