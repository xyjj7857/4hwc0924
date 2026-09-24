/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  RefreshCw,
  Activity,
  Zap,
  HelpCircle,
  ClipboardList,
  Trash2,
  Music
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
  change24h: number;
  amplitude?: number;
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
  table15mVol: "成交额（万）",
  tableGain: "涨幅",
  tableLoss: "跌幅",
  tableAmplitude: "振幅",
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
      if (sse15m.config) setConfig(sse15m.config);
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
          if (data.config) setConfig(data.config);
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

  return (
    <div className="text-gray-100 font-sans selection:bg-red-500/30 min-h-[calc(100vh-170px)] flex flex-col gap-6">
      <audio ref={audioRef} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-1 flex-1 items-stretch">
        
        {/* Left Column: Config & Audio OR Funding Rate Ranking */}
        <div className="lg:col-span-4 flex flex-col space-y-5 h-full">
          
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

        {/* Right Column: Results */}
        <div className="lg:col-span-8 flex flex-col space-y-6 h-full">
          
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[320px]">
            
            {/* Gainers List */}
            <section className="space-y-4 flex flex-col h-full flex-1">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20 shadow-md">
                    <TrendingUp className="w-5 h-5 text-emerald-500 animate-pulse" />
                  </div>
                  <h2 className="text-[24px] font-bold text-emerald-500 tracking-tight">{t.gainer15m}</h2>

                  {/* 15分钟涨幅榜说明书 */}
                  <div className="relative group/gain15-help flex items-center">
                    <button
                      type="button"
                      className="p-1 rounded-full text-white hover:text-emerald-300 hover:bg-white/10 transition-all cursor-help focus:outline-none flex items-center justify-center"
                      title="15分钟涨幅榜说明书"
                      aria-label="15分钟涨幅榜说明书"
                    >
                      <HelpCircle className="w-5 h-5 text-white stroke-[2.3] drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                    </button>

                    <div className="absolute left-0 top-full mt-2 hidden group-hover/gain15-help:block z-50 w-80 sm:w-96 p-4 rounded-2xl bg-[#121316]/98 border border-emerald-500/40 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_20px_rgba(16,185,129,0.25)] backdrop-blur-xl text-left pointer-events-none transition-all">
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
                            1. 刷新周期与刷新时刻
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
                            <p>• <span className="text-zinc-200 font-medium">计算公式：</span><span className="text-emerald-300 font-mono font-bold">(当前最新价 - 15m开盘价) ÷ 15m开盘价 × 100%</span>。</p>
                            <p>• <span className="text-zinc-200 font-medium">榜单排序：</span>按 15 分钟涨幅从大到小降序排列，展示 TOP 5 标的。</p>
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                            3. 异动标签与警报机制
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-emerald-400 font-medium">涨幅警报：</span>当 15m 涨幅 ≥ {config.gainThreshold}% 时，触发涨幅警报与语音播报。</p>
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                            4. 快速交易与持仓识别
                          </div>
                          <p className="text-zinc-400 pl-3">
                            若榜单中的币对在当前持仓中，自动显示紫色 <span className="text-[#d946ef] font-bold">[持仓中]</span> 标签并将币名标为亮紫色；点击任意行可快速联动切换至交易看板。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <span className="text-[15px] text-gray-500 uppercase font-bold tracking-widest font-mono">Top 5</span>
              </div>
              
              <div className="bg-[#141416]/40 rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex-1 flex flex-col">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-[15px] text-gray-500 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3 w-[33%] text-left">{t.tableSymbol}</th>
                        <th className="px-2 py-3 w-[34%] text-center">{t.table15mVol}</th>
                        <th className="px-4 py-3 w-[33%] text-right">{t.tableGain}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                        {results?.gainers.map((item, idx) => {
                          const isHolding = isHoldingPosition(item.symbol);
                          const shouldHighlight = isAlerting && item.change >= config.gainThreshold;
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
                              <td className="px-4 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[21px] ${
                                    isHolding 
                                      ? 'text-[#d946ef]' 
                                      : (shouldHighlight ? 'text-emerald-400' : 'text-zinc-200 group-hover:text-emerald-500')
                                  } transition-colors uppercase`}>
                                    {item.symbol.replace('USDT', '')}
                                  </span>
                                  {isHolding && (
                                    <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 bg-[#d946ef]/20 text-[#d946ef] border border-[#d946ef]/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                      持仓中
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className={`px-2 py-3 text-center font-mono text-[18px] font-bold ${shouldHighlight ? 'text-emerald-300' : 'text-emerald-500'}`}>
                                {formatVolume(item.volume15m)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 text-emerald-500 font-bold text-[21px] font-sans">
                                  +{item.change.toFixed(2)}%
                                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-emerald-500" />
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!results || results.gainers.length === 0) && (
                        <tr>
                          <td colSpan={3} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Losers List */}
            <section className="space-y-4 flex flex-col h-full flex-1">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center border border-red-500/20 shadow-md">
                    <TrendingDown className="w-5 h-5 text-red-500 animate-pulse" />
                  </div>
                  <h2 className="text-[24px] font-bold text-red-500 tracking-tight">{t.loser15m}</h2>

                  {/* 15分钟跌幅榜说明书 */}
                  <div className="relative group/loss15-help flex items-center">
                    <button
                      type="button"
                      className="p-1 rounded-full text-white hover:text-red-300 hover:bg-white/10 transition-all cursor-help focus:outline-none flex items-center justify-center"
                      title="15分钟跌幅榜说明书"
                      aria-label="15分钟跌幅榜说明书"
                    >
                      <HelpCircle className="w-5 h-5 text-white stroke-[2.3] drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                    </button>

                    <div className="absolute left-0 top-full mt-2 hidden group-hover/loss15-help:block z-50 w-80 sm:w-96 p-4 rounded-2xl bg-[#121316]/98 border border-red-500/40 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_20px_rgba(239,68,68,0.25)] backdrop-blur-xl text-left pointer-events-none transition-all">
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
                            1. 刷新周期与刷新时刻
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
                            <p>• <span className="text-zinc-200 font-medium">计算公式：</span><span className="text-red-300 font-mono font-bold">(当前最新价 - 15m开盘价) ÷ 15m开盘价 × 100%</span>。</p>
                            <p>• <span className="text-zinc-200 font-medium">榜单排序：</span>按 15 分钟跌幅从大到小升序排列（跌幅最大排前），展示 TOP 5 标的。</p>
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                            3. 异动标签与警报机制
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-red-400 font-medium">跌幅警报：</span>当 15m 跌幅绝对值 ≥ {config.lossThreshold}% 时，触发跌幅警报与语音播报。</p>
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
                            4. 快速交易与持仓识别
                          </div>
                          <p className="text-zinc-400 pl-3">
                            若榜单中的币对在当前持仓中，自动显示紫色 <span className="text-[#d946ef] font-bold">[持仓中]</span> 标签并将币名标为亮紫色；点击任意行可快速联动切换至交易看板。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <span className="text-[15px] text-gray-500 uppercase font-bold tracking-widest font-mono">Top 5</span>
              </div>
              
              <div className="bg-[#141416]/40 rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex-1 flex flex-col">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-[15px] text-gray-500 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3 w-[33%] text-left">{t.tableSymbol}</th>
                        <th className="px-2 py-3 w-[34%] text-center">{t.table15mVol}</th>
                        <th className="px-4 py-3 w-[33%] text-right">{t.tableLoss}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                        {results?.losers.map((item, idx) => {
                          const isHolding = isHoldingPosition(item.symbol);
                          const shouldHighlight = isAlerting && Math.abs(item.change) >= config.lossThreshold;
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
                              <td className="px-4 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[21px] ${
                                    isHolding 
                                      ? 'text-[#d946ef]' 
                                      : (shouldHighlight ? 'text-red-400' : 'text-zinc-200 group-hover:text-red-500')
                                  } transition-colors uppercase`}>
                                    {item.symbol.replace('USDT', '')}
                                  </span>
                                  {isHolding && (
                                    <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 bg-[#d946ef]/20 text-[#d946ef] border border-[#d946ef]/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                      持仓中
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className={`px-2 py-3 text-center font-mono text-[18px] font-bold ${shouldHighlight ? 'text-red-300' : 'text-emerald-500'}`}>
                                {formatVolume(item.volume15m)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 text-red-500 font-bold text-[21px] font-sans">
                                  {item.change.toFixed(2)}%
                                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-red-500" />
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!results || results.losers.length === 0) && (
                        <tr>
                          <td colSpan={3} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Amplitude List */}
            <section className="space-y-4 flex flex-col h-full flex-1">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center border border-amber-500/20 shadow-md">
                    <Activity className="w-5 h-5 text-amber-500 animate-pulse" />
                  </div>
                  <h2 className="text-[24px] font-bold text-amber-500 tracking-tight">{t.amplitude15m}</h2>

                  {/* 15分钟振幅榜说明书 */}
                  <div className="relative group/amp15-help flex items-center">
                    <button
                      type="button"
                      className="p-1 rounded-full text-white hover:text-amber-300 hover:bg-white/10 transition-all cursor-help focus:outline-none flex items-center justify-center"
                      title="15分钟振幅榜说明书"
                      aria-label="15分钟振幅榜说明书"
                    >
                      <HelpCircle className="w-5 h-5 text-white stroke-[2.3] drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                    </button>

                    <div className="absolute left-0 top-full mt-2 hidden group-hover/amp15-help:block z-50 w-80 sm:w-96 p-4 rounded-2xl bg-[#121316]/98 border border-amber-500/40 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_20px_rgba(245,158,11,0.25)] backdrop-blur-xl text-left pointer-events-none transition-all">
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
                            1. 刷新周期与刷新时刻
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
                            <p>• <span className="text-zinc-200 font-medium">计算公式：</span><span className="text-amber-300 font-mono font-bold">(15m最高价 - 15m最低价) ÷ 15m开盘价 × 100%</span>。</p>
                            <p>• <span className="text-zinc-200 font-medium">榜单排序：</span>按 15 分钟振幅从大到小降序排列，展示 TOP 5 标的。</p>
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                            3. 异动标签与警报机制
                          </div>
                          <div className="text-zinc-400 pl-3 space-y-1">
                            <p>• <span className="text-amber-400 font-medium">振幅警报：</span>当 15m 振幅 ≥ {config.amplitudeThreshold}% 时，触发振幅警报与语音播报。</p>
                          </div>
                        </div>

                        <div>
                          <div className="font-bold text-white mb-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                            4. 快速交易与持仓识别
                          </div>
                          <p className="text-zinc-400 pl-3">
                            若榜单中的币对在当前持仓中，自动显示紫色 <span className="text-[#d946ef] font-bold">[持仓中]</span> 标签并将币名标为亮紫色；点击任意行可快速联动切换至交易看板。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <span className="text-[15px] text-gray-500 uppercase font-bold tracking-widest font-mono">Top 5</span>
              </div>
              
              <div className="bg-[#141416]/40 rounded-2xl border border-white/10 overflow-hidden shadow-2xl flex-1 flex flex-col">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-[15px] text-gray-500 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3 w-[33%] text-left">{t.tableSymbol}</th>
                        <th className="px-2 py-3 w-[34%] text-center">{t.table15mVol}</th>
                        <th className="px-4 py-3 w-[33%] text-right">{t.tableAmplitude}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence mode="popLayout">
                        {results?.amplitude15m?.map((item, idx) => {
                          const isHolding = isHoldingPosition(item.symbol);
                          const shouldHighlight = isAlerting && (item.amplitude || 0) >= config.amplitudeThreshold;
                          return (
                            <motion.tr 
                              key={item.symbol} 
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
                              <td className="px-4 py-3 text-left">
                                <div className="flex items-center">
                                  <span className={`font-bold text-[21px] ${
                                    isHolding 
                                      ? 'text-[#d946ef]' 
                                      : (shouldHighlight ? 'text-amber-400' : 'text-zinc-200 group-hover:text-amber-500')
                                  } transition-colors uppercase`}>
                                    {item.symbol.replace('USDT', '')}
                                  </span>
                                  {isHolding && (
                                    <span className="ml-2 text-[11px] font-bold px-1.5 py-0.5 bg-[#d946ef]/20 text-[#d946ef] border border-[#d946ef]/40 rounded shadow-sm shrink-0 whitespace-nowrap">
                                      持仓中
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className={`px-2 py-3 text-center font-mono text-[18px] font-bold ${shouldHighlight ? 'text-amber-300' : 'text-emerald-500'}`}>
                                {formatVolume(item.volume15m)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 text-amber-500 font-bold text-[21px] font-sans">
                                  {(item.amplitude || 0).toFixed(2)}%
                                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-amber-500" />
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                      {(!results || !results.amplitude15m || results.amplitude15m.length === 0) && (
                        <tr>
                          <td colSpan={3} className="px-4 py-12 text-center text-gray-600 italic text-[18px] font-medium">
                            {t.waitingScan}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
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
