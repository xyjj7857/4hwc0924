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
  BarChart2,
  Filter,
  Settings2,
  FileSpreadsheet,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TradeLog, Position } from '../types';
import BoardRecordModal from './BoardRecordModal';
import FilterSettingsModal4h, { FilterSettings4h, DEFAULT_FILTER_SETTINGS_4H } from './FilterSettingsModal4h';
import OrderSettingsModal4h, { OrderSettings4h, DEFAULT_ORDER_SETTINGS_4H } from './OrderSettingsModal4h';
import { ScreeningRecordsModal, ScreeningRecord } from './ScreeningRecordsModal';
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
  past4hCandles?: Array<{
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
  high?: number;
  low?: number;
  closePos?: number;
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
  allPassedSymbols?: SymbolData[];
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
  exchangeInfo?: any;
  balance?: { spotBalance: number; futuresBalance: number };
  openOrders?: any[];
  onRefreshOrders?: () => void;
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
  tableClosePos: "收位",
  volumeKCount: "量k 根数 (USDT最低成交额)",
  gainKCount: "涨跌k 根数 (最大涨幅)",
  tableVolumeRatio: "量比",
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

export default function MonitoringAssistant4h({ 
  apiConfig,
  isConnected,
  onSelectSymbol,
  addLog,
  onSwitchToTrade,
  isMuted = false,
  positions = [],
  exchangeInfo,
  balance,
  openOrders = [],
  onRefreshOrders
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
    volumeKCount: 12,
    gainKCount: 6,
  });

  const saveDbSettings = useCallback((patch: Record<string, any>) => {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    }).catch(err => {
      console.warn('Failed to sync 4H settings to SQLite database:', err);
    });
  }, []);

  // 自定义 量k 数量 (默认 12 条，即当前未完结4H K线前的12根完整K线最低成交额)
  const [volumeKCount, setVolumeKCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('monitor_4h_volume_k_count');
      if (saved) return Math.max(1, parseInt(saved) || 12);
    } catch {}
    return 12;
  });

  // 自定义 涨跌k 数量 (默认 6 条，即当前未完结4H K线前的6根完结K线在常规/高涨幅模式下的最大涨幅)
  const [gainKCount, setGainKCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('monitor_4h_gain_k_count');
      if (saved) return Math.max(1, parseInt(saved) || 6);
    } catch {}
    return 6;
  });

  const handleUpdateVolumeKCount = useCallback((val: number) => {
    const clamped = Math.max(1, Math.min(30, val));
    setVolumeKCount(clamped);
    try {
      localStorage.setItem('monitor_4h_volume_k_count', String(clamped));
    } catch {}
    saveDbSettings({ monitor_4h_volume_k_count: clamped });
    setConfig(prev => ({ ...prev, volumeKCount: clamped }));
    fetch("/api/monitoring-4h/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volumeKCount: clamped })
    }).catch(() => {});
  }, [saveDbSettings]);

  const handleUpdateGainKCount = useCallback((val: number) => {
    const clamped = Math.max(1, Math.min(30, val));
    setGainKCount(clamped);
    try {
      localStorage.setItem('monitor_4h_gain_k_count', String(clamped));
    } catch {}
    saveDbSettings({ monitor_4h_gain_k_count: clamped });
    setConfig(prev => ({ ...prev, gainKCount: clamped }));
    fetch("/api/monitoring-4h/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gainKCount: clamped })
    }).catch(() => {});
  }, [saveDbSettings]);

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

  // 4H 筛选设置状态
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filterSettings, setFilterSettings] = useState<FilterSettings4h>(() => {
    try {
      const saved = localStorage.getItem('monitoring4h_filter_settings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_FILTER_SETTINGS_4H;
  });

  // 4H 下单设置状态
  const [isOrderSettingsModalOpen, setIsOrderSettingsModalOpen] = useState(false);
  const [orderSettings, setOrderSettings] = useState<OrderSettings4h>(() => {
    try {
      const saved = localStorage.getItem('monitoring4h_order_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_ORDER_SETTINGS_4H,
          ...parsed,
          maxPositionCount: parsed.maxPositionCount || DEFAULT_ORDER_SETTINGS_4H.maxPositionCount
        };
      }
    } catch {}
    return DEFAULT_ORDER_SETTINGS_4H;
  });

  // 自动交易开关状态
  const [isAutoTradingActive, setIsAutoTradingActive] = useState<boolean>(() => {
    try {
      return localStorage.getItem('monitoring4h_auto_trading') === 'true';
    } catch {
      return false;
    }
  });

  // 4H 筛选扫描历史记录状态与弹窗
  const [isScreeningRecordsModalOpen, setIsScreeningRecordsModalOpen] = useState(false);
  const [screeningRecords, setScreeningRecords] = useState<ScreeningRecord[]>(() => {
    try {
      const saved = localStorage.getItem('monitoring4h_screening_records');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // 从本地数据库加载 4H 筛选历史记录 (限制最多 1000 条)
  useEffect(() => {
    fetch('/api/screening-records?limit=1000')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const mapped: ScreeningRecord[] = data.map((d: any) => ({
            id: d.id,
            scanTime: d.scan_time || d.scanTime,
            scanTimeStr: d.scan_time_str || d.scanTimeStr,
            cycleStr: d.cycle_str || d.cycleStr || '',
            symbol: d.symbol,
            currentPrice: d.current_price ?? d.currentPrice ?? 0,
            open4h: d.open_4h ?? d.open4h ?? 0,
            changePercent: d.change_percent ?? d.changePercent ?? 0,
            closePos: d.close_pos ?? d.closePos ?? 0,
            volume4h: d.volume_4h ?? d.volume4h ?? 0,
            volume24h: d.volume_24h ?? d.volume24h ?? 0,
            volumeRatio: d.volume_ratio ?? d.volumeRatio ?? 0,
            maxGainPastK: d.max_gain_past_k ?? d.maxGainPastK ?? 0,
            fundingRate: d.funding_rate ?? d.fundingRate ?? 0,
            settlementCycle: d.settlement_cycle || d.settlementCycle || '8h',
            filterSummary: d.filter_summary || d.filterSummary || '',
            isOrdered: Boolean(d.is_ordered ?? d.isOrdered),
            orderStatus: d.order_status || d.orderStatus || 'NOT_ORDERED',
            orderReason: d.order_reason || d.orderReason || '',
            orderId: d.order_id || d.orderId
          }));
          setScreeningRecords(mapped);
          try {
            localStorage.setItem('monitoring4h_screening_records', JSON.stringify(mapped.slice(0, 500)));
          } catch {}
        }
      })
      .catch(e => console.warn('Failed to load screening records from DB:', e));

    // 启动时将当前 4H 自动交易状态、筛选设置与下单设置双向持久化同步至后端 settings 表
    try {
      const savedAuto = localStorage.getItem('monitoring4h_auto_trading') === 'true';
      const savedFs = localStorage.getItem('monitoring4h_filter_settings');
      const savedOs = localStorage.getItem('monitoring4h_order_settings');
      const syncPayload: Record<string, any> = {
        monitoring4h_auto_trading: savedAuto
      };
      if (savedFs) syncPayload.monitoring4h_filter_settings = JSON.parse(savedFs);
      if (savedOs) syncPayload.monitoring4h_order_settings = JSON.parse(savedOs);
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncPayload)
      }).catch(() => {});
    } catch {}
  }, []);

  // 保存筛选记录辅助函数 (双重持久化: 状态 + 本地数据库 + localStorage)
  const saveScreeningRecords = useCallback((newRecords: ScreeningRecord[]) => {
    if (newRecords.length === 0) return;
    setScreeningRecords(prev => {
      const updated = [...newRecords, ...prev].slice(0, 1000);
      try {
        localStorage.setItem('monitoring4h_screening_records', JSON.stringify(updated.slice(0, 500)));
      } catch {}
      return updated;
    });

    fetch('/api/screening-records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: newRecords })
    }).catch(err => console.warn('Failed to save screening records to backend DB:', err));
  }, []);

  // 清空筛选记录
  const handleClearScreeningRecords = useCallback(async () => {
    try {
      await fetch('/api/screening-records', { method: 'DELETE' });
    } catch (e) {}
    setScreeningRecords([]);
    try {
      localStorage.removeItem('monitoring4h_screening_records');
    } catch {}
    addLog?.('[4H筛选记录] 🗑️ 已清空全部 4H 筛选历史记录', 'INFO');
  }, [addLog]);

  // 刷新筛选记录
  const handleRefreshScreeningRecords = useCallback(async () => {
    try {
      const res = await fetch('/api/screening-records?limit=1000');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const mapped: ScreeningRecord[] = data.map((d: any) => ({
            id: d.id,
            scanTime: d.scan_time || d.scanTime,
            scanTimeStr: d.scan_time_str || d.scanTimeStr,
            cycleStr: d.cycle_str || d.cycleStr || '',
            symbol: d.symbol,
            currentPrice: d.current_price ?? d.currentPrice ?? 0,
            open4h: d.open_4h ?? d.open4h ?? 0,
            changePercent: d.change_percent ?? d.changePercent ?? 0,
            closePos: d.close_pos ?? d.closePos ?? 0,
            volume4h: d.volume_4h ?? d.volume4h ?? 0,
            volume24h: d.volume_24h ?? d.volume24h ?? 0,
            volumeRatio: d.volume_ratio ?? d.volumeRatio ?? 0,
            maxGainPastK: d.max_gain_past_k ?? d.maxGainPastK ?? 0,
            fundingRate: d.funding_rate ?? d.fundingRate ?? 0,
            settlementCycle: d.settlement_cycle || d.settlementCycle || '8h',
            filterSummary: d.filter_summary || d.filterSummary || '',
            isOrdered: Boolean(d.is_ordered ?? d.isOrdered),
            orderStatus: d.order_status || d.orderStatus || 'NOT_ORDERED',
            orderReason: d.order_reason || d.orderReason || '',
            orderId: d.order_id || d.orderId
          }));
          setScreeningRecords(mapped);
          addLog?.(`[4H筛选记录] 🔄 成功刷新筛选历史记录，当前共 ${mapped.length} 条`, 'INFO');
        }
      }
    } catch (e) {
      addLog?.('[4H筛选记录] 刷新筛选历史记录遇到异常', 'WARN');
    }
  }, [addLog]);

  // 从本地数据库 (SQLite settings 表) 初始化恢复所有 4H 相关参数配置
  useEffect(() => {
    let active = true;
    fetch('/api/settings')
      .then(res => res.ok ? res.json() : null)
      .then((settings: Record<string, any> | null) => {
        if (!active || !settings) return;
        if (settings.monitoring4h_filter_settings && typeof settings.monitoring4h_filter_settings === 'object') {
          setFilterSettings(settings.monitoring4h_filter_settings);
          try { localStorage.setItem('monitoring4h_filter_settings', JSON.stringify(settings.monitoring4h_filter_settings)); } catch {}
        }
        if (settings.monitoring4h_order_settings && typeof settings.monitoring4h_order_settings === 'object') {
          setOrderSettings({
            ...DEFAULT_ORDER_SETTINGS_4H,
            ...settings.monitoring4h_order_settings,
            maxPositionCount: settings.monitoring4h_order_settings.maxPositionCount || DEFAULT_ORDER_SETTINGS_4H.maxPositionCount
          });
          try { localStorage.setItem('monitoring4h_order_settings', JSON.stringify(settings.monitoring4h_order_settings)); } catch {}
        }
        if (settings.monitoring4h_auto_trading !== undefined) {
          const autoState = Boolean(settings.monitoring4h_auto_trading);
          setIsAutoTradingActive(autoState);
          try { localStorage.setItem('monitoring4h_auto_trading', String(autoState)); } catch {}
        }
        if (typeof settings.monitor_4h_volume_k_count === 'number') {
          const val = Math.max(1, Math.min(30, settings.monitor_4h_volume_k_count));
          setVolumeKCount(val);
          try { localStorage.setItem('monitor_4h_volume_k_count', String(val)); } catch {}
        }
        if (typeof settings.monitor_4h_gain_k_count === 'number') {
          const val = Math.max(1, Math.min(30, settings.monitor_4h_gain_k_count));
          setGainKCount(val);
          try { localStorage.setItem('monitor_4h_gain_k_count', String(val)); } catch {}
        }
        if (settings.monitor_4h_gain_mode === 'standard' || settings.monitor_4h_gain_mode === 'high') {
          setGainMode(settings.monitor_4h_gain_mode);
          try { localStorage.setItem('monitor_4h_gain_mode', settings.monitor_4h_gain_mode); } catch {}
        }
        if (settings.monitor_4h_sort_scheme === 'fixed' || settings.monitor_4h_sort_scheme === 'dynamic') {
          setSortScheme(settings.monitor_4h_sort_scheme);
          try { localStorage.setItem('monitor_4h_sort_scheme', settings.monitor_4h_sort_scheme); } catch {}
        }
        if (settings.area1_collapsed_4h !== undefined) {
          const a1Col = Boolean(settings.area1_collapsed_4h);
          setIsArea1Collapsed(a1Col);
          try { localStorage.setItem('area1_collapsed_4h', String(a1Col)); } catch {}
        }
        if (settings.area2_collapsed_modules_4h && typeof settings.area2_collapsed_modules_4h === 'object') {
          setCollapsedModules(settings.area2_collapsed_modules_4h);
          try { localStorage.setItem('area2_collapsed_modules_4h', JSON.stringify(settings.area2_collapsed_modules_4h)); } catch {}
        }
        if (settings.monitoring4h_filtered_board_collapsed !== undefined) {
          const fbCol = Boolean(settings.monitoring4h_filtered_board_collapsed);
          setIsFilteredBoardCollapsed(fbCol);
          try { localStorage.setItem('monitoring4h_filtered_board_collapsed', String(fbCol)); } catch {}
        }
      })
      .catch(err => {
        console.warn('Failed to load 4H settings from DB:', err);
      });
    return () => { active = false; };
  }, []);

  const handleToggleAutoTrading = () => {
    setIsAutoTradingActive(prev => {
      const next = !prev;
      try {
        localStorage.setItem('monitoring4h_auto_trading', String(next));
      } catch {}
      saveDbSettings({ monitoring4h_auto_trading: next });
      if (next) {
        const sm = filterSettings.scanMoment || { hour: 3, minute: 58, second: 30 };
        const maxPos = orderSettings.maxPositionCount?.enabled !== false ? (orderSettings.maxPositionCount?.value || '10') : '10';
        addLog?.(`[4H自动策略] 🚀 4H 自动交易策略已启动！将在周期绝对时刻 (${sm.hour}h ${sm.minute}m ${sm.second}s) 自动执行筛选建仓 (最大持仓限制: ${maxPos}) 并已存入本地数据库`, 'SUCCESS');
      } else {
        addLog?.('[4H自动策略] ⏸️ 4H 自动交易策略已停止，不再执行自动开单 (状态已存入本地数据库)', 'INFO');
      }
      return next;
    });
  };

  const handleSaveFilterSettings = (newSettings: FilterSettings4h) => {
    setFilterSettings(newSettings);
    try {
      localStorage.setItem('monitoring4h_filter_settings', JSON.stringify(newSettings));
    } catch {}
    saveDbSettings({ monitoring4h_filter_settings: newSettings });
    addLog?.('[筛选设置] 已更新 4H 榜单筛选条件并保存至本地数据库', 'INFO');
  };

  const handleSaveOrderSettings = (newSettings: OrderSettings4h) => {
    setOrderSettings(newSettings);
    try {
      localStorage.setItem('monitoring4h_order_settings', JSON.stringify(newSettings));
    } catch {}
    saveDbSettings({ monitoring4h_order_settings: newSettings });
    addLog?.('[下单设置] 已更新 4H 下单配置参数并保存至本地数据库', 'INFO');
  };

  // 统计是否有任何激活的过滤条件
  const hasActiveFilters = useMemo(() => {
    return Boolean(
      filterSettings.gainRange.enabled ||
      filterSettings.closePosRange.enabled ||
      filterSettings.minVolume4h.enabled ||
      filterSettings.fundingRateRange.enabled ||
      filterSettings.minVolumeRatio.enabled ||
      filterSettings.minMaxGainPastK.enabled
    );
  }, [filterSettings]);

  // 统计已启用的筛选条件项数
  const activeFilterCount = useMemo(() => {
    return [
      filterSettings.gainRange.enabled,
      filterSettings.closePosRange.enabled,
      filterSettings.minVolume4h.enabled,
      filterSettings.fundingRateRange.enabled,
      filterSettings.minVolumeRatio.enabled,
      filterSettings.minMaxGainPastK.enabled
    ].filter(Boolean).length;
  }, [filterSettings]);

  // 统计是否有任何生效的下单设置
  const hasActiveOrderSettings = useMemo(() => {
    return Boolean(
      orderSettings.maxPositionCount?.enabled ||
      orderSettings.leverage.enabled ||
      orderSettings.calcQtyPercent.enabled ||
      orderSettings.minOrderAmount.enabled ||
      orderSettings.fixedOrderAmount.enabled ||
      orderSettings.stopLossMultiplier.enabled ||
      orderSettings.takeProfitMultiplier.enabled
    );
  }, [orderSettings]);

  // 统计已启用的下单设置项数
  const activeOrderSettingsCount = useMemo(() => {
    return [
      orderSettings.maxPositionCount?.enabled,
      orderSettings.leverage.enabled,
      orderSettings.calcQtyPercent.enabled,
      orderSettings.minOrderAmount.enabled,
      orderSettings.fixedOrderAmount.enabled,
      orderSettings.stopLossMultiplier.enabled,
      orderSettings.takeProfitMultiplier.enabled
    ].filter(Boolean).length;
  }, [orderSettings]);

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
    saveDbSettings({ area1_collapsed_4h: isArea1Collapsed });
  }, [isArea1Collapsed, saveDbSettings]);

  // 区域2各模块向上折叠状态
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('area2_collapsed_modules_4h');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // 筛选榜单独立向上折叠状态 (默认展开)
  const [isFilteredBoardCollapsed, setIsFilteredBoardCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('monitoring4h_filtered_board_collapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleFilteredBoardCollapse = () => {
    setIsFilteredBoardCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('monitoring4h_filtered_board_collapsed', String(next));
      } catch {}
      saveDbSettings({ monitoring4h_filtered_board_collapsed: next });
      return next;
    });
  };

  const toggleModuleCollapse = (id: string) => {
    setCollapsedModules(prev => {
      const updated = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem('area2_collapsed_modules_4h', JSON.stringify(updated));
      } catch {}
      saveDbSettings({ area2_collapsed_modules_4h: updated });
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
    saveDbSettings({ area2_collapsed_modules_4h: all });
  };

  const expandAllModules = () => {
    setCollapsedModules({});
    try {
      localStorage.removeItem('area2_collapsed_modules_4h');
    } catch {}
    saveDbSettings({ area2_collapsed_modules_4h: {} });
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
    saveDbSettings({ monitor_4h_gain_mode: mode });
    fetch("/api/monitoring-4h/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gainMode: mode })
    }).catch(() => {});
  }, [saveDbSettings]);

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
    saveDbSettings({ monitor_4h_sort_scheme: scheme });
  }, [saveDbSettings]);

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

    // 动态计算 量k 指标（当前未完结成交额 / 前 volumeKCount 根完整K线最低成交额）
    const current4hVolume = item.volume15m || 0;
    let minVolumePastK = item.minVolumePastK || 0;
    let volumeRatioPastK = item.volumeRatioPastK || 0;

    if (item.past4hCandles && item.past4hCandles.length > 0) {
      const volCandles = item.past4hCandles.slice(0, Math.max(1, volumeKCount));
      const validVols = volCandles.map(c => c.volume).filter(v => v > 0);
      if (validVols.length > 0) {
        minVolumePastK = Math.min(...validVols);
        volumeRatioPastK = minVolumePastK > 0 ? (current4hVolume / minVolumePastK) : 0;
      }
    } else if (minVolumePastK > 0) {
      volumeRatioPastK = current4hVolume / minVolumePastK;
    }

    // 动态计算 涨跌k 指标（当前未完结K线前的 gainKCount 根完结K线的最大涨幅，随常规模式/高涨幅模式动态切换）
    let maxGainPastK = gainMode === 'high' ? (item.maxGainPastK_high ?? 0) : (item.maxGainPastK_standard ?? 0);
    if (item.past4hCandles && item.past4hCandles.length > 0) {
      const gainCandles = item.past4hCandles.slice(0, Math.max(1, gainKCount));
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
      currentVolume: current4hVolume,
      minVolumePastK,
      volumeRatioPastK,
      maxGainPastK
    };
  }, [livePrices, gainMode, fundingRates, contextFundingRates, volumeKCount, gainKCount]);

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
      openPrice: item.openPrice || 0,
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
      openPrice: item.openPrice || 0,
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
      candlesCount: item.candlesCount || 0
    };
  }, [livePrices, fundingRates, contextFundingRates]);

  // 检查单个币对是否符合当前的筛选设置条件
  const checkItemMatchesFilters = useCallback((item: SymbolData) => {
    const data = getSymbolDisplayData(item);
    // 1. 涨幅范围
    if (filterSettings.gainRange.enabled) {
      const min = parseFloat(filterSettings.gainRange.min);
      const max = parseFloat(filterSettings.gainRange.max);
      if (!isNaN(min) && data.effectiveChange < min) return false;
      if (!isNaN(max) && data.effectiveChange > max) return false;
    }
    // 2. 收位范围
    if (filterSettings.closePosRange.enabled) {
      const min = parseFloat(filterSettings.closePosRange.min);
      const max = parseFloat(filterSettings.closePosRange.max);
      if (!isNaN(min) && (data.closePos === undefined || data.closePos < min)) return false;
      if (!isNaN(max) && (data.closePos === undefined || data.closePos > max)) return false;
    }
    // 3. 4H成交额不小于
    if (filterSettings.minVolume4h.enabled) {
      const min = parseFloat(filterSettings.minVolume4h.value);
      if (!isNaN(min) && (data.currentVolume || 0) < min) return false;
    }
    // 4. 资金费率范围
    if (filterSettings.fundingRateRange.enabled) {
      const min = parseFloat(filterSettings.fundingRateRange.min);
      const max = parseFloat(filterSettings.fundingRateRange.max);
      if (!isNaN(min) && data.fundingRate < min) return false;
      if (!isNaN(max) && data.fundingRate > max) return false;
    }
    // 5. 量比不小于 (自动跟随前端 volumeKCount)
    if (filterSettings.minVolumeRatio.enabled) {
      const min = parseFloat(filterSettings.minVolumeRatio.value);
      if (!isNaN(min) && (data.volumeRatioPastK || 0) < min) return false;
    }
    // 6. 前 N 根涨幅极值不大于 (自动跟随前端 gainKCount 与 gainMode)
    if (filterSettings.minMaxGainPastK.enabled) {
      const max = parseFloat(filterSettings.minMaxGainPastK.value);
      if (!isNaN(max) && (data.maxGainPastK || 0) > max) return false;
    }
    return true;
  }, [filterSettings, getSymbolDisplayData]);

  // 依据当前模式与排序方案展示 4H 榜单
  // 方案1、固定：排序不发生变化，保持入榜固定排位，仅数值实时更新（默认方案）
  // 方案2、排序：随涨跌幅或高涨幅变动实时重新排序排位
  const displayGainers = useMemo(() => {
    let list = fourHourBoards.gainers || [];
    if (filterSettings.filterTableRows && hasActiveFilters) {
      list = list.filter(checkItemMatchesFilters);
    }
    if (sortScheme === 'fixed') {
      return list;
    }
    return [...list].sort((a, b) => {
      const changeA = getSymbolDisplayData(a).effectiveChange;
      const changeB = getSymbolDisplayData(b).effectiveChange;
      return changeB - changeA;
    });
  }, [fourHourBoards.gainers, sortScheme, getSymbolDisplayData, filterSettings.filterTableRows, hasActiveFilters, checkItemMatchesFilters]);

  const displayLosers = useMemo(() => {
    let list = fourHourBoards.losers || [];
    if (filterSettings.filterTableRows && hasActiveFilters) {
      list = list.filter(checkItemMatchesFilters);
    }
    if (sortScheme === 'fixed') {
      return list;
    }
    return [...list].sort((a, b) => {
      const changeA = getSymbolDisplayData(a).effectiveChange;
      const changeB = getSymbolDisplayData(b).effectiveChange;
      return changeA - changeB;
    });
  }, [fourHourBoards.losers, sortScheme, getSymbolDisplayData, filterSettings.filterTableRows, hasActiveFilters, checkItemMatchesFilters]);

  // 汇总 4H 监控全部候选币对，供 4H 筛选榜单使用（方案一：优先采用后端全量达标币对池）
  const allCandidateSymbols4h = useMemo(() => {
    const passedList = fourHourBoards.allPassedSymbols;
    if (passedList && passedList.length > 0) {
      const map = new Map<string, SymbolData>();
      for (const item of passedList) {
        if (item && item.symbol && !map.has(item.symbol)) {
          map.set(item.symbol, item);
        }
      }
      // 补充 1h 放量榜与 24h 榜单币对，确保放量异动币也不遗漏
      const appendList = (arr?: SymbolData[] | VolumeSpikeData[]) => {
        if (!arr) return;
        for (const item of arr) {
          if (item && item.symbol && !map.has(item.symbol)) {
            map.set(item.symbol, item as SymbolData);
          }
        }
      };
      appendList(spikeAnd24hBoards.volumeSpike as any);
      appendList(spikeAnd24hBoards.gainers24h);
      appendList(spikeAnd24hBoards.losers24h);
      return Array.from(map.values());
    }

    // 兜底策略：若全量达标池尚未下发，汇聚 6 个子榜单
    const map = new Map<string, SymbolData>();
    const appendList = (arr?: SymbolData[]) => {
      if (!arr) return;
      for (const item of arr) {
        if (item && item.symbol && !map.has(item.symbol)) {
          map.set(item.symbol, item);
        }
      }
    };
    appendList(fourHourBoards.gainers);
    appendList(fourHourBoards.losers);
    appendList(fourHourBoards.amplitude15m);
    appendList(spikeAnd24hBoards.volumeSpike);
    appendList(spikeAnd24hBoards.gainers24h);
    appendList(spikeAnd24hBoards.losers24h);
    return Array.from(map.values());
  }, [fourHourBoards, spikeAnd24hBoards]);

  // 4H 筛选榜单：展示满足勾选条件的币对集合
  const filteredBoardSymbols = useMemo(() => {
    if (!hasActiveFilters) return [];
    const matched = allCandidateSymbols4h.filter(checkItemMatchesFilters);
    // 按当前模式的有效涨跌幅降序排列
    return [...matched].sort((a, b) => {
      const changeA = getSymbolDisplayData(a).effectiveChange;
      const changeB = getSymbolDisplayData(b).effectiveChange;
      return changeB - changeA;
    });
  }, [allCandidateSymbols4h, hasActiveFilters, checkItemMatchesFilters, getSymbolDisplayData]);

  // --- 4H 自动交易策略执行引擎 ---
  const [localExchangeInfo, setLocalExchangeInfo] = useState<any>(null);
  useEffect(() => {
    if (!exchangeInfo || !exchangeInfo.symbols) {
      fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: '/fapi/v1/exchangeInfo',
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data && data.symbols) {
          setLocalExchangeInfo(data);
        }
      })
      .catch(() => {});
    }
  }, [exchangeInfo, apiConfig.apiKey, apiConfig.apiSecret]);

  const activeExchangeInfo = exchangeInfo?.symbols ? exchangeInfo : localExchangeInfo;

  const getSymbolExchangeInfo = useCallback((sym: string) => {
    if (!activeExchangeInfo || !activeExchangeInfo.symbols) return null;
    return activeExchangeInfo.symbols.find((s: any) => s.symbol === sym || s.symbol === sym.toUpperCase());
  }, [activeExchangeInfo]);

  const formatPriceForSymbol = useCallback((sym: string, price: number) => {
    if (price == null || isNaN(price)) return '0';
    const info = getSymbolExchangeInfo(sym);
    if (!info) return price.toFixed(4);

    const priceFilter = info.filters?.find((f: any) => f.filterType === 'PRICE_FILTER');
    if (priceFilter && parseFloat(priceFilter.tickSize) > 0) {
      const tickSize = parseFloat(priceFilter.tickSize);
      const tickStr = String(priceFilter.tickSize);
      const tickDecimals = tickStr.includes('.') ? (tickStr.split('.')[1].replace(/0+$/, '').length || 0) : 0;
      const roundedPrice = Math.round(price / tickSize) * tickSize;
      return roundedPrice.toFixed(tickDecimals);
    }
    return price.toFixed(info.pricePrecision !== undefined ? info.pricePrecision : 4);
  }, [getSymbolExchangeInfo]);

  const formatQtyForSymbol = useCallback((sym: string, qty: number) => {
    if (qty == null || isNaN(qty)) return '0';
    const info = getSymbolExchangeInfo(sym);
    if (!info) return String(qty);

    const lotSize = info.filters?.find((f: any) => f.filterType === 'LOT_SIZE');
    if (lotSize && parseFloat(lotSize.stepSize) > 0) {
      const stepSize = parseFloat(lotSize.stepSize);
      const lotStr = String(lotSize.stepSize);
      const lotDecimals = lotStr.includes('.') ? (lotStr.split('.')[1].replace(/0+$/, '').length || 0) : 0;
      const roundedQty = Math.floor(qty / stepSize) * stepSize;
      return roundedQty.toFixed(lotDecimals);
    }
    return qty.toFixed(info.quantityPrecision !== undefined ? info.quantityPrecision : 2);
  }, [getSymbolExchangeInfo]);

  // 向币安为单个持仓挂出 1 张止盈限价单与 1 张止损算法单 (图三标准：止盈价 = 4H开盘价 × 设定倍数，止损价 = 4H开盘价 × 设定倍数)
  const placePositionTpSl = useCallback(async (
    sym: string,
    posAmount: number,
    base4hOpenPrice: number,
    currentPrice: number,
    posSide: string = 'BOTH',
    orderSettingsToUse: OrderSettings4h
  ) => {
    if (!isConnected || !apiConfig.apiKey || !apiConfig.apiSecret) {
      addLog?.(`[4H自动策略] ⚠️ 未连接币安 API，无法为 ${sym} 挂止盈止损单`, 'WARN');
      return { tpSuccess: false, slSuccess: false };
    }

    const slEnabled = orderSettingsToUse.stopLossMultiplier?.enabled;
    const tpEnabled = orderSettingsToUse.takeProfitMultiplier?.enabled;
    const slMultiplier = parseFloat(orderSettingsToUse.stopLossMultiplier?.value) || 0.985;
    const tpMultiplier = parseFloat(orderSettingsToUse.takeProfitMultiplier?.value) || 1.05;

    const closingQty = formatQtyForSymbol(sym, posAmount);
    if (parseFloat(closingQty) <= 0) {
      addLog?.(`[4H风控挂单] ⚠️ ${sym} 持仓数量计算为 0，跳过挂止盈止损`, 'WARN');
      return { tpSuccess: false, slSuccess: false };
    }

    const closingSide = 'SELL';
    const baseAnchorPrice = base4hOpenPrice > 0 ? base4hOpenPrice : currentPrice;

    // 步骤 1: 撤销该币对属于当前平仓方向的原有普通挂单与算法单（防历史旧单冲突）
    try {
      const openOrdersRes = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: '/fapi/v1/openOrders',
          params: { symbol: sym },
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });
      if (openOrdersRes.ok) {
        const openOrdersData = await openOrdersRes.json();
        if (Array.isArray(openOrdersData)) {
          for (const order of openOrdersData) {
            if (order.side === closingSide) {
              await fetch('/api/binance-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  method: 'DELETE',
                  endpoint: '/fapi/v1/order',
                  params: { symbol: sym, orderId: order.orderId },
                  apiKey: apiConfig.apiKey,
                  apiSecret: apiConfig.apiSecret
                })
              });
            }
          }
        }
      }
    } catch (cancelErr) {}

    try {
      const openAlgoRes = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'GET',
          endpoint: '/fapi/v1/openAlgoOrders',
          params: { symbol: sym },
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });
      if (openAlgoRes.ok) {
        const algoData = await openAlgoRes.json();
        const allAlgoOrders = Array.isArray(algoData) ? algoData : (algoData.orders || algoData.algoOrders || []);
        for (const algoOrder of allAlgoOrders) {
          if (!algoOrder.side || algoOrder.side === closingSide) {
            await fetch('/api/binance-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                method: 'DELETE',
                endpoint: '/fapi/v1/algoOrder',
                params: { algoId: algoOrder.algoId, symbol: sym },
                apiKey: apiConfig.apiKey,
                apiSecret: apiConfig.apiSecret
              })
            });
          }
        }
      }
    } catch (algoCancelErr) {}

    let tpSuccess = false;
    let slSuccess = false;

    // 步骤 2: 挂止盈单 (按照图三：止盈价 = 当前4H开盘价 × 设定倍数)
    // 优先采用币安 Maker LIMIT 限价委托：直接进入委托账本，享 Maker 手续费优惠，100% 成功出现在“永续合约当前委托”中
    if (tpEnabled && tpMultiplier > 0) {
      let calculatedTpPrice = baseAnchorPrice * tpMultiplier;
      if (currentPrice > 0 && calculatedTpPrice <= currentPrice) {
        calculatedTpPrice = currentPrice * 1.005;
        addLog?.(`[4H自动策略-止盈] 提示: ${sym} 计算止盈价低于或等于现价，安全调整为 ${calculatedTpPrice.toFixed(4)}`, 'INFO');
      }
      const finalTpPrice = formatPriceForSymbol(sym, calculatedTpPrice);

      const limitTpParams: any = {
        symbol: sym,
        side: closingSide,
        positionSide: posSide,
        type: 'LIMIT',
        price: finalTpPrice,
        quantity: closingQty,
        timeInForce: 'GTC'
      };
      if (posSide === 'BOTH') limitTpParams.reduceOnly = 'true';

      addLog?.(`[4H风控挂单] 正在提交 ${sym} 限价止盈单 (挂单价: ${finalTpPrice}, 数量: ${closingQty}, 倍数: ${tpMultiplier}x)...`, 'TRADE');

      try {
        const tpRes = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'POST',
            endpoint: '/fapi/v1/order',
            params: limitTpParams,
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });
        const tpData = await tpRes.json();
        if (tpRes.ok && (tpData.orderId || tpData.clientOrderId)) {
          tpSuccess = true;
          addLog?.(`[4H自动策略] ✅ ${sym} 限价止盈委托挂单成功！订单ID: ${tpData.orderId} (止盈价: ${finalTpPrice}, 数量: ${closingQty})`, 'SUCCESS');
        } else {
          // 降级尝试 algoOrder 止盈
          const algoTpParams: any = {
            algoType: 'CONDITIONAL',
            symbol: sym,
            side: closingSide,
            positionSide: posSide,
            quantity: closingQty,
            workingType: 'MARK_PRICE',
            triggerPrice: finalTpPrice,
            type: 'TAKE_PROFIT_MARKET'
          };
          if (posSide === 'BOTH') algoTpParams.reduceOnly = 'true';
          const algoTpRes = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: 'POST',
              endpoint: '/fapi/v1/algoOrder',
              params: algoTpParams,
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });
          const algoTpData = await algoTpRes.json();
          if (algoTpRes.ok && (algoTpData.algoId || algoTpData.orderId)) {
            tpSuccess = true;
            addLog?.(`[4H自动策略] ✅ ${sym} 算法止盈委托挂单成功！触发价: ${finalTpPrice}`, 'SUCCESS');
          } else {
            addLog?.(`[4H自动策略] ⚠️ ${sym} 止盈挂单反馈: ${tpData?.msg || algoTpData?.msg || '未知异常'}`, 'INFO');
          }
        }
      } catch (tpErr: any) {
        addLog?.(`[4H自动策略] ❌ ${sym} 止盈挂单异常: ${tpErr?.message || tpErr}`, 'ERROR');
      }
    }

    // 步骤 3: 挂止损单 (按照图三：止损价 = 当前4H开盘价 × 设定倍数)
    // 采用币安官方专用于条件单的 algoOrder STOP_MARKET，带智能防立即触发校验
    if (slEnabled && slMultiplier > 0) {
      let calculatedSlPrice = baseAnchorPrice * slMultiplier;
      if (currentPrice > 0 && calculatedSlPrice >= currentPrice) {
        calculatedSlPrice = currentPrice * 0.995;
        addLog?.(`[4H自动策略-止损] 提示: ${sym} 设定止损价 (${(baseAnchorPrice * slMultiplier).toFixed(4)}) 高于或等于当前现价 (${currentPrice})，安全调整为 ${calculatedSlPrice.toFixed(4)}，防止币安拒单`, 'INFO');
      }
      const finalSlPrice = formatPriceForSymbol(sym, calculatedSlPrice);

      addLog?.(`[4H风控挂单] 正在向币安 Algo 算法端点提交 ${sym} 条件止损单 (触发价: ${finalSlPrice}, 数量: ${closingQty}, 倍数: ${slMultiplier}x)...`, 'TRADE');

      try {
        const buildAlgoSlParams = (targetPosSide: string, withReduceOnly: boolean) => {
          const p: any = {
            algoType: 'CONDITIONAL',
            symbol: sym,
            side: closingSide,
            positionSide: targetPosSide,
            type: 'STOP_MARKET',
            triggerPrice: finalSlPrice,
            quantity: closingQty,
            workingType: 'MARK_PRICE'
          };
          if (withReduceOnly && targetPosSide === 'BOTH') {
            p.reduceOnly = 'true';
          }
          return p;
        };

        let currentPosSide = posSide || 'BOTH';
        let slParams = buildAlgoSlParams(currentPosSide, currentPosSide === 'BOTH');

        let algoRes = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'POST',
            endpoint: '/fapi/v1/algoOrder',
            params: slParams,
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });
        let algoData = await algoRes.json();

        // 自愈重试 1: 若 position side 报错，自愈为另一侧重新在 algoOrder 提交
        if (!algoRes.ok && String(algoData?.msg || '').includes('position side')) {
          currentPosSide = currentPosSide === 'BOTH' ? 'LONG' : 'BOTH';
          slParams = buildAlgoSlParams(currentPosSide, currentPosSide === 'BOTH');
          algoRes = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: 'POST',
              endpoint: '/fapi/v1/algoOrder',
              params: slParams,
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });
          algoData = await algoRes.json();
        }

        // 自愈重试 2: 若 reduceOnly 报错，去除 reduceOnly 重新在 algoOrder 提交
        if (!algoRes.ok && String(algoData?.msg || '').includes('reduceOnly')) {
          slParams = buildAlgoSlParams(currentPosSide, false);
          algoRes = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: 'POST',
              endpoint: '/fapi/v1/algoOrder',
              params: slParams,
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });
          algoData = await algoRes.json();
        }

        if (algoRes.ok && (algoData.algoId || algoData.orderId || algoData.clientAlgoId)) {
          slSuccess = true;
          const algoId = String(algoData.algoId || algoData.orderId || algoData.clientAlgoId);
          addLog?.(`[4H自动策略] ✅ ${sym} 算法止损委托 (AlgoOrder) 挂单成功！AlgoID: ${algoId} (触发价: ${finalSlPrice}, 数量: ${closingQty})`, 'SUCCESS');
        } else {
          addLog?.(`[4H自动策略] ❌ ${sym} 算法止损挂单反馈: ${algoData?.msg || '未知异常'}`, 'ERROR');
        }
      } catch (slErr: any) {
        addLog?.(`[4H自动策略] ❌ ${sym} 算法止损网络异常: ${slErr?.message || slErr}`, 'ERROR');
      }
    }

    onRefreshOrders?.();
    return { tpSuccess, slSuccess };
  }, [isConnected, apiConfig, formatQtyForSymbol, formatPriceForSymbol, addLog, onRefreshOrders]);

  const [isApplyingTpSlAll, setIsApplyingTpSlAll] = useState(false);
  const handleApplyTpSlToAllPositions = useCallback(async () => {
    if (!isConnected || !apiConfig.apiKey || !apiConfig.apiSecret) {
      addLog?.('[一键补挂止盈止损] ⚠️ 未连接 API 凭据，无法执行', 'WARN');
      return;
    }
    const activePositions = (positions || []).filter(p => p.amount > 0);
    if (activePositions.length === 0) {
      addLog?.('[一键补挂止盈止损] 当前无活跃合约持仓', 'INFO');
      return;
    }
    setIsApplyingTpSlAll(true);
    addLog?.(`[一键补挂止盈止损] 正在为当前 ${activePositions.length} 个活跃持仓按图三标准挂止盈单与止损单...`, 'INFO');
    try {
      for (const pos of activePositions) {
        const cand = (fourHourBoards.allPassedSymbols || []).find(c => c.symbol === pos.symbol);
        const base4hOpen = cand && cand.openPrice > 0 ? cand.openPrice : (pos.entryPrice || pos.markPrice);
        await placePositionTpSl(
          pos.symbol,
          pos.amount,
          base4hOpen,
          pos.markPrice || pos.entryPrice,
          pos.positionSide || 'BOTH',
          orderSettingsRef.current
        );
      }
      onRefreshOrders?.();
      addLog?.(`[一键补挂止盈止损] ✅ 已完成全部持仓的风控挂单检查与提交！`, 'SUCCESS');
    } finally {
      setIsApplyingTpSlAll(false);
    }
  }, [isConnected, apiConfig, positions, fourHourBoards.allPassedSymbols, placePositionTpSl, addLog, onRefreshOrders]);

  const positionsRef = useRef<Position[]>(positions || []);
  useEffect(() => {
    positionsRef.current = positions || [];
  }, [positions]);

  const orderSettingsRef = useRef<OrderSettings4h>(orderSettings);
  useEffect(() => {
    orderSettingsRef.current = orderSettings;
  }, [orderSettings]);

  const filterSettingsRef = useRef<FilterSettings4h>(filterSettings);
  useEffect(() => {
    filterSettingsRef.current = filterSettings;
  }, [filterSettings]);

  const allCandidateSymbols4hRef = useRef<SymbolData[]>(allCandidateSymbols4h);
  useEffect(() => {
    allCandidateSymbols4hRef.current = allCandidateSymbols4h;
  }, [allCandidateSymbols4h]);

  const checkItemMatchesFiltersRef = useRef(checkItemMatchesFilters);
  useEffect(() => {
    checkItemMatchesFiltersRef.current = checkItemMatchesFilters;
  }, [checkItemMatchesFilters]);

  const getSymbolDisplayDataRef = useRef(getSymbolDisplayData);
  useEffect(() => {
    getSymbolDisplayDataRef.current = getSymbolDisplayData;
  }, [getSymbolDisplayData]);

  const lastAutoExecutedCycleRef = useRef<number>(-1);
  const isExecutingAutoTradingRef = useRef<boolean>(false);
  const isAutoTradingActiveRef = useRef<boolean>(isAutoTradingActive);
  useEffect(() => {
    isAutoTradingActiveRef.current = isAutoTradingActive;
  }, [isAutoTradingActive]);

  const executeCycleScreeningAndAutoTrading = useCallback(async (cycleId?: number, isManual: boolean = false) => {
    if (isExecutingAutoTradingRef.current) return;
    isExecutingAutoTradingRef.current = true;

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const scanTimeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    
    // 4H 周期字符串 (如 "04:00~08:00 (4H)")
    const localH = now.getHours();
    const cycleStart = Math.floor(localH / 4) * 4;
    const cycleEnd = (cycleStart + 4) % 24;
    const cycleStr = `${pad(cycleStart)}:00~${pad(cycleEnd)}:00 (4H)`;

    const currentOrderSettings = orderSettingsRef.current;
    const currentFilterSettings = filterSettingsRef.current;
    const currentPositions = positionsRef.current || [];
    const isAutoActive = isAutoTradingActiveRef.current;

    // 筛选门槛摘要文本快照
    const fsSummaryParts: string[] = [];
    if (currentFilterSettings.gainRange?.enabled) fsSummaryParts.push(`4H涨跌[${currentFilterSettings.gainRange.min ?? '-'}, ${currentFilterSettings.gainRange.max ?? '-'}]%`);
    if (currentFilterSettings.closePosRange?.enabled) fsSummaryParts.push(`收位[${currentFilterSettings.closePosRange.min ?? '-'}, ${currentFilterSettings.closePosRange.max ?? '-'}]%`);
    if (currentFilterSettings.minVolume4h?.enabled) fsSummaryParts.push(`4H额>=${currentFilterSettings.minVolume4h.value ?? '-'}万`);
    if (currentFilterSettings.fundingRateRange?.enabled) fsSummaryParts.push(`费率[${currentFilterSettings.fundingRateRange.min ?? '-'}, ${currentFilterSettings.fundingRateRange.max ?? '-'}]%`);
    if (currentFilterSettings.minVolumeRatio?.enabled) fsSummaryParts.push(`量比>=${currentFilterSettings.minVolumeRatio.value ?? '-'}`);
    if (currentFilterSettings.minMaxGainPastK?.enabled) fsSummaryParts.push(`前K高<=${currentFilterSettings.minMaxGainPastK.value ?? '-'}`);
    const filterSummary = fsSummaryParts.join('; ') || '满足筛选设置';

    // 用户要求：目前只记录满足“筛选设置”的币对信息，其他的币对不记录。
    const hasActiveFiltersLocal = Boolean(
      currentFilterSettings.gainRange?.enabled ||
      currentFilterSettings.closePosRange?.enabled ||
      currentFilterSettings.minVolume4h?.enabled ||
      currentFilterSettings.fundingRateRange?.enabled ||
      currentFilterSettings.minVolumeRatio?.enabled ||
      currentFilterSettings.minMaxGainPastK?.enabled
    );

    if (!hasActiveFiltersLocal) {
      addLog?.(`[4H筛选记录] 提示：当前未开启任何“筛选设置”条件，按规则仅记录满足“筛选设置”的币对，本次不记录`, 'INFO');
      return;
    }

    addLog?.(`[4H筛选${isManual ? '-手动即时' : ''}] ⏱️ 扫描时刻触发，正在全量扫描候选池并生成筛选记录...`, 'INFO');

    try {
      // 第一步：按照筛选设置中 4 小时周期扫描出满足条件的币对
      const candidatesPool = allCandidateSymbols4hRef.current || [];
      const matchedCandidates = candidatesPool
        .filter(item => checkItemMatchesFiltersRef.current(item))
        .sort((a, b) => {
          const changeA = getSymbolDisplayDataRef.current(a).effectiveChange;
          const changeB = getSymbolDisplayDataRef.current(b).effectiveChange;
          return changeB - changeA;
        });

      // 用户要求：目前只记录满足“筛选设置”的币对信息，其他的币对不记录。
      if (matchedCandidates.length === 0) {
        addLog?.('[4H筛选] 本周期无满足“筛选设置”的达标币对，按规则不记录未达标币对', 'INFO');
        return;
      }

      addLog?.(
        `[4H筛选] 第一步：共筛选出 ${matchedCandidates.length} 个达标币对: ${matchedCandidates.map(c => c.symbol).join(', ')}`,
        'SUCCESS'
      );

      // 详细记录每个所筛选达标币对的核心指标至运行日志（严格满足用户要求：日志记录所筛选币对的信息）
      for (const item of matchedCandidates) {
        const displayData = getSymbolDisplayDataRef.current(item);
        addLog?.(
          `[4H达标币对详情] 🎯 ${item.symbol}: 4H涨跌 ${displayData.effectiveChange >= 0 ? '+' : ''}${displayData.effectiveChange.toFixed(2)}% | 收位 ${displayData.closePos?.toFixed(1) ?? '--'}% | 4H额 ${(displayData.currentVolume || 0).toFixed(0)}万 | 量比 ${(displayData.volumeRatioPastK || 0).toFixed(2)} | 前K高 ${(displayData.maxGainPastK || 0).toFixed(2)}%`,
          'INFO'
        );
      }

      // 情况 A: 未开启“自动”交易时（用户要求：在不开启“自动”时也必须完整留存筛选记录及各类参数）
      if (!isAutoActive) {
        const recordsToSave: ScreeningRecord[] = matchedCandidates.map(item => {
          const displayData = getSymbolDisplayDataRef.current(item);
          const currentPrice = displayData.currentPrice || item.lastPrice || 0;
          return {
            id: `${Date.now()}_${item.symbol}_${Math.random().toString(36).substring(2, 7)}`,
            scanTime: Date.now(),
            scanTimeStr,
            cycleStr,
            symbol: item.symbol,
            currentPrice,
            open4h: item.openPrice > 0 ? item.openPrice : currentPrice,
            changePercent: displayData.effectiveChange,
            closePos: displayData.closePos,
            volume4h: displayData.currentVolume,
            volume24h: item.volume24h || 0,
            volumeRatio: displayData.volumeRatioPastK,
            maxGainPastK: displayData.maxGainPastK,
            fundingRate: displayData.fundingRate,
            settlementCycle: displayData.settlementCycle,
            filterSummary,
            isOrdered: false,
            orderStatus: 'NOT_ORDERED',
            orderReason: isManual ? '手动即时扫描（未开启“自动”交易）' : '扫描时刻达标入库（未开启“自动”交易）'
          };
        });

        saveScreeningRecords(recordsToSave);
        addLog?.(`[4H筛选记录] 💾 已将 ${recordsToSave.length} 条达标币对参数记录保存至历史数据库`, 'SUCCESS');
        return;
      }

      // 情况 B: 已开启“自动”交易，但未配置或未连接币安 API
      if (!isConnected || !apiConfig?.apiKey || !apiConfig?.apiSecret) {
        addLog?.('[4H自动策略] ⚠️ 触发自动交易，但当前未连接币安 API，已跳过下单并留存记录', 'WARN');
        const recordsToSave: ScreeningRecord[] = matchedCandidates.map(item => {
          const displayData = getSymbolDisplayDataRef.current(item);
          const currentPrice = displayData.currentPrice || item.lastPrice || 0;
          return {
            id: `${Date.now()}_${item.symbol}_${Math.random().toString(36).substring(2, 7)}`,
            scanTime: Date.now(),
            scanTimeStr,
            cycleStr,
            symbol: item.symbol,
            currentPrice,
            open4h: item.openPrice > 0 ? item.openPrice : currentPrice,
            changePercent: displayData.effectiveChange,
            closePos: displayData.closePos,
            volume4h: displayData.currentVolume,
            volume24h: item.volume24h || 0,
            volumeRatio: displayData.volumeRatioPastK,
            maxGainPastK: displayData.maxGainPastK,
            fundingRate: displayData.fundingRate,
            settlementCycle: displayData.settlementCycle,
            filterSummary,
            isOrdered: false,
            orderStatus: 'FAILED',
            orderReason: '已开启自动交易但未连接币安 API'
          };
        });
        saveScreeningRecords(recordsToSave);
        return;
      }

      // 第二步：判断仓单是否达到下单设置中的最大持仓单数量？如果达到，则不开单。如果未达到则判断最多可以开几个。
      const maxPositionsLimit = currentOrderSettings.maxPositionCount?.enabled !== false
        ? (parseInt(currentOrderSettings.maxPositionCount?.value || '10', 10) || 10)
        : 10;
      
      const currentActiveCount = currentPositions.filter(p => p.amount > 0).length;

      if (currentActiveCount >= maxPositionsLimit) {
        addLog?.(
          `[4H自动策略] 第二步：当前持仓单数 (${currentActiveCount}) 已达到下单设置中最大持仓单数量上限 (${maxPositionsLimit})，本次不开单`,
          'WARN'
        );
        const recordsToSave: ScreeningRecord[] = matchedCandidates.map(item => {
          const displayData = getSymbolDisplayDataRef.current(item);
          const currentPrice = displayData.currentPrice || item.lastPrice || 0;
          return {
            id: `${Date.now()}_${item.symbol}_${Math.random().toString(36).substring(2, 7)}`,
            scanTime: Date.now(),
            scanTimeStr,
            cycleStr,
            symbol: item.symbol,
            currentPrice,
            open4h: item.openPrice > 0 ? item.openPrice : currentPrice,
            changePercent: displayData.effectiveChange,
            closePos: displayData.closePos,
            volume4h: displayData.currentVolume,
            volume24h: item.volume24h || 0,
            volumeRatio: displayData.volumeRatioPastK,
            maxGainPastK: displayData.maxGainPastK,
            fundingRate: displayData.fundingRate,
            settlementCycle: displayData.settlementCycle,
            filterSummary,
            isOrdered: false,
            orderStatus: 'SKIPPED',
            orderReason: `持仓单数 (${currentActiveCount}) 已达到上限 (${maxPositionsLimit})`
          };
        });
        saveScreeningRecords(recordsToSave);
        return;
      }

      const availableSlots = maxPositionsLimit - currentActiveCount;
      addLog?.(
        `[4H自动策略] 第二步：当前持仓 ${currentActiveCount}/${maxPositionsLimit}，本次最多可开 ${availableSlots} 个新仓位`,
        'INFO'
      );

      // 第三步：逐一对于满足筛选条件的币对还要判断是否已经有持仓单，如果有则不开单
      let openedCount = 0;
      const recordsToSave: ScreeningRecord[] = [];

      for (const item of matchedCandidates) {
        const sym = item.symbol;
        const displayData = getSymbolDisplayDataRef.current(item);
        const currentPrice = displayData.currentPrice || item.lastPrice || 0;
        const base4hOpenPrice = item.openPrice > 0 ? item.openPrice : currentPrice;

        const baseRecord: Omit<ScreeningRecord, 'isOrdered' | 'orderStatus' | 'orderReason' | 'orderId'> = {
          id: `${Date.now()}_${sym}_${Math.random().toString(36).substring(2, 7)}`,
          scanTime: Date.now(),
          scanTimeStr,
          cycleStr,
          symbol: sym,
          currentPrice,
          open4h: base4hOpenPrice,
          changePercent: displayData.effectiveChange,
          closePos: displayData.closePos,
          volume4h: displayData.currentVolume,
          volume24h: item.volume24h || 0,
          volumeRatio: displayData.volumeRatioPastK,
          maxGainPastK: displayData.maxGainPastK,
          fundingRate: displayData.fundingRate,
          settlementCycle: displayData.settlementCycle,
          filterSummary
        };

        if (openedCount >= availableSlots) {
          addLog?.(`[4H自动策略] 本次新开仓配额 (${availableSlots}) 已用完，跳过 ${sym}`, 'INFO');
          recordsToSave.push({
            ...baseRecord,
            isOrdered: false,
            orderStatus: 'SKIPPED',
            orderReason: `本次新开仓配额 (${availableSlots}) 已用完`
          });
          continue;
        }

        const alreadyHolding = currentPositions.some(p => p.symbol === sym && p.amount > 0);
        if (alreadyHolding) {
          addLog?.(`[4H自动策略] 币对 ${sym} 已经在持仓单中，跳过不开单`, 'INFO');
          recordsToSave.push({
            ...baseRecord,
            isOrdered: false,
            orderStatus: 'SKIPPED',
            orderReason: '已有该币对有效持仓单'
          });
          continue;
        }

        if (!currentPrice || currentPrice <= 0) {
          addLog?.(`[4H自动策略] ${sym} 未获取到有效当前价格，跳过`, 'WARN');
          recordsToSave.push({
            ...baseRecord,
            isOrdered: false,
            orderStatus: 'FAILED',
            orderReason: '未获取到有效当前价格'
          });
          continue;
        }

        // 1. 设置杠杆
        const leverage = currentOrderSettings.leverage.enabled 
          ? (parseInt(currentOrderSettings.leverage.value, 10) || 10)
          : 10;

        if (currentOrderSettings.leverage.enabled) {
          try {
            await fetch('/api/binance-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                method: 'POST',
                endpoint: '/fapi/v1/leverage',
                params: { symbol: sym, leverage },
                apiKey: apiConfig.apiKey,
                apiSecret: apiConfig.apiSecret
              })
            });
          } catch (e) {}
        }

        // 2. 计算下单金额 (总合约额 / Notional Value in USDT)
        let targetUsdt = 30;

        if (currentOrderSettings.fixedOrderAmount.enabled) {
          // 固定下单金额 (独立模式)
          targetUsdt = parseFloat(currentOrderSettings.fixedOrderAmount.value) || 30;
        } else if (currentOrderSettings.calcQtyPercent.enabled) {
          // 合约计算量百分比 (%)
          let futuresBal = balance?.futuresBalance || 0;
          if (futuresBal <= 0) {
            try {
              const balRes = await fetch('/api/binance-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  endpoint: '/fapi/v2/balance',
                  apiKey: apiConfig.apiKey,
                  apiSecret: apiConfig.apiSecret
                })
              });
              if (balRes.ok) {
                const balData = await balRes.json();
                if (Array.isArray(balData)) {
                  const usdt = balData.find((b: any) => b.asset === 'USDT');
                  if (usdt) {
                    futuresBal = parseFloat(usdt.availableBalance || usdt.balance || '0');
                  }
                }
              }
            } catch (e) {}
          }

          const percentVal = parseFloat(currentOrderSettings.calcQtyPercent.value) || 20;
          const turnoverCoef = parseFloat(currentOrderSettings.calcQtyPercent.turnoverCoef) || 1000;
          const baseQty1 = futuresBal * (percentVal / 100);

          let quoteVol = item.volume15m || 0;
          if (quoteVol <= 0) {
            try {
              const klineRes = await fetch('/api/binance-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  method: 'GET',
                  endpoint: '/fapi/v1/klines',
                  params: { symbol: sym, interval: '15m', limit: '1' },
                  apiKey: apiConfig.apiKey,
                  apiSecret: apiConfig.apiSecret
                })
              });
              if (klineRes.ok) {
                const klines = await klineRes.json();
                if (Array.isArray(klines) && klines.length > 0) {
                  quoteVol = parseFloat(klines[klines.length - 1][7]) || 0;
                }
              }
            } catch (e) {}
          }

          const baseQty2 = turnoverCoef > 0 ? (quoteVol / turnoverCoef) : 0;
          const finalCalcAmount = Math.min(
            baseQty1 > 0 ? baseQty1 : (baseQty2 > 0 ? baseQty2 : 30),
            baseQty2 > 0 ? baseQty2 : (baseQty1 > 0 ? baseQty1 : 30)
          );
          const floorAmount = Math.floor(finalCalcAmount > 0 ? finalCalcAmount : 30);
          targetUsdt = floorAmount;
          addLog?.(`[4H自动策略] ${sym} 合约量计算: 基础量1 (合约余额 ${futuresBal.toFixed(2)} × ${percentVal}%) = ${baseQty1.toFixed(2)} USDT, 基础量2 (15m成交额 ${(quoteVol/10000).toFixed(2)}万 ÷ ${turnoverCoef}) = ${baseQty2.toFixed(2)} USDT, 取小并向下取整 = ${floorAmount} USDT (总合约额)`, 'INFO');
        } else if (currentOrderSettings.minOrderAmount.enabled) {
          targetUsdt = parseFloat(currentOrderSettings.minOrderAmount.value) || 20;
        }

        // 最小下单金额保底检查
        if (currentOrderSettings.minOrderAmount.enabled) {
          const minVal = parseFloat(currentOrderSettings.minOrderAmount.value) || 0;
          if (targetUsdt < minVal) {
            addLog?.(`[4H自动策略] ${sym} 计算总合约额 (${targetUsdt} USDT) 低于最小下单保底 (${minVal} USDT)，自动保底提升至 ${minVal} USDT`, 'INFO');
            targetUsdt = minVal;
          }
        }

        // 3. 计算下单合约数量并规整 stepSize 精度
        // 核心修正：targetUsdt 即为总合约额（名义价值），严禁再乘以杠杆倍数！
        // 杠杆倍数仅是在下单前告知币安该单的杠杆（用于确定保证金占用），不能放大下单数量！
        const rawQty = targetUsdt / currentPrice;
        const formattedQty = formatQtyForSymbol(sym, rawQty);
        if (parseFloat(formattedQty) <= 0) {
          addLog?.(`[4H自动策略] ${sym} 计算下单数量为 0，跳过`, 'WARN');
          recordsToSave.push({
            ...baseRecord,
            isOrdered: false,
            orderStatus: 'FAILED',
            orderReason: '计算下单数量小于币安最小步长精度'
          });
          continue;
        }

        addLog?.(
          `[4H自动策略] 正在向币安发送市价开仓单: ${sym} 数量: ${formattedQty} (总合约额: ${targetUsdt} USDT, 杠杆: ${leverage}x)...`,
          'TRADE'
        );

        let orderData: any = null;
        let successfulPositionSide = 'BOTH';

        try {
          const orderRes = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: 'POST',
              endpoint: '/fapi/v1/order',
              params: {
                symbol: sym,
                side: 'BUY',
                type: 'MARKET',
                quantity: formattedQty,
                positionSide: 'BOTH'
              },
              apiKey: apiConfig.apiKey,
              apiSecret: apiConfig.apiSecret
            })
          });
          orderData = await orderRes.json();
          if (!orderRes.ok) {
            // 如果 BOTH 报 position side 不匹配，切换为 LONG
            if (String(orderData?.msg || '').includes('position side')) {
              const retryRes = await fetch('/api/binance-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  method: 'POST',
                  endpoint: '/fapi/v1/order',
                  params: {
                    symbol: sym,
                    side: 'BUY',
                    type: 'MARKET',
                    quantity: formattedQty,
                    positionSide: 'LONG'
                  },
                  apiKey: apiConfig.apiKey,
                  apiSecret: apiConfig.apiSecret
                })
              });
              orderData = await retryRes.json();
              if (retryRes.ok) {
                successfulPositionSide = 'LONG';
              }
            }
          }
        } catch (err: any) {
          addLog?.(`[4H自动策略] ${sym} 开仓网络异常: ${err?.message || err}`, 'ERROR');
          recordsToSave.push({
            ...baseRecord,
            isOrdered: false,
            orderStatus: 'FAILED',
            orderReason: `开仓网络异常: ${err?.message || err}`
          });
          continue;
        }

        if (!orderData || (!orderData.orderId && !orderData.clientOrderId)) {
          addLog?.(`[4H自动策略] ${sym} 开仓失败: ${orderData?.msg || '未知错误'}`, 'ERROR');
          recordsToSave.push({
            ...baseRecord,
            isOrdered: false,
            orderStatus: 'FAILED',
            orderReason: `下单失败: ${orderData?.msg || '未知错误'}`
          });
          continue;
        }

        // 开仓单完全成交后的合约数量
        const executedQty = parseFloat(orderData.executedQty || formattedQty);
        const finalQtyStr = formatQtyForSymbol(sym, executedQty);
        const avgPrice = parseFloat(orderData.avgPrice || currentPrice);
        addLog?.(
          `[4H自动策略] ✅ ${sym} 开仓单完全成交成功！数量: ${finalQtyStr} @ ${avgPrice || '市价'}，3秒后自动挂止损与止盈单...`,
          'SUCCESS'
        );

        recordsToSave.push({
          ...baseRecord,
          isOrdered: true,
          orderStatus: 'ORDERED',
          orderReason: `已下单成功 (市价买入数量: ${finalQtyStr}, 均价: ${avgPrice || currentPrice})`,
          orderId: String(orderData.orderId || orderData.clientOrderId || '')
        });
        openedCount++;

        // 开仓单完全成交后 2.5 秒读取最新持仓并按照图三标准提交 1 张止盈限价单与 1 张止损算法单
        addLog?.(
          `[4H自动策略] ⏳ ${sym} 开仓单已成交！将在 2.5 秒后读取币安最新持仓，并按照图三风控标准挂出 1 张止盈单与 1 张止损单...`,
          'INFO'
        );

        setTimeout(async () => {
          try {
            let posAmount = parseFloat(orderData.executedQty || '0') > 0 ? parseFloat(orderData.executedQty) : parseFloat(formattedQty);
            let posEntryPrice = parseFloat(orderData.avgPrice || '0') > 0 ? parseFloat(orderData.avgPrice) : (base4hOpenPrice > 0 ? base4hOpenPrice : currentPrice);
            let posSide = successfulPositionSide || 'BOTH';

            try {
              const posRes = await fetch('/api/binance-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  endpoint: '/fapi/v1/positionRisk',
                  params: { symbol: sym },
                  apiKey: apiConfig.apiKey,
                  apiSecret: apiConfig.apiSecret
                })
              });
              if (posRes.ok) {
                const posData = await posRes.json();
                if (Array.isArray(posData)) {
                  const matchedPos = posData.find((p: any) => p.symbol === sym && Math.abs(parseFloat(p.positionAmt || '0')) > 0);
                  if (matchedPos) {
                    posAmount = Math.abs(parseFloat(matchedPos.positionAmt));
                    posEntryPrice = parseFloat(matchedPos.entryPrice) || posEntryPrice;
                    posSide = matchedPos.positionSide || posSide;
                  }
                }
              }
            } catch (e) {}

            await placePositionTpSl(
              sym,
              posAmount,
              base4hOpenPrice > 0 ? base4hOpenPrice : posEntryPrice,
              currentPrice,
              posSide,
              currentOrderSettings
            );
          } catch (delayErr: any) {
            addLog?.(`[4H自动策略] 挂止盈止损异常: ${delayErr?.message || delayErr}`, 'ERROR');
          }
        }, 2500);
      }

      // 保存完整的筛选记录（无论下单成功与否）
      if (recordsToSave.length > 0) {
        saveScreeningRecords(recordsToSave);
        addLog?.(`[4H筛选记录] 💾 已将本次 ${recordsToSave.length} 条达标币对与下单详情存入筛选历史`, 'SUCCESS');
      }
    } finally {
      isExecutingAutoTradingRef.current = false;
    }
  }, [
    isConnected,
    apiConfig,
    formatPriceForSymbol,
    formatQtyForSymbol,
    saveScreeningRecords,
    addLog,
    balance
  ]);

  const executeCycleScreeningAndAutoTradingRef = useRef(executeCycleScreeningAndAutoTrading);
  useEffect(() => {
    executeCycleScreeningAndAutoTradingRef.current = executeCycleScreeningAndAutoTrading;
  }, [executeCycleScreeningAndAutoTrading]);

  const executeAutoTradingBatch = useCallback(async () => {
    await executeCycleScreeningAndAutoTrading(undefined, false);
  }, [executeCycleScreeningAndAutoTrading]);

  const executeAutoTradingBatchRef = useRef(executeAutoTradingBatch);
  useEffect(() => {
    executeAutoTradingBatchRef.current = executeAutoTradingBatch;
    (window as any).runAutoTrading4h = executeAutoTradingBatch;
  }, [executeAutoTradingBatch]);

  const handleManualTriggerScan = useCallback(async () => {
    addLog?.('[4H筛选] 🔍 正在执行手动即时筛选扫描...', 'INFO');
    await executeCycleScreeningAndAutoTrading(undefined, true);
  }, [executeCycleScreeningAndAutoTrading, addLog]);

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
      if (sse4h.config) {
        setConfig(sse4h.config);
        if (sse4h.config.volumeKCount && !localStorage.getItem('monitor_4h_volume_k_count')) {
          setVolumeKCount(sse4h.config.volumeKCount);
        }
        if (sse4h.config.gainKCount && !localStorage.getItem('monitor_4h_gain_k_count')) {
          setGainKCount(sse4h.config.gainKCount);
        }
      }
      if (sse4h.scanStats) setScanStats(sse4h.scanStats);

      // Support sse4h.results (from server getFullResults4h()) or direct fourHourBoards/spikeAnd24hBoards
      if (sse4h.results) {
        setFourHourBoards({
          gainers: sse4h.results.gainers || [],
          losers: sse4h.results.losers || [],
          amplitude15m: sse4h.results.amplitude15m || [],
          allPassedSymbols: sse4h.results.allPassedSymbols || sse4h.fourHourBoards?.allPassedSymbols || [],
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
              allPassedSymbols: data.results.allPassedSymbols || data.fourHourBoards?.allPassedSymbols || [],
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

      // 4H 周期筛选扫描时刻定时触发检测（关键规约：无论是否开启自动交易，均在该时刻执行筛选并留存“筛选记录”）
      const sm = filterSettings.scanMoment || { hour: 3, minute: 58, second: 30 };
      const scanTargetSec = (sm.hour * 3600) + (sm.minute * 60) + sm.second;
      const cycleId = Math.floor(now.getTime() / (4 * 3600 * 1000));

      if (Math.abs(totalSecondsInCycle - scanTargetSec) <= 1 && lastAutoExecutedCycleRef.current !== cycleId) {
        lastAutoExecutedCycleRef.current = cycleId;
        executeCycleScreeningAndAutoTradingRef.current?.(cycleId, false);
      }
    };

    updateTick();
    const clockInterval = setInterval(updateTick, 1000);
    return () => clearInterval(clockInterval);
  }, [config.yMin, config.ySec, config.settleMin, config.settleSec, isAutoTradingActive, filterSettings.scanMoment]);

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
            allPassedSymbols: resObj.allPassedSymbols || data.fourHourBoards?.allPassedSymbols || [],
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
          allPassedSymbols: results.allPassedSymbols || data.fourHourBoards?.allPassedSymbols || [],
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

              {/* 量k 自定义根数控制 */}
              <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner">
                <span className="text-zinc-400 text-xs px-2 font-medium flex items-center gap-1" title="自定义量k数量：取当前未完结4H K线前的N根完整K线最低交易额(USDT)计算成交额比值">
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
                      量k 说明 (默认12条完整4H K线)
                    </p>
                    <p className="mb-1 text-zinc-300">完全基于本地已订阅 15m 真实 K 线聚合计算，严禁订阅 4H K 线流。</p>
                    <p className="mb-1 text-zinc-300">• 取当前未完结 4H K 线之前的 <strong className="text-cyan-300">{volumeKCount} 根</strong>完整 4H K 线的最低交易额 (USDT计价)。</p>
                    <p className="text-zinc-300">• 在 4H 成交额单元格实时展示：<span className="text-cyan-300 font-mono font-bold">当前未完结成交额 ÷ 前{volumeKCount}根最低成交额</span> 的比值。</p>
                  </div>
                </div>
              </div>

              {/* 涨跌k 自定义根数控制 */}
              <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner">
                <span className="text-zinc-400 text-xs px-2 font-medium flex items-center gap-1" title="自定义涨跌k数量：取当前未完结4H K线前的N根完结K线按当前模式计算的最大涨幅">
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
                      涨跌k 说明 (默认6条完结4H K线)
                    </p>
                    <p className="mb-1 text-zinc-300">完全基于本地已订阅 15m 真实 K 线聚合计算，严禁订阅 4H K 线流。</p>
                    <p className="mb-1 text-zinc-300">• 取当前未完结 4H K 线之前的 <strong className="text-emerald-300">{gainKCount} 根</strong>完结 4H K 线的最大涨幅。</p>
                    <p className="text-zinc-300">• 计算参照当前选取的模式（<strong className="text-emerald-300">常规模式</strong>或<strong className="text-cyan-300">高涨幅模式</strong>）实时计算并在涨跌幅处展示。</p>
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

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"></span>
                            4. 量k 与 涨跌k 聚合计算规则
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-cyan-300 font-medium">严禁订阅 4H 流：</span>所有数据均由本地 15m 真实 K 线聚合计算。</p>
                            <p>• <span className="text-zinc-200 font-medium">量k (默认12根)：</span>取当前未完结4H K线前 {volumeKCount} 根完整K线的最低成交额(USDT)，在4H成交额处实时展示「当前未完结成交额 ÷ 前{volumeKCount}根K线最低成交额」的比值。</p>
                            <p>• <span className="text-zinc-200 font-medium">涨跌k (默认6根)：</span>取当前未完结4H K线前 {gainKCount} 根完结K线在当前模式下的最大涨幅并展示。</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                  {/* 筛选记录 按钮 (在未开启“自动”时亦完整记录每个扫描时刻满足条件的币对，支持导出下载) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsScreeningRecordsModalOpen(true);
                    }}
                    className="px-2.5 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/60 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-95 shadow-sm shadow-amber-500/10"
                    title="点击打开筛选记录：记录每个筛选扫描时刻满足条件的币对详情、参数快照及下单状态，支持导出下载"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                    <span>筛选记录</span>
                    {screeningRecords.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-amber-500/30 text-amber-200 text-[10px] font-mono font-bold">
                        {screeningRecords.length}
                      </span>
                    )}
                  </button>

                  {/* 筛选设置 按钮 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsFilterModalOpen(true);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-95 ${
                      hasActiveFilters
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25 shadow-[0_0_10px_rgba(245,158,11,0.25)]'
                        : 'bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:bg-white/10'
                    }`}
                    title="点击打开筛选设置弹窗，自定义涨幅、收位、成交额、费率、量比等筛选规则"
                  >
                    <Filter className="w-3.5 h-3.5 text-amber-400" />
                    <span>筛选设置</span>
                    {activeFilterCount > 0 && (
                      <span className="w-4 h-4 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>

                  {/* 下单设置 按钮 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOrderSettingsModalOpen(true);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-95 ${
                      hasActiveOrderSettings
                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 shadow-[0_0_10px_rgba(6,182,212,0.25)]'
                        : 'bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:bg-white/10'
                    }`}
                    title="点击打开下单设置弹窗，自定义杠杆、合约计算量、最小下单、止损止盈倍数"
                  >
                    <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>下单设置</span>
                    {activeOrderSettingsCount > 0 && (
                      <span className="w-4 h-4 rounded-full bg-cyan-500 text-black text-[10px] font-bold flex items-center justify-center">
                        {activeOrderSettingsCount}
                      </span>
                    )}
                  </button>

                  {/* 一键为持仓补齐图三止盈止损单 快捷按钮 */}
                  {(positions || []).some(p => p.amount > 0) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApplyTpSlToAllPositions();
                      }}
                      disabled={isApplyingTpSlAll}
                      className="px-2.5 py-1.5 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 to-orange-500/15 text-amber-300 hover:text-amber-100 hover:bg-amber-500/25 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-95 disabled:opacity-50 shadow-xs"
                      title="按照图三下单设置，为当前持有的所有仓单在币安补挂 1 张止盈单 + 1 张止损单"
                    >
                      <span className={isApplyingTpSlAll ? "animate-spin" : ""}>⚡</span>
                      <span>{isApplyingTpSlAll ? '补挂中...' : '补齐止盈止损'}</span>
                    </button>
                  )}

                  {/* 自动 交易开关按钮 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleAutoTrading();
                    }}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-95 ${
                      isAutoTradingActive
                        ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.35)] hover:bg-emerald-500/30'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
                    }`}
                    title={isAutoTradingActive 
                      ? `4H自动建仓策略运行中 (周期扫描时刻: ${filterSettings.scanMoment?.hour ?? 3}h ${filterSettings.scanMoment?.minute ?? 58}m ${filterSettings.scanMoment?.second ?? 30}s, 最大持仓上限: ${orderSettings.maxPositionCount?.value || '10'})，点击停止` 
                      : "点击启动4H自动交易策略（在周期扫描时刻自动筛选、建仓并挂止盈止损）"}
                  >
                    <span className={`w-2 h-2 rounded-full ${isAutoTradingActive ? 'bg-emerald-400 animate-ping' : 'bg-zinc-600'}`} />
                    <span>{isAutoTradingActive ? '自动: 运行中' : '自动'}</span>
                  </button>

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
                <div>
                  {/* 🌟 4H 筛选榜单 (置于实时榜单上方) */}
                  <div className="border-b border-white/10 bg-amber-500/[0.02]">
                    <div className="px-4 py-2.5 bg-gradient-to-r from-amber-500/10 via-amber-500/[0.03] to-transparent border-b border-amber-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                        <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center border border-amber-500/40 shrink-0 shadow-sm">
                          <Filter className="w-3.5 h-3.5 text-amber-400" />
                        </div>
                        <span className="font-bold text-[15px] sm:text-base text-amber-300 tracking-wide flex items-center gap-1.5">
                          <span>4小时筛选榜单</span>
                        </span>
                        {hasActiveFilters ? (
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                            {filteredBoardSymbols.length > 0 ? `命中 ${filteredBoardSymbols.length} 个币对` : '0 个符合'}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-400 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 shrink-0">
                            未开启筛选条件
                          </span>
                        )}

                        {hasActiveFilters && (
                          <span className="text-[11px] text-zinc-400 hidden xl:inline truncate max-w-xl">
                            (已生效: {[
                              filterSettings.gainRange.enabled && `涨幅[${filterSettings.gainRange.min}%~${filterSettings.gainRange.max}%]`,
                              filterSettings.closePosRange.enabled && `收位[${filterSettings.closePosRange.min}%~${filterSettings.closePosRange.max}%]`,
                              filterSettings.minVolume4h.enabled && `4H额≥${filterSettings.minVolume4h.value}万`,
                              filterSettings.fundingRateRange.enabled && `费率[${filterSettings.fundingRateRange.min}%~${filterSettings.fundingRateRange.max}%]`,
                              filterSettings.minVolumeRatio.enabled && `量比≥${filterSettings.minVolumeRatio.value}`,
                              filterSettings.minMaxGainPastK.enabled && `前${gainKCount}K高≤${filterSettings.minMaxGainPastK.value}%`
                            ].filter(Boolean).join(' · ')})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setIsFilterModalOpen(true)}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                          title="打开筛选设置弹窗调节参数"
                        >
                          <Filter className="w-3 h-3 text-amber-400" />
                          <span>筛选设置</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleToggleFilteredBoardCollapse}
                          className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                          title={isFilteredBoardCollapsed ? "展开筛选榜单" : "向上折叠筛选榜单"}
                        >
                          {isFilteredBoardCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {!isFilteredBoardCollapsed && (
                      <div className="overflow-x-auto">
                        {!hasActiveFilters ? (
                          <div className="px-4 py-6 text-center bg-white/[0.01]">
                            <p className="text-zinc-400 text-xs sm:text-sm mb-2 font-medium">当前尚未开启任何筛选条件</p>
                            <button
                              type="button"
                              onClick={() => setIsFilterModalOpen(true)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
                            >
                              <Filter className="w-3.5 h-3.5" />
                              <span>前往「筛选设置」勾选涨幅、收位、成交额、量比等参数</span>
                            </button>
                          </div>
                        ) : filteredBoardSymbols.length === 0 ? (
                          <div className="px-4 py-6 text-center text-zinc-500 italic text-xs sm:text-sm bg-white/[0.01]">
                            当前暂无币对满足已勾选的全部筛选条件（已启用 {activeFilterCount} 项条件）
                          </div>
                        ) : (
                          <table className="w-full text-left border-collapse min-w-[880px]">
                            <thead>
                              <tr className="bg-amber-500/[0.08] text-[13px] text-amber-300/80 uppercase font-bold tracking-wider border-b border-amber-500/20">
                                <th className="px-3 py-2.5 text-left w-[10%]">
                                  <div className="flex items-center gap-1">
                                    <span>{t.tableSymbol}</span>
                                    <span className="text-[10px] font-normal px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-sans">
                                      筛选
                                    </span>
                                  </div>
                                </th>
                                <th className="px-2 py-2.5 text-right w-[10%]">{t.tableLivePrice}</th>
                                <th className="px-2 py-2.5 text-right w-[10%]">{t.tableOpenPrice}</th>
                                <th className="px-2 py-2.5 text-right w-[16%]">上线开盘 / 历史高低</th>
                                <th className="px-2 py-2.5 text-center w-[11%]">{t.tableFundingCycle}</th>
                                <th className="px-2 py-2.5 text-right w-[13%]">4H成交额 & 量比</th>
                                <th className="px-2 py-2.5 text-right w-[9%]">收位</th>
                                <th className="px-3 py-2.5 text-right w-[21%]">{gainMode === 'high' ? t.tableHighGain : t.tableGain}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 bg-amber-500/[0.015]">
                              {filteredBoardSymbols.map((item, idx) => {
                                const isHolding = isHoldingPosition(item.symbol);
                                const data = getSymbolDisplayData(item);
                                return (
                                  <tr
                                    key={`filtered-${item.symbol}`}
                                    className="transition-all hover:bg-amber-500/[0.08] cursor-pointer group border-l-4 border-amber-500/40 hover:border-amber-400"
                                    onClick={() => handleRowClick(item.symbol)}
                                    title="点击同步交易辅助与K线"
                                  >
                                    <td className="px-3 py-2.5 text-left">
                                      <div className="flex items-center">
                                        <span className="font-bold text-[17px] sm:text-[19px] text-zinc-100 group-hover:text-amber-300 transition-colors uppercase font-sans">
                                          {item.symbol.replace('USDT', '')}
                                        </span>
                                        <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                          #{idx + 1}
                                        </span>
                                        {isHolding && (
                                          <span className="ml-1 text-[9px] font-bold px-1.5 py-0.2 bg-[#d946ef]/20 text-[#d946ef] border border-[#d946ef]/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                            持仓
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-2 py-2.5 text-right font-mono text-[14px] sm:text-[15px] font-bold text-zinc-100 group-hover:text-white transition-colors">
                                      {formatPriceVal(data.currentPrice)}
                                    </td>
                                    <td className="px-2 py-2.5 text-right font-mono text-[13px] sm:text-[14px] font-medium text-zinc-400">
                                      {formatPriceVal(data.openPrice)}
                                    </td>
                                    <td className="px-2 py-2 text-right">
                                      <div className="flex flex-col items-end gap-0.5 font-mono text-[11px] sm:text-[12px] leading-tight">
                                        <div className="flex items-center gap-1.5 justify-end">
                                          <span className="text-[10px] text-zinc-500 font-sans">上线</span>
                                          <span className="text-zinc-300">{data.listingOpen > 0 ? formatPriceVal(data.listingOpen) : '--'}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 justify-end">
                                          <span className="text-[10px] text-zinc-500 font-sans">高</span>
                                          <span className={data.laterExtreme === 'high' ? 'text-emerald-400 font-bold' : 'text-zinc-300'}>
                                            {data.historicalHigh > 0 ? formatPriceVal(data.historicalHigh) : '--'}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 justify-end">
                                          <span className="text-[10px] text-zinc-500 font-sans">低</span>
                                          <span className={data.laterExtreme === 'low' ? 'text-red-400 font-bold' : 'text-zinc-400'}>
                                            {data.historicalLow > 0 ? formatPriceVal(data.historicalLow) : '--'}
                                          </span>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-2 py-2.5 text-center">
                                      <div className="inline-flex items-center gap-1 font-mono text-[13px]">
                                        <span className={`font-bold ${data.fundingRate > 0 ? 'text-amber-300' : data.fundingRate < 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                          {data.fundingRate > 0 ? '+' : ''}{data.fundingRate.toFixed(4)}%
                                        </span>
                                        <span className="text-zinc-500 text-xs">({data.settlementCycle})</span>
                                      </div>
                                    </td>
                                    <td className="px-2 py-2.5 text-right font-mono text-emerald-400">
                                      <div className="text-[14px] sm:text-[15px] font-bold leading-tight">
                                        {formatVolume(data.currentVolume)}
                                      </div>
                                      <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                                        量比: <span className="font-bold text-amber-300">{data.volumeRatioPastK > 0 ? `${data.volumeRatioPastK.toFixed(2)}x` : '--'}</span>
                                      </div>
                                    </td>
                                    <td className="px-2 py-2.5 text-right font-mono">
                                      <div className="flex flex-col items-end">
                                        <span className={`text-[14px] sm:text-[15px] font-bold ${getClosePosStyle(data.closePos)}`}>
                                          {data.closePos !== undefined ? `${data.closePos.toFixed(1)}%` : '--'}
                                        </span>
                                        <span className="text-[10px] text-zinc-500 font-sans">
                                          {getClosePosTag(data.closePos)}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                      <div className="flex flex-col items-end">
                                        <div className="flex items-center justify-end gap-1 text-emerald-400 font-bold text-[18px] sm:text-[20px] font-mono leading-tight">
                                          {formatChangeText(data.effectiveChange)}
                                          <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-amber-400" />
                                        </div>
                                        <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                                          前{gainKCount}K高: <span className="font-bold text-emerald-300">{formatChangeText(data.maxGainPastK)}</span>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ⚡ 实时高涨幅榜（原红色区域实时榜单） */}
                  <div className="px-4 py-2 bg-white/[0.02] border-b border-white/5 flex items-center justify-between text-xs text-zinc-400 font-medium">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-bold text-emerald-400">实时榜单</span>
                      <span className="text-[11px] text-zinc-500">· 4H 全市场动态排序 (TOP {displayGainers.length})</span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[880px]">
                    <thead>
                      <tr className="bg-white/5 text-[14px] text-gray-400 uppercase font-bold tracking-wider">
                        <th className="px-3 py-3 text-left w-[10%]">{t.tableSymbol}</th>
                        <th className="px-2 py-3 text-right w-[10%]">{t.tableLivePrice}</th>
                        <th className="px-2 py-3 text-right w-[10%]">{t.tableOpenPrice}</th>
                        <th className="px-2 py-3 text-right w-[16%]">
                          <div className="flex items-center justify-end gap-1" title="币对上线以来的开盘价、全历史最高/最低价，并标记后创出的极值方向">
                            <span>上线开盘 / 历史高低</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              全历史
                            </span>
                          </div>
                        </th>
                        <th className="px-2 py-3 text-center w-[11%]">{t.tableFundingCycle}</th>
                        <th className="px-2 py-3 text-right w-[13%]">
                          <div className="flex items-center justify-end gap-1" title={`当前未完结4H成交额 / 前${volumeKCount}根完整K线最低成交额比值`}>
                            <span>{t.table4hVol}</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                              量比(前{volumeKCount}K)
                            </span>
                          </div>
                        </th>
                        <th className="px-2 py-3 text-right w-[9%]">
                          <div className="flex items-center justify-end gap-1 cursor-help" title="收位：当前价在整根当前未完结4H K线高低区间的百分位置&#10;公式：(当前价 - 最低价) ÷ (最高价 - 最低价) × 100%">
                            <span>收位</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
                              K线位
                            </span>
                          </div>
                        </th>
                        <th className="px-3 py-3 text-right w-[21%]">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <span>{gainMode === 'high' ? t.tableHighGain : t.tableGain}</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300" title={`前${gainKCount}根完结K线最大涨幅`}>
                              前{gainKCount}K高
                            </span>
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

                              {/* 3. 4H开盘价 */}
                              <td className="px-2 py-3 text-right font-mono text-[14px] sm:text-[15px] font-medium text-zinc-400">
                                {formatPriceVal(data.openPrice)}
                              </td>

                              {/* 4. 上线开盘 / 历史最高/最低价 与 后出极值标记 */}
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

                              {/* 6. 4H成交额 & 量比 */}
                              <td className={`px-2 py-3 text-right font-mono ${shouldHighlight ? 'text-emerald-300' : 'text-emerald-500'}`}>
                                <div className="text-[14px] sm:text-[16px] font-bold leading-tight">
                                  {formatVolume(data.currentVolume)}
                                </div>
                                <div 
                                  className="flex items-center justify-end gap-1 mt-1 text-[11px] font-mono cursor-help"
                                  title={`当前未完结4H成交额: ${formatVolume(data.currentVolume)} 万 USDT\n前${volumeKCount}根完结4H K线最低成交额: ${formatVolume(data.minVolumePastK)} 万 USDT\n比值 (当前/前${volumeKCount}K最低) = ${data.volumeRatioPastK > 0 ? data.volumeRatioPastK.toFixed(2) : '--'}倍`}
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
                              </td>

                              {/* 7. 收位 (方案 A: 纯数值 + 状态色) */}
                              <td className="px-2 py-3 text-right font-mono">
                                <div 
                                  className="flex flex-col items-end justify-center cursor-help"
                                  title={`当前价在4H K线中的位置 (收位)\n当前价: ${formatPriceVal(data.currentPrice)}\n最高价: ${formatPriceVal(data.high)}\n最低价: ${formatPriceVal(data.low)}\n收位: ${data.closePos.toFixed(2)}% (${data.closePos >= 80 ? '高位极强' : data.closePos >= 60 ? '偏强多头' : data.closePos >= 40 ? '中位均衡' : data.closePos >= 20 ? '偏弱下探' : '低位探底'})\n计算公式: (现价 - 最低) ÷ (最高 - 最低) × 100%`}
                                >
                                  <span className={`text-[15px] sm:text-[16px] leading-tight ${getClosePosStyle(data.closePos)}`}>
                                    {data.closePos.toFixed(1)}%
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-sans leading-none mt-0.5">
                                    {getClosePosTag(data.closePos)}
                                  </span>
                                </div>
                              </td>

                              {/* 8. 涨幅 & 前K最大涨幅 */}
                              <td className="px-3 py-3 text-right">
                                <div className="flex flex-col items-end">
                                  <div className="flex items-center justify-end gap-1 text-emerald-400 font-bold text-[19px] sm:text-[21px] font-mono leading-tight">
                                    {formatChangeText(data.effectiveChange)}
                                    <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-emerald-400" />
                                  </div>
                                  <div 
                                    className="flex items-center justify-end gap-1 mt-1 text-[11px] font-mono text-zinc-400 cursor-help"
                                    title={`当前未完结K线前的${gainKCount}根完结K线最大涨幅 (${gainMode === 'high' ? '高涨幅模式' : '常规模式'})`}
                                  >
                                    <span className="text-zinc-500 text-[10px]">前{gainKCount}K高:</span>
                                    <span className={`font-bold ${data.maxGainPastK > 0 ? 'text-emerald-300' : 'text-zinc-400'}`}>
                                      {formatChangeText(data.maxGainPastK)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!displayGainers || displayGainers.length === 0) && (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
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

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"></span>
                            4. 量k 与 涨跌k 聚合计算规则
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-cyan-300 font-medium">严禁订阅 4H 流：</span>所有数据均由本地 15m 真实 K 线聚合计算。</p>
                            <p>• <span className="text-zinc-200 font-medium">量k (默认12根)：</span>取当前未完结4H K线前 {volumeKCount} 根完整K线的最低成交额(USDT)，在4H成交额处实时展示「当前未完结成交额 ÷ 前{volumeKCount}根K线最低成交额」的比值。</p>
                            <p>• <span className="text-zinc-200 font-medium">涨跌k (默认6根)：</span>取当前未完结4H K线前 {gainKCount} 根完结K线在当前模式下的最大涨幅并展示。</p>
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
                  <table className="w-full text-left border-collapse min-w-[880px]">
                    <thead>
                      <tr className="bg-white/5 text-[14px] text-gray-400 uppercase font-bold tracking-wider">
                        <th className="px-3 py-3 text-left w-[10%]">{t.tableSymbol}</th>
                        <th className="px-2 py-3 text-right w-[10%]">{t.tableLivePrice}</th>
                        <th className="px-2 py-3 text-right w-[10%]">{t.tableOpenPrice}</th>
                        <th className="px-2 py-3 text-right w-[16%]">
                          <div className="flex items-center justify-end gap-1" title="币对上线以来的开盘价、全历史最高/最低价，并标记后创出的极值方向">
                            <span>上线开盘 / 历史高低</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              全历史
                            </span>
                          </div>
                        </th>
                        <th className="px-2 py-3 text-center w-[11%]">{t.tableFundingCycle}</th>
                        <th className="px-2 py-3 text-right w-[13%]">
                          <div className="flex items-center justify-end gap-1" title={`当前未完结4H成交额 / 前${volumeKCount}根完整K线最低成交额比值`}>
                            <span>{t.table4hVol}</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                              量比(前{volumeKCount}K)
                            </span>
                          </div>
                        </th>
                        <th className="px-2 py-3 text-right w-[9%]">
                          <div className="flex items-center justify-end gap-1 cursor-help" title="收位：当前价在整根当前未完结4H K线高低区间的百分位置&#10;公式：(当前价 - 最低价) ÷ (最高价 - 最低价) × 100%">
                            <span>收位</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
                              K线位
                            </span>
                          </div>
                        </th>
                        <th className="px-3 py-3 text-right w-[21%]">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <span>{gainMode === 'high' ? t.tableHighLoss : t.tableLoss}</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300" title={`前${gainKCount}根完结K线最大涨幅`}>
                              前{gainKCount}K高
                            </span>
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
                              <td className="px-3 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[18px] sm:text-[20px] ${
                                    isHolding 
                                      ? 'text-[#d946ef]' 
                                      : (shouldHighlight ? 'text-red-400' : 'text-zinc-200 group-hover:text-red-400')
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

                              {/* 3. 4H开盘价 */}
                              <td className="px-2 py-3 text-right font-mono text-[14px] sm:text-[15px] font-medium text-zinc-400">
                                {formatPriceVal(data.openPrice)}
                              </td>

                              {/* 4. 上线开盘 / 历史最高/最低价 与 后出极值标记 */}
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

                              {/* 6. 4H成交额 & 量比 */}
                              <td className={`px-2 py-3 text-right font-mono ${shouldHighlight ? 'text-red-300' : 'text-emerald-500'}`}>
                                <div className="text-[14px] sm:text-[16px] font-bold leading-tight">
                                  {formatVolume(data.currentVolume)}
                                </div>
                                <div 
                                  className="flex items-center justify-end gap-1 mt-1 text-[11px] font-mono cursor-help"
                                  title={`当前未完结4H成交额: ${formatVolume(data.currentVolume)} 万 USDT\n前${volumeKCount}根完结4H K线最低成交额: ${formatVolume(data.minVolumePastK)} 万 USDT\n比值 (当前/前${volumeKCount}K最低) = ${data.volumeRatioPastK > 0 ? data.volumeRatioPastK.toFixed(2) : '--'}倍`}
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
                              </td>

                              {/* 7. 收位 (方案 A: 纯数值 + 状态色) */}
                              <td className="px-2 py-3 text-right font-mono">
                                <div 
                                  className="flex flex-col items-end justify-center cursor-help"
                                  title={`当前价在4H K线中的位置 (收位)\n当前价: ${formatPriceVal(data.currentPrice)}\n最高价: ${formatPriceVal(data.high)}\n最低价: ${formatPriceVal(data.low)}\n收位: ${data.closePos.toFixed(2)}% (${data.closePos >= 80 ? '高位极强' : data.closePos >= 60 ? '偏强多头' : data.closePos >= 40 ? '中位均衡' : data.closePos >= 20 ? '偏弱下探' : '低位探底'})\n计算公式: (现价 - 最低) ÷ (最高 - 最低) × 100%`}
                                >
                                  <span className={`text-[15px] sm:text-[16px] leading-tight ${getClosePosStyle(data.closePos)}`}>
                                    {data.closePos.toFixed(1)}%
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-sans leading-none mt-0.5">
                                    {getClosePosTag(data.closePos)}
                                  </span>
                                </div>
                              </td>

                              {/* 8. 跌幅 & 前K最大涨幅 */}
                              <td className="px-3 py-3 text-right">
                                <div className="flex flex-col items-end">
                                  <div className="flex items-center justify-end gap-1 text-red-500 font-bold text-[19px] sm:text-[21px] font-mono leading-tight">
                                    {formatChangeText(data.effectiveChange)}
                                    <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-red-500" />
                                  </div>
                                  <div 
                                    className="flex items-center justify-end gap-1 mt-1 text-[11px] font-mono text-zinc-400 cursor-help"
                                    title={`当前未完结K线前的${gainKCount}根完结K线最大涨幅 (${gainMode === 'high' ? '高涨幅模式' : '常规模式'})`}
                                  >
                                    <span className="text-zinc-500 text-[10px]">前{gainKCount}K高:</span>
                                    <span className={`font-bold ${data.maxGainPastK > 0 ? 'text-emerald-300' : 'text-zinc-400'}`}>
                                      {formatChangeText(data.maxGainPastK)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!displayLosers || displayLosers.length === 0) && (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
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

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"></span>
                            4. 量k 与 涨跌k 聚合计算规则
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-cyan-300 font-medium">严禁订阅 4H 流：</span>所有数据均由本地 15m 真实 K 线聚合计算。</p>
                            <p>• <span className="text-zinc-200 font-medium">量k (默认12根)：</span>取当前未完结4H K线前 {volumeKCount} 根完整K线的最低成交额(USDT)，在4H成交额处实时展示「当前未完结成交额 ÷ 前{volumeKCount}根K线最低成交额」的比值。</p>
                            <p>• <span className="text-zinc-200 font-medium">涨跌k (默认6根)：</span>取当前未完结4H K线前 {gainKCount} 根完结K线在当前模式下的最大涨幅并展示。</p>
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
                  <table className="w-full text-left border-collapse min-w-[880px]">
                    <thead>
                      <tr className="bg-white/5 text-[14px] text-gray-400 uppercase font-bold tracking-wider">
                        <th className="px-3 py-3 text-left w-[10%]">{t.tableSymbol}</th>
                        <th className="px-2 py-3 text-right w-[10%]">{t.tableLivePrice}</th>
                        <th className="px-2 py-3 text-right w-[10%]">{t.tableOpenPrice}</th>
                        <th className="px-2 py-3 text-right w-[16%]">
                          <div className="flex items-center justify-end gap-1" title="币对上线以来的开盘价、全历史最高/最低价，并标记后创出的极值方向">
                            <span>上线开盘 / 历史高低</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              全历史
                            </span>
                          </div>
                        </th>
                        <th className="px-2 py-3 text-center w-[11%]">{t.tableFundingCycle}</th>
                        <th className="px-2 py-3 text-right w-[13%]">
                          <div className="flex items-center justify-end gap-1" title={`当前未完结4H成交额 / 前${volumeKCount}根完整K线最低成交额比值`}>
                            <span>{t.table4hVol}</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                              量比(前{volumeKCount}K)
                            </span>
                          </div>
                        </th>
                        <th className="px-2 py-3 text-right w-[9%]">
                          <div className="flex items-center justify-end gap-1 cursor-help" title="收位：当前价在整根当前未完结4H K线高低区间的百分位置&#10;公式：(当前价 - 最低价) ÷ (最高价 - 最低价) × 100%">
                            <span>收位</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
                              K线位
                            </span>
                          </div>
                        </th>
                        <th className="px-3 py-3 text-right w-[21%]">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <span>{t.tableAmplitude}</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300" title={`前${gainKCount}根完结K线最大涨幅`}>
                              前{gainKCount}K高
                            </span>
                          </div>
                        </th>
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
                              <td className="px-3 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[18px] sm:text-[20px] ${
                                    isHolding 
                                      ? 'text-[#d946ef]' 
                                      : (shouldHighlight ? 'text-amber-400' : 'text-zinc-200 group-hover:text-amber-400')
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

                              {/* 3. 4H开盘价 */}
                              <td className="px-2 py-3 text-right font-mono text-[14px] sm:text-[15px] font-medium text-zinc-400">
                                {formatPriceVal(data.openPrice)}
                              </td>

                              {/* 4. 上线开盘 / 历史最高/最低价 与 后出极值标记 */}
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

                              {/* 6. 4H成交额 & 量比 */}
                              <td className={`px-2 py-3 text-right font-mono ${shouldHighlight ? 'text-amber-300' : 'text-emerald-500'}`}>
                                <div className="text-[14px] sm:text-[16px] font-bold leading-tight">
                                  {formatVolume(data.currentVolume)}
                                </div>
                                <div 
                                  className="flex items-center justify-end gap-1 mt-1 text-[11px] font-mono cursor-help"
                                  title={`当前未完结4H成交额: ${formatVolume(data.currentVolume)} 万 USDT\n前${volumeKCount}根完结4H K线最低成交额: ${formatVolume(data.minVolumePastK)} 万 USDT\n比值 (当前/前${volumeKCount}K最低) = ${data.volumeRatioPastK > 0 ? data.volumeRatioPastK.toFixed(2) : '--'}倍`}
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
                              </td>

                              {/* 7. 收位 (方案 A: 纯数值 + 状态色) */}
                              <td className="px-2 py-3 text-right font-mono">
                                <div 
                                  className="flex flex-col items-end justify-center cursor-help"
                                  title={`当前价在4H K线中的位置 (收位)\n当前价: ${formatPriceVal(data.currentPrice)}\n最高价: ${formatPriceVal(data.high)}\n最低价: ${formatPriceVal(data.low)}\n收位: ${data.closePos.toFixed(2)}% (${data.closePos >= 80 ? '高位极强' : data.closePos >= 60 ? '偏强多头' : data.closePos >= 40 ? '中位均衡' : data.closePos >= 20 ? '偏弱下探' : '低位探底'})\n计算公式: (现价 - 最低) ÷ (最高 - 最低) × 100%`}
                                >
                                  <span className={`text-[15px] sm:text-[16px] leading-tight ${getClosePosStyle(data.closePos)}`}>
                                    {data.closePos.toFixed(1)}%
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-sans leading-none mt-0.5">
                                    {getClosePosTag(data.closePos)}
                                  </span>
                                </div>
                              </td>

                              {/* 8. 振幅 & 前K最大涨幅 */}
                              <td className="px-3 py-3 text-right">
                                <div className="flex flex-col items-end">
                                  <div className="flex items-center justify-end gap-1 text-amber-500 font-bold text-[19px] sm:text-[21px] font-mono leading-tight">
                                    {(item.amplitude || 0).toFixed(2)}%
                                    <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-amber-500" />
                                  </div>
                                  <div 
                                    className="flex items-center justify-end gap-1 mt-1 text-[11px] font-mono text-zinc-400 cursor-help"
                                    title={`当前未完结K线前的${gainKCount}根完结K线最大涨幅 (${gainMode === 'high' ? '高涨幅模式' : '常规模式'})`}
                                  >
                                    <span className="text-zinc-500 text-[10px]">前{gainKCount}K高:</span>
                                    <span className={`font-bold ${data.maxGainPastK > 0 ? 'text-emerald-300' : 'text-zinc-400'}`}>
                                      {formatChangeText(data.maxGainPastK)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!fourHourBoards || !fourHourBoards.amplitude15m || fourHourBoards.amplitude15m.length === 0) && (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
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
                  <table className="w-full text-left border-collapse min-w-[880px]">
                    <thead>
                      <tr className="bg-white/5 text-[14px] text-gray-400 uppercase font-bold tracking-wider">
                        <th className="px-3 py-3 text-left w-[10%]">{t.tableSymbol}</th>
                        <th className="px-2 py-3 text-right w-[10%]">{t.tableLivePrice}</th>
                        <th className="px-2 py-3 text-right w-[10%]">{t.tableOpenPrice}</th>
                        <th className="px-2 py-3 text-right w-[16%]">
                          <div className="flex items-center justify-end gap-1" title="币对上线以来的开盘价、全历史最高/最低价，并标记后创出的极值方向">
                            <span>上线开盘 / 历史高低</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              全历史
                            </span>
                          </div>
                        </th>
                        <th className="px-2 py-3 text-center w-[11%]">{t.tableFundingCycle}</th>
                        <th className="px-2 py-3 text-center w-[13%]">{t.tableSpikeRatio}</th>
                        <th className="px-2 py-3 text-right w-[9%]">
                          <div className="flex items-center justify-end gap-1 cursor-help" title="收位：当前价在整根当前未完结4H K线高低区间的百分位置&#10;公式：(当前价 - 最低价) ÷ (最高价 - 最低价) × 100%">
                            <span>收位</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
                              K线位
                            </span>
                          </div>
                        </th>
                        <th className="px-3 py-3 text-right w-[21%]">{t.table1hChange}</th>
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
                              <td className="px-3 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[18px] sm:text-[20px] ${
                                    isHolding 
                                      ? 'text-[#d946ef]' 
                                      : 'text-zinc-200 group-hover:text-cyan-400'
                                  } transition-colors uppercase font-sans`}>
                                    {item.symbol.replace('USDT', '')}
                                  </span>
                                  {isHolding && (
                                    <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 bg-[#d946ef]/20 text-[#d946ef] border border-[#d946ef]/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                      持仓
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
                              <td className="px-2 py-3 text-right font-mono text-[15px] sm:text-[16px] font-bold text-zinc-100 group-hover:text-white transition-colors">
                                {formatPriceVal(data.currentPrice)}
                              </td>

                              {/* 3. 4H开盘价 */}
                              <td className="px-2 py-3 text-right font-mono text-[14px] sm:text-[15px] font-medium text-zinc-400">
                                {formatPriceVal(data.openPrice)}
                              </td>

                              {/* 4. 上线开盘 / 历史最高/最低价 与 后出极值标记 */}
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

                              {/* 6. 放量倍数 */}
                              <td className="px-2 py-3 text-center font-mono text-[16px] sm:text-[17px] font-bold text-cyan-400">
                                {item.ratio.toFixed(2)}倍
                              </td>

                              {/* 7. 收位 (方案 A: 纯数值 + 状态色) */}
                              <td className="px-2 py-3 text-right font-mono">
                                <div 
                                  className="flex flex-col items-end justify-center cursor-help"
                                  title={`当前价在4H K线中的位置 (收位)\n当前价: ${formatPriceVal(data.currentPrice)}\n最高价: ${formatPriceVal(data.high)}\n最低价: ${formatPriceVal(data.low)}\n收位: ${data.closePos.toFixed(2)}% (${data.closePos >= 80 ? '高位极强' : data.closePos >= 60 ? '偏强多头' : data.closePos >= 40 ? '中位均衡' : data.closePos >= 20 ? '偏弱下探' : '低位探底'})\n计算公式: (现价 - 最低) ÷ (最高 - 最低) × 100%`}
                                >
                                  <span className={`text-[15px] sm:text-[16px] leading-tight ${getClosePosStyle(data.closePos)}`}>
                                    {data.closePos.toFixed(1)}%
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-sans leading-none mt-0.5">
                                    {getClosePosTag(data.closePos)}
                                  </span>
                                </div>
                              </td>

                              {/* 8. 1H涨跌 */}
                              <td className="px-3 py-3 text-right">
                                <div className={`flex items-center justify-end gap-1 font-bold text-[19px] sm:text-[21px] font-mono leading-tight ${
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
                          <td colSpan={8} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
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
                  <table className="w-full text-left border-collapse min-w-[880px]">
                    <thead>
                      <tr className="bg-white/5 text-[14px] text-gray-400 uppercase font-bold tracking-wider">
                        <th className="px-3 py-3 text-left w-[10%]">{t.tableSymbol}</th>
                        <th className="px-2 py-3 text-right w-[10%]">{t.tableLivePrice}</th>
                        <th className="px-2 py-3 text-right w-[10%]">{t.tableOpenPrice}</th>
                        <th className="px-2 py-3 text-right w-[16%]">
                          <div className="flex items-center justify-end gap-1" title="币对上线以来的开盘价、全历史最高/最低价，并标记后创出的极值方向">
                            <span>上线开盘 / 历史高低</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              全历史
                            </span>
                          </div>
                        </th>
                        <th className="px-2 py-3 text-center w-[11%]">{t.tableFundingCycle}</th>
                        <th className="px-2 py-3 text-right w-[13%]">{t.table24hVol}</th>
                        <th className="px-2 py-3 text-right w-[9%]">
                          <div className="flex items-center justify-end gap-1 cursor-help" title="收位：当前价在整根当前未完结4H K线高低区间的百分位置&#10;公式：(当前价 - 最低价) ÷ (最高价 - 最低价) × 100%">
                            <span>收位</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
                              K线位
                            </span>
                          </div>
                        </th>
                        <th className="px-3 py-3 text-right w-[21%]">{t.tableGain}</th>
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
                              <td className="px-3 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[18px] sm:text-[20px] ${
                                    isHolding 
                                      ? 'text-[#d946ef]' 
                                      : 'text-zinc-200 group-hover:text-emerald-500'
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

                              {/* 3. 4H开盘价 */}
                              <td className="px-2 py-3 text-right font-mono text-[14px] sm:text-[15px] font-medium text-zinc-400">
                                {formatPriceVal(data.openPrice)}
                              </td>

                              {/* 4. 上线开盘 / 历史最高/最低价 与 后出极值标记 */}
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

                              {/* 6. 24H成交额 */}
                              <td className="px-2 py-3 text-right font-mono text-[15px] sm:text-[16px] font-bold text-emerald-500">
                                {formatVolume(item.volume24h)}
                              </td>

                              {/* 7. 收位 (方案 A: 纯数值 + 状态色) */}
                              <td className="px-2 py-3 text-right font-mono">
                                <div 
                                  className="flex flex-col items-end justify-center cursor-help"
                                  title={`当前价在4H K线中的位置 (收位)\n当前价: ${formatPriceVal(data.currentPrice)}\n最高价: ${formatPriceVal(data.high)}\n最低价: ${formatPriceVal(data.low)}\n收位: ${data.closePos.toFixed(2)}% (${data.closePos >= 80 ? '高位极强' : data.closePos >= 60 ? '偏强多头' : data.closePos >= 40 ? '中位均衡' : data.closePos >= 20 ? '偏弱下探' : '低位探底'})\n计算公式: (现价 - 最低) ÷ (最高 - 最低) × 100%`}
                                >
                                  <span className={`text-[15px] sm:text-[16px] leading-tight ${getClosePosStyle(data.closePos)}`}>
                                    {data.closePos.toFixed(1)}%
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-sans leading-none mt-0.5">
                                    {getClosePosTag(data.closePos)}
                                  </span>
                                </div>
                              </td>

                              {/* 8. 24H涨幅 */}
                              <td className="px-3 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 text-emerald-500 font-bold text-[19px] sm:text-[21px] font-mono leading-tight">
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
                          <td colSpan={8} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
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
                  <table className="w-full text-left border-collapse min-w-[880px]">
                    <thead>
                      <tr className="bg-white/5 text-[14px] text-gray-400 uppercase font-bold tracking-wider">
                        <th className="px-3 py-3 text-left w-[10%]">{t.tableSymbol}</th>
                        <th className="px-2 py-3 text-right w-[10%]">{t.tableLivePrice}</th>
                        <th className="px-2 py-3 text-right w-[10%]">{t.tableOpenPrice}</th>
                        <th className="px-2 py-3 text-right w-[16%]">
                          <div className="flex items-center justify-end gap-1" title="币对上线以来的开盘价、全历史最高/最低价，并标记后创出的极值方向">
                            <span>上线开盘 / 历史高低</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">
                              全历史
                            </span>
                          </div>
                        </th>
                        <th className="px-2 py-3 text-center w-[11%]">{t.tableFundingCycle}</th>
                        <th className="px-2 py-3 text-right w-[13%]">{t.table24hVol}</th>
                        <th className="px-2 py-3 text-right w-[9%]">
                          <div className="flex items-center justify-end gap-1 cursor-help" title="收位：当前价在整根当前未完结4H K线高低区间的百分位置&#10;公式：(当前价 - 最低价) ÷ (最高价 - 最低价) × 100%">
                            <span>收位</span>
                            <span className="text-[10px] font-normal px-1 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono">
                              K线位
                            </span>
                          </div>
                        </th>
                        <th className="px-3 py-3 text-right w-[21%]">{t.tableLoss}</th>
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
                              <td className="px-3 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[18px] sm:text-[20px] ${
                                    isHolding 
                                      ? 'text-[#d946ef]' 
                                      : 'text-zinc-200 group-hover:text-red-500'
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

                              {/* 3. 4H开盘价 */}
                              <td className="px-2 py-3 text-right font-mono text-[14px] sm:text-[15px] font-medium text-zinc-400">
                                {formatPriceVal(data.openPrice)}
                              </td>

                              {/* 4. 上线开盘 / 历史最高/最低价 与 后出极值标记 */}
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

                              {/* 6. 24H成交额 */}
                              <td className="px-2 py-3 text-right font-mono text-[15px] sm:text-[16px] font-bold text-emerald-500">
                                {formatVolume(item.volume24h)}
                              </td>

                              {/* 7. 收位 (方案 A: 纯数值 + 状态色) */}
                              <td className="px-2 py-3 text-right font-mono">
                                <div 
                                  className="flex flex-col items-end justify-center cursor-help"
                                  title={`当前价在4H K线中的位置 (收位)\n当前价: ${formatPriceVal(data.currentPrice)}\n最高价: ${formatPriceVal(data.high)}\n最低价: ${formatPriceVal(data.low)}\n收位: ${data.closePos.toFixed(2)}% (${data.closePos >= 80 ? '高位极强' : data.closePos >= 60 ? '偏强多头' : data.closePos >= 40 ? '中位均衡' : data.closePos >= 20 ? '偏弱下探' : '低位探底'})\n计算公式: (现价 - 最低) ÷ (最高 - 最低) × 100%`}
                                >
                                  <span className={`text-[15px] sm:text-[16px] leading-tight ${getClosePosStyle(data.closePos)}`}>
                                    {data.closePos.toFixed(1)}%
                                  </span>
                                  <span className="text-[10px] text-zinc-500 font-sans leading-none mt-0.5">
                                    {getClosePosTag(data.closePos)}
                                  </span>
                                </div>
                              </td>

                              {/* 8. 24H跌幅 */}
                              <td className="px-3 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 text-red-500 font-bold text-[19px] sm:text-[21px] font-mono leading-tight">
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
                          <td colSpan={8} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
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

      {/* 4H 榜单筛选设置弹窗 */}
      <FilterSettingsModal4h
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        settings={filterSettings}
        onSave={handleSaveFilterSettings}
        currentVolumeKCount={volumeKCount}
        currentGainKCount={gainKCount}
        currentGainMode={gainMode}
      />

      {/* 4H 自动下单设置弹窗 */}
      <OrderSettingsModal4h
        isOpen={isOrderSettingsModalOpen}
        onClose={() => setIsOrderSettingsModalOpen(false)}
        settings={orderSettings}
        onSave={handleSaveOrderSettings}
        onSaveAndApply={handleApplyTpSlToAllPositions}
        holdingPositionsCount={(positions || []).filter(p => p.amount > 0).length}
      />

      {/* 4H 周期筛选扫描历史记录弹窗 (支持查询与下载导出) */}
      <ScreeningRecordsModal
        isOpen={isScreeningRecordsModalOpen}
        onClose={() => setIsScreeningRecordsModalOpen(false)}
        records={screeningRecords}
        onClearRecords={handleClearScreeningRecords}
        onRefreshRecords={handleRefreshScreeningRecords}
        onManualTriggerScan={handleManualTriggerScan}
        formatPrice={formatPriceForSymbol}
      />
    </div>
  );
}
