import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Settings, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Shield, 
  Clock, 
  Zap, 
  Server, 
  Key, 
  XCircle,
  RefreshCw,
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowDownRight,
  Terminal,
  Wallet,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  FileText,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sliders,
  Calculator,
  Volume2,
  VolumeX,
  Plus,
  Bell,
  Trash2,
  LogOut,
  Check,
  GripVertical,
  BarChart2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ApiConfig, OrderForm, Position, TradeLog, TradeLogCategory, AccountBalance, OpenOrder, PositionHistory, AlarmItem, AlarmSettings } from './types';
import { LogsModule, detectTradeLogInfo } from './components/LogsModule';
import MonitoringAssistant from './components/MonitoringAssistant';
import MonitoringAssistant4h from './components/MonitoringAssistant4h';
import WeightStatsModule from './components/WeightStatsModule';
import { AlarmNavButton } from './components/AlarmNavButton';
import { AlarmModal, AlarmRingingBanner } from './components/AlarmModal';
import { KellyModal } from './components/KellyModal';
import { EntryVerificationModal } from './components/EntryVerificationModal';
import { EntryVerificationAlert, VerificationAlertState } from './components/EntryVerificationAlert';
import { PositionRiskModal } from './components/PositionRiskModal';
import { PositionRiskButton } from './components/PositionRiskButton';
import { useMarketPrices } from './context/MarketPriceContext';
import { 
  PositionRiskConfig, 
  getLocalPositionRiskConfigs, 
  saveLocalPositionRiskConfigs,
  getAllLocalPositionRiskConfigs,
  saveAllLocalPositionRiskConfigs 
} from './types/positionRisk';
import { 
  matchSymbolWithVerificationList, 
  matchSymbolWithPositions, 
  getLocalVerificationList, 
  setLocalVerificationList 
} from './utils/entryVerification';
import { playAlarmSound, stopAlarmSound } from './utils/alarmAudio';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  LabelList
} from 'recharts';
import * as XLSX from 'xlsx';

const Candlestick = (props: any) => {
  const { x, y, width, height, payload } = props;
  if (x === undefined || y === undefined || width === undefined || height === undefined) return null;
  if (!payload) return null;

  const isUp = payload.close >= payload.open;
  const color = isUp ? '#10B981' : '#EF4444';

  const bodyMax = Math.max(payload.open, payload.close);
  const bodyMin = Math.min(payload.open, payload.close);
  const bodyHeightVal = Math.max(0.0001, bodyMax - bodyMin);

  const pixelsPerUnit = height / bodyHeightVal;

  const wickTopY = y - (payload.high - bodyMax) * pixelsPerUnit;
  const wickBottomY = y + height + (bodyMin - payload.low) * pixelsPerUnit;
  const cx = x + width / 2;

  return (
    <g stroke={color} strokeWidth={1.5} fill={isUp ? color : 'transparent'}>
      {/* Upper Wick */}
      <line x1={cx} y1={y} x2={cx} y2={wickTopY} />
      {/* Lower Wick */}
      <line x1={cx} y1={y + height} x2={cx} y2={wickBottomY} />
      {/* Candle Body */}
      <rect 
        x={x} 
        y={y} 
        width={width} 
        height={height} 
        fill={isUp ? '#10B981' : '#EF4444'} 
        stroke={isUp ? '#10B981' : '#EF4444'}
        strokeWidth={1}
        rx={1}
      />
    </g>
  );
};

const CustomTrendTooltip = ({ active, payload, opacity }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const change = data.close - data.open;
    const changePctStr = data.open > 0 ? ((change / data.open) * 100).toFixed(2) : '0.00';
    const amplitude = data.open > 0 ? (((data.high - data.low) / data.open) * 100).toFixed(2) : '0.00';
    return (
      <div 
        className="bg-[#141416] border border-[#232326] p-4 rounded-lg shadow-xl text-xs font-mono space-y-1.5 min-w-[180px] backdrop-blur-sm z-50 transition-opacity duration-200"
        style={{ opacity: opacity !== undefined ? opacity / 100 : 0.95 }}
      >
        <p className="font-sans font-bold text-zinc-400 pb-1 border-b border-zinc-800">{data.name}</p>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">开盘:</span>
          <span className="text-zinc-300 font-bold">{data.open?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">最高:</span>
          <span className="text-zinc-300 font-bold">{data.high?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">最低:</span>
          <span className="text-zinc-300 font-bold">{data.low?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">收盘:</span>
          <span className={`font-bold ${data.close >= data.open ? 'text-emerald-500' : 'text-red-500'}`}>
            {data.close?.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">次数:</span>
          <span className="text-zinc-300 font-bold">{data.tradesCount ?? 0}</span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-zinc-800/50">
          <span className="text-zinc-500">涨跌幅:</span>
          <span className={`font-bold ${change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {change >= 0 ? '+' : ''}{changePctStr}%
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">振幅:</span>
          <span className="text-zinc-400">{amplitude}%</span>
        </div>
        {data.pnlSum !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-zinc-500">净盈亏:</span>
            <span className={`font-bold ${data.pnlSum >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {data.pnlSum >= 0 ? '+' : ''}{data.pnlSum?.toFixed(2)} USDT
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export default function App() {
  // State
  const [activeMainTab, setActiveMainTab] = useState<'TRADE' | 'MONITOR' | 'MONITOR_4H' | 'REPORT' | 'WEIGHT_STATS'>('TRADE');
  const [activeContractTab, setActiveContractTab] = useState<'positions' | 'orders'>('positions');
  const [positionHistory, setPositionHistory] = useState<PositionHistory[]>([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  
  // Pagination & Rate limiting/Sync progress States
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 50;
  const [rateLimitDelay, setRateLimitDelay] = useState<number>(300); // 默认 300ms, 安全防护
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; stage: string }>({
    current: 0,
    total: 0,
    stage: ''
  });
  
  // Date range for history (default to last 7 days)
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  
  const [apiConfig, setApiConfig] = useState<ApiConfig>({
    apiKey: '',
    apiSecret: '',
    baseUrl: 'https://fapi.binance.com', // Binance Futures API
    accountName: '',
  });

  const [savedApiAccounts, setSavedApiAccounts] = useState<any[]>([]);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);

  const [kValue, setKValue] = useState<number | null>(null);
  const [zValue, setZValue] = useState<number | null>(null);
  const [entryEntity, setEntryEntity] = useState<number | null>(null);
  const [entryEntityRatio, setEntryEntityRatio] = useState<number | null>(null);
  const [countdownStr, setCountdownStr] = useState<string>('00:00');

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      const remMinutes = 14 - (minutes % 15);
      const remSeconds = 59 - seconds;
      setCountdownStr(`${String(remMinutes).padStart(2, '0')}:${String(remSeconds).padStart(2, '0')}`);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  const [selectedReportAccount, setSelectedReportAccount] = useState<string>('ALL_ACCOUNTS');
  const [selectedReportAccounts, setSelectedReportAccounts] = useState<string[]>([]);
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
  const availableAccountsRef = useRef<string[]>([]);
  useEffect(() => {
    availableAccountsRef.current = availableAccounts;
  }, [availableAccounts]);
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState<boolean>(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(event.target as Node)) {
        setIsAccountDropdownOpen(false);
      }
    };
    if (isAccountDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAccountDropdownOpen]);

  // 走势分析状态
  const [trendInitialBalance, setTrendInitialBalance] = useState<number>(200);
  const [trendOpacity, setTrendOpacity] = useState<number>(40);
  const [trendChartType, setTrendChartType] = useState<'candle' | 'line'>('candle');
  const [trendTimeframe, setTrendTimeframe] = useState<'1h' | '4h' | '1d' | '1w' | '1M'>('1M');
  const [isTrendAnalysisVisible, setIsTrendAnalysisVisible] = useState<boolean>(true);
  const [isStreakChartVisible, setIsStreakChartVisible] = useState<boolean>(true);
  const [trendCandles, setTrendCandles] = useState<any[]>([]);

  // 缩放与横向移动(漫游)状态
  const [trendZoomInfo, setTrendZoomInfo] = useState({ startIndex: 0, viewLen: 0 });
  const [streakZoomInfo, setStreakZoomInfo] = useState({ startIndex: 0, viewLen: 0 });
  const [isTrendHovered, setIsTrendHovered] = useState(false);
  const [isStreakHovered, setIsStreakHovered] = useState(false);

  const trendContainerRef = useRef<HTMLDivElement>(null);
  const streakContainerRef = useRef<HTMLDivElement>(null);

  const handleZoom = useCallback((
    deltaY: number,
    totalLength: number,
    setZoom: React.Dispatch<React.SetStateAction<{ startIndex: number; viewLen: number }>>
  ) => {
    if (totalLength === 0) return;

    setZoom((prev) => {
      const currentViewLen = prev.viewLen <= 0 || prev.viewLen > totalLength 
        ? totalLength 
        : prev.viewLen;
        
      const currentStartIndex = prev.startIndex;
      
      // Step: 约数据集长度的10%
      const step = Math.max(1, Math.floor(totalLength * 0.1));
      
      let newViewLen = currentViewLen;
      let newStartIndex = currentStartIndex;
      
      if (deltaY < 0) {
        // 放大：减少可见项
        newViewLen = Math.max(4, currentViewLen - step);
        const diff = currentViewLen - newViewLen;
        newStartIndex = currentStartIndex + Math.floor(diff / 2);
      } else {
        // 缩小：增加可见项
        newViewLen = Math.min(totalLength, currentViewLen + step);
        const diff = newViewLen - currentViewLen;
        newStartIndex = Math.max(0, currentStartIndex - Math.floor(diff / 2));
      }
      
      // 边界夹逼
      if (newStartIndex < 0) newStartIndex = 0;
      if (newStartIndex + newViewLen > totalLength) {
        newStartIndex = Math.max(0, totalLength - newViewLen);
      }
      
      return {
        startIndex: newStartIndex,
        viewLen: newViewLen
      };
    });
  }, []);

  const handlePan = useCallback((
    direction: 'left' | 'right',
    totalLength: number,
    setZoom: React.Dispatch<React.SetStateAction<{ startIndex: number; viewLen: number }>>
  ) => {
    if (totalLength === 0) return;

    setZoom((prev) => {
      const currentViewLen = prev.viewLen <= 0 || prev.viewLen > totalLength 
        ? totalLength 
        : prev.viewLen;
      
      if (currentViewLen >= totalLength) return prev;
      
      // 每次移动当前可见长度的10%
      const step = Math.max(1, Math.floor(currentViewLen * 0.1));
      let newStartIndex = prev.startIndex;
      
      if (direction === 'left') {
        newStartIndex = Math.max(0, prev.startIndex - step);
      } else {
        newStartIndex = Math.min(totalLength - currentViewLen, prev.startIndex + step);
      }
      
      return {
        startIndex: newStartIndex,
        viewLen: currentViewLen
      };
    });
  }, []);


  const [serverIp, setServerIp] = useState<string>('未获取 (开启点击后刷新)');
  const [isQueryingIp, setIsQueryingIp] = useState<boolean>(false);
  const [showServerIp, setShowServerIp] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  
  const [positionMode, setPositionMode] = useState<'ONE_WAY' | 'HEDGE'>('ONE_WAY');
  const [isApiVisible, setIsApiVisible] = useState(false);
  const [isTradeRiskVisible, setIsTradeRiskVisible] = useState(false);
  const [leverage, setLeverage] = useState<number>(() => {
    const saved = localStorage.getItem('app_user_leverage');
    return saved ? Number(saved) : 5;
  });
  const [orderRatioPercent, setOrderRatioPercent] = useState<number | null>(() => {
    const saved = localStorage.getItem('app_order_ratio_percent');
    return saved ? Number(saved) : 5;
  });
  const [isCustomRatio, setIsCustomRatio] = useState<boolean>(() => {
    const saved = localStorage.getItem('app_is_custom_ratio');
    return saved === 'true';
  });
  const [customRatioInput, setCustomRatioInput] = useState<string>(() => {
    const saved = localStorage.getItem('app_custom_ratio_value');
    return saved || '';
  });
  const [futuresRatio, setFuturesRatio] = useState<number>(50);
  const [turnoverCoef, setTurnoverCoef] = useState<number>(3000);
  const [isCalculatingVolume, setIsCalculatingVolume] = useState<boolean>(false);
  const positionOpenTimesRef = useRef<{[key: string]: number}>({});
  const isInitialLoadCompletedRef = useRef(false);
  const hasFetchedPositionsRef = useRef(false);
  const previousActivePositionsRef = useRef<Position[]>([]);
  const [exchangeInfo, setExchangeInfo] = useState<any>(null);

  // Active Risk Control State
  const [activeRisk, setActiveRisk] = useState({
    enabled: false,
    tp: 3,
    sl: 5,
    tpCoef: 45,
    slCoef: 100,
  });

  const activeRiskRef = useRef(activeRisk);

  useEffect(() => {
    activeRiskRef.current = activeRisk;
  }, [activeRisk]);

  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return localStorage.getItem('global_mute_state') === 'true';
  });

  // Alarm Clock State & Persistent Settings (设置一次永久生效)
  const [alarmSettings, setAlarmSettings] = useState<AlarmSettings>(() => {
    try {
      const saved = localStorage.getItem('trading_terminal_alarm_settings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to parse saved alarm settings:', e);
    }
    return {
      enabled: true,
      alarms: [
        { id: 'preset_4h_0', time: '00:00', label: '4h换线', enabled: true, soundType: 'chime' },
        { id: 'preset_4h_1', time: '04:00', label: '4h换线', enabled: true, soundType: 'chime' },
        { id: 'preset_4h_2', time: '08:00', label: '4h换线/费率', enabled: true, soundType: 'chime' },
        { id: 'preset_4h_3', time: '12:00', label: '4h换线', enabled: true, soundType: 'chime' },
        { id: 'preset_4h_4', time: '16:00', label: '4h换线/费率', enabled: true, soundType: 'chime' },
        { id: 'preset_4h_5', time: '20:00', label: '4h换线', enabled: true, soundType: 'chime' },
      ],
      volume: 0.85,
      soundType: 'chime',
    };
  });

  const [isAlarmModalOpen, setIsAlarmModalOpen] = useState(false);
  const [isKellyModalOpen, setIsKellyModalOpen] = useState(false);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [verificationList, setVerificationList] = useState<string[]>(() => getLocalVerificationList());
  const [verificationAlert, setVerificationAlert] = useState<VerificationAlertState | null>(null);
  const [ringingAlarm, setRingingAlarm] = useState<AlarmItem | null>(null);
  const lastTriggeredMinuteRef = useRef<string>('');

  // 永久保存入场验证黑名单设置（本地缓存 + 服务端 SQLite settings 双重保障）
  const handleUpdateVerificationList = useCallback((newList: string[]) => {
    setVerificationList(newList);
    setLocalVerificationList(newList);
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryVerificationList: newList })
    }).catch(err => {
      console.error('Failed to save entry verification list to DB:', err);
    });
  }, []);

  // 永续合约持仓专属风控配置（时间风控、止盈/止损、条件风控）- 绑定账号维度持久化隔离
  const allAccountRiskConfigsRef = useRef<Record<string, Record<string, PositionRiskConfig>>>(getAllLocalPositionRiskConfigs());
  const previousActiveAccountRef = useRef<string>('');
  const [positionRiskConfigs, setPositionRiskConfigs] = useState<Record<string, PositionRiskConfig>>(() => getLocalPositionRiskConfigs());
  const [isPositionRiskModalOpen, setIsPositionRiskModalOpen] = useState(false);
  const [selectedRiskPosition, setSelectedRiskPosition] = useState<Position | null>(null);

  // 保存持仓专属风控配置（按当前登录账号绑定 + 本地多账号隔离缓存 + 服务端 SQLite settings 双重持久化）
  const handleSavePositionRiskConfig = useCallback((updated: PositionRiskConfig) => {
    const currentAccount = apiConfigRef.current?.accountName || 'default';
    setPositionRiskConfigs(prev => {
      const next = { ...prev, [updated.positionId]: updated };
      positionRiskConfigsRef.current = next;

      // 1. 本地存储：按当前登录账号持久化隔离
      saveLocalPositionRiskConfigs(next, currentAccount);

      // 2. 更新内存全局映射
      allAccountRiskConfigsRef.current[currentAccount] = next;
      saveAllLocalPositionRiskConfigs(allAccountRiskConfigsRef.current);

      // 3. 服务端 SQLite 持久化：保存所有账户字典及当前账户专属字段
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          accountPositionRiskConfigs: allAccountRiskConfigsRef.current,
          [`positionRiskConfigs_${currentAccount}`]: next,
          positionRiskConfigs: next // 保持向下兼容
        })
      }).catch(err => {
        console.error('Failed to sync position risk configs to DB:', err);
      });
      return next;
    });
    const tcStr = updated.timeControl?.enabled ? `${updated.timeControl.maxHoldMinutes}分钟` : '关';
    const tpStr = updated.tpSlControl?.tpEnabled ? `${updated.tpSlControl.tpPrice || updated.tpSlControl.tpPercent + '%'} (${updated.tpSlControl.tpMode})` : '关';
    const slStr = updated.tpSlControl?.slEnabled ? `${updated.tpSlControl.slPrice || updated.tpSlControl.slPercent + '%'} (${updated.tpSlControl.slMode})` : '关';
    addLogRef.current?.(`[风控设置] [账户: ${currentAccount}] 已保存 ${updated.symbol} (${updated.side === 'BUY' ? '多' : '空'}) 风控策略 (时间: ${tcStr}, 止盈: ${tpStr}, 止损: ${slStr})`, 'INFO', 'RISK_SETTING', updated.symbol);
    setTimeout(() => {
      checkPositionsRiskRef.current?.();
    }, 50);
  }, []);

  // Persist alarm settings on every change (永久生效)
  useEffect(() => {
    try {
      localStorage.setItem('trading_terminal_alarm_settings', JSON.stringify(alarmSettings));
    } catch (e) {
      console.warn('Failed to persist alarm settings:', e);
    }
  }, [alarmSettings]);

  // One-click toggle alarm master switch
  const handleToggleAlarmGlobal = () => {
    setAlarmSettings(prev => {
      const next = !prev.enabled;
      addLog(`[闹钟] 闹钟总开关已${next ? '开启 (已启动所有已设定的时刻监控)' : '关闭 (已暂停所有闹钟提醒)'}`, next ? 'SUCCESS' : 'INFO');
      return { ...prev, enabled: next };
    });
  };

  // Alarm Clock Ticker & Trigger Logic (每秒巡检，触发响铃)
  useEffect(() => {
    const checkAlarm = () => {
      if (!alarmSettings.enabled) return;

      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const currentMinute = `${h}:${m}`;

      // Avoid duplicate trigger within the same minute
      if (lastTriggeredMinuteRef.current === currentMinute) {
        return;
      }

      const activeAlarm = alarmSettings.alarms.find(
        a => a.enabled && a.time === currentMinute
      );

      if (activeAlarm) {
        lastTriggeredMinuteRef.current = currentMinute;
        setRingingAlarm(activeAlarm);
        playAlarmSound(activeAlarm.soundType || alarmSettings.soundType, alarmSettings.volume, isMuted);
        addLog(`[闹钟提醒] ⏰ ${activeAlarm.time} 闹钟触发: ${activeAlarm.label || '定时闹钟'}！`, 'TRADE');
      }
    };

    const interval = setInterval(checkAlarm, 1000);
    return () => clearInterval(interval);
  }, [alarmSettings, isMuted]);

  // Repeat sound periodically while alarm is ringing
  useEffect(() => {
    if (!ringingAlarm) return;

    let count = 0;
    const interval = setInterval(() => {
      count++;
      if (count >= 8) { // Auto-stop repeating after ~32 seconds
        stopAlarmSound();
        return;
      }
      playAlarmSound(ringingAlarm.soundType || alarmSettings.soundType, alarmSettings.volume, isMuted);
    }, 4000);

    return () => clearInterval(interval);
  }, [ringingAlarm, alarmSettings, isMuted]);

  // Dismiss ringing alarm
  const handleDismissAlarm = () => {
    stopAlarmSound();
    setRingingAlarm(null);
  };

  // Snooze 5 minutes
  const handleSnoozeAlarm = () => {
    stopAlarmSound();
    if (ringingAlarm) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 5);
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const snoozeTime = `${h}:${m}`;

      const snoozeItem: AlarmItem = {
        id: `snooze_${Date.now()}`,
        time: snoozeTime,
        label: `${ringingAlarm.label} (贪睡5分)`,
        enabled: true,
        soundType: ringingAlarm.soundType,
      };

      setAlarmSettings(prev => ({
        ...prev,
        alarms: [...prev.alarms, snoozeItem].sort((a, b) => a.time.localeCompare(b.time)),
      }));

      addLog(`[闹钟提醒] 已开启贪睡模式，将在 5 分钟后 (${snoozeTime}) 再次提醒`, 'INFO');
    }
    setRingingAlarm(null);
  };

  const [orderForm, setOrderForm] = useState<OrderForm>({
    symbol: 'BTCUSDT', // Binance Futures format
    side: 'BUY',
    type: 'MARKET',
    amount: 500,
  });

  const [positions, setPositions] = useState<Position[]>([]);
  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      const timeA = a.openTime || a.timestamp || 0;
      const timeB = b.openTime || b.timestamp || 0;
      return timeB - timeA;
    });
  }, [positions]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [isTrading, setIsTrading] = useState(false);

  // 实时行情价格字典 (依据本地 WebSocket 流，0 接口权重消耗，高频毫秒级推流/刷新)
  const { livePrices: sseLivePrices } = useMarketPrices();
  const [livePrices, setLivePrices] = useState<Record<string, { lastPrice: number; markPrice: number; change24h: number }>>({});
  const livePricesRef = useRef<Record<string, { lastPrice: number; markPrice: number; change24h: number }>>({});
  
  useEffect(() => {
    if (sseLivePrices && Object.keys(sseLivePrices).length > 0) {
      setLivePrices(prev => ({
        ...prev,
        ...sseLivePrices
      }));
    }
  }, [sseLivePrices]);

  useEffect(() => {
    livePricesRef.current = livePrices;
  }, [livePrices]);

  // 实时行情价格引擎：对活跃持仓币对及当前下单币对进行极速刷新 (500ms 轮询本地后端内存)
  useEffect(() => {
    let timer: any = null;
    let isCancelled = false;

    const fetchLivePrices = async () => {
      try {
        const symbolSet = new Set<string>();
        if (orderForm.symbol) {
          symbolSet.add(orderForm.symbol.trim().toUpperCase());
        }
        for (const p of positionsRef.current) {
          if (p.symbol) symbolSet.add(p.symbol.trim().toUpperCase());
        }

        const symbolsParam = Array.from(symbolSet).join(',');
        const url = symbolsParam ? `/api/market/live-prices?symbols=${encodeURIComponent(symbolsParam)}` : '/api/market/live-prices';

        const res = await fetch(url);
        if (res.ok && !isCancelled) {
          const data = await res.json();
          if (data && data.prices) {
            setLivePrices(prev => ({
              ...prev,
              ...data.prices
            }));
          }
        }
      } catch (e) {
        // Silent
      }
    };

    fetchLivePrices();
    timer = setInterval(fetchLivePrices, 500);

    return () => {
      isCancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [orderForm.symbol, positions.length]);
  
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>(() => {
    try {
      const saved = localStorage.getItem('trade_logs_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isAutoCleanLogs, setIsAutoCleanLogs] = useState<boolean>(() => {
    return localStorage.getItem('auto_clean_logs_enabled') === 'true';
  });
  const [autoCleanHours, setAutoCleanHours] = useState<number>(() => {
    const saved = localStorage.getItem('auto_clean_logs_hours');
    return saved ? parseInt(saved, 10) : 6;
  });

  useEffect(() => {
    localStorage.setItem('auto_clean_logs_enabled', String(isAutoCleanLogs));
  }, [isAutoCleanLogs]);

  useEffect(() => {
    localStorage.setItem('auto_clean_logs_hours', String(autoCleanHours));
  }, [autoCleanHours]);

  // Binance WebSocket User Data Stream connection state
  const [userStreamStatus, setUserStreamStatus] = useState<'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'RECONNECTING'>('DISCONNECTED');

  // 左侧栏宽度左右可拖拽调节
  const [tradeSidebarWidth, setTradeSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('app_trade_sidebar_width');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 280 && val <= 1100) return val;
      }
    } catch {}
    return 380; // 默认宽度 380px
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  const handleMouseDownResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
    const startX = e.clientX;
    const startWidth = tradeSidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const minW = 280;
      const maxW = Math.min(window.innerWidth * 0.65, 1000);
      const nextWidth = Math.round(Math.max(minW, Math.min(maxW, startWidth + deltaX)));
      setTradeSidebarWidth(nextWidth);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setIsResizingSidebar(false);
      const finalDelta = upEvent.clientX - startX;
      const minW = 280;
      const maxW = Math.min(window.innerWidth * 0.65, 1000);
      const finalWidth = Math.round(Math.max(minW, Math.min(maxW, startWidth + finalDelta)));
      try {
        localStorage.setItem('app_trade_sidebar_width', finalWidth.toString());
      } catch {}
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [tradeSidebarWidth]);

  const [balance, setBalance] = useState<AccountBalance>({
    asset: 'USDT',
    balance: 0,
    available: 0,
    unrealizedPnl: 0,
    spotBalance: 0,
    futuresBalance: 0
  });

  // Transfer States
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferType, setTransferType] = useState<'futures_to_spot' | 'spot_to_futures'>('spot_to_futures');
  const [transferAmount, setTransferAmount] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Calculate win/loss streaks for the chart
  const chartData = React.useMemo(() => {
    const streaks: any[] = [];
    if (positionHistory.length > 0) {
      // positionHistory is sorted by timestamp DESC (newest first)
      // We need to process from oldest to newest for streaks
      const sortedHistory = [...positionHistory].sort((a, b) => a.timestamp - b.timestamp);
      
      let currentStreak: any = null;
      
      sortedHistory.forEach((h) => {
        const isWin = h.pnl > 0;
        if (!currentStreak) {
          currentStreak = { isWin, count: 1 };
        } else if (currentStreak.isWin === isWin) {
          currentStreak.count++;
        } else {
          streaks.push(currentStreak);
          currentStreak = { isWin, count: 1 };
        }
      });
      if (currentStreak) streaks.push(currentStreak);
    }

    return streaks.map((s, idx) => ({
      name: idx + 1,
      count: s.count,
      isWin: s.isWin,
      color: s.isWin ? '#10B981' : '#EF4444'
    }));
  }, [positionHistory]);

  // 通过点击选择时段或点击分析主动对当前选中账户的“仓位历史记录”进行数据分析
  const handleAnalyzeTrend = useCallback((overrideTimeframe?: '1h' | '4h' | '1d' | '1w' | '1M') => {
    if (positionHistory.length === 0) {
      setTrendCandles([]);
      return;
    }

    const activeTimeframe = overrideTimeframe || trendTimeframe;

    // 按平仓时间/最后平仓时间进行升序排序
    const sorted = [...positionHistory].sort((a, b) => {
      const timeA = a.closeTime || a.timestamp || 0;
      const timeB = b.closeTime || b.timestamp || 0;
      return timeA - timeB;
    });

    let runningBalance = trendInitialBalance;
    const balancePoints = sorted.map(h => {
      runningBalance += (h.pnl || 0);
      return {
        time: h.closeTime || h.timestamp || 0,
        balance: runningBalance,
        pnl: h.pnl || 0
      };
    });

    // 格式化时间键函数
    const getGroupKey = (timestamp: number, tf: '1h' | '4h' | '1d' | '1w' | '1M') => {
      const d = new Date(timestamp);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const hours = d.getHours();
      
      if (tf === '1h') {
        return `${year}-${month}-${date} ${String(hours).padStart(2, '0')}:00`;
      } else if (tf === '4h') {
        const h4 = Math.floor(hours / 4) * 4;
        return `${year}-${month}-${date} ${String(h4).padStart(2, '0')}:00`;
      } else if (tf === '1d') {
        return `${year}-${month}-${date}`;
      } else if (tf === '1w') {
        const oneJan = new Date(year, 0, 1);
        const numberOfDays = Math.floor((d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
        const week = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
        return `${year}-W${String(week).padStart(2, '0')}`;
      } else {
        return `${year}-${month}`;
      }
    };

    const groupMap: Record<string, { balance: number; pnl: number; time: number }[]> = {};
    balancePoints.forEach(pt => {
      const key = getGroupKey(pt.time, activeTimeframe);
      if (!groupMap[key]) {
        groupMap[key] = [];
      }
      groupMap[key].push(pt);
    });

    const sortedGroupKeys = Object.keys(groupMap).sort((a, b) => a.localeCompare(b));
    const candlesList: any[] = [];
    let runningPrev = trendInitialBalance;

    sortedGroupKeys.forEach(key => {
      const pts = groupMap[key];
      const open = runningPrev;
      const close = pts[pts.length - 1].balance;
      const balances = pts.map(p => p.balance);
      const high = Math.max(open, close, ...balances);
      const low = Math.min(open, close, ...balances);
      const pnlSum = pts.reduce((sum, p) => sum + p.pnl, 0);

      const tradesCount = positionHistory.filter(item => {
        const itemOpenTime = item.openTime || item.timestamp || 0;
        return getGroupKey(itemOpenTime, activeTimeframe) === key;
      }).length;

      candlesList.push({
        name: key,
        open,
        high,
         low,
        close,
        range: [Math.min(open, close), Math.max(open, close)],
        pnlSum,
        count: pts.length,
        tradesCount
      });

      runningPrev = close; // 下一个区间的开盘是当前区间的收盘
    });

    setTrendCandles(candlesList);
    // 重置缩放区间为全幅，使得新图可以立刻完整地展示
    setTrendZoomInfo({ startIndex: 0, viewLen: candlesList.length });
  }, [positionHistory, trendInitialBalance, trendTimeframe]);

  // 当仓位交易历史、初始资金改变时，重置并清空走势分析 (不再进行自动分析)
  useEffect(() => {
    setTrendCandles([]);
  }, [positionHistory, trendInitialBalance]);

  // 可见区间的 K线 数据（支持缩放和游走）
  const visibleTrendCandles = React.useMemo(() => {
    if (trendCandles.length === 0) return [];
    let len = trendZoomInfo.viewLen;
    if (len <= 0 || len > trendCandles.length) {
      len = trendCandles.length;
    }
    let start = trendZoomInfo.startIndex;
    if (start < 0) start = 0;
    if (start + len > trendCandles.length) {
      start = Math.max(0, trendCandles.length - len);
    }
    return trendCandles.slice(start, start + len);
  }, [trendCandles, trendZoomInfo]);

  // 可见区间的 连续盈亏柱状图 数据（支持缩放和游走）
  const visibleStreakData = React.useMemo(() => {
    if (chartData.length === 0) return [];
    let len = streakZoomInfo.viewLen;
    if (len <= 0 || len > chartData.length) {
      len = chartData.length;
    }
    let start = streakZoomInfo.startIndex;
    if (start < 0) start = 0;
    if (start + len > chartData.length) {
      start = Math.max(0, chartData.length - len);
    }
    return chartData.slice(start, start + len);
  }, [chartData, streakZoomInfo]);

  const historyTotals = React.useMemo(() => {
    return positionHistory.reduce((acc, curr) => {
      acc.totalPnl += curr.pnl;
      acc.totalCommission += curr.commission;
      acc.totalFunding += curr.fundingFee;
      acc.totalTrades += 1;
      if (curr.pnl > 0) acc.wins += 1;
      return acc;
    }, { totalPnl: 0, totalCommission: 0, totalFunding: 0, wins: 0, totalTrades: 0 });
  }, [positionHistory]);

  // 走势分析鼠标滚轮监听
  useEffect(() => {
    const element = trendContainerRef.current;
    if (!element) return;
    
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      handleZoom(e.deltaY, trendCandles ? trendCandles.length : 0, setTrendZoomInfo);
    };
    
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
    };
  }, [trendCandles, handleZoom]);

  // 连续盈亏鼠标滚轮监听
  useEffect(() => {
    const element = streakContainerRef.current;
    if (!element) return;
    
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      handleZoom(e.deltaY, chartData ? chartData.length : 0, setStreakZoomInfo);
    };
    
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
    };
  }, [chartData, handleZoom]);

  // 键盘左右键监听（当鼠标悬浮在两个图表各自的容器内时）
  useEffect(() => {
    if (!isTrendHovered) return;
    
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePan('left', trendCandles ? trendCandles.length : 0, setTrendZoomInfo);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handlePan('right', trendCandles ? trendCandles.length : 0, setTrendZoomInfo);
      }
    };
    
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isTrendHovered, trendCandles, handlePan]);

  useEffect(() => {
    if (!isStreakHovered) return;
    
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePan('left', chartData ? chartData.length : 0, setStreakZoomInfo);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handlePan('right', chartData ? chartData.length : 0, setStreakZoomInfo);
      }
    };
    
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isStreakHovered, chartData, handlePan]);

  // Reset pagination on history changes
  useEffect(() => {
    setCurrentPage(1);
  }, [positionHistory]);

  const logEndRef = useRef<HTMLDivElement>(null);

  // Helper: Add Log
  const addLog = useCallback((
    message: string, 
    type: TradeLog['type'] = 'INFO',
    category?: TradeLogCategory,
    symbol?: string
  ) => {
    const info = detectTradeLogInfo({
      id: '',
      timestamp: Date.now(),
      type,
      message,
      category,
      symbol
    });

    const newLog: TradeLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      type,
      message,
      category: category || (info.isTrade ? info.category : undefined),
      symbol: symbol || info.symbol
    };

    setLogs(prev => {
      let updated = [newLog, ...prev];
      if (isAutoCleanLogs) {
        const threshold = Date.now() - autoCleanHours * 60 * 60 * 1000;
        updated = updated.filter(log => log.timestamp >= threshold);
      }
      return updated.slice(0, 500);
    });

    if (info.isTrade) {
      setTradeLogs(prev => {
        const updated = [newLog, ...prev.filter(l => l.id !== newLog.id)].slice(0, 500);
        try {
          localStorage.setItem('trade_logs_history', JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }
  }, [isAutoCleanLogs, autoCleanHours]);

  const handleClearTradeLogs = useCallback(() => {
    setTradeLogs([]);
    try {
      localStorage.removeItem('trade_logs_history');
    } catch {}
  }, []);

  // Periodic Log Auto-Cleanup
  useEffect(() => {
    if (!isAutoCleanLogs) return;

    const cleanup = () => {
      const threshold = Date.now() - autoCleanHours * 60 * 60 * 1000;
      setLogs(prev => {
        const afterClean = prev.filter(log => log.timestamp >= threshold);
        if (afterClean.length !== prev.length) {
          return afterClean;
        }
        return prev;
      });
    };

    cleanup();
    const interval = setInterval(cleanup, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [isAutoCleanLogs, autoCleanHours]);

  // 实时检测当前订单表单中的币对匹配状态
  const currentRiskMatch = useMemo(() => {
    return matchSymbolWithVerificationList(orderForm.symbol, verificationList);
  }, [orderForm.symbol, verificationList]);

  const currentPosMatch = useMemo(() => {
    return matchSymbolWithPositions(orderForm.symbol, positions);
  }, [orderForm.symbol, positions]);

  // 从监控榜单自动带入币对的核心校验处理（规则2与规则3）
  const handleSelectSymbolFromMonitoring = useCallback((sym: string) => {
    const formattedSym = sym.trim().toUpperCase();
    setOrderForm(prev => ({ ...prev, symbol: formattedSym }));
    addLog(`已通过行情中心选择并同步 ${formattedSym} 到合约执行面板`, 'SUCCESS');

    // 规则2: 与“入场验证名单”中的币对信息进行对比
    const riskMatch = matchSymbolWithVerificationList(formattedSym, verificationList);

    // 规则3: 与“当前持仓”中的币对信息进行对比
    const posMatch = matchSymbolWithPositions(formattedSym, positions);

    if (riskMatch.isMatched || posMatch.hasPosition) {
      setVerificationAlert({
        isRiskBlacklist: riskMatch.isMatched,
        matchedKeyword: riskMatch.matchedKeyword,
        hasPosition: posMatch.hasPosition,
        position: posMatch.position,
        symbol: formattedSym,
        timestamp: Date.now()
      });

      if (riskMatch.isMatched) {
        addLog(`[入场验证警示] ⚠️ 风险标的，请谨慎！币对 ${formattedSym} 命中入场验证名单 (匹配项: ${riskMatch.matchedKeyword})`, 'ERROR');
      }
      if (posMatch.hasPosition) {
        const sideDesc = posMatch.position?.side === 'BUY' ? '多单 (LONG)' : '空单 (SHORT)';
        addLog(`[持仓排重提示] ⚡ 已入场，注意重复下单！币对 ${formattedSym} 当前已有活跃持仓 (${sideDesc} 数量: ${posMatch.position?.amount})`, 'INFO');
      }
    } else {
      setVerificationAlert(null);
    }
  }, [verificationList, positions, addLog]);

  // Poll backend monitor logs to keep unified log console synchronized
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [res1, res2] = await Promise.all([
          fetch("/api/monitoring/logs"),
          fetch("/api/monitoring-4h/logs")
        ]);
        
        let allBackendLogs: any[] = [];

        if (res1.ok) {
          const text1 = await res1.text();
          if (text1 && !text1.trim().startsWith('<')) {
            try {
              const logs1 = JSON.parse(text1);
              if (Array.isArray(logs1)) allBackendLogs.push(...logs1);
            } catch (e) {}
          }
        }

        if (res2.ok) {
          const text2 = await res2.text();
          if (text2 && !text2.trim().startsWith('<')) {
            try {
              const logs2 = JSON.parse(text2);
              if (Array.isArray(logs2)) allBackendLogs.push(...logs2);
            } catch (e) {}
          }
        }

        if (allBackendLogs.length > 0) {
          setLogs(prev => {
            const prevIds = new Set(prev.map(l => l.id));
            const newLogs = allBackendLogs.filter((l: any) => !prevIds.has(l.id));
            if (newLogs.length === 0) return prev;
            
            let updated = [...newLogs, ...prev];
            if (isAutoCleanLogs) {
              const threshold = Date.now() - autoCleanHours * 60 * 60 * 1000;
              updated = updated.filter(log => log.timestamp >= threshold);
            }
            return updated.sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
          });
        }
      } catch (err) {
        // Silent ignore network errors during polling
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isAutoCleanLogs, autoCleanHours]);

  const fetchAvailableAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/position-history/accounts');
      if (res.ok) {
        const list: string[] = await res.json();
        setAvailableAccounts(prev => {
          if (prev.length === list.length && prev.every((item, idx) => item === list[idx])) {
            return prev;
          }
          return list;
        });
        setSelectedReportAccounts(prev => {
          if (prev.length === 0 && list.length > 0) {
            return list;
          }
          return prev;
        });
      }
    } catch (err) {
      console.error('Failed to fetch available accounts:', err);
    }
  }, []);

  const fetchSavedApiAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/api-credentials');
      if (res.ok) {
        const list = await res.json();
        setSavedApiAccounts(list);
      }
    } catch (err) {
      console.error('Failed to fetch saved API accounts:', err);
    }
  }, []);

  const loadPositionHistory = useCallback(async (accountStrOrArray?: string | string[]) => {
    try {
      const currentAvailable = availableAccountsRef.current;
      let targetAccounts: string[] = [];
      if (typeof accountStrOrArray === 'string') {
        targetAccounts = accountStrOrArray === 'ALL_ACCOUNTS' || accountStrOrArray === '' ? [] : [accountStrOrArray];
      } else if (Array.isArray(accountStrOrArray)) {
        targetAccounts = accountStrOrArray;
      } else {
        targetAccounts = selectedReportAccounts;
      }

      // 如果有可用账户但用户明确全部取消了勾选
      if (targetAccounts.length === 0 && currentAvailable.length > 0 && selectedReportAccounts.length === 0) {
        setPositionHistory([]);
        return;
      }

      let url = '/api/position-history';
      const isAll = currentAvailable.length === 0 || 
        targetAccounts.length === 0 || 
        (targetAccounts.length === currentAvailable.length && currentAvailable.every(a => targetAccounts.includes(a)));

      if (!isAll && targetAccounts.length > 0) {
        url += `?accounts=${encodeURIComponent(targetAccounts.join(','))}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const list = await res.json();
        setPositionHistory(list);
      }
    } catch (err) {
      console.error('Failed to load position history:', err);
    }
  }, [selectedReportAccounts]);

  // 1. 切换到 REPORT 标签时，拉取可用账户列表
  useEffect(() => {
    if (activeMainTab === 'REPORT') {
      fetchAvailableAccounts();
    }
  }, [activeMainTab, fetchAvailableAccounts]);

  // 2. 切换到 REPORT 标签或所选筛选账户变更时，拉取对应的仓位历史记录
  useEffect(() => {
    if (activeMainTab === 'REPORT') {
      loadPositionHistory();
    }
  }, [activeMainTab, selectedReportAccounts, loadPositionHistory]);

  const fetchExchangeInfo = async (apiKey?: string, apiSecret?: string) => {
    try {
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: '/fapi/v1/exchangeInfo',
          apiKey: apiKey || apiConfig.apiKey,
          apiSecret: apiSecret || apiConfig.apiSecret
        })
      });
      const data = await response.json();
      if (response.ok) {
        setExchangeInfo(data);
        addLog('交易对精度信息已同步', 'SUCCESS');
      }
    } catch (error) {
      addLog('获取交易对精度信息失败', 'ERROR');
    }
  };

  const getSymbolInfo = (symbol: string) => {
    if (!exchangeInfo || !exchangeInfo.symbols) return null;
    return exchangeInfo.symbols.find((s: any) => s.symbol === symbol);
  };

  const formatPrice = (symbol: string, price: number) => {
    if (price == null || isNaN(price)) return '0';
    const info = getSymbolInfo(symbol);
    if (!info) return String(price);
    
    const priceFilter = info.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
    if (priceFilter) {
      const tickSize = parseFloat(priceFilter.tickSize);
      const roundedPrice = Math.round(price / tickSize) * tickSize;
      return roundedPrice.toFixed(info.pricePrecision);
    }
    
    return price.toFixed(info.pricePrecision);
  };

  const formatQty = (symbol: string, qty: number) => {
    if (qty == null || isNaN(qty)) return '0';
    const info = getSymbolInfo(symbol);
    if (!info) return String(qty);
    
    const lotSizeFilter = info.filters.find((f: any) => f.filterType === 'LOT_SIZE');
    if (lotSizeFilter) {
      const stepSize = parseFloat(lotSizeFilter.stepSize);
      const roundedQty = Math.round(qty / stepSize) * stepSize; // Use round for closest quantity as requested
      return roundedQty.toFixed(info.quantityPrecision);
    }
    
    return qty.toFixed(info.quantityPrecision);
  };

  const formatDateTime = (ts?: number) => {
    if (!ts || isNaN(ts)) return '-';
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const mins = pad(d.getMinutes());
    const secs = pad(d.getSeconds());
    return `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
  };

  // Auto-scroll logs
  useEffect(() => {
    // We don't necessarily want to scroll to bottom if they are looking at old logs, 
    // but for a trading terminal, usually we want the newest at the top or bottom.
    // Here I'm putting newest at the top, so no scroll needed.
  }, [logs]);

  // Fetch Server IP manually on active click
  const handleFetchIp = useCallback(async () => {
    if (isQueryingIp) return;
    setIsQueryingIp(true);
    addLog('正在手动发起服务器 IP 查询...', 'INFO');
    try {
      const res = await fetch('/api/server-info');
      if (res.ok) {
        const data = await res.json();
        setServerIp(data.ip);
        addLog(`服务器 IP 查询成功: ${data.ip}`, 'SUCCESS');
      } else {
        throw new Error('IP API returned non-ok response');
      }
    } catch (err) {
      setServerIp('127.0.0.1');
      addLog('手动查询 IP 失败，已使用回退本地地址', 'ERROR');
    } finally {
      setIsQueryingIp(false);
    }
  }, [addLog, isQueryingIp]);

  // Unified Login / Verification Function
  const performLogin = useCallback(async (configToVerify: ApiConfig, isAutoLogin = false) => {
    if (!configToVerify.accountName) {
      if (!isAutoLogin) addLog('验证失败: 请输入账户名称 (例如: 主账号)', 'ERROR');
      return false;
    }
    if (!configToVerify.apiKey || !configToVerify.apiSecret) {
      if (!isAutoLogin) addLog('验证失败: 请先输入 API Key 和 Secret', 'ERROR');
      return false;
    }

    setIsVerifying(true);
    if (!isAutoLogin) {
      addLog('正在尝试连接币安永续合约服务器...', 'INFO');
    } else {
      addLog(`正在保持登录状态，自动连接币安账户 [${configToVerify.accountName}]...`, 'INFO');
    }

    try {
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: '/fapi/v2/account',
          apiKey: configToVerify.apiKey,
          apiSecret: configToVerify.apiSecret
        })
      });

      const data = await response.json();

      if (response.ok) {
        setIsConnected(true);
        const accName = configToVerify.accountName;

        // 关键：切换/登录账号时，重置持仓比对防误触，并加载绑定至该账号的风控设置
        hasFetchedPositionsRef.current = false;
        previousActivePositionsRef.current = [];
        previousActiveAccountRef.current = accName;
        positionsRef.current = [];

        const accRiskConfigs = allAccountRiskConfigsRef.current[accName] || getLocalPositionRiskConfigs(accName) || {};
        setPositionRiskConfigs(accRiskConfigs);
        positionRiskConfigsRef.current = accRiskConfigs;

        fetchExchangeInfo(configToVerify.apiKey, configToVerify.apiSecret);
        
        let spotVal = 0;
        try {
          const spotResponse = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: '/api/v3/account',
              baseUrl: 'https://api.binance.com',
              apiKey: configToVerify.apiKey,
              apiSecret: configToVerify.apiSecret
            })
          });
          if (spotResponse.ok) {
            const spotData = await spotResponse.json();
            if (spotData && Array.isArray(spotData.balances)) {
              const usdtSpot = spotData.balances.find((b: any) => b.asset === 'USDT');
              if (usdtSpot) {
                spotVal = parseFloat(usdtSpot.free) + parseFloat(usdtSpot.locked);
              }
            }
          }
        } catch (spotErr) {
          console.error('Failed to fetch spot balance during validation:', spotErr);
        }

        const usdtAsset = data.assets?.find((a: any) => a.asset === 'USDT');
        if (usdtAsset) {
          const futuresVal = parseFloat(usdtAsset.walletBalance);
          setBalance({
            asset: 'USDT',
            balance: spotVal + futuresVal,
            available: parseFloat(usdtAsset.availableBalance),
            unrealizedPnl: parseFloat(usdtAsset.unrealizedProfit),
            spotBalance: spotVal,
            futuresBalance: futuresVal
          });
        }

        // Auto-detect Position Mode (Hedge or One-way)
        try {
          const modeResponse = await fetch('/api/binance-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: '/fapi/v1/positionSide/dual',
              apiKey: configToVerify.apiKey,
              apiSecret: configToVerify.apiSecret
            })
          });
          const modeData = await modeResponse.json();
          if (modeResponse.ok) {
            const isHedge = modeData.dualSidePosition;
            setPositionMode(isHedge ? 'HEDGE' : 'ONE_WAY');
            addLog(`持仓模式已同步: ${isHedge ? '双向持仓 (Hedge)' : '单向持仓 (One-way)'}`, 'INFO');
          }
        } catch (e) {
          console.error('Failed to sync position mode');
        }

        addLog(`连接成功: 币安 API 验证通过${isAutoLogin ? ' (已默认保持登录状态)' : ''}`, 'SUCCESS');
        addLog(`账户余额已同步: ${usdtAsset?.walletBalance || '0'} USDT`, 'INFO');

        // 默认自动保存账户名称和api信息到本地数据库，且默认保持登录状态
        try {
          const fullConfigToSave = {
            accountName: configToVerify.accountName,
            apiKey: configToVerify.apiKey,
            apiSecret: configToVerify.apiSecret,
            baseUrl: configToVerify.baseUrl || 'https://fapi.binance.com'
          };

          // 1. 保存至 api_credentials 本地数据库表
          await fetch('/api/api-credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullConfigToSave)
          });
          fetchSavedApiAccounts();

          // 2. 保存至 settings 本地数据库表，确保刷新或重登时保持登录
          await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiConfig: fullConfigToSave
            })
          });

          if (!isAutoLogin) {
            addLog(`账户 [${configToVerify.accountName}] 及 API 信息已自动保存至本地数据库，默认保持登录`, 'SUCCESS');
          }
        } catch (saveErr) {
          console.error('Failed to auto-save api credentials on verification:', saveErr);
        }

        return true;
      } else {
        setIsConnected(false);
        addLog(`连接失败: ${data.msg || data.error || '未知错误'}`, 'ERROR');
        return false;
      }
    } catch (error) {
      setIsConnected(false);
      addLog('网络异常: 无法连接到代理服务器', 'ERROR');
      return false;
    } finally {
      setIsVerifying(false);
    }
  }, [addLog, fetchSavedApiAccounts]);

  const performLoginRef = useRef(performLogin);
  useEffect(() => {
    performLoginRef.current = performLogin;
  }, [performLogin]);

  // Load configuration and position history from SQLite database on mount
  useEffect(() => {
    let active = true;
    
    const loadFromDb = async () => {
      try {
        // 1. Fetch system settings
        const settingsRes = await fetch('/api/settings');
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (!active) return;
          
          if (settings.accountPositionRiskConfigs && typeof settings.accountPositionRiskConfigs === 'object') {
            allAccountRiskConfigsRef.current = {
              ...allAccountRiskConfigsRef.current,
              ...settings.accountPositionRiskConfigs
            };
            saveAllLocalPositionRiskConfigs(allAccountRiskConfigsRef.current);
          }
          // 扫描并合并任何以 positionRiskConfigs_ 为前缀的账号专属配置
          Object.keys(settings).forEach(key => {
            if (key.startsWith('positionRiskConfigs_')) {
              const acc = key.replace('positionRiskConfigs_', '');
              if (acc && typeof settings[key] === 'object') {
                allAccountRiskConfigsRef.current[acc] = settings[key];
                saveLocalPositionRiskConfigs(settings[key], acc);
              }
            }
          });

          if (settings.positionRiskConfigs && typeof settings.positionRiskConfigs === 'object') {
            const currentAcc = settings.apiConfig?.accountName || 'default';
            if (!allAccountRiskConfigsRef.current[currentAcc]) {
              allAccountRiskConfigsRef.current[currentAcc] = settings.positionRiskConfigs;
            }
          }

          if (settings.apiConfig) {
            setApiConfig(settings.apiConfig);
            addLog('从本地数据库 [settings 表] 成功加载了 API 配置以及代理端点', 'SUCCESS');

            const accName = settings.apiConfig.accountName;
            if (accName) {
              const accConfigs = allAccountRiskConfigsRef.current[accName] || getLocalPositionRiskConfigs(accName);
              if (accConfigs && Object.keys(accConfigs).length > 0) {
                setPositionRiskConfigs(accConfigs);
                positionRiskConfigsRef.current = accConfigs;
              }
            }

            // 默认保持登录状态：若本地数据库已存有 API 信息，则自动恢复登录状态
            if (settings.apiConfig.accountName && settings.apiConfig.apiKey && settings.apiConfig.apiSecret) {
              performLoginRef.current(settings.apiConfig, true);
            }
          }
          if (settings.activeRisk) {
            setActiveRisk(settings.activeRisk);
            addLog(`从本地数据库 [settings 表] 成功加载了止盈/止损及风控参数 (止盈: ${settings.activeRisk.tp}%, 止损: ${settings.activeRisk.sl}%)`, 'SUCCESS');
          }
          if (settings.rateLimitDelay !== undefined) {
            setRateLimitDelay(settings.rateLimitDelay);
          }
          if (settings.leverage !== undefined) {
            setLeverage(settings.leverage);
          }
          if (settings.futuresRatio !== undefined) {
            setFuturesRatio(settings.futuresRatio);
          }
          if (settings.turnoverCoef !== undefined) {
            setTurnoverCoef(settings.turnoverCoef);
          }
          if (settings.kValue !== undefined) {
            setKValue(settings.kValue);
          }
          if (settings.zValue !== undefined) {
            setZValue(settings.zValue);
          }
          if (settings.entryEntity !== undefined) {
            setEntryEntity(settings.entryEntity);
          }
          if (settings.entryEntityRatio !== undefined) {
            setEntryEntityRatio(settings.entryEntityRatio);
          }
          if (settings.entryVerificationList && Array.isArray(settings.entryVerificationList)) {
            setVerificationList(settings.entryVerificationList);
            setLocalVerificationList(settings.entryVerificationList);
            addLog(`从本地数据库 [settings 表] 成功同步了 ${settings.entryVerificationList.length} 个入场验证名单标的`, 'INFO');
          }
        }
        
        // 2. Fetch position history database
        const historyRes = await fetch('/api/position-history');
        if (historyRes.ok) {
          const historyList = await historyRes.json();
          if (!active) return;
          if (Array.isArray(historyList) && historyList.length > 0) {
            setPositionHistory(historyList);
            addLog(`从本地数据库 [position_history 表] 成功加载了 ${historyList.length} 条已闭环的历史仓位及财务报表`, 'SUCCESS');
          }
        }
        // Load available accounts
        fetchAvailableAccounts();
        fetchSavedApiAccounts();
      } catch (err) {
        console.error('Failed to load initial settings / history from DB:', err);
      } finally {
        if (active) {
          isInitialLoadCompletedRef.current = true;
        }
      }
    };
    
    loadFromDb();
    
    return () => {
      active = false;
    };
  }, [addLog, fetchAvailableAccounts, fetchSavedApiAccounts]);

  // Debounced auto-save of configuration & parameters to SQLite
  useEffect(() => {
    if (!isInitialLoadCompletedRef.current) return;
    
    const timer = setTimeout(() => {
      fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiConfig,
          activeRisk,
          rateLimitDelay,
          leverage,
          futuresRatio,
          turnoverCoef,
          kValue,
          zValue,
          entryEntity,
          entryEntityRatio,
          entryVerificationList: verificationList
        })
      })
      .then(res => {
        if (!res.ok) throw new Error('Network response not ok');
      })
      .catch(err => {
        console.error('Failed to autosave settings to database:', err);
      });
    }, 1500); // 1.5s debounce to group setting adjustments
    
    return () => clearTimeout(timer);
  }, [apiConfig, activeRisk, rateLimitDelay, leverage, futuresRatio, turnoverCoef, kValue, zValue, entryEntity, entryEntityRatio, verificationList]);

  // API Verification
  const handleVerifyConnection = async () => {
    await performLogin(apiConfig, false);
  };

  // 退出当前账号登录状态，并清空api信息
  const handleLogout = async () => {
    setIsConnected(false);
    setIsVerifying(false);

    // 重置持仓缓存与账号追踪，防止跨账号误触发平仓清理
    hasFetchedPositionsRef.current = false;
    previousActivePositionsRef.current = [];
    previousActiveAccountRef.current = '';
    positionsRef.current = [];

    const clearedConfig: ApiConfig = {
      accountName: '',
      apiKey: '',
      apiSecret: '',
      baseUrl: 'https://fapi.binance.com'
    };
    setApiConfig(clearedConfig);

    // 清空财务余额/仓位/委托
    setBalance({
      asset: 'USDT',
      balance: 0,
      available: 0,
      unrealizedPnl: 0,
      spotBalance: 0,
      futuresBalance: 0
    });
    setPositions([]);
    setOpenOrders([]);
    setPositionRiskConfigs({});
    positionRiskConfigsRef.current = {};

    // 同步清空本地数据库 settings 表中当前活跃的 apiConfig
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiConfig: clearedConfig
        })
      });
    } catch (err) {
      console.error('Failed to clear settings on logout:', err);
    }

    addLog('已退出当前账号登录状态，并已清空 API 信息', 'INFO');
  };

  // Fetch Balance Helper
  const handleFetchBalance = useCallback(async () => {
    if (!isConnected) return;
    try {
      // 1. Fetch futures balance
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: '/fapi/v2/balance',
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });
      const data = await response.json();

      // 2. Fetch spot balance
      let spotVal = 0;
      try {
        const spotResponse = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/api/v3/account',
            baseUrl: 'https://api.binance.com',
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });
        if (spotResponse.ok) {
          const spotData = await spotResponse.json();
          if (spotData && Array.isArray(spotData.balances)) {
            const usdtSpot = spotData.balances.find((b: any) => b.asset === 'USDT');
            if (usdtSpot) {
              spotVal = parseFloat(usdtSpot.free) + parseFloat(usdtSpot.locked);
            }
          }
        }
      } catch (spotErr) {
        // Silent catch
      }

      if (response.ok && Array.isArray(data)) {
        const usdtBalance = data.find((b: any) => b.asset === 'USDT');
        if (usdtBalance) {
          const futuresVal = parseFloat(usdtBalance.balance);
          setBalance({
            asset: 'USDT',
            balance: spotVal + futuresVal,
            available: parseFloat(usdtBalance.availableBalance),
            unrealizedPnl: parseFloat(usdtBalance.crossUnPnl),
            spotBalance: spotVal,
            futuresBalance: futuresVal
          });
        }
      }
    } catch (error) {
      // Silent fail
    }
  }, [isConnected, apiConfig.apiKey, apiConfig.apiSecret]);

  // Periodic Balance Refresh (Fallback calibration, real-time balance is pushed via WebSocket ACCOUNT_UPDATE)
  useEffect(() => {
    if (!isConnected) return;
    handleFetchBalance();
    const interval = setInterval(handleFetchBalance, 30000);
    return () => clearInterval(interval);
  }, [isConnected, handleFetchBalance]);

  // Handle Account Transfer (Spot <-> Futures)
  const handleTransfer = async () => {
    const amountVal = parseFloat(transferAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      addLog('[划转] 请输入合法的划转金额', 'ERROR');
      return;
    }

    // Check balances
    if (transferType === 'futures_to_spot') {
      const sourceBalance = balance.futuresBalance || 0;
      if (amountVal > sourceBalance) {
        addLog('[划转] 余额不足，转入失败', 'ERROR');
        alert('余额不足，转入失败');
        return;
      }
    } else {
      const sourceBalance = balance.spotBalance || 0;
      if (amountVal > sourceBalance) {
        addLog('[划转] 余额不足，转入失败', 'ERROR');
        alert('余额不足，转入失败');
        return;
      }
    }

    setIsTransferring(true);
    addLog(`[划转] 正在提交划转请求: ${transferType === 'futures_to_spot' ? '合约 -> 现货' : '现货 -> 合约'} ${amountVal} USDT...`, 'INFO');

    try {
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'POST',
          endpoint: '/sapi/v1/asset/transfer',
          baseUrl: 'https://api.binance.com',
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret,
          params: {
            type: transferType === 'futures_to_spot' ? 'UMFUTURE_MAIN' : 'MAIN_UMFUTURE',
            asset: 'USDT',
            amount: amountVal.toString()
          }
        })
      });

      const data = await response.json();
      if (response.ok && (data.tranId || data.status === 'success' || data.tranId !== undefined)) {
        addLog(`[划转] 划转成功！划转金额: ${amountVal} USDT`, 'SUCCESS');
        setIsTransferModalOpen(false);
        setTransferAmount('');
        await handleFetchBalance();
      } else {
        const errMsg = data.msg || data.error || JSON.stringify(data);
        if (errMsg.includes('balance') || errMsg.includes('insufficient') || errMsg.includes('Balance')) {
          addLog('[划转] 余额不足，转入失败', 'ERROR');
          alert('余额不足，转入失败');
        } else {
          addLog(`[划转] 划转失败: ${errMsg}`, 'ERROR');
          alert(`划转失败: ${errMsg}`);
        }
      }
    } catch (err: any) {
      addLog(`[划转] 划转请求异常: ${err.message}`, 'ERROR');
      alert(`划转异常: ${err.message}`);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleCancelOrdersBySymbolRef = useRef<(symbol: string) => Promise<void>>(async () => {});
  const handleClosePositionRef = useRef<(id: string, currentPositions?: Position[], reason?: string) => Promise<void>>(async () => {});
  const checkPositionsRiskRef = useRef<() => void>(() => {});
  const closingPositionIdsRef = useRef<Set<string>>(new Set());
  const recentlyClosedPosIdsRef = useRef<Map<string, number>>(new Map());

  const positionsRef = useRef<Position[]>(positions);
  const positionRiskConfigsRef = useRef<Record<string, PositionRiskConfig>>(positionRiskConfigs);
  const isConnectedRef = useRef<boolean>(isConnected);
  const apiConfigRef = useRef<ApiConfig>(apiConfig);
  const addLogRef = useRef(addLog);

  useEffect(() => {
    positionsRef.current = positions;
    positionRiskConfigsRef.current = positionRiskConfigs;
    isConnectedRef.current = isConnected;
    apiConfigRef.current = apiConfig;
    addLogRef.current = addLog;
    handleCancelOrdersBySymbolRef.current = handleCancelOrdersBySymbol;
    handleClosePositionRef.current = handleClosePosition;
    checkPositionsRiskRef.current = checkPositionsRisk;
  });

  // Hybrid WebSocket User Data Stream & Calibration Engine
  useEffect(() => {
    if (!isConnected || !apiConfig.apiKey || !apiConfig.apiSecret) {
      setUserStreamStatus('DISCONNECTED');
      return;
    }

    const currentAccount = apiConfig.accountName || 'default';

    // 1. REST Baseline Snapshot & Calibration Fetcher
    const fetchSnapshot = async () => {
      try {
        const posPromise = fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v2/positionRisk',
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        const ordersPromise = fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v1/openOrders',
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        const algoPromise = fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v1/openAlgoOrders',
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        const [posRes, ordersRes, algoRes] = await Promise.all([posPromise, ordersPromise, algoPromise]);
        
        let mappedPositions: Position[] = [];
        
        if (posRes.ok) {
          const data = await posRes.json();
          if (Array.isArray(data)) {
            const now = Date.now();
            // 清理已过期的 15s 平仓防干涉记录
            for (const [id, time] of recentlyClosedPosIdsRef.current.entries()) {
              if (now - time > 15000) {
                recentlyClosedPosIdsRef.current.delete(id);
              }
            }

            const currentActivePositions = data.filter((p: any) => {
              const amt = parseFloat(p.positionAmt);
              if (amt === 0) return false;
              const posId = p.symbol + p.positionSide;
              // 如果该持仓在 15 秒内已经被 WebSocket 实时通知平仓归零，直接过滤，防止币安 REST API 从库延迟的旧缓存重新将已平仓位拉回
              if (recentlyClosedPosIdsRef.current.has(posId) || recentlyClosedPosIdsRef.current.has(p.symbol)) {
                return false;
              }
              return true;
            });

            mappedPositions = currentActivePositions.map((p: any) => {
              const amount = Math.abs(parseFloat(p.positionAmt));
              const entryPrice = parseFloat(p.entryPrice);
              const markPrice = parseFloat(p.markPrice);
              const pnl = parseFloat(p.unRealizedProfit);
              const pnlPercent = (entryPrice * amount > 0) ? (pnl / (entryPrice * amount)) * 100 : 0;
              const posId = p.symbol + p.positionSide;

              let posOpenTime = positionOpenTimesRef.current[posId];
              if (!posOpenTime) {
                posOpenTime = (p.updateTime && Number(p.updateTime) > 0) ? Number(p.updateTime) : Date.now();
                positionOpenTimesRef.current[posId] = posOpenTime;
              }

              return {
                id: posId,
                symbol: p.symbol,
                side: parseFloat(p.positionAmt) > 0 ? 'BUY' : 'SELL',
                positionSide: p.positionSide,
                entryPrice,
                markPrice,
                amount,
                pnl,
                pnlPercent,
                timestamp: Date.now(),
                openTime: posOpenTime
              };
            });

            // 按照开仓时间由近至远从上往下排列（最新开仓在顶部）
            mappedPositions.sort((a, b) => {
              const timeA = a.openTime || a.timestamp || 0;
              const timeB = b.openTime || b.timestamp || 0;
              return timeB - timeA;
            });

            setPositions(mappedPositions);
            positionsRef.current = mappedPositions;
            checkPositionsRiskRef.current?.();

            // Check if any position got closed
            if (previousActiveAccountRef.current !== currentAccount) {
              previousActiveAccountRef.current = currentAccount;
              previousActivePositionsRef.current = mappedPositions;
              hasFetchedPositionsRef.current = true;
            } else if (hasFetchedPositionsRef.current) {
              const prevPositions = previousActivePositionsRef.current;
              const currentIds = new Set(mappedPositions.map(p => p.id));
              const prevIds = new Set(prevPositions.map(p => p.id));

              // 检测新增开仓单并输出日志
              const newPositions = mappedPositions.filter(p => !prevIds.has(p.id));
              if (newPositions.length > 0) {
                addLog(`[REST轮询兜底] 检测到外部新开仓单同步: ${newPositions.map(p => `${p.symbol} (${p.side === 'BUY' ? '多' : '空'} 数量: ${p.amount})`).join(', ')}，已同步渲染至持仓列表`, 'SUCCESS');
              }

              // 检测已平仓单并自动清理挂单
              const closedPositions = prevPositions.filter(p => !currentIds.has(p.id));
              if (closedPositions.length > 0) {
                const closedSymbols = Array.from(new Set(closedPositions.map(p => p.symbol)));
                addLog(`[REST轮询自愈] 检测到持仓单平仓完成（商品: ${closedPositions.map(p => `${p.symbol} ${p.side === 'BUY' ? '多' : '空'}`).join(', ')}），正在精准清理对应币对 [${closedSymbols.join(', ')}] 的遗留挂单(包括算法单与普通单)...`, 'SUCCESS');
                for (const sym of closedSymbols) {
                  handleCancelOrdersBySymbolRef.current(sym);
                }
                // 同步清理已平仓持仓专属风控配置
                setPositionRiskConfigs(prev => {
                  let changed = false;
                  const next = { ...prev };
                  for (const cp of closedPositions) {
                    if (next[cp.id]) {
                      delete next[cp.id];
                      changed = true;
                    }
                  }
                  if (changed) {
                    if (allAccountRiskConfigsRef.current[currentAccount]) {
                      allAccountRiskConfigsRef.current[currentAccount] = next;
                    }
                    saveLocalPositionRiskConfigs(next, currentAccount);
                    saveAllLocalPositionRiskConfigs(allAccountRiskConfigsRef.current);
                    fetch('/api/settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        accountPositionRiskConfigs: allAccountRiskConfigsRef.current,
                        [`positionRiskConfigs_${currentAccount}`]: next
                      })
                    }).catch(() => {});
                    return next;
                  }
                  return prev;
                });
              }
              previousActivePositionsRef.current = mappedPositions;
            } else {
              hasFetchedPositionsRef.current = true;
              previousActivePositionsRef.current = mappedPositions;
            }
          }
        }

        let combinedOrders: OpenOrder[] = [];

        if (ordersRes.ok) {
          const normalOrders = await ordersRes.json();
          if (Array.isArray(normalOrders)) {
            combinedOrders = [...combinedOrders, ...normalOrders.map((o: any) => ({
              id: String(o.orderId ?? o.id ?? Math.random()),
              symbol: o.symbol,
              side: o.side,
              type: o.type,
              price: parseFloat(o.price),
              stopPrice: parseFloat(o.stopPrice),
              isAlgo: false,
              time: Number(o.time || o.updateTime || Date.now()),
              positionSide: o.positionSide
            }))];
          }
        }

        if (algoRes.ok) {
          const algoData = await algoRes.json();
          const algoOrders = Array.isArray(algoData) ? algoData : (algoData.orders || algoData.algoOrders || []);
          if (Array.isArray(algoOrders)) {
            combinedOrders = [...combinedOrders, ...algoOrders.map((o: any) => ({
              id: String(o.algoId ?? o.clientAlgoId ?? o.id ?? Math.random()),
              symbol: o.symbol,
              side: o.side,
              type: o.algoType || o.type,
              price: parseFloat(o.price || 0),
              stopPrice: parseFloat(o.stopPrice || o.triggerPrice || 0),
              isAlgo: true,
              time: Number(o.time || o.createTime || o.updateTime || Date.now()),
              positionSide: o.positionSide
            }))];
          }
        }

        const sortedOrders = combinedOrders.sort((a, b) => b.time - a.time);
        setOpenOrders(sortedOrders);

        // Always clean up refs for closed positions
        const currentIds = new Set(mappedPositions.map(p => p.id));
        Object.keys(positionOpenTimesRef.current).forEach(id => {
          if (!currentIds.has(id)) {
            delete positionOpenTimesRef.current[id];
          }
        });
      } catch (error) {
        // Silent fail for background calibration
      }
    };

    // 2. Delta Event Handlers for WebSocket Stream
    const handleAccountDeltaUpdate = (accountData: any) => {
      const reason = accountData.m; // 'DEPOSIT', 'WITHDRAW', 'ORDER', 'FUNDING_FEE', etc.

      // 2.1 Update balance deltas
      if (accountData.B && Array.isArray(accountData.B)) {
        const usdtBalance = accountData.B.find((b: any) => b.a === 'USDT');
        if (usdtBalance) {
          const wb = parseFloat(usdtBalance.wb || '0');
          const cw = parseFloat(usdtBalance.cw || usdtBalance.wb || '0');
          setBalance(prev => ({
            ...prev,
            balance: wb + (prev.spotBalance || 0),
            available: cw,
            futuresBalance: wb
          }));
        }
      }

      // 2.1.1 资金划转事件主动联动：当监听到出入金/资金划转类型事件时，立刻主动触发全量财务(现货/总资产/可用保证金)极速刷新
      const isTransferEvent = reason === 'DEPOSIT' || reason === 'WITHDRAW' || (typeof reason === 'string' && reason.includes('TRANSFER'));
      if (isTransferEvent) {
        const transferDesc = reason === 'DEPOSIT' ? '划入合约' : reason === 'WITHDRAW' ? '划出合约' : reason;
        addLog(`[WS私有流推流⚡] 检测到资金划转事件 (${transferDesc})，已秒级更新合约余额，并主动触发现货/总资产/可用保证金极速同步`, 'SUCCESS');
        handleFetchBalance();
        // 800ms 后二次校验，确保币安现货账本结算完全入账
        setTimeout(() => {
          handleFetchBalance();
        }, 800);
      }

      // 2.2 Update position deltas
      if (accountData.P && Array.isArray(accountData.P)) {
        let hasChanges = false;
        const currentList = [...positionsRef.current];

        for (const p of accountData.P) {
          const symbol = p.s;
          const posSide = p.ps || 'BOTH';
          const posId = symbol + posSide;
          const amountAmt = parseFloat(p.pa || '0');
          const existingIndex = currentList.findIndex(item => 
            item.id === posId || 
            (item.symbol === symbol && (item.positionSide === posSide || item.positionSide === 'BOTH' || posSide === 'BOTH'))
          );

          if (amountAmt === 0) {
            // Position Closed
            recentlyClosedPosIdsRef.current.set(posId, Date.now());
            recentlyClosedPosIdsRef.current.set(symbol, Date.now());

            if (existingIndex !== -1) {
              const closedPos = currentList[existingIndex];
              currentList.splice(existingIndex, 1);
              hasChanges = true;

              addLog(`[WS私有流推流⚡] 检测到持仓单平仓归零: ${closedPos.symbol} (${closedPos.side === 'BUY' ? '多' : '空'})，立即执行挂单精准清扫自愈...`, 'SUCCESS');
              handleCancelOrdersBySymbolRef.current(closedPos.symbol);

              // Remove position risk config
              setPositionRiskConfigs(prev => {
                if (!prev[posId] && !prev[closedPos.id]) return prev;
                const next = { ...prev };
                delete next[posId];
                delete next[closedPos.id];
                if (allAccountRiskConfigsRef.current[currentAccount]) {
                  allAccountRiskConfigsRef.current[currentAccount] = next;
                }
                saveLocalPositionRiskConfigs(next, currentAccount);
                saveAllLocalPositionRiskConfigs(allAccountRiskConfigsRef.current);
                return next;
              });
            }
          } else {
            // Position Opened or Size Updated
            recentlyClosedPosIdsRef.current.delete(posId);
            recentlyClosedPosIdsRef.current.delete(symbol);

            const amount = Math.abs(amountAmt);
            const entryPrice = parseFloat(p.ep || '0');
            const pnl = parseFloat(p.up || '0');
            const pnlPercent = (entryPrice * amount > 0) ? (pnl / (entryPrice * amount)) * 100 : 0;
            const side = amountAmt > 0 ? 'BUY' : 'SELL';

            let posOpenTime = positionOpenTimesRef.current[posId] || (existingIndex !== -1 ? currentList[existingIndex].openTime : Date.now());
            positionOpenTimesRef.current[posId] = posOpenTime;

            const updatedPosition: Position = {
              id: posId,
              symbol,
              side,
              positionSide: posSide,
              entryPrice,
              markPrice: existingIndex !== -1 ? currentList[existingIndex].markPrice : entryPrice,
              amount,
              pnl,
              pnlPercent,
              timestamp: Date.now(),
              openTime: posOpenTime
            };

            if (existingIndex !== -1) {
              const oldAmt = currentList[existingIndex].amount;
              currentList[existingIndex] = {
                ...currentList[existingIndex],
                ...updatedPosition
              };
              addLog(`[WS私有流推流⚡] 检测到外部持仓仓位变动: ${symbol} (${side === 'BUY' ? '多' : '空'}), 数量变动: ${oldAmt} -> ${amount}, 开仓均价: ${entryPrice}, 已秒级同步刷新`, 'SUCCESS');
            } else {
              currentList.unshift(updatedPosition);
              addLog(`[WS私有流推流⚡] 检测到外部新开仓单: ${symbol} (${side === 'BUY' ? '多' : '空'}), 开仓数量: ${amount}, 开仓均价: ${entryPrice}, 已秒级同步渲染至持仓列表`, 'SUCCESS');
            }
            hasChanges = true;
          }
        }

        if (hasChanges) {
          currentList.sort((a, b) => (b.openTime || b.timestamp || 0) - (a.openTime || a.timestamp || 0));
          setPositions(currentList);
          positionsRef.current = currentList;
          previousActivePositionsRef.current = currentList;
          checkPositionsRiskRef.current?.();
        }
      }
    };

    const handleOrderTradeDeltaUpdate = (orderData: any) => {
      const orderIdStr = (orderData.i || '').toString();
      const status = orderData.X; // 'NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'EXPIRED'
      const executionType = orderData.x; // 'NEW', 'CANCELED', 'TRADE', 'EXPIRED'
      const symbol = orderData.s;

      // Log trade fill execution
      if (executionType === 'TRADE') {
        const sideDesc = orderData.S === 'BUY' ? '买入' : '卖出';
        const fillQty = orderData.l || orderData.z || orderData.q;
        const fillPrice = orderData.L || orderData.ap || orderData.p || '市价';
        const rp = parseFloat(orderData.rp || '0');
        const rpStr = rp !== 0 ? ` (平仓盈亏: ${rp > 0 ? '+' : ''}${rp.toFixed(4)} USDT)` : '';
        
        // 同时向 [系统日志] 和 [交易日志] 打印双重同步消息
        addLog(`[WS私有流推流⚡] 外部订单成交同步: ${symbol} ${sideDesc} 数量: ${fillQty}, 成交价: ${fillPrice}, 订单状态: ${status}${rpStr}`, 'SUCCESS');
        addLog(`[WS私有流推流⚡] 外部订单成交同步: ${symbol} ${sideDesc} 数量: ${fillQty}, 成交价: ${fillPrice}, 订单状态: ${status}${rpStr}`, 'TRADE');

        // 立刻刷新余额，且在 3.5 秒后进行底层的低频全量校准，防止 REST API 从库缓存覆写 WS 毫秒级推送
        handleFetchBalance();
        setTimeout(() => {
          fetchSnapshot();
        }, 3500);
      }

      // Update openOrders state
      setOpenOrders(prev => {
        if (status === 'FILLED' || status === 'CANCELED' || status === 'EXPIRED') {
          return prev.filter(o => o.id !== orderIdStr);
        } else if (status === 'NEW' || status === 'PARTIALLY_FILLED') {
          const existingIdx = prev.findIndex(o => o.id === orderIdStr);
          const updatedItem: OpenOrder = {
            id: orderIdStr,
            symbol,
            side: orderData.S,
            type: orderData.o,
            price: parseFloat(orderData.p || '0'),
            stopPrice: parseFloat(orderData.sp || '0'),
            isAlgo: false,
            time: Number(orderData.T || Date.now()),
            positionSide: orderData.ps
          };
          if (existingIdx !== -1) {
            const next = [...prev];
            next[existingIdx] = updatedItem;
            return next;
          }
          return [updatedItem, ...prev];
        }
        return prev;
      });
    };

    // 3. Initial Baseline Snapshot
    fetchSnapshot();

    // 4. Dynamic Smart Degrade Calibration Engine
    let calibrationInterval: any = null;
    const startSmartCalibrationTimer = (currentStatus: string) => {
      if (calibrationInterval) clearInterval(calibrationInterval);
      
      // 用户要求：WebSocket 正常连接时切换为 30 秒低频兜底；断连时自动提速为 3 秒应急轮询
      const intervalMs = (currentStatus === 'CONNECTED') ? 30000 : 3000;
      
      calibrationInterval = setInterval(() => {
        fetchSnapshot();
      }, intervalMs);
    };

    // 初始根据连接状态启动智能轮询引擎
    startSmartCalibrationTimer('DISCONNECTED');

    // 5. Establish SSE connection to backend UserDataStream
    let eventSource: EventSource | null = null;
    try {
      setUserStreamStatus('CONNECTING');
      eventSource = new EventSource(`/api/user-data-stream?accountName=${encodeURIComponent(currentAccount)}`);

      eventSource.onopen = () => {
        // SSE channel is open, but do NOT set to CONNECTED until server explicitly confirms Binance WS is connected
      };

      eventSource.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (!payload) return;

          if (payload.type === 'STREAM_STATUS') {
            const nextStatus = payload.status || 'DISCONNECTED';
            setUserStreamStatus(nextStatus);
            startSmartCalibrationTimer(nextStatus);
            if (nextStatus === 'CONNECTED') {
              addLog('[智能降级架构] 币安 WebSocket 实时推流已就续，自动切换为 0 权重实时推流模式 (REST 兜底调至 30 秒低频运行)', 'SUCCESS');
              fetchSnapshot();
            } else if (nextStatus === 'DISCONNECTED' || nextStatus === 'RECONNECTING') {
              addLog('[智能降级架构] WebSocket 推送断开/重连中，已智能激活 3 秒 REST 极速轮询应急接管...', 'WARN');
            }
          } else if (payload.type === 'ACCOUNT_UPDATE' && payload.data) {
            handleAccountDeltaUpdate(payload.data);
          } else if (payload.type === 'ORDER_TRADE_UPDATE' && payload.order) {
            handleOrderTradeDeltaUpdate(payload.order);
          }
        } catch (parseErr) {
          // Ignore parse errors on keepalive ping comments
        }
      };

      eventSource.onerror = () => {
        setUserStreamStatus('DISCONNECTED');
        startSmartCalibrationTimer('DISCONNECTED');
      };
    } catch (e) {
      setUserStreamStatus('DISCONNECTED');
      startSmartCalibrationTimer('DISCONNECTED');
      console.warn("Failed to initiate EventSource for user data stream:", e);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (calibrationInterval) {
        clearInterval(calibrationInterval);
      }
    };
  }, [isConnected, apiConfig.apiKey, apiConfig.apiSecret, apiConfig.accountName]);

  const handleCancelOrder = async (order: OpenOrder) => {
    if (!isConnected) return;
    
    addLog(`正在撤销委托: ${order.symbol} ${order.id}...`, 'TRADE');
    
    try {
      const endpoint = order.isAlgo ? '/fapi/v1/algoOrder' : '/fapi/v1/order';
      const params = order.isAlgo ? { algoId: order.id } : { symbol: order.symbol, orderId: order.id };
      
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'DELETE',
          endpoint: endpoint,
          params: params,
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      const data = await response.json();
      if (response.ok) {
        addLog(`委托已撤销: ${order.symbol} ${order.id}`, 'SUCCESS');
      } else {
        addLog(`撤销失败: ${data.msg || '未知错误'}`, 'ERROR');
      }
    } catch (error) {
      addLog('网络异常: 撤销请求失败', 'ERROR');
    }
  };

  // 1号区域: 杠杆倍数选择处理器 (1X, 2X, 3X, 5X, 10X)
  const handleSelectLeverage = (lev: number) => {
    setLeverage(lev);
    localStorage.setItem('app_user_leverage', lev.toString());
    addLog(`合约开单杠杆倍数已设置为: ${lev}X (后期下单将统一使用该杠杆倍数)`, 'INFO');
  };

  // 2号区域: 合约比例选择处理器 (3%, 5%, 10%, 20%)
  const handleSelectRatioPercent = (pct: number) => {
    setIsCustomRatio(false);
    setOrderRatioPercent(pct);
    setFuturesRatio(pct);
    localStorage.setItem('app_order_ratio_percent', pct.toString());
    localStorage.setItem('app_is_custom_ratio', 'false');

    const fb = balance.futuresBalance || 0;
    const calcAmount = parseFloat((fb * (pct / 100)).toFixed(2));
    setOrderForm(prev => ({ ...prev, amount: calcAmount }));
    addLog(`合约开单比例已选择: ${pct}% (计算方式: 合约余额 ${fb.toFixed(2)} USDT × ${pct}% = ${calcAmount} USDT，后续下单将统一按此比例计算)`, 'INFO');
  };

  // 2号区域: 自定义比例应用处理器 (<= 100)
  const handleApplyCustomRatio = (rawVal: string) => {
    setIsCustomRatio(true);
    localStorage.setItem('app_is_custom_ratio', 'true');

    if (rawVal === '') {
      setCustomRatioInput('');
      return;
    }

    let val = parseFloat(rawVal);
    if (isNaN(val)) return;
    if (val > 100) val = 100; // 自定义不能大于 100，100 代表 100%
    if (val < 0) val = 0;

    const valStr = val.toString();
    setCustomRatioInput(valStr);
    setOrderRatioPercent(val);
    setFuturesRatio(val);
    localStorage.setItem('app_custom_ratio_value', valStr);
    localStorage.setItem('app_order_ratio_percent', val.toString());

    const fb = balance.futuresBalance || 0;
    const calcAmount = parseFloat((fb * (val / 100)).toFixed(2));
    setOrderForm(prev => ({ ...prev, amount: calcAmount }));
    addLog(`合约开单自定义比例已设置为: ${val}% (计算方式: 合约余额 ${fb.toFixed(2)} USDT × ${val}% = ${calcAmount} USDT，后续下单将统一按此比例计算)`, 'INFO');
  };

  // 当合约账户余额发生变化时，如果已选择比例，保持下单数量动态刷新
  useEffect(() => {
    if (orderRatioPercent !== null && balance.futuresBalance && balance.futuresBalance > 0) {
      const calcAmount = parseFloat((balance.futuresBalance * (orderRatioPercent / 100)).toFixed(2));
      setOrderForm(prev => {
        if (Math.abs(prev.amount - calcAmount) > 0.001) {
          return { ...prev, amount: calcAmount };
        }
        return prev;
      });
    }
  }, [balance.futuresBalance, orderRatioPercent]);

  const handleCalculateContractVolume = useCallback(async () => {
    const normalizedSymbol = orderForm.symbol.trim().toUpperCase();
    if (!normalizedSymbol) {
      addLog('合约量计算失败: 请先输入合约交易对', 'ERROR');
      return;
    }

    if (isCalculatingVolume) return;
    setIsCalculatingVolume(true);
    addLog(`[合约量计算] 开始执行计算，输入币对: ${normalizedSymbol}...`, 'INFO');

    try {
      const futuresBalance = balance.futuresBalance || 0;
      // 基础合约量1 = 合约余额 * 选择的百分比（或者自定义的百分比）
      const activeRatio = orderRatioPercent !== null ? orderRatioPercent : futuresRatio;
      const baseQty1 = futuresBalance * (activeRatio / 100);
      addLog(`[合约量计算] 基础合约量1 = 合约余额 (${futuresBalance.toFixed(2)} USDT) * 选择比例 (${activeRatio}%) = ${baseQty1.toFixed(2)} USDT`, 'INFO');

      addLog(`[合约量计算] 正在向币安接口获取 ${normalizedSymbol} 的最近 15m K线...`, 'INFO');

      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'GET',
          endpoint: '/fapi/v1/klines',
          params: {
            symbol: normalizedSymbol,
            interval: '15m',
            limit: '1'
          },
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      if (!response.ok) {
        throw new Error(`K线获取接口返回了非 200 状态: ${response.status}`);
      }

      const klines = await response.json();
      if (!Array.isArray(klines) || klines.length === 0) {
        throw new Error('未获取到有效的 K线数据，返回值为空');
      }

      const latestKline = klines[klines.length - 1];
      // Index 7 is quote asset volume (成交额 in USDT)
      const quoteAssetVolume = parseFloat(latestKline[7]);
      
      if (isNaN(quoteAssetVolume)) {
        throw new Error(`解析 K线成交额失败，无法解析字段`);
      }

      // Calculate K-value, Z-value, and Entry Entity
      const openPrice = parseFloat(latestKline[1]);
      const highPrice = parseFloat(latestKline[2]);
      const lowPrice = parseFloat(latestKline[3]);
      const closePrice = parseFloat(latestKline[4]);

      if (isNaN(openPrice) || isNaN(highPrice) || isNaN(lowPrice) || isNaN(closePrice)) {
        throw new Error(`解析 K线 价格数据(OHLC) 失败`);
      }

      // 1. k值 = 100 * (收盘价 - 开盘价) / 开盘价
      const calcKValue = openPrice !== 0 ? (100 * (closePrice - openPrice) / openPrice) : 0;
      
      // 2. z值 = 100 * (最高价 - 最低价) / 最低价
      const calcZValue = lowPrice !== 0 ? (100 * (highPrice - lowPrice) / lowPrice) : 0;

      // 3. 进场主体 = z * (收盘价 - 最低价) / (最高价 - 最低价)
      const rangeDenom = highPrice - lowPrice;
      const ratio = rangeDenom !== 0 ? (closePrice - lowPrice) / rangeDenom : 0.5;
      const calcEntryEntity = calcZValue * ratio;

      setKValue(calcKValue);
      setZValue(calcZValue);
      setEntryEntity(calcEntryEntity);
      setEntryEntityRatio(ratio);

      addLog(`[分析] 15m K线指标计算成功: k值=${calcKValue.toFixed(4)}%, z值=${calcZValue.toFixed(4)}%, 进场主体=${calcEntryEntity.toFixed(4)}`, 'SUCCESS');

      // 基础合约量2 = 15分钟成交额 / 成交额系数
      const baseQty2 = quoteAssetVolume / turnoverCoef;
      addLog(`[合约量计算] 基础合约量2 = 15分钟成交额 (${quoteAssetVolume.toFixed(2)} USDT) / 成交额系数 (${turnoverCoef}) = ${baseQty2.toFixed(2)} USDT`, 'INFO');

      // Compare baseQty1 & baseQty2, pick min
      const finalAmount = Math.min(baseQty1, baseQty2);
      const roundedAmount = parseFloat(finalAmount.toFixed(2));

      setOrderForm(prev => ({
        ...prev,
        amount: roundedAmount
      }));

      addLog(`[合约量计算] 最终值 = min(基础合约量1: ${baseQty1.toFixed(2)}, 基础合约量2: ${baseQty2.toFixed(2)}) = ${roundedAmount} USDT，已更新至“下单数量”`, 'SUCCESS');
    } catch (err: any) {
      addLog(`[合约量计算] 获取或计算异常: ${err.message || '未知错误'}`, 'ERROR');
    } finally {
      setIsCalculatingVolume(false);
    }
  }, [orderForm.symbol, balance.futuresBalance, leverage, futuresRatio, turnoverCoef, apiConfig.apiKey, apiConfig.apiSecret, isCalculatingVolume, addLog, setKValue, setZValue, setEntryEntity, setEntryEntityRatio]);

  const handlePlaceOrder = async (direction?: 'BUY' | 'SELL') => {
    if (!isConnected) {
      addLog('下单失败: 请先验证 API 连接', 'ERROR');
      return;
    }

    const orderSide = direction || orderForm.side;
    if (direction) {
      setOrderForm(prev => ({ ...prev, side: direction }));
    }

    setIsTrading(true);
    
    // Normalize symbol: uppercase and append USDT if missing
    let normalizedSymbol = orderForm.symbol.toUpperCase().trim();
    if (normalizedSymbol && !normalizedSymbol.endsWith('USDT') && !normalizedSymbol.endsWith('BUSD')) {
      normalizedSymbol += 'USDT';
    }

    addLog(`正在获取 ${normalizedSymbol} 当前价格以计算下单数量...`, 'INFO');

    let currentPrice = 0;
    try {
      const priceRes = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'GET',
          endpoint: '/fapi/v1/ticker/price',
          params: { symbol: normalizedSymbol },
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });
      const priceData = await priceRes.json();
      if (priceRes.ok && priceData.price) {
        currentPrice = parseFloat(priceData.price);
      } else {
        addLog(`获取价格失败: ${priceData.msg || '未知错误'}`, 'ERROR');
        setIsTrading(false);
        return;
      }
    } catch (error) {
      addLog('获取价格异常', 'ERROR');
      setIsTrading(false);
      return;
    }

    // 统一按选定的百分比或金额开单：“一旦选择了，后期下单都统一成这个百分比，除非重新选择这个比例”
    let targetAmount = orderForm.amount;
    if (orderRatioPercent !== null && balance.futuresBalance && balance.futuresBalance > 0) {
      const calculatedFromRatio = parseFloat((balance.futuresBalance * (orderRatioPercent / 100)).toFixed(2));
      if (calculatedFromRatio > 0) {
        targetAmount = calculatedFromRatio;
        if (orderForm.amount !== targetAmount) {
          setOrderForm(prev => ({ ...prev, amount: targetAmount }));
        }
      }
    }

    const calculatedQty = targetAmount / currentPrice;
    const formattedQty = formatQty(normalizedSymbol, calculatedQty);

    if (parseFloat(formattedQty) <= 0) {
      addLog(`下单数量太小: ${targetAmount} USDT 不足以购买最小单位 of ${normalizedSymbol}`, 'ERROR');
      setIsTrading(false);
      return;
    }

    // Determine positionSide based on mode
    let positionSide = 'BOTH';
    if (positionMode === 'HEDGE') {
      positionSide = orderSide === 'BUY' ? 'LONG' : 'SHORT';
    }

    // 1. 自动并在下单前，同步合约杠杆倍数至币安终端，避免实盘和系统设置的杠杆不一致导致保证金不足
    try {
      addLog(`正在同步 ${normalizedSymbol} 的合约杠杆倍数至 ${leverage}x...`, 'INFO');
      const levResponse = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'POST',
          endpoint: '/fapi/v1/leverage',
          params: {
            symbol: normalizedSymbol,
            leverage: leverage
          },
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });
      const levData = await levResponse.json();
      if (levResponse.ok) {
        addLog(`成功同步合约杠杆为: ${leverage}x`, 'SUCCESS');
      } else {
        addLog(`同步杠杆失败: ${levData.msg || '无法更改，实盘可能已达该币种杠杆上限或有未平仓位阻碍'}`, 'WARN');
      }
    } catch (err: any) {
      console.warn('Failed to sync leverage with Binance:', err);
    }

    addLog(`正在发送 ${orderSide} 订单: ${targetAmount} USDT ≈ ${formattedQty} ${normalizedSymbol} (价格: ${currentPrice}, 杠杆: ${leverage}x, 比例: ${orderRatioPercent !== null ? orderRatioPercent + '%' : '固定'})...`, 'TRADE');

    try {
      const response = await fetch('/api/binance-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'POST',
          endpoint: '/fapi/v1/order',
          params: {
            symbol: normalizedSymbol,
            side: orderSide,
            type: orderForm.type,
            quantity: formattedQty,
            positionSide: positionSide,
          },
          apiKey: apiConfig.apiKey,
          apiSecret: apiConfig.apiSecret
        })
      });

      const data = await response.json();

      if (response.ok) {
        addLog(`订单成交: ${orderSide} ${formattedQty} ${normalizedSymbol} (约 ${orderForm.amount} USDT) @ ${data.avgPrice || '市价'}`, 'SUCCESS');
      } else {
        let errorMsg = data.msg || data.error || '未知错误';
        if (typeof errorMsg === 'string') {
          if (errorMsg.includes('Precision')) {
            errorMsg += ' (请尝试减少下单数量的小数位数)';
          }
          if (errorMsg.includes('position side')) {
            errorMsg += ' (请检查持仓模式设置是否与币安账户一致)';
          }
          if (errorMsg.includes('Margin is insufficient') || errorMsg.includes('insufficient margin') || errorMsg.includes('Margin') || errorMsg.includes('insufficient')) {
            errorMsg += ` (可用保证金不足！当前系统杠杆为 ${leverage}x。请检查币安账户实际划转的可用资金，或尝试在前置“交易+风控”配置中调大杠杆倍数、调低“合约比例”/“成交额系数”以自动减小下单金额，或直接手动调低“下单数量”)`;
          }
        }
        addLog(`下单失败: ${errorMsg}`, 'ERROR');
      }
    } catch (error) {
      addLog('网络异常: 下单请求失败', 'ERROR');
    } finally {
      setIsTrading(false);
    }
  };

  const handleClosePosition = async (id: string, currentPositions?: Position[], reason?: string) => {
    if (closingPositionIdsRef.current.has(id)) {
      console.log(`[平仓中] 持仓 ${id} 正在执行出场流程，跳过重复触发`);
      return;
    }
    closingPositionIdsRef.current.add(id);

    try {
      const targetPositions = currentPositions || positionsRef.current || positions;
      const pos = targetPositions.find(p => p.id === id);
      if (!pos) {
        addLogRef.current(`[风控提示] 未在当前持仓列表中匹配到持仓 ID: ${id}，取消平仓`, 'WARN');
        closingPositionIdsRef.current.delete(id);
        return;
      }

      const triggerReason = reason || '用户手动市价平仓';
      addLogRef.current(`[风控全流程启动] 🚨 持仓 ${pos.symbol} (${pos.side === 'BUY' ? '多单' : '空单'}) 触发执行出场 (触发原因: ${triggerReason})`, 'WARN');

      // 阶段 1：出场前必须先撤销该币对属于当前持仓的所有挂单（包括止盈普通限价单和止损算法单）
      // 核心原因：如果币安后台已存在该持仓的限价止盈挂单，若不先撤单直接以市价平仓(reduceOnly)，币安将直接报错拒绝 (-2022: ReduceOnly Order is rejected) 导致平仓失败！
      addLogRef.current(`[风控全流程 步骤1/3] 正在优先撤销 ${pos.symbol} 的所有止盈限价单与算法止损单以解锁仓位...`, 'INFO');
      try {
        // 1a: 撤销该币对所有普通挂单
        await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'DELETE',
            endpoint: '/fapi/v1/allOpenOrders',
            params: { symbol: pos.symbol },
            baseUrl: apiConfigRef.current.baseUrl || "https://fapi.binance.com",
            apiKey: apiConfigRef.current.apiKey,
            apiSecret: apiConfigRef.current.apiSecret
          })
        });

        // 1b: 撤销该币对所有算法委托单
        const algoRes = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'GET',
            endpoint: '/fapi/v1/openAlgoOrders',
            params: { symbol: pos.symbol },
            baseUrl: apiConfigRef.current.baseUrl || "https://fapi.binance.com",
            apiKey: apiConfigRef.current.apiKey,
            apiSecret: apiConfigRef.current.apiSecret
          })
        });

        if (algoRes.ok) {
          const algoData = await algoRes.json();
          const allOrders = Array.isArray(algoData) ? algoData : (algoData.orders || algoData.algoOrders || []);
          for (const order of allOrders) {
            const algoId = order.algoId || order.clientAlgoId;
            if (algoId) {
              await fetch('/api/binance-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  method: 'DELETE',
                  endpoint: '/fapi/v1/algoOrder',
                  params: { algoId: algoId, symbol: pos.symbol },
                  baseUrl: apiConfigRef.current.baseUrl || "https://fapi.binance.com",
                  apiKey: apiConfigRef.current.apiKey,
                  apiSecret: apiConfigRef.current.apiSecret
                })
              });
            }
          }
        }
        addLogRef.current(`[风控全流程 步骤1完成] ${pos.symbol} 关联挂单已全部撤销完成`, 'SUCCESS');
      } catch (cancelErr: any) {
        addLogRef.current(`[风控全流程 步骤1提示] 预撤单网络异常: ${cancelErr?.message || cancelErr}`, 'WARN');
      }

      // 阶段 2：执行市价平仓出场
      addLogRef.current(`[风控全流程 步骤2/3] 正在提交 ${pos.symbol} 市价平仓委托出场...`, 'TRADE');
      const positionSide = pos.positionSide;
      const orderParams: any = {
        symbol: pos.symbol,
        side: pos.side === 'BUY' ? 'SELL' : 'BUY',
        type: 'MARKET',
        quantity: formatQty(pos.symbol, pos.amount),
        positionSide: positionSide,
      };

      if (positionSide === 'BOTH') {
        orderParams.reduceOnly = 'true';
      }

      try {
        const response = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'POST',
            endpoint: '/fapi/v1/order',
            params: orderParams,
            baseUrl: apiConfigRef.current.baseUrl || "https://fapi.binance.com",
            apiKey: apiConfigRef.current.apiKey,
            apiSecret: apiConfigRef.current.apiSecret
          })
        });

        const data = await response.json();
        if (response.ok) {
          const avgPrice = parseFloat(data.avgPrice || '0');
          addLogRef.current(`[风控全流程 步骤2完成] 持仓已平: ${pos.symbol} 平仓成交价: ${avgPrice || '市价'}`, 'SUCCESS');
        } else {
          addLogRef.current(`平仓委托反馈: ${data.msg || data.error || '未知错误'}`, 'ERROR');
        }
      } catch (err: any) {
        addLogRef.current(`平仓请求异常: ${err?.message || err}`, 'ERROR');
      }

      // 阶段 3：自愈清扫该币对残留挂单并清理对应风控状态
      addLogRef.current(`[风控全流程 步骤3/3] 正在进行最终挂单精准清扫与风控状态重置...`, 'INFO');
      try {
        await handleCancelOrdersBySymbolRef.current(pos.symbol);
      } catch (e) {}

      // 移除该持仓的风控配置（按当前登录账号持久化隔离更新）
      const currentAccount = apiConfigRef.current.accountName || 'default';
      setPositionRiskConfigs(prev => {
        if (!prev[pos.id]) return prev;
        const next = { ...prev };
        delete next[pos.id];
        positionRiskConfigsRef.current = next;
        if (allAccountRiskConfigsRef.current[currentAccount]) {
          allAccountRiskConfigsRef.current[currentAccount] = next;
        }
        saveLocalPositionRiskConfigs(next, currentAccount);
        saveAllLocalPositionRiskConfigs(allAccountRiskConfigsRef.current);
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            accountPositionRiskConfigs: allAccountRiskConfigsRef.current,
            [`positionRiskConfigs_${currentAccount}`]: next
          })
        }).catch(() => {});
        return next;
      });

      addLogRef.current(`[风控全流程结束] ✅ ${pos.symbol} 风控出场全流程已彻底执行完毕`, 'SUCCESS');
    } finally {
      // 延迟 3 秒解除平仓中状态，等待币安持仓推送刷新
      setTimeout(() => {
        closingPositionIdsRef.current.delete(id);
      }, 3000);
    }
  };

  // 监听并执行每个持仓专属的多重风控：时间风控、止盈风控、止损风控
  // 规则：当设置了多个风控条件时，按照先触发哪一条就按照触发的条件马上出场，并对这个持仓的挂单（包括止盈委托单和止损算法单）进行撤单，完成风控全流程
  const checkPositionsRisk = useCallback(() => {
    if (!isConnectedRef.current) return;
    const currentPositions = positionsRef.current;
    if (!currentPositions || currentPositions.length === 0) return;

    const now = Date.now();
    const currentConfigs = positionRiskConfigsRef.current;

    for (const pos of currentPositions) {
      const cfg = currentConfigs[pos.id];
      if (!cfg) continue;

      // 若当前持仓已经在执行平仓出场流程中，避免重复触发
      if (closingPositionIdsRef.current.has(pos.id)) continue;

      // 获取该币对实时标记价/现价
      const liveInfo = livePricesRef.current[pos.symbol] || livePricesRef.current[pos.symbol.toUpperCase()];
      const currentMarkPrice = (liveInfo?.markPrice || liveInfo?.lastPrice) || pos.markPrice || pos.entryPrice;

      // 1. 检查条件A：时间风控 (最大持仓时间)
      if (cfg.timeControl?.enabled) {
        const maxMinutes = Number(cfg.timeControl.maxHoldMinutes) || 240;
        const maxMs = maxMinutes * 60 * 1000;
        const activatedAt = cfg.timeControl.activatedAt || pos.openTime || now;
        if (!cfg.timeControl.activatedAt) {
          handleSavePositionRiskConfig({
            ...cfg,
            timeControl: {
              ...cfg.timeControl,
              activatedAt
            }
          });
        }

        const elapsed = now - activatedAt;
        if (elapsed >= maxMs) {
          const reason = `⏱️ 最大持仓时间风控超时触发 (设定上限: ${maxMinutes} 分钟, 实际已持仓: ${(elapsed / 60000).toFixed(1)} 分钟)`;
          addLogRef.current(`[时间风控触发] ⏱️ 持仓 ${pos.symbol} (${pos.side === 'BUY' ? '多单' : '空单'}) 已达最大设定持仓时间 (${maxMinutes} 分钟)，立即执行全流程平仓出场！`, 'WARN');
          handleClosePositionRef.current(pos.id, currentPositions, reason);
          continue;
        }
      }

      // 2. 检查条件B：止盈风控 (本地双重兜底保障，防止交易所挂单偶发延迟)
      if (cfg.tpSlControl?.tpEnabled) {
        let tpTargetPrice = 0;
        if (cfg.tpSlControl.tpMode === 'PRICE') {
          tpTargetPrice = cfg.tpSlControl.tpPrice;
        } else {
          const ratio = (cfg.tpSlControl.tpPercent || 0) / 100;
          tpTargetPrice = pos.side === 'BUY' 
            ? pos.entryPrice * (1 + ratio) 
            : pos.entryPrice * (1 - ratio);
        }

        const isLong = pos.side === 'BUY';
        const isTpReached = isLong 
          ? currentMarkPrice >= tpTargetPrice 
          : currentMarkPrice <= tpTargetPrice;

        if (isTpReached && tpTargetPrice > 0 && currentMarkPrice > 0) {
          const reason = `🎯 止盈条件触发 (当前标记价: ${currentMarkPrice} 已达止盈目标: ${tpTargetPrice.toFixed(4)})`;
          addLogRef.current(`[止盈风控触发] 🎯 持仓 ${pos.symbol} (${isLong ? '多单' : '空单'}) 已触及止盈价 (${tpTargetPrice.toFixed(4)})，立即执行全流程平仓出场！`, 'SUCCESS');
          handleClosePositionRef.current(pos.id, currentPositions, reason);
          continue;
        }
      }

      // 3. 检查条件C：止损风控 (本地双重兜底保障)
      if (cfg.tpSlControl?.slEnabled) {
        let slTargetPrice = 0;
        if (cfg.tpSlControl.slMode === 'PRICE') {
          slTargetPrice = cfg.tpSlControl.slPrice;
        } else {
          const ratio = (cfg.tpSlControl.slPercent || 0) / 100;
          slTargetPrice = pos.side === 'BUY' 
            ? pos.entryPrice * (1 - ratio) 
            : pos.entryPrice * (1 + ratio);
        }

        const isLong = pos.side === 'BUY';
        const isSlReached = isLong 
          ? currentMarkPrice <= slTargetPrice 
          : currentMarkPrice >= slTargetPrice;

        if (isSlReached && slTargetPrice > 0 && currentMarkPrice > 0) {
          const reason = `🛑 止损条件触发 (当前标记价: ${currentMarkPrice} 已触及止损价: ${slTargetPrice.toFixed(4)})`;
          addLogRef.current(`[止损风控触发] 🛑 持仓 ${pos.symbol} (${isLong ? '多单' : '空单'}) 已触及止损价 (${slTargetPrice.toFixed(4)})，立即执行全流程平仓出场！`, 'WARN');
          handleClosePositionRef.current(pos.id, currentPositions, reason);
          continue;
        }
      }
    }
  }, [handleSavePositionRiskConfig]);

  // 维持稳定不中断的心跳风控监测 (1000ms)，不受界面每秒倒计时重渲染干扰
  useEffect(() => {
    checkPositionsRisk();
    const interval = setInterval(() => {
      checkPositionsRisk();
    }, 1000);
    return () => clearInterval(interval);
  }, [checkPositionsRisk]);

  // 针对特定币对进行精准遗留挂单清理（自愈风控，防止幽灵仓单且不影响其它币对）
  const handleCancelOrdersBySymbol = async (targetSymbol: string) => {
    if (!isConnected || !targetSymbol) return;

    addLog(`[自愈风控] 开始对币对 [${targetSymbol}] 执行遗留挂单精准清理...`, 'INFO');

    try {
      // 第一步：查找并撤销该币对的普通挂单
      try {
        const cancelResponse = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'DELETE',
            endpoint: '/fapi/v1/allOpenOrders',
            params: { symbol: targetSymbol },
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });
        const cancelData = await cancelResponse.json();
        if (cancelResponse.ok) {
          addLog(`[自愈风控] [${targetSymbol}] 普通遗留挂单已全部撤销`, 'SUCCESS');
        } else {
          addLog(`[自愈风控] [${targetSymbol}] 普通挂单撤销反馈: ${cancelData.msg || '无普通挂单或已清理'}`, 'INFO');
        }
      } catch (e: any) {
        addLog(`[自愈风控] [${targetSymbol}] 撤销普通挂单网络异常: ${e.message}`, 'ERROR');
      }

      // 第二步：查询并撤销该币对的算法委托单（止盈止损条件单）
      try {
        const algoResponse = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'GET',
            endpoint: '/fapi/v1/openAlgoOrders',
            params: { symbol: targetSymbol },
            baseUrl: apiConfig.baseUrl || "https://fapi.binance.com",
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });

        if (algoResponse.ok) {
          const algoData = await algoResponse.json();
          const allOrders = Array.isArray(algoData) ? algoData : (algoData.orders || algoData.algoOrders || []);
          // 确保严格只处理属于该目标币对的算法单
          const targetAlgoOrders = allOrders.filter((o: any) => !o.symbol || o.symbol === targetSymbol);

          if (targetAlgoOrders.length > 0) {
            addLog(`[自愈风控] 发现 [${targetSymbol}] 存在 ${targetAlgoOrders.length} 个算法挂单，正在逐一撤销...`, 'INFO');
            for (const order of targetAlgoOrders) {
              const delResponse = await fetch('/api/binance-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  method: 'DELETE',
                  endpoint: '/fapi/v1/algoOrder',
                  params: { algoId: order.algoId, symbol: targetSymbol },
                  baseUrl: apiConfig.baseUrl || "https://fapi.binance.com",
                  apiKey: apiConfig.apiKey,
                  apiSecret: apiConfig.apiSecret
                })
              });
              if (delResponse.ok) {
                addLog(`[自愈风控] [${targetSymbol}] 算法单 ${order.algoId} 撤销成功`, 'SUCCESS');
              } else {
                const delResult = await delResponse.json();
                addLog(`[自愈风控] [${targetSymbol}] 算法单 ${order.algoId} 撤销异常: ${delResult.msg || '未知错误'}`, 'INFO');
              }
            }
            addLog(`[自愈风控] [${targetSymbol}] 算法挂单已全部清空`, 'SUCCESS');
          } else {
            addLog(`[自愈风控] [${targetSymbol}] 未发现遗留算法挂单`, 'INFO');
          }
        }
      } catch (e: any) {
        addLog(`[自愈风控] [${targetSymbol}] 撤销算法单网络异常: ${e.message}`, 'ERROR');
      }

      addLog(`[自愈风控] [${targetSymbol}] 遗留挂单精准清理完成，其它币对挂单完好保留`, 'SUCCESS');
    } catch (error) {
      addLog(`[自愈风控] [${targetSymbol}] 精准清理流程异常: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
    }
  };

  const isAllAccountsSelected = availableAccounts.length > 0 && availableAccounts.every(acc => selectedReportAccounts.includes(acc));
  const isIndeterminate = !isAllAccountsSelected && selectedReportAccounts.some(acc => availableAccounts.includes(acc));

  const handleToggleAllAccounts = () => {
    if (isAllAccountsSelected) {
      setSelectedReportAccounts([]);
    } else {
      setSelectedReportAccounts([...availableAccounts]);
    }
  };

  const handleToggleAccount = (acc: string) => {
    setSelectedReportAccounts(prev => {
      if (prev.includes(acc)) {
        return prev.filter(a => a !== acc);
      } else {
        return [...prev, acc];
      }
    });
  };

  const handleSelectOnlyAccount = (acc: string) => {
    setSelectedReportAccounts([acc]);
  };

  const displayAccountLabel = (() => {
    if (availableAccounts.length === 0) return '所有账户';
    if (selectedReportAccounts.length === 0) return '未选账户';
    if (selectedReportAccounts.length === 1) return selectedReportAccounts[0];
    if (isAllAccountsSelected) return '所有账户';
    return `已选 ${selectedReportAccounts.length} 个账户`;
  })();

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(positionHistory.map(h => ({
      '合约名称': h.symbol,
      '订单类型': h.side === 'BUY' ? '多单' : '空单',
      '账户': h.account || '默认账户',
      '总盈亏': h.pnl.toFixed(4),
      '成交盈亏': h.tradePnl.toFixed(4),
      '手续费': h.commission.toFixed(4),
      '资金费': h.fundingFee.toFixed(4),
      '收益率': (h.entryPrice * h.amount) > 0 ? `${((h.pnl / (h.entryPrice * h.amount)) * 100).toFixed(3)}%` : '0.000%',
      '开仓时间': new Date(h.openTime).toLocaleString(),
      '最后平仓时间': new Date(h.closeTime).toLocaleString(),
      '数量': h.amount
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "仓位历史记录");
    XLSX.writeFile(wb, `PositionHistory_${new Date().getTime()}.xlsx`);
  };

  const fetchHistoryFromBinance = async () => {
    if (!isConnected) {
      addLog('获取历史失败: API 未连接', 'ERROR');
      return;
    }

    const activeAccount = apiConfig.accountName || '';
    if (!activeAccount) {
      addLog('获取历史失败: 请先在币安 API 配置板块录入账户名', 'ERROR');
      return;
    }

    setIsFetchingHistory(true);
    setSyncProgress({ current: 0, total: 0, stage: '正在查询本地数据库时间范围...' });

    try {
      // 1. Get existing history for this account from DB
      const localRes = await fetch(`/api/position-history?account=${encodeURIComponent(activeAccount)}`);
      if (!localRes.ok) throw new Error('Failed to fetch local history');
      const localHistory: PositionHistory[] = await localRes.json();

      const requestedStartTime = new Date(dateRange.start + 'T00:00:00').getTime();
      const requestedEndTime = new Date(dateRange.end + 'T23:59:59.999').getTime();

      // Compute missing ranges
      const missingRanges: { startTime: number, endTime: number }[] = [];
      if (localHistory.length === 0) {
        missingRanges.push({ startTime: requestedStartTime, endTime: requestedEndTime });
      } else {
        const minLocalTime = Math.min(...localHistory.map(h => h.openTime));
        const maxLocalTime = Math.max(...localHistory.map(h => h.closeTime));

        if (requestedStartTime < minLocalTime) {
          missingRanges.push({ startTime: requestedStartTime, endTime: minLocalTime - 1 });
        }
        if (requestedEndTime > maxLocalTime) {
          missingRanges.push({ startTime: maxLocalTime + 1, endTime: requestedEndTime });
        }
      }

      const binanceRequestWithRetry = async (
        endpoint: string,
        params: any,
        method: string = 'GET',
        maxRetries = 4,
        initialDelay = 1500
      ): Promise<any> => {
        let attempt = 0;
        while (true) {
          try {
            const response = await fetch('/api/binance-proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                method,
                endpoint,
                params,
                apiKey: apiConfig.apiKey,
                apiSecret: apiConfig.apiSecret
              })
            });

            const data = await response.json();

            if (response.status === 429 || response.status === 418 || (data && data.code === -1003)) {
              attempt++;
              if (attempt >= maxRetries) {
                return { ok: false, status: response.status, data };
              }
              
              const delay = initialDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
              addLog(`[防限速避让] 触发币安接口频限. 正在自动进行第 ${attempt}/${maxRetries} 次指数避退并重试，延迟 ${Math.round(delay)}ms...`, 'INFO');
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }

            return { ok: response.ok, status: response.status, data };
          } catch (error) {
            attempt++;
            if (attempt >= maxRetries) {
              throw error;
            }
            const delay = initialDelay * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      };

      if (missingRanges.length === 0) {
        addLog(`💡 优先本地检索：所选账号 [${activeAccount}] 请求时间段的数据已完全包含在本地数据库中！本次直接极速展示本地存储对账记录，已大幅节省币安接口调用。`, 'SUCCESS');
        // Filter local history to the requested date range and set state
        const filteredLocal = localHistory.filter(h => h.openTime >= requestedStartTime && h.closeTime <= requestedEndTime);
        setPositionHistory(filteredLocal);
        setIsFetchingHistory(false);
        return;
      }

      // We have missing ranges! Let's fetch them from Binance and supplement the local DB
      let activePositions: { symbol: string, side: 'BUY' | 'SELL', amount: number }[] = [];
      try {
        const posResponse = await fetch('/api/binance-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: '/fapi/v2/positionRisk',
            apiKey: apiConfig.apiKey,
            apiSecret: apiConfig.apiSecret
          })
        });
        if (posResponse.ok) {
          const posData = await posResponse.json();
          if (Array.isArray(posData)) {
            activePositions = posData
              .filter((p: any) => parseFloat(p.positionAmt) !== 0)
              .map((p: any) => ({
                symbol: p.symbol.toUpperCase(),
                side: parseFloat(p.positionAmt) > 0 ? 'BUY' : 'SELL',
                amount: Math.abs(parseFloat(p.positionAmt))
              }));
          }
        }
      } catch (err) {
        console.error('获取持仓失败:', err);
      }

      if (activePositions.length > 0) {
        const details = activePositions.map(p => `${p.symbol} (${p.side === 'BUY' ? '做多' : '做空'} ${p.amount})`).join(', ');
        addLog(`当前存在活跃持仓: ${details}。生成历史闭环仓位时，将自动精准剔除这些持仓最近的开仓成交数据。`, 'INFO');
      } else {
        addLog(`当前无活跃持仓，将完整分析并闭环缺失区段的全部历史成交。`, 'INFO');
      }

      let allNewMatchedHistory: PositionHistory[] = [];

      for (const range of missingRanges) {
        addLog(`正在从币安拉取缺失时间段的流水 [时间: ${new Date(range.startTime).toLocaleDateString()} 至 ${new Date(range.endTime).toLocaleDateString()}]...`, 'INFO');
        
        const startTime = range.startTime;
        const endTime = range.endTime;

        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        let allIncome: any[] = [];
        let currentStart = startTime;

        // 2. 获取收入记录
        while (currentStart < endTime) {
          let currentEnd = Math.min(currentStart + SEVEN_DAYS_MS, endTime);
          let fetchStart = currentStart;
          let fetchEnd = currentEnd;

          while (fetchStart < fetchEnd) {
            setSyncProgress({
              current: 0,
              total: 0,
              stage: `正在获取缺失区间收入流水 [${new Date(fetchStart).toLocaleDateString()} - ${new Date(fetchEnd).toLocaleDateString()}]...`
            });

            const res = await binanceRequestWithRetry('/fapi/v1/income', {
              startTime: fetchStart,
              endTime: fetchEnd,
              limit: 1000
            });

            if (!res.ok || !Array.isArray(res.data)) {
              const errMsg = res.data && res.data.msg ? res.data.msg : '未知错误';
              addLog(`获取收入历史失败 [${new Date(fetchStart).toLocaleDateString()} - ${new Date(fetchEnd).toLocaleDateString()}]: ${errMsg}`, 'ERROR');
              setIsFetchingHistory(false);
              return;
            }

            const income = res.data;
            if (income.length === 0) break;

            allIncome = [...allIncome, ...income];
            if (income.length < 1000) break;

            const maxTime = Math.max(...income.map(i => i.time));
            if (maxTime >= fetchEnd) break;
            fetchStart = maxTime <= fetchStart ? fetchStart + 1 : maxTime + 1;

            if (rateLimitDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
            }
          }
          currentStart = currentEnd + 1;
        }

        // Extract active symbols for this segment
        const activeSymbolsSet = new Set(allIncome
          .filter(i => i.incomeType === 'REALIZED_PNL' || i.incomeType === 'COMMISSION')
          .map(i => i.symbol.toUpperCase())
        );
        activePositions.forEach(p => activeSymbolsSet.add(p.symbol));
        const activeSymbols = Array.from(activeSymbolsSet);

        if (activeSymbols.length === 0) {
          continue; // No trade activity in this segment, skip to next missing range
        }

        addLog(`发现缺失区间内存在 ${activeSymbols.length} 个活跃合约，正在抓取详细成交记录进行平仓配对...`, 'INFO');

        // 3. fetch detailed trades
        let allTrades: any[] = [];
        let symbolIndex = 0;
        for (const symbol of activeSymbols) {
          symbolIndex++;
          let chunkStart = startTime;
          while (chunkStart <= endTime) {
            let chunkEnd = Math.min(chunkStart + SEVEN_DAYS_MS - 1, endTime);
            let fetchStart = chunkStart;

            setSyncProgress({
              current: symbolIndex,
              total: activeSymbols.length,
              stage: `正在抓取 [${symbol}] 数据 [${new Date(chunkStart).toLocaleDateString()} - ${new Date(chunkEnd).toLocaleDateString()}] (${symbolIndex}/${activeSymbols.length})`
            });

            while (fetchStart <= chunkEnd) {
              const res = await binanceRequestWithRetry('/fapi/v1/userTrades', {
                symbol,
                startTime: fetchStart,
                endTime: chunkEnd,
                limit: 1000
              });

              if (!res.ok || !Array.isArray(res.data)) {
                break;
              }

              const trades = res.data;
              if (trades.length === 0) break;

              allTrades = [...allTrades, ...trades];
              if (trades.length < 1000) break;

              const maxTime = Math.max(...trades.map(t => t.time));
              fetchStart = maxTime <= fetchStart ? fetchStart + 1 : maxTime + 1;

              if (rateLimitDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
              }
            }
            chunkStart = chunkEnd + 1;
            if (rateLimitDelay > 0) {
              await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
            }
          }
        }

        if (allTrades.length > 0) {
          // De-duplicate and sort
          const uniqueTrades = Array.from(new Map(allTrades.map(t => [t.id, t])).values())
            .sort((a, b) => a.time - b.time);

          // Exclude active open positions
          if (activePositions.length > 0) {
            activePositions.forEach(activePos => {
              const sym = activePos.symbol;
              const sideToExclude = activePos.side;
              let remainingQtyToExclude = activePos.amount;

              for (let i = uniqueTrades.length - 1; i >= 0; i--) {
                if (remainingQtyToExclude <= 1e-8) break;
                const t = uniqueTrades[i];
                if (t.symbol.toUpperCase() === sym && t.side === sideToExclude) {
                  const qty = parseFloat(t.qty);
                  if (qty <= remainingQtyToExclude + 1e-8) {
                    t.exclude = true;
                    remainingQtyToExclude -= qty;
                  } else {
                    t.qty = (qty - remainingQtyToExclude).toString();
                    remainingQtyToExclude = 0;
                  }
                }
              }
            });
          }

          const filteredTrades = uniqueTrades.filter(t => !t.exclude);

          // 3s interval merge
          const mergedTrades: any[] = [];
          const aggregateGroup = (group: any[]): any => {
            if (group.length === 1) return group[0];
            let totalQty = 0;
            let totalCost = 0;
            let totalPnl = 0;
            let totalCommission = 0;

            group.forEach(g => {
              const q = parseFloat(g.qty);
              totalQty += q;
              totalCost += parseFloat(g.price) * q;
              totalPnl += parseFloat(g.realizedPnl || '0');
              totalCommission += parseFloat(g.commission || '0');
            });

            const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
            return {
              ...group[0],
              qty: totalQty.toString(),
              price: avgPrice.toString(),
              realizedPnl: totalPnl.toString(),
              commission: totalCommission.toString(),
              time: group[0].time,
              id: group.map(g => g.id).join('_'),
            };
          };

          if (filteredTrades.length > 0) {
            let currentGroup: any[] = [filteredTrades[0]];
            for (let i = 1; i < filteredTrades.length; i++) {
              const current = filteredTrades[i];
              const lastInGroup = currentGroup[currentGroup.length - 1];

              const sameSymbol = current.symbol === lastInGroup.symbol;
              const sameSide = current.side === lastInGroup.side;
              const withinThreeSecs = (current.time - lastInGroup.time) <= 3000;

              if (sameSymbol && sameSide && withinThreeSecs) {
                currentGroup.push(current);
              } else {
                mergedTrades.push(aggregateGroup(currentGroup));
                currentGroup = [current];
              }
            }
            if (currentGroup.length > 0) {
              mergedTrades.push(aggregateGroup(currentGroup));
            }
          }

          // Group by symbol
          const groupedTrades: { [key: string]: any[] } = {};
          mergedTrades.forEach(t => {
            if (!groupedTrades[t.symbol]) groupedTrades[t.symbol] = [];
            groupedTrades[t.symbol].push(t);
          });

          const segmentMatchedHistory: PositionHistory[] = [];
          const EPSILON = 0.00000001;

          Object.keys(groupedTrades).forEach(symbol => {
            const trades = groupedTrades[symbol];
            const parsedTrades = trades.map(t => ({
              ...t,
              remainingQty: parseFloat(t.qty),
              originalQty: parseFloat(t.qty),
              commissionVal: parseFloat(t.commission || '0'),
              realizedPnlVal: parseFloat(t.realizedPnl || '0'),
            }));

            for (let i = parsedTrades.length - 1; i >= 0; i--) {
              const closeTrade = parsedTrades[i];
              if (closeTrade.remainingQty < EPSILON) continue;

              const closeSide = closeTrade.side;
              const openSide = closeSide === 'BUY' ? 'SELL' : 'BUY';

              const matchedCloseTrades: any[] = [];
              const matchedOpenTrades: any[] = [];
              let qtyToMatch = closeTrade.remainingQty;

              matchedCloseTrades.push({ trade: closeTrade, qty: qtyToMatch });
              closeTrade.remainingQty = 0;

              for (let j = i - 1; j >= 0; j--) {
                if (qtyToMatch < EPSILON) break;
                const openTrade = parsedTrades[j];
                if (openTrade.side === openSide && openTrade.remainingQty > EPSILON) {
                  const takeQty = Math.min(qtyToMatch, openTrade.remainingQty);
                  matchedOpenTrades.push({ trade: openTrade, qty: takeQty });
                  openTrade.remainingQty -= takeQty;
                  qtyToMatch -= takeQty;
                }
              }

              if (matchedOpenTrades.length > 0) {
                let sumCommission = 0;
                let sumRealizedPnl = 0;
                let openCost = 0;
                let openQty = 0;
                let closeRevenue = 0;
                let closeQty = 0;
                let earliestOpenTime = Infinity;
                let latestCloseTime = -Infinity;

                matchedOpenTrades.forEach(m => {
                  const fraction = m.qty / m.trade.originalQty;
                  sumCommission += m.trade.commissionVal * fraction;
                  sumRealizedPnl += m.trade.realizedPnlVal * fraction;
                  openQty += m.qty;
                  openCost += parseFloat(m.trade.price) * m.qty;
                  earliestOpenTime = Math.min(earliestOpenTime, m.trade.time);
                });

                matchedCloseTrades.forEach(m => {
                  const fraction = m.qty / m.trade.originalQty;
                  sumCommission += m.trade.commissionVal * fraction;
                  sumRealizedPnl += m.trade.realizedPnlVal * fraction;
                  closeQty += m.qty;
                  closeRevenue += parseFloat(m.trade.price) * m.qty;
                  latestCloseTime = Math.max(latestCloseTime, m.trade.time);
                });

                const entryPrice = openQty > 0 ? openCost / openQty : 0;
                const exitPrice = closeQty > 0 ? closeRevenue / closeQty : 0;

                const posIncome = allIncome.filter(inc => 
                  inc.symbol.toUpperCase() === symbol.toUpperCase() && 
                  inc.time >= earliestOpenTime - 5000 && 
                  inc.time <= latestCloseTime + 5000
                );

                const fundingFee = posIncome
                  .filter(inc => inc.incomeType === 'FUNDING_FEE')
                  .reduce((sum, inc) => sum + parseFloat(inc.income), 0);

                const finalPnl = sumRealizedPnl - sumCommission + fundingFee;

                segmentMatchedHistory.push({
                  id: activeAccount + '_' + closeTrade.id + '_' + matchedOpenTrades.map(o => o.trade.id).join('_'),
                  symbol: symbol,
                  side: openSide,
                  positionSide: closeTrade.positionSide || (openSide === 'BUY' ? 'LONG' : 'SHORT'),
                  entryPrice: entryPrice,
                  exitPrice: exitPrice,
                  amount: openQty,
                  tradePnl: sumRealizedPnl,
                  commission: sumCommission,
                  fundingFee: fundingFee,
                  pnl: finalPnl,
                  pnlPercent: 0,
                  openTime: earliestOpenTime,
                  closeTime: latestCloseTime,
                  timestamp: latestCloseTime,
                  account: activeAccount
                });
              }
            }
          });

          // Second pass: merge same open batch positions within 30 seconds
          const segmentMergedHistory: PositionHistory[] = [];
          const openTimeMergeThresholdMs = 30000;
          const sortedSegment = [...segmentMatchedHistory].sort((a, b) => a.openTime - b.openTime);

          for (const item of sortedSegment) {
            const existing = segmentMergedHistory.find(h => 
              h.symbol.toUpperCase() === item.symbol.toUpperCase() &&
              h.side === item.side &&
              h.positionSide === item.positionSide &&
              Math.abs(h.openTime - item.openTime) <= openTimeMergeThresholdMs
            );

            if (existing) {
              const originalQty = existing.amount;
              const itemQty = item.amount;
              const combinedQty = originalQty + itemQty;

              if (combinedQty > 0) {
                existing.entryPrice = (existing.entryPrice * originalQty + item.entryPrice * itemQty) / combinedQty;
                existing.exitPrice = (existing.exitPrice * originalQty + item.exitPrice * itemQty) / combinedQty;
              }

              existing.amount = combinedQty;
              existing.tradePnl += item.tradePnl;
              existing.commission += item.commission;
              existing.fundingFee += item.fundingFee;
              existing.pnl += item.pnl;
              existing.openTime = Math.min(existing.openTime, item.openTime);
              existing.closeTime = Math.max(existing.closeTime, item.closeTime);
              existing.timestamp = Math.max(existing.timestamp, item.timestamp);
              existing.id = `${existing.id}_${item.id}`;
            } else {
              segmentMergedHistory.push({ ...item });
            }
          }

          allNewMatchedHistory.push(...segmentMergedHistory);
        }
      }

      // Save all newly matched records to local SQLite
      if (allNewMatchedHistory.length > 0) {
        addLog(`成功获取并计算出缺失区段的 ${allNewMatchedHistory.length} 条全新仓位历史记录，正在持久化补全本地数据库...`, 'SUCCESS');
        const dbSaveRes = await fetch('/api/position-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ history: allNewMatchedHistory })
        });
        if (dbSaveRes.ok) {
          addLog(`已成功补全本地 SQLite 数据库，已对新产生的 ${allNewMatchedHistory.length} 条记录进行了补足。`, 'SUCCESS');
        }
      } else {
        addLog('未在缺失区段发现任何需要补全的平仓成交记录。', 'INFO');
      }

      // Reload the updated history from local DB for this account, filtered to the user selected range
      const updatedLocalRes = await fetch(`/api/position-history?account=${encodeURIComponent(activeAccount)}`);
      if (updatedLocalRes.ok) {
        const fullHistoryList: PositionHistory[] = await updatedLocalRes.json();
        const filteredList = fullHistoryList.filter(h => h.openTime >= requestedStartTime && h.closeTime <= requestedEndTime);
        setPositionHistory(filteredList);
        // Sync report selector to view this account
        setSelectedReportAccount(activeAccount);
        setSelectedReportAccounts([activeAccount]);
        addLog(`同步补全完成！当前时间段 [${dateRange.start} 至 ${dateRange.end}] 共计 ${filteredList.length} 条独立闭合仓位记录已成功加载展示。`, 'SUCCESS');
      }

      // Fetch the available accounts list as well so the dropdown stays in sync
      fetchAvailableAccounts();

    } catch (error) {
      console.error(error);
      addLog('获取历史记录并进行闭环汇总时发生异常', 'ERROR');
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const formatDateChinese = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${year}年${month}月${day}日`;
  };

  const renderReportView = () => {
    const totalTradesCount = trendCandles.reduce((sum, c) => sum + (c.tradesCount || 0), 0);

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="grid grid-cols-1 gap-6">
          {/* Trend Analysis (走势分析) Chart */}
          <section className="financial-card p-6" id="trend-analysis-section">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#232326] pb-4 mb-6">
              {/* Left Side: Title and toggle */}
              <div className="flex flex-wrap items-center gap-6">
                <div 
                  className="flex items-center gap-2 cursor-pointer hover:opacity-80 select-none"
                  onClick={() => setIsTrendAnalysisVisible(!isTrendAnalysisVisible)}
                >
                  <span className="text-emerald-500 font-bold">$</span>
                  <h2 className="font-semibold text-sm text-white flex items-center gap-2">
                    走势分析
                  </h2>
                  <span className="text-zinc-500 text-[10px] uppercase font-mono ml-2 border border-[#232326] px-1.5 py-0.5 rounded-md hover:text-zinc-300">
                    {isTrendAnalysisVisible ? 'HIDE' : 'SHOW'}
                  </span>
                </div>
                
                {isTrendAnalysisVisible && (
                  <>
                    {/* Opacity slider */}
                    <div className="flex items-center gap-2 bg-[#141416]/50 px-3 py-1.5 rounded-lg border border-[#232326]">
                      <span className="text-xs text-zinc-400">悬浮窗透明度:</span>
                      <input 
                        type="range" 
                        min="10" 
                        max="100" 
                        value={trendOpacity} 
                        onChange={(e) => setTrendOpacity(Number(e.target.value))}
                        className="w-20 md:w-28 accent-emerald-500 cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
                      />
                      <span className="text-xs font-mono text-zinc-300 w-8 text-right">{trendOpacity}%</span>
                    </div>

                    {/* Initial capital config */}
                    <div className="flex items-center gap-1.5 bg-[#141416]/50 px-3 py-1.5 rounded-lg border border-[#232326]">
                      <span className="text-xs text-zinc-400">期初余额:</span>
                      <input 
                        type="number"
                        value={trendInitialBalance}
                        onChange={(e) => setTrendInitialBalance(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-20 bg-transparent text-xs text-emerald-400 font-mono focus:outline-none focus:ring-0 font-semibold"
                      />
                      <span className="text-[10px] text-zinc-500 font-mono">USDT</span>
                    </div>
                  </>
                )}
              </div>

              {/* Right Side: Chart buttons & timeframe */}
              {isTrendAnalysisVisible && (
                <div className="flex flex-wrap items-center gap-3">
                  {/* Chart type toggles */}
                  <div className="flex items-center bg-[#141416] p-1 rounded-lg border border-[#232326]">
                    <button
                      onClick={() => setTrendChartType('candle')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        trendChartType === 'candle'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                      }`}
                    >
                      📊 蜡烛图
                    </button>
                    <button
                      onClick={() => setTrendChartType('line')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        trendChartType === 'line'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                      }`}
                    >
                      📈 分时图
                    </button>
                  </div>

                  {/* Timeframes */}
                  <div className="flex items-center bg-[#141416] p-1 rounded-lg border border-[#232326]">
                    {(['1h', '4h', '1d', '1w', '1M'] as const).map((tf) => {
                      const labelMap = { '1h': '1小时', '4h': '4小时', '1d': '日线', '1w': '周线', '1M': '月线' };
                      return (
                        <button
                          key={tf}
                          onClick={() => {
                            setTrendTimeframe(tf);
                            handleAnalyzeTrend(tf);
                          }}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                            trendTimeframe === tf
                              ? 'bg-zinc-800 text-white font-semibold'
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {labelMap[tf]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Content Area */}
            {isTrendAnalysisVisible && (
              <div className="grid grid-cols-1 lg:grid-cols-8 gap-6">
                {/* Left sidebar: Stats overlay block */}
                <div className="lg:col-span-1 bg-[#141416]/60 border border-[#232326] rounded-xl p-4 flex flex-col justify-between h-full min-h-[160px] select-none text-[10px] xl:text-xs w-1/2 lg:w-full lg:max-w-[180px]">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
                      <div className="w-1.5 h-3 bg-emerald-500 rounded-full" />
                      <span className="text-xs font-semibold text-zinc-300">区间 K线统计</span>
                    </div>

                    <div className="space-y-3 font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">可见k:</span>
                        <span className="text-zinc-200 font-bold">{visibleTrendCandles.length} 根</span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40 text-rose-200/90">
                        <span className="text-zinc-500">汇总次数:</span>
                        <span className="text-zinc-200 font-bold">{visibleTrendCandles.reduce((sum, c) => sum + (c.tradesCount || 0), 0)} 次</span>
                      </div>

                      <div className="space-y-1 pt-1 border-t border-zinc-800/40">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500">收涨:</span>
                          <span className="text-emerald-500 font-bold">
                            {visibleTrendCandles.filter(c => c.close >= c.open).length} 根 ({
                              visibleTrendCandles.length > 0 
                                ? ((visibleTrendCandles.filter(c => c.close >= c.open).length / visibleTrendCandles.length) * 100).toFixed(1)
                                : '0.0'
                            }%)
                          </span>
                        </div>
                        <div className="flex items-center justify-between pl-3 text-[11px]">
                          <span className="text-zinc-600">均涨:</span>
                          <span className="text-emerald-400 font-semibold">
                            +{(() => {
                              const ups = visibleTrendCandles.filter(c => c.close >= c.open);
                              if (ups.length === 0) return '0.00';
                              const sum = ups.reduce((acc, c) => acc + ((c.close - c.open) / (c.open || 1)), 0);
                              return ((sum / ups.length) * 100).toFixed(2);
                            })()}%
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 pt-1 border-t border-zinc-800/40">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500">收跌:</span>
                          <span className="text-red-500 font-bold">
                            {visibleTrendCandles.filter(c => c.close < c.open).length} 根 ({
                              visibleTrendCandles.length > 0 
                                ? ((visibleTrendCandles.filter(c => c.close < c.open).length / visibleTrendCandles.length) * 100).toFixed(1)
                                : '0.0'
                            }%)
                          </span>
                        </div>
                        <div className="flex items-center justify-between pl-3 text-[11px]">
                          <span className="text-zinc-600">均跌:</span>
                          <span className="text-red-400 font-semibold">
                            -{(() => {
                              const dns = visibleTrendCandles.filter(c => c.close < c.open);
                              if (dns.length === 0) return '0.00';
                              const sum = dns.reduce((acc, c) => acc + ((c.open - c.close) / (c.open || 1)), 0);
                              return ((sum / dns.length) * 100).toFixed(2);
                            })()}%
                          </span>
                        </div>
                      </div>

                      {/* 新增：“总盈亏”和“总胜率” */}
                      <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800/45">
                        <span className="text-zinc-500">总盈亏:</span>
                        <span className={`font-bold ${
                          (() => {
                            const vpnl = visibleTrendCandles.reduce((sum, c) => sum + (c.pnlSum || 0), 0);
                            return vpnl >= 0 ? 'text-emerald-500' : 'text-red-500';
                          })()
                        }`}>
                          {(() => {
                            const vpnl = visibleTrendCandles.reduce((sum, c) => sum + (c.pnlSum || 0), 0);
                            return `${vpnl >= 0 ? '+' : ''}${vpnl.toFixed(2)}`;
                          })()}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800/45">
                        <span className="text-zinc-500">总胜率:</span>
                        <span className="text-blue-400 font-bold">
                          {(() => {
                            const vcount = visibleTrendCandles.length;
                            const vups = visibleTrendCandles.filter(c => c.close >= c.open).length;
                            return vcount > 0 ? ((vups / vcount) * 100).toFixed(1) : '0.0';
                          })()}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-zinc-800/40 text-[10px] text-zinc-500 space-y-1 italic">
                    <p>💡 逻辑释义：将盈亏累计在期初余额上，呈现高保真多周期账户余额权益走势。</p>
                  </div>
                </div>

                {/* Right: The Dynamic Chart Canvas */}
                <div 
                  ref={trendContainerRef}
                  onMouseEnter={() => setIsTrendHovered(true)}
                  onMouseLeave={() => setIsTrendHovered(false)}
                  className="lg:col-span-7 h-[380px] w-full border border-zinc-800/40 rounded-xl bg-[#141416]/20 p-2 relative"
                >
                  {visibleTrendCandles.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-6 text-zinc-500 italic border border-zinc-950/40 rounded-xl bg-[#141416]/20 text-center">
                      <TrendingUp size={24} className="mb-2 text-emerald-500 animate-pulse" />
                      <span className="text-sm">暂无分析数据。请选择账户并点击右上方的 K线 周期按钮（如「1小时」、「4小时」、「日线」、「周线」、「月线」）来主动对选中账户的“仓位历史记录”进行数据分析。</span>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      {trendChartType === 'candle' ? (
                        <BarChart data={visibleTrendCandles} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#232326" vertical={false} />
                          <XAxis 
                            dataKey="name" 
                            stroke="#52525b" 
                            fontSize={9} 
                            tickLine={false} 
                            axisLine={false}
                            dy={6}
                          />
                          <YAxis 
                            stroke="#52525b" 
                            fontSize={9} 
                            tickLine={false} 
                            axisLine={false}
                            domain={['auto', 'auto']}
                            tickFormatter={(v) => Number(v).toFixed(0)}
                          />
                          <Tooltip content={<CustomTrendTooltip opacity={trendOpacity} />} cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }} />
                          <Bar 
                            dataKey="range" 
                            shape={<Candlestick />} 
                            isAnimationActive={false}
                          />
                        </BarChart>
                      ) : (
                        <AreaChart data={visibleTrendCandles} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="balanceTrendGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10B981" stopOpacity={0.25}/>
                              <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#232326" vertical={false} />
                          <XAxis 
                            dataKey="name" 
                            stroke="#52525b" 
                            fontSize={9} 
                            tickLine={false} 
                            axisLine={false}
                            dy={6}
                          />
                          <YAxis 
                            stroke="#52525b" 
                            fontSize={9} 
                            tickLine={false} 
                            axisLine={false}
                            domain={['auto', 'auto']}
                            tickFormatter={(v) => Number(v).toFixed(0)}
                          />
                          <Tooltip content={<CustomTrendTooltip opacity={trendOpacity} />} cursor={{ stroke: 'rgba(16, 185, 129, 0.2)', strokeWidth: 1 }} />
                          <Area 
                            type="monotone" 
                            dataKey="close" 
                            stroke="#10B981" 
                            strokeWidth={2} 
                            fillOpacity={1} 
                            fill="url(#balanceTrendGrad)" 
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      )}
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Trend Chart */}
          <section className="financial-card p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-6">
                <div 
                  className="flex items-center gap-2 cursor-pointer hover:opacity-80 select-none"
                  onClick={() => setIsStreakChartVisible(!isStreakChartVisible)}
                >
                  <TrendingUp size={18} className="text-emerald-500" />
                  <h2 className="font-semibold flex items-center gap-2">
                    连续赢/亏走势图
                  </h2>
                  <span className="text-zinc-500 text-[10px] uppercase font-mono ml-2 border border-[#232326] px-1.5 py-0.5 rounded-md hover:text-zinc-300">
                    {isStreakChartVisible ? 'HIDE' : 'SHOW'}
                  </span>
                </div>
                
                {/* Summary Stats */}
                {isStreakChartVisible && (
                  <div className="hidden md:flex items-center gap-6 pl-6 border-l border-[#232326]">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">总盈亏汇总</span>
                      <span className={`text-sm font-mono font-bold ${historyTotals.totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {historyTotals.totalPnl >= 0 ? '+' : ''}{historyTotals.totalPnl.toFixed(2)} USDT
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">手续费汇总</span>
                      <span className="text-sm font-mono font-bold text-zinc-300">
                        -{Math.abs(historyTotals.totalCommission).toFixed(2)} USDT
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">资金费汇总</span>
                      <span className={`text-sm font-mono font-bold ${historyTotals.totalFunding >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {historyTotals.totalFunding >= 0 ? '+' : ''}{historyTotals.totalFunding.toFixed(4)} USDT
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">胜率</span>
                      <span className="text-sm font-mono font-bold text-blue-500">
                        {historyTotals.totalTrades > 0 
                          ? ((historyTotals.wins / historyTotals.totalTrades) * 100).toFixed(1) 
                          : '0.0'}%
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">次数</span>
                      <span className="text-sm font-mono font-bold text-amber-500">
                        {historyTotals.totalTrades}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {isStreakChartVisible && (
                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
                    <span className="text-zinc-400">连续盈利</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-red-500 rounded-sm" />
                    <span className="text-zinc-400">连续亏损</span>
                  </div>
                </div>
              )}
            </div>
            
            {isStreakChartVisible && (
              <div 
                ref={streakContainerRef}
                onMouseEnter={() => setIsStreakHovered(true)}
                onMouseLeave={() => setIsStreakHovered(false)}
                className="h-[350px] w-full border border-zinc-800/40 rounded-xl bg-[#141416]/20 p-2 relative"
              >
                {visibleStreakData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-zinc-600 italic">
                    暂无历史数据，请先进行交易
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={visibleStreakData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#232326" vertical={false} />
                      <XAxis 
                        dataKey="name" 
                        stroke="#52525b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="#52525b" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#141416', border: '1px solid #232326', borderRadius: '8px' }}
                        cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                        formatter={(value: any, name: any, props: any) => [value, props.payload.isWin ? '连续盈利次数' : '连续亏损次数']}
                      />
                      <Bar 
                        dataKey="count" 
                        radius={[4, 4, 0, 0]} 
                        barSize={Math.min(60, 800 / visibleStreakData.length)}
                        isAnimationActive={false}
                      >
                        {visibleStreakData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                        <LabelList dataKey="count" position="top" fill="#fff" fontSize={12} offset={10} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </section>

          {/* Position History Table */}
          <section className="financial-card overflow-hidden">
            <div className="p-5 border-b border-[#232326] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-blue-500" />
                  <h2 className="font-semibold">仓位历史记录</h2>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    onClick={fetchHistoryFromBinance}
                    disabled={isFetchingHistory || !isConnected}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded transition-colors disabled:opacity-50"
                  >
                    {isFetchingHistory ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {isFetchingHistory ? '同步中...' : '同步历史'}
                  </button>

                  <div className="flex items-center gap-1.5 bg-[#1C1C1E] px-2.5 py-1.5 rounded border border-[#232326]">
                    <span className="text-[10px] text-zinc-500">限速策略:</span>
                    <select
                      value={rateLimitDelay}
                      onChange={e => setRateLimitDelay(Number(e.target.value))}
                      disabled={isFetchingHistory}
                      className="bg-transparent text-[11px] text-zinc-300 outline-none border-none cursor-pointer focus:outline-none"
                    >
                      <option value={0} className="bg-[#1C1C1E] text-zinc-300">不限速 (0ms)</option>
                      <option value={100} className="bg-[#1C1C1E] text-zinc-300">极速模式 (100ms)</option>
                      <option value={300} className="bg-[#1C1C1E] text-zinc-300 font-medium">推荐安全 (300ms)</option>
                      <option value={800} className="bg-[#1C1C1E] text-zinc-300">防卡安防 (800ms)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* 账目筛选：可勾选单个/多个/全账户 */}
                <div className="relative" ref={accountDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsAccountDropdownOpen(prev => !prev)}
                    className="flex items-center gap-2 bg-[#1C1C1E] hover:bg-[#232326] px-3 py-1.5 rounded border border-[#232326] transition-colors cursor-pointer text-xs select-none"
                    title="点击筛选单个/多个/全账户统计"
                  >
                    <span className="text-[10px] text-zinc-500 uppercase font-semibold">账目</span>
                    <span className="text-white font-medium max-w-[130px] truncate">
                      {displayAccountLabel}
                    </span>
                    <ChevronDown size={13} className={`text-zinc-400 transition-transform duration-200 ${isAccountDropdownOpen ? 'rotate-180 text-blue-400' : ''}`} />
                  </button>

                  {/* 弹出下拉面板 */}
                  {isAccountDropdownOpen && (
                    <div className="absolute top-full mt-1.5 left-0 z-50 min-w-[220px] max-w-[300px] bg-[#161618] border border-[#2A2A2E] rounded-lg shadow-2xl py-2 flex flex-col text-xs text-zinc-200">
                      {/* 全账户 / 所有账户 勾选生效小组件 */}
                      <div 
                        className="px-3 py-1.5 flex items-center justify-between hover:bg-[#202025] cursor-pointer transition-colors group select-none"
                        onClick={handleToggleAllAccounts}
                      >
                        <div className="flex items-center gap-2.5">
                          <div 
                            className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                              isAllAccountsSelected 
                                ? 'bg-blue-600 border-blue-500 text-white shadow-sm shadow-blue-500/30' 
                                : isIndeterminate
                                  ? 'bg-blue-950/70 border-blue-500 text-blue-400'
                                  : 'border-zinc-600 bg-[#252529] group-hover:border-zinc-400'
                            }`}
                          >
                            {isAllAccountsSelected ? (
                              <Check size={12} strokeWidth={3} />
                            ) : isIndeterminate ? (
                              <div className="w-2 h-0.5 bg-blue-400 rounded-sm" />
                            ) : null}
                          </div>
                          <span className={`text-xs font-semibold ${isAllAccountsSelected ? 'text-white' : 'text-zinc-300'}`}>
                            所有账户 (全选)
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {selectedReportAccounts.length}/{availableAccounts.length}
                        </span>
                      </div>

                      <div className="h-px bg-[#26262B] my-1 mx-2" />

                      {/* 单个/多个账户勾选列表 */}
                      <div className="max-h-[220px] overflow-y-auto py-0.5">
                        {availableAccounts.length === 0 ? (
                          <div className="px-3 py-3 text-center text-zinc-500 text-[11px]">
                            暂无已同步账户记录
                          </div>
                        ) : (
                          availableAccounts.map(acc => {
                            const isChecked = selectedReportAccounts.includes(acc);
                            return (
                              <div
                                key={acc}
                                className="px-3 py-1.5 flex items-center justify-between hover:bg-[#202025] cursor-pointer transition-colors group select-none"
                                onClick={() => handleToggleAccount(acc)}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {/* 账户前的勾选生效小组件 */}
                                  <div 
                                    className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-all ${
                                      isChecked 
                                        ? 'bg-blue-600 border-blue-500 text-white shadow-sm shadow-blue-500/30' 
                                        : 'border-zinc-600 bg-[#252529] group-hover:border-zinc-400'
                                    }`}
                                  >
                                    {isChecked && <Check size={12} strokeWidth={3} />}
                                  </div>
                                  <span className={`text-xs truncate ${isChecked ? 'text-white font-medium' : 'text-zinc-400'}`} title={acc}>
                                    {acc}
                                  </span>
                                </div>

                                {/* 单击仅选此账户 */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectOnlyAccount(acc);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 text-[10px] text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/30 transition-all shrink-0 ml-2"
                                  title={`仅统计 ${acc}`}
                                >
                                  仅选此
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* 底部快捷控制栏 */}
                      {availableAccounts.length > 0 && (
                        <>
                          <div className="h-px bg-[#26262B] my-1 mx-2" />
                          <div className="px-3 pt-1 pb-0.5 flex items-center justify-between text-[11px] text-zinc-400">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedReportAccounts([...availableAccounts])}
                                className="text-zinc-400 hover:text-blue-400 transition-colors"
                              >
                                全选
                              </button>
                              <span className="text-zinc-600">|</span>
                              <button
                                type="button"
                                onClick={() => setSelectedReportAccounts([])}
                                className="text-zinc-400 hover:text-red-400 transition-colors"
                              >
                                清空
                              </button>
                            </div>
                            <span className="text-[10px] text-zinc-500">
                              {selectedReportAccounts.length === 0 
                                ? '未选择' 
                                : selectedReportAccounts.length === availableAccounts.length 
                                  ? '已选全部' 
                                  : `已选 ${selectedReportAccounts.length} 个`}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 bg-[#1C1C1E] px-3 py-1.5 rounded border border-[#232326]">
                  <span className="text-[10px] text-zinc-500 uppercase">开始</span>
                  <input 
                    type="date" 
                    className="bg-transparent text-xs text-white outline-none"
                    value={dateRange.start}
                    onChange={e => setDateRange({...dateRange, start: e.target.value})}
                  />
                  <span className="text-[10px] text-zinc-400 font-mono">({formatDateChinese(dateRange.start)})</span>
                </div>
                <div className="flex items-center gap-2 bg-[#1C1C1E] px-3 py-1.5 rounded border border-[#232326]">
                  <span className="text-[10px] text-zinc-500 uppercase">终止</span>
                  <input 
                    type="date" 
                    className="bg-transparent text-xs text-white outline-none"
                    value={dateRange.end}
                    onChange={e => setDateRange({...dateRange, end: e.target.value})}
                  />
                  <span className="text-[10px] text-zinc-400 font-mono">({formatDateChinese(dateRange.end)})</span>
                </div>
                <button 
                  onClick={exportToExcel}
                  disabled={positionHistory.length === 0}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold rounded transition-colors disabled:opacity-50"
                >
                  <Download size={14} />
                  下载表格 (.XLSX)
                </button>
              </div>
            </div>

            {/* Sync Progress Bar */}
            {isFetchingHistory && (
              <div className="bg-[#1C1C1E]/30 border-b border-[#232326] px-5 py-3.5 flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 font-medium flex items-center gap-2">
                    <RefreshCw size={12} className="animate-spin text-blue-500" />
                    {syncProgress.stage || '同步数据中...'}
                  </span>
                  {syncProgress.total > 0 && (
                    <span className="text-blue-400 font-mono text-[11px] bg-blue-500/10 px-1.5 py-0.5 rounded">
                      任务进度: {syncProgress.current} / {syncProgress.total} ({Math.round((syncProgress.current / syncProgress.total) * 100)}%)
                    </span>
                  )}
                </div>
                {syncProgress.total > 0 && (
                  <div className="w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
                    <div 
                      className="bg-blue-500 h-1 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(59,130,246,0.5)]" 
                      style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                    />
                  </div>
                )}
                {rateLimitDelay > 0 && (
                  <p className="text-[10px] text-zinc-500 italic">
                    💡 限速优化：已在本批次请求中激活硬休眠 {rateLimitDelay}ms/请求 的防护策略，防止高频调用被限制。
                  </p>
                )}
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-[#232326]">
                    <th className="px-5 py-3 font-medium">合约名称</th>
                    <th className="px-5 py-3 font-medium">账户</th>
                    <th className="px-5 py-3 font-medium">总盈亏</th>
                    <th className="px-5 py-3 font-medium">成交盈亏</th>
                    <th className="px-5 py-3 font-medium">手续费</th>
                    <th className="px-5 py-3 font-medium">资金费</th>
                    <th className="px-5 py-3 font-medium">收益率</th>
                    <th className="px-5 py-3 font-medium">开仓时间</th>
                    <th className="px-5 py-3 font-medium">最后平仓时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232326]">
                  {positionHistory.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-12 text-center text-zinc-600 italic text-sm">
                        暂无历史记录。
                      </td>
                    </tr>
                  ) : (
                    positionHistory.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((h) => (
                      <tr key={h.id} className="hover:bg-[#1C1C1E]/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-bold text-sm">{h.symbol}</div>
                          <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-block mt-1 ${
                            h.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                          }`}>
                            {h.side === 'BUY' ? '多' : '空'} ({h.positionSide})
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs font-mono text-zinc-300">
                          {h.account || '默认账户'}
                        </td>
                        <td className="px-5 py-4">
                          <div className={`font-bold text-sm ${h.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {h.pnl >= 0 ? '+' : ''}{h.pnl.toFixed(2)}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className={`text-xs ${h.tradePnl >= 0 ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                            {h.tradePnl.toFixed(2)}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs text-red-400/70 font-mono">
                          {h.commission.toFixed(2)}
                        </td>
                        <td className="px-5 py-4 text-xs text-amber-400/70 font-mono">
                          {h.fundingFee.toFixed(2)}
                        </td>
                        <td className="px-5 py-4 font-mono text-sm">
                          {(() => {
                            const contractVolume = h.entryPrice * h.amount;
                            const yieldRate = contractVolume > 0 ? (h.pnl / contractVolume) : 0;
                            const displayRate = yieldRate * 100;
                            return (
                              <div className={`font-bold ${yieldRate >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {yieldRate >= 0 ? '+' : ''}{displayRate.toFixed(3)}%
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-5 py-4 text-xs text-zinc-500 font-mono">
                          {new Date(h.openTime).toLocaleString()}
                        </td>
                        <td className="px-5 py-4 text-xs text-zinc-500 font-mono">
                          {new Date(h.closeTime).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {positionHistory.length > ITEMS_PER_PAGE && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-[#232326] gap-4 bg-[#1C1C1E]/20">
                <span className="text-xs text-zinc-500 font-mono">
                  显示第 {(currentPage - 1) * ITEMS_PER_PAGE + 1} 至 {Math.min(currentPage * ITEMS_PER_PAGE, positionHistory.length)} 条，共 {positionHistory.length} 条记录
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 bg-[#1C1C1E] border border-[#232326] text-[11px] text-zinc-400 rounded hover:bg-[#232326] disabled:opacity-30 disabled:hover:bg-[#1C1C1E] transition-all"
                  >
                    首页
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1.5 bg-[#1C1C1E] border border-[#232326] text-[11px] text-zinc-400 rounded hover:bg-[#232326] disabled:opacity-30 disabled:hover:bg-[#1C1C1E] transition-all"
                  >
                    上一页
                  </button>
                  <span className="text-xs text-zinc-400 px-3 py-1 bg-black/30 border border-[#232326] rounded font-mono">
                    {currentPage} / {Math.ceil(positionHistory.length / ITEMS_PER_PAGE)}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(positionHistory.length / ITEMS_PER_PAGE), prev + 1))}
                    disabled={currentPage === Math.ceil(positionHistory.length / ITEMS_PER_PAGE)}
                    className="px-2.5 py-1.5 bg-[#1C1C1E] border border-[#232326] text-[11px] text-zinc-400 rounded hover:bg-[#232326] disabled:opacity-30 disabled:hover:bg-[#1C1C1E] transition-all"
                  >
                    下一页
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.ceil(positionHistory.length / ITEMS_PER_PAGE))}
                    disabled={currentPage === Math.ceil(positionHistory.length / ITEMS_PER_PAGE)}
                    className="px-2.5 py-1.5 bg-[#1C1C1E] border border-[#232326] text-[11px] text-zinc-400 rounded hover:bg-[#232326] disabled:opacity-30 disabled:hover:bg-[#1C1C1E] transition-all"
                  >
                    末页
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen flex flex-col w-full pt-2.5 pb-10 px-4 md:px-8 xl:px-12 ${
      activeMainTab === 'TRADE' ? 'lg:h-screen lg:max-h-screen lg:overflow-hidden' : 'space-y-4'
    }`}>
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-[#232326] pb-2.5 gap-4 animate-in fade-in duration-300 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* Card 1: 交易辅助 */}
          <button
            onClick={() => {
              setActiveMainTab('TRADE');
            }}
            id="btn-active-tab-trade"
            className={`flex items-center justify-center gap-2 px-3 rounded-xl border transition-all text-center relative overflow-hidden h-[50px] w-[205px] group cursor-pointer ${
              activeMainTab === 'TRADE'
              ? 'bg-[#388e3c] border-[#388e3c] shadow-lg shadow-[#388e3c]/20 ring-1 ring-[#388e3c]/30'
              : 'bg-[#388e3c]/15 border-[#388e3c]/25 hover:border-[#388e3c]/45 hover:bg-[#388e3c]/25'
            }`}
          >
            {activeMainTab === 'TRADE' && (
              <div className="absolute top-0 left-0 w-1 h-full bg-white opacity-40 animate-pulse" />
            )}
            <div className={`p-1.5 rounded-lg transition-colors shrink-0 ${
              activeMainTab === 'TRADE' ? 'bg-white/20 text-white' : 'bg-[#388e3c]/15 text-[#388e3c]/80 group-hover:text-[#388e3c]'
            }`}>
              <Zap size={16} className={activeMainTab === 'TRADE' ? 'fill-white/20' : 'fill-[#388e3c]/10'} />
            </div>
            <div className="min-w-0">
              <h3 className={`font-bold text-[18px] leading-none transition-colors ${
                activeMainTab === 'TRADE' ? 'text-white' : 'text-[#388e3c]/90 group-hover:text-[#388e3c]'
              }`}>
                交易辅助
              </h3>
            </div>
          </button>

          {/* Card 2: 监控辅助 */}
          <button
            onClick={() => {
              setActiveMainTab('MONITOR');
            }}
            id="btn-active-tab-monitor"
            className={`flex items-center justify-center gap-2 px-3 rounded-xl border transition-all text-center relative overflow-hidden h-[50px] w-[205px] group cursor-pointer ${
              activeMainTab === 'MONITOR'
              ? 'bg-[#ff8a65] border-[#ff8a65] shadow-lg shadow-[#ff8a65]/20 ring-1 ring-[#ff8a65]/30'
              : 'bg-[#ff8a65]/15 border-[#ff8a65]/25 hover:border-[#ff8a65]/45 hover:bg-[#ff8a65]/25'
            }`}
          >
            {activeMainTab === 'MONITOR' && (
              <div className="absolute top-0 left-0 w-1 h-full bg-zinc-950 opacity-40 animate-pulse" />
            )}
            <div className={`p-1.5 rounded-lg transition-colors shrink-0 ${
              activeMainTab === 'MONITOR' ? 'bg-zinc-950/20 text-zinc-950' : 'bg-[#ff8a65]/15 text-[#ff8a65]/80 group-hover:text-[#ff8a65]'
            }`}>
              <Activity size={16} className={activeMainTab === 'MONITOR' ? 'fill-zinc-900/10' : 'fill-[#ff8a65]/10'} />
            </div>
            <div className="min-w-0">
              <h3 className={`font-bold text-[18px] leading-none transition-colors ${
                activeMainTab === 'MONITOR' ? 'text-zinc-950' : 'text-[#ff8a65]/90 group-hover:text-[#ff8a65]'
              }`}>
                监控辅助
              </h3>
            </div>
          </button>

          {/* Card 2b: 监控辅助（4h） */}
          <button
            onClick={() => {
              setActiveMainTab('MONITOR_4H');
            }}
            id="btn-active-tab-monitor-4h"
            className={`flex items-center justify-center gap-2 px-3 rounded-xl border transition-all text-center relative overflow-hidden h-[50px] w-[215px] group cursor-pointer ${
              activeMainTab === 'MONITOR_4H'
              ? 'bg-[#b39ddb] border-[#b39ddb] shadow-lg shadow-[#b39ddb]/20 ring-1 ring-[#b39ddb]/30'
              : 'bg-[#b39ddb]/15 border-[#b39ddb]/25 hover:border-[#b39ddb]/45 hover:bg-[#b39ddb]/25'
            }`}
          >
            {activeMainTab === 'MONITOR_4H' && (
              <div className="absolute top-0 left-0 w-1 h-full bg-zinc-950 opacity-40 animate-pulse" />
            )}
            <div className={`p-1.5 rounded-lg transition-colors shrink-0 ${
              activeMainTab === 'MONITOR_4H' ? 'bg-zinc-950/20 text-zinc-950' : 'bg-[#b39ddb]/15 text-[#b39ddb]/80 group-hover:text-[#b39ddb]'
            }`}>
              <Activity size={16} className={activeMainTab === 'MONITOR_4H' ? 'fill-zinc-900/10' : 'fill-[#b39ddb]/10'} />
            </div>
            <div className="min-w-0">
              <h3 className={`font-bold text-[18px] leading-none transition-colors ${
                activeMainTab === 'MONITOR_4H' ? 'text-zinc-950' : 'text-[#b39ddb]/90 group-hover:text-[#b39ddb]'
              }`}>
                监控辅助（4h）
              </h3>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Card 3: 报表统计 */}
          <button
            onClick={() => {
              setActiveMainTab('REPORT');
            }}
            id="btn-active-tab-report"
            className={`flex items-center justify-center gap-2 px-3 rounded-xl border transition-all text-center relative overflow-hidden h-[50px] w-[205px] group cursor-pointer ${
              activeMainTab === 'REPORT'
              ? 'bg-[#039be5] border-[#039be5] shadow-lg shadow-[#039be5]/20 ring-1 ring-[#039be5]/30'
              : 'bg-[#039be5]/15 border-[#039be5]/25 hover:border-[#039be5]/45 hover:bg-[#039be5]/25'
            }`}
          >
            {activeMainTab === 'REPORT' && (
              <div className="absolute top-0 left-0 w-1 h-full bg-white opacity-40 animate-pulse" />
            )}
            <div className={`p-1.5 rounded-lg transition-colors shrink-0 ${
              activeMainTab === 'REPORT' ? 'bg-white/20 text-white' : 'bg-[#039be5]/15 text-[#039be5]/80 group-hover:text-[#039be5]'
            }`}>
              <FileText size={16} className={activeMainTab === 'REPORT' ? 'fill-white/10' : 'fill-[#039be5]/10'} />
            </div>
            <div className="min-w-0">
              <h3 className={`font-bold text-[18px] leading-none transition-colors ${
                activeMainTab === 'REPORT' ? 'text-white' : 'text-[#039be5]/90 group-hover:text-[#039be5]'
              }`}>
                报表统计
              </h3>
            </div>
          </button>

          {/* Card 4: 权重统计 */}
          <button
            onClick={() => {
              setActiveMainTab('WEIGHT_STATS');
            }}
            id="btn-active-tab-weight-stats"
            className={`flex items-center justify-center gap-2 px-3 rounded-xl border transition-all text-center relative overflow-hidden h-[50px] w-[205px] group cursor-pointer ${
              activeMainTab === 'WEIGHT_STATS'
              ? 'bg-[#00acc1] border-[#00acc1] shadow-lg shadow-[#00acc1]/20 ring-1 ring-[#00acc1]/30'
              : 'bg-[#00acc1]/15 border-[#00acc1]/25 hover:border-[#00acc1]/45 hover:bg-[#00acc1]/25'
            }`}
          >
            {activeMainTab === 'WEIGHT_STATS' && (
              <div className="absolute top-0 left-0 w-1 h-full bg-white opacity-40 animate-pulse" />
            )}
            <div className={`p-1.5 rounded-lg transition-colors shrink-0 ${
              activeMainTab === 'WEIGHT_STATS' ? 'bg-white/20 text-white' : 'bg-[#00acc1]/15 text-[#00acc1]/80 group-hover:text-[#00acc1]'
            }`}>
              <BarChart2 size={16} className={activeMainTab === 'WEIGHT_STATS' ? 'fill-white/10' : 'fill-[#00acc1]/10'} />
            </div>
            <div className="min-w-0">
              <h3 className={`font-bold text-[18px] leading-none transition-colors ${
                activeMainTab === 'WEIGHT_STATS' ? 'text-white' : 'text-[#00acc1]/90 group-hover:text-[#00acc1]'
              }`}>
                权重统计
              </h3>
            </div>
          </button>

          {/* 闹钟组件 (位于报表统计与恢复之间) */}
          <AlarmNavButton 
            settings={alarmSettings}
            onOpenModal={() => setIsAlarmModalOpen(true)}
            onToggleGlobal={handleToggleAlarmGlobal}
          />

          {/* 一键静音 / 恢复组件 */}
          <button
            onClick={() => {
              const newState = !isMuted;
              setIsMuted(newState);
              localStorage.setItem('global_mute_state', String(newState));
              addLog(`[系统] 一键静音已${newState ? '开启，全局警报处于静音状态' : '关闭，警报声音已恢复'}`, newState ? 'INFO' : 'SUCCESS');
            }}
            id="btn-global-mute-toggle"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md transition-all active:scale-[0.97] ${
              isMuted 
              ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/15 animate-pulse' 
              : 'bg-[#141416] border-[#232326] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
            }`}
            title={isMuted ? "点击恢复音量" : "点击一键静音"}
          >
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span className="text-xs font-semibold">{isMuted ? '静音' : '恢复'}</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#141416] border border-[#232326] rounded-md">
            <Server size={14} className="text-zinc-500" />
            <span className="text-xs font-mono text-zinc-400">
              服务器 IP: {showServerIp ? serverIp : '******'}
            </span>
            <div className="flex items-center gap-1.5 ml-1 border-l border-[#232326] pl-1.5">
              <button
                onClick={() => setShowServerIp(prev => !prev)}
                className="text-zinc-500 hover:text-zinc-300 active:scale-95 transition-all p-0.5"
                title={showServerIp ? "隐藏 IP 信息" : "显示 IP 信息"}
              >
                {showServerIp ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button
                onClick={handleFetchIp}
                disabled={isQueryingIp}
                className={`text-zinc-500 hover:text-zinc-300 active:scale-95 disabled:opacity-30 transition-all p-0.5 ${
                  isQueryingIp ? 'animate-spin text-blue-500' : ''
                }`}
                title="手动刷新/查询 IP"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <div 
                className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md text-xs font-medium transition-all ${
                  userStreamStatus === 'CONNECTED'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-sm shadow-emerald-500/10'
                    : userStreamStatus === 'CONNECTING' || userStreamStatus === 'RECONNECTING'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-zinc-800/80 border-zinc-700/60 text-zinc-400'
                }`} 
                title={
                  userStreamStatus === 'CONNECTED' 
                    ? '币安官方 WebSocket 私有流 (wss://fstream.binance.com/private/ws) 实时推流中，享受 0 API 权重毫秒级推送 (REST 兜底设为 30 秒)' 
                    : userStreamStatus === 'RECONNECTING'
                    ? '正在自动重连 Binance WebSocket 私有流 (已自动启动 3 秒 REST 应急轮询接管)'
                    : userStreamStatus === 'CONNECTING'
                    ? '正在申请全局 ListenKey 并建立私有推流长连接...'
                    : 'WebSocket 未激活 (当前依赖 30 秒兜底轮询)'
                }
              >
                <div className={`w-1.5 h-1.5 rounded-full ${
                  userStreamStatus === 'CONNECTED'
                    ? 'bg-emerald-400 animate-pulse'
                    : userStreamStatus === 'CONNECTING' || userStreamStatus === 'RECONNECTING'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-zinc-500'
                }`} />
                <span className="font-mono">
                  {userStreamStatus === 'CONNECTED' 
                    ? 'WS私有流 0权重⚡' 
                    : userStreamStatus === 'RECONNECTING' 
                    ? 'WS重连中(3s轮询)' 
                    : userStreamStatus === 'CONNECTING' 
                    ? 'WS连接中...' 
                    : 'WS未激活(30s轮询)'}
                </span>
              </div>
            )}
            <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-md transition-colors ${
              isConnected 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
              : 'bg-red-500/10 border-red-500/20 text-red-500'
            }`}>
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-xs font-medium uppercase">{isConnected ? '已连接' : '未连接'}</span>
            </div>
          </div>
        </div>
      </header>

      <div className={activeMainTab === 'TRADE' ? 'flex-1 min-h-0 flex flex-col mt-2.5 overflow-hidden' : 'hidden'}>
        <div className={`flex flex-col lg:flex-row items-stretch gap-0 flex-1 min-h-0 h-full overflow-hidden ${isResizingSidebar ? 'select-none cursor-col-resize' : ''}`}>
          {/* Left Column: API & Config & Account & Logs */}
          <div 
            style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${tradeSidebarWidth}px` : undefined }}
            className="w-full lg:w-auto shrink-0 flex flex-col space-y-3 h-full min-h-0 overflow-hidden pr-0 lg:pr-1"
          >
          {/* Account Status */}
          <section className="financial-card p-4 space-y-3 shrink-0">
            {!isConnected ? (
              <div className="py-8 text-center space-y-2 border border-dashed border-[#232326] rounded-lg">
                <AlertCircle size={24} className="mx-auto text-zinc-600" />
                <p className="text-xs text-zinc-500">请先验证 API 连接以查看余额</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="financial-label">总资产</label>
                  <div className="text-xl font-mono font-bold text-emerald-500">{balance.balance.toFixed(2)} <span className="text-xs text-zinc-500">USDT</span></div>
                </div>
                <div className="space-y-1">
                  <label className="financial-label">可用保证金</label>
                  <div className="text-xl font-mono font-bold text-blue-500">{balance.available.toFixed(2)} <span className="text-xs text-zinc-500">USDT</span></div>
                </div>
                <div className="space-y-1 pt-2 border-t border-[#232326]">
                  <label className="financial-label">现货余额</label>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-mono font-bold text-zinc-300">{(balance.spotBalance || 0).toFixed(2)} <span className="text-xs text-zinc-500">USDT</span></span>
                    <button 
                      type="button"
                      onClick={() => {
                        setTransferType('futures_to_spot');
                        setTransferAmount('');
                        setIsTransferModalOpen(true);
                      }}
                      className="flex items-center justify-center w-6 h-6 bg-gradient-to-r from-emerald-400 to-green-500 hover:from-emerald-300 hover:to-green-400 active:from-emerald-500 active:to-green-600 text-slate-900 border-2 border-emerald-600 shadow-[0_2.5px_0_#047857] hover:scale-110 active:translate-y-[1.5px] active:shadow-[0_1px_0_#047857] transition-all duration-200 rounded-lg cursor-pointer"
                      title="点击划转 (从 合约 划转到 现货)"
                    >
                      <Plus size={14} className="stroke-[4.5]" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1 pt-2 border-t border-[#232326]">
                  <label className="financial-label">合约余额</label>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-mono font-bold text-zinc-300">{(balance.futuresBalance || 0).toFixed(2)} <span className="text-xs text-zinc-500">USDT</span></span>
                    <button 
                      type="button"
                      onClick={() => {
                        setTransferType('spot_to_futures');
                        setTransferAmount('');
                        setIsTransferModalOpen(true);
                      }}
                      className="flex items-center justify-center w-6 h-6 bg-gradient-to-r from-emerald-400 to-green-500 hover:from-emerald-300 hover:to-green-400 active:from-emerald-500 active:to-green-600 text-slate-900 border-2 border-emerald-600 shadow-[0_2.5px_0_#047857] hover:scale-110 active:translate-y-[1.5px] active:shadow-[0_1px_0_#047857] transition-all duration-200 rounded-lg cursor-pointer"
                      title="点击划转 (从 现货 划转到 合约)"
                    >
                      <Plus size={14} className="stroke-[4.5]" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Trade + Risk Control Configuration */}
          <section className="financial-card border-l-2 border-l-amber-500/50 shrink-0">
            <div 
              className="flex justify-between items-center cursor-pointer p-5 pb-2"
              onClick={() => setIsTradeRiskVisible(!isTradeRiskVisible)}
            >
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-amber-500" />
                <h2 className="font-semibold">交易+风控</h2>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTradeRiskVisible(!isTradeRiskVisible);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 border ${
                  isTradeRiskVisible
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25 hover:text-amber-200'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30 hover:text-amber-100 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                }`}
                title={isTradeRiskVisible ? '点击收起交易+风控' : '点击展开交易+风控'}
              >
                <span>{isTradeRiskVisible ? '收起' : '展开'}</span>
                {isTradeRiskVisible ? <ChevronUp size={13} className="stroke-[2.5]" /> : <ChevronDown size={13} className="stroke-[2.5]" />}
              </button>
            </div>
            
            {isTradeRiskVisible && (
              <div className="p-5 pt-0 space-y-4 animate-in fade-in duration-300 max-h-[380px] overflow-y-auto custom-scrollbar">
                {/* 交易基础配置 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-sky-400 font-semibold uppercase tracking-wider">
                    <Sliders size={13} />
                    <span>交易配置</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="financial-label">自定义杠杆倍数</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          className="financial-input w-full pr-8" 
                          value={leverage}
                          onChange={e => setLeverage(Number(e.target.value))}
                          min="1"
                          max="125"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-mono">X</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="financial-label">合约比例 (%)</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          className="financial-input w-full pr-8" 
                          value={futuresRatio}
                          onChange={e => setFuturesRatio(Number(e.target.value))}
                          min="0"
                          max="100"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-mono">%</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="financial-label">成交额系数</label>
                    <input 
                      type="number" 
                      className="financial-input w-full" 
                      value={turnoverCoef}
                      onChange={e => setTurnoverCoef(Number(e.target.value))}
                      min="1"
                    />
                  </div>
                </div>

                <div className="h-px bg-zinc-800/80 my-3" />

                {/* 风控核心配置 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold uppercase tracking-wider">
                    <ShieldAlert size={13} />
                    <span>风控配置</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 text-center">
                    <label className="financial-label text-emerald-400 text-center block w-full">云端止盈 (%)</label>
                    <input 
                      type="number" 
                      step="any"
                      className="w-full bg-[#182C25] border border-emerald-500/40 text-[#5EF2C1] font-mono text-xl p-2 rounded focus:outline-none focus:border-[#4ADE80] font-bold transition-all placeholder-emerald-800 text-center" 
                      value={activeRisk.tp}
                      onChange={e => {
                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                        setActiveRisk(prev => ({...prev, tp: val}));
                      }}
                    />
                  </div>
                  <div className="space-y-1 text-center">
                    <label className="financial-label text-rose-400 text-center block w-full">云端止损 (%)</label>
                    <input 
                      type="number" 
                      step="any"
                      className="w-full bg-[#2F191B] border border-rose-500/40 text-[#FCA5A5] font-mono text-xl p-2 rounded focus:outline-none focus:border-[#F87171] font-bold transition-all placeholder-rose-800 text-center" 
                      value={activeRisk.sl}
                      onChange={e => {
                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                        setActiveRisk(prev => ({...prev, sl: val}));
                      }}
                    />
                  </div>
                  
                  {/* 新增展示板："k值"、"z值"、"进场主体" */}
                  <div className="col-span-2 grid grid-cols-3 gap-2.5 pt-2 border-t border-zinc-800/50">
                    <div className="space-y-1 text-center">
                      <label className="text-[10px] text-zinc-500 block">K值</label>
                      <button
                        type="button"
                        disabled={kValue === null}
                        onClick={() => {
                          if (kValue !== null) {
                            const valAbs = Math.abs(kValue);
                            const tpFactor = (activeRisk as any).tpCoef ?? 45;
                            const slFactor = (activeRisk as any).slCoef ?? 100;
                            const nextTp = parseFloat((valAbs * tpFactor / 100).toFixed(4));
                            const nextSl = parseFloat((valAbs * slFactor / 100).toFixed(4));
                            setActiveRisk(prev => ({
                              ...prev,
                              tp: nextTp,
                              sl: nextSl
                            }));
                            addLog(`[快速风控] 已提取 K值 ${kValue.toFixed(4)}% 的绝对值，通过风控系数 (止盈 ${tpFactor}%, 止损 ${slFactor}%) 计算并更新：云端止盈 = ${nextTp}%, 云端止损 = ${nextSl}%`, 'SUCCESS');
                          }
                        }}
                        className={`w-full py-2 rounded font-mono text-xl font-bold text-center transition-all ${
                          kValue !== null 
                            ? `${kValue < 0 ? 'bg-[#2F191B] border border-rose-500/30 text-[#FCA5A5] hover:bg-[#3d1f22]' : 'bg-[#182C25] border border-emerald-500/30 text-[#5EF2C1] hover:bg-[#203a31]'} cursor-pointer hover:scale-[1.02] active:scale-[0.98]` 
                            : 'bg-[#1C1C1E] border border-zinc-800/60 text-zinc-500 cursor-not-allowed'
                        }`}
                        title={kValue !== null ? "点击使用 止盈/止损系数 快速计算并填充至云端止盈/止损" : undefined}
                      >
                        {kValue !== null ? `${kValue > 0 ? '+' : ''}${kValue.toFixed(2)}%` : '--'}
                      </button>
                    </div>

                    <div className="space-y-1 text-center">
                      <label className="text-[10px] text-zinc-500 block">Z值</label>
                      <div className={`w-full py-2 rounded font-mono text-xl font-bold text-center transition-all ${
                        zValue !== null 
                          ? 'bg-[#2E183B]/40 border border-fuchsia-500/30 text-[#D946EF]' 
                          : 'bg-[#1C1C1E] border border-zinc-800/60 text-zinc-500'
                      }`}>
                        {zValue !== null ? `${zValue.toFixed(2)}%` : '--'}
                      </div>
                    </div>

                    <div className="space-y-1 text-center">
                      <label className="text-[10px] text-zinc-500 block">进场主体</label>
                      <button
                        type="button"
                        disabled={entryEntity === null}
                        onClick={() => {
                          if (entryEntity !== null) {
                            const currentZ = zValue ?? 0;
                            const tpFactor = (activeRisk as any).tpCoef ?? 45;
                            const slFactor = (activeRisk as any).slCoef ?? 100;
                            
                            const isRed = entryEntityRatio !== null && entryEntityRatio < 0.5;
                            let nextTp = 0;
                            let formulaDesc = '';
                            
                            if (isRed) {
                              const diff = currentZ - entryEntity;
                              nextTp = parseFloat((diff * tpFactor / 100).toFixed(4));
                              formulaDesc = `红色 (RED) 状态，根据公式 (z值 - 进场主体) * 止盈系数% = (${currentZ.toFixed(4)} - ${entryEntity.toFixed(4)}) * ${tpFactor}%`;
                            } else {
                              nextTp = parseFloat((entryEntity * tpFactor / 100).toFixed(4));
                              formulaDesc = `绿色 (GREEN) 状态，根据公式 进场主体 * 止盈系数% = ${entryEntity.toFixed(4)} * ${tpFactor}%`;
                            }
                            
                            const nextSl = parseFloat((currentZ * slFactor / 100).toFixed(4));
                            
                            setActiveRisk(prev => ({
                              ...prev,
                              tp: nextTp,
                              sl: nextSl
                            }));
                            addLog(`[快速风控] 进场主体处于${formulaDesc} 计算并更新：云端止盈 = ${nextTp}%, 云端止损 = ${nextSl}%`, 'SUCCESS');
                          }
                        }}
                        className={`w-full py-2 rounded font-mono text-xl font-bold text-center transition-all ${
                          entryEntity !== null 
                            ? `${(entryEntityRatio !== null && entryEntityRatio < 0.5) ? 'bg-[#2F191B] border border-rose-500/30 text-[#FCA5A5] hover:bg-[#3d1f22]' : 'bg-[#182C25] border border-emerald-500/30 text-[#5EF2C1] hover:bg-[#203a31]'} cursor-pointer hover:scale-[1.02] active:scale-[0.98]` 
                            : 'bg-[#1C1C1E] border border-zinc-800/60 text-zinc-500 cursor-not-allowed'
                        }`}
                        title={entryEntity !== null ? "点击使用 止盈/止损系数 快速计算并填充至云端止盈/止损" : undefined}
                      >
                        {entryEntity !== null ? entryEntity.toFixed(2) : '--'}
                      </button>
                    </div>
                  </div>
                  
                  {/* 止盈/止损系数 参数配置面板 */}
                  <div className="col-span-2 space-y-2 pt-2 border-t border-zinc-800/50">
                    <label className="text-[10px] text-zinc-400 font-semibold block uppercase tracking-wider">止盈/止损系数</label>
                    <div className="grid grid-cols-2 gap-3 pb-1">
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-1">止盈系数</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            step="any"
                            className="financial-input w-full pr-8 text-center font-mono font-bold text-emerald-400" 
                            value={(activeRisk as any).tpCoef !== undefined ? (activeRisk as any).tpCoef : 45}
                            onChange={e => {
                              const val = e.target.value === '' ? 0 : Number(e.target.value);
                              setActiveRisk(prev => ({...prev, tpCoef: val}));
                            }}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-mono">%</div>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-zinc-500 block mb-1">止损系数</label>
                        <div className="relative">
                          <input 
                            type="number" 
                            step="any"
                            className="financial-input w-full pr-8 text-center font-mono font-bold text-rose-400" 
                            value={(activeRisk as any).slCoef !== undefined ? (activeRisk as any).slCoef : 100}
                            onChange={e => {
                              const val = e.target.value === '' ? 0 : Number(e.target.value);
                              setActiveRisk(prev => ({...prev, slCoef: val}));
                            }}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-mono">%</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

          {/* API Configuration */}
          <section className="financial-card shrink-0">
            <div 
              className="flex items-center justify-between cursor-pointer p-5 pb-2"
              onClick={() => setIsApiVisible(!isApiVisible)}
            >
              <div className="flex items-center gap-2.5 shrink-0">
                <Key size={18} className="text-blue-500" />
                <h2 className="font-semibold whitespace-nowrap">币安 API 配置</h2>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLogout();
                  }}
                  className="px-2.5 py-1 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 whitespace-nowrap"
                  title="退出当前账号并清空 API 信息"
                >
                  <LogOut size={13} />
                  <span>退出</span>
                </button>
              </div>
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsApiVisible(!isApiVisible);
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 border whitespace-nowrap ${
                    isApiVisible
                      ? 'bg-blue-500/15 text-blue-300 border-blue-500/40 hover:bg-blue-500/25 hover:text-blue-200'
                      : 'bg-blue-500/20 text-blue-300 border-blue-500/50 hover:bg-blue-500/30 hover:text-blue-100 shadow-[0_0_10px_rgba(59,130,246,0.15)]'
                  }`}
                  title={isApiVisible ? '点击收起 API 配置' : '点击展开 API 配置'}
                >
                  <span>{isApiVisible ? '收起' : '展开'}</span>
                  {isApiVisible ? <ChevronUp size={13} className="stroke-[2.5]" /> : <ChevronDown size={13} className="stroke-[2.5]" />}
                </button>
              </div>
            </div>
            
            {isApiVisible && (
              <div className="p-5 pt-0 space-y-4 animate-in fade-in duration-300 max-h-[260px] overflow-y-auto custom-scrollbar">
                <div>
                  <label className="financial-label">账户名称 (Account Name)</label>
                  <div className="relative">
                    {showAccountDropdown && (
                      <div className="fixed inset-0 z-40" onClick={() => setShowAccountDropdown(false)} />
                    )}
                    <div className="relative z-50 flex items-center">
                      <input 
                        type="text" 
                        className="financial-input w-full pr-10" 
                        placeholder="例如: 主账号, 跑机01"
                        value={apiConfig.accountName || ''}
                        onChange={e => setApiConfig({...apiConfig, accountName: e.target.value})}
                      />
                      {savedApiAccounts.length > 0 && (
                        <button
                          type="button"
                          className="absolute right-2 text-zinc-400 hover:text-white p-1 focus:outline-none cursor-pointer"
                          onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                          title="选择已保存的账户"
                        >
                          <ChevronDown size={16} />
                        </button>
                      )}
                    </div>
                    
                    {showAccountDropdown && savedApiAccounts.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-[#1C1C1E] border border-zinc-800 rounded shadow-xl divide-y divide-zinc-800 animate-in fade-in slide-in-from-top-1 duration-150">
                        {savedApiAccounts.map((acc, idx) => (
                          <div
                            key={idx}
                            className="w-full px-3 py-2 text-xs text-zinc-300 hover:bg-[#252528] hover:text-white transition-colors flex justify-between items-center group"
                          >
                            <button
                              type="button"
                              className="flex-1 text-left cursor-pointer flex items-center justify-between pr-2"
                              onClick={() => {
                                setApiConfig({
                                  accountName: acc.accountName,
                                  apiKey: acc.apiKey || '',
                                  apiSecret: acc.apiSecret || '',
                                  baseUrl: (acc.baseUrl && acc.baseUrl.includes('fapi-gcp')) ? 'https://fapi.binance.com' : (acc.baseUrl || 'https://fapi.binance.com')
                                });
                                setShowAccountDropdown(false);
                                addLog(`已加载账号 [${acc.accountName}] 配置${acc.apiKey ? '（含已存 API 信息）' : ''}`, 'INFO');
                              }}
                            >
                              <span className="font-medium">{acc.accountName}</span>
                              {acc.apiKey ? (
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">已存凭证</span>
                              ) : (
                                <span className="text-[10px] text-zinc-500">未存凭证</span>
                              )}
                            </button>
                            <button
                              type="button"
                              className="text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                              title="删除此账户记录"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await fetch(`/api/api-credentials/${encodeURIComponent(acc.accountName)}`, { method: 'DELETE' });
                                  fetchSavedApiAccounts();
                                  addLog(`已删除账户 [${acc.accountName}] 记录`, 'INFO');
                                } catch (delErr) {
                                  console.error('Failed to delete credential:', delErr);
                                }
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="financial-label">API Key</label>
                  <input 
                    type="password" 
                    className="financial-input w-full" 
                    placeholder="输入币安 API Key"
                    value={apiConfig.apiKey}
                    onChange={e => setApiConfig({...apiConfig, apiKey: e.target.value})}
                  />
                </div>
                <div>
                  <label className="financial-label">API Secret</label>
                  <input 
                    type="password" 
                    className="financial-input w-full" 
                    placeholder="输入币安 API Secret"
                    value={apiConfig.apiSecret}
                    onChange={e => setApiConfig({...apiConfig, apiSecret: e.target.value})}
                  />
                </div>
                <button 
                  onClick={handleVerifyConnection}
                  disabled={isVerifying}
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded font-medium transition-all ${
                    isConnected 
                    ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20'
                  }`}
                >
                  {isVerifying ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : isConnected ? (
                    <>
                      <CheckCircle2 size={16} />
                      已通过验证
                    </>
                  ) : (
                    <>
                      <Settings size={16} />
                      验证并连接
                    </>
                  )}
                </button>
              </div>
            )}
          </section>

          {/* Logs Module (Moved below Binance API config) */}
          <LogsModule
            logs={logs}
            tradeLogs={tradeLogs}
            isAutoCleanLogs={isAutoCleanLogs}
            setIsAutoCleanLogs={setIsAutoCleanLogs}
            autoCleanHours={autoCleanHours}
            setAutoCleanHours={setAutoCleanHours}
            onClearLogs={() => setLogs([])}
            onClearTradeLogs={handleClearTradeLogs}
            onAddLog={addLog}
          />

        </div>

        {/* Draggable Divider (Horizontal Resizer Bar) */}
        <div
          id="sidebar-drag-resizer"
          onMouseDown={handleMouseDownResize}
          onDoubleClick={() => {
            setTradeSidebarWidth(380);
            try { localStorage.setItem('app_trade_sidebar_width', '380'); } catch(e) {}
          }}
          className="hidden lg:flex items-center justify-center w-3.5 shrink-0 cursor-col-resize group relative select-none z-20 py-1 transition-all"
          title="按住鼠标左右拖动可调整左侧宽度（向右拖动可拉宽日志区）；双击恢复默认宽度"
        >
          {/* Divider Line */}
          <div className={`w-[2px] h-full rounded-full transition-all duration-150 ${
            isResizingSidebar 
              ? 'bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.8)] scale-x-125' 
              : 'bg-zinc-800/90 group-hover:bg-amber-500/70 group-hover:shadow-[0_0_6px_rgba(245,158,11,0.4)]'
          }`} />
          {/* Visual Grip Handle Indicator */}
          <div className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-8 rounded-sm bg-[#18181b] border transition-all duration-150 shadow-md pointer-events-none ${
            isResizingSidebar 
              ? 'border-amber-400 text-amber-400 scale-110 bg-[#241f17] shadow-[0_0_8px_rgba(245,158,11,0.4)]' 
              : 'border-zinc-700/80 text-zinc-500 group-hover:border-amber-500/60 group-hover:text-amber-400 group-hover:bg-[#1f1d18]'
          }`}>
            <GripVertical size={13} className="stroke-[2.5]" />
          </div>
        </div>

        {/* Right Column: Trading Area */}
        <div className="flex-1 min-w-0 flex flex-col space-y-3 h-full min-h-0 overflow-hidden pl-0 lg:pl-1">
          {/* Order Module */}
          <section className="financial-card p-4 shrink-0">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Activity size={18} className="text-blue-500" />
                  <h2 className="font-semibold">合约执行终端</h2>
                </div>
                {/* 凯利仓位组件按钮 */}
                <button
                  type="button"
                  id="btn-kelly-position"
                  onClick={() => setIsKellyModalOpen(true)}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 transition-all flex items-center gap-1.5 shadow-sm shadow-amber-500/10 active:scale-95 group"
                  title="打开凯利仓位与复利计算器"
                >
                  <Calculator size={13} className="text-amber-400 group-hover:rotate-12 transition-transform" />
                  <span>凯利仓位</span>
                  <span className="text-[10px] px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded font-mono font-bold">f*</span>
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="financial-label mb-0">合约交易对 (如 BTCUSDT)</label>
                    {/* 入场验证组件按钮 - 精准对应用户截图中的黄色框体区域 */}
                    <button
                      type="button"
                      id="btn-entry-verification"
                      onClick={() => setIsVerificationModalOpen(true)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 shadow-sm active:scale-95 group ${
                        currentRiskMatch.isMatched 
                          ? 'border-red-500/80 bg-red-500/20 text-red-200 shadow-red-500/20 animate-pulse' 
                          : currentPosMatch.hasPosition
                          ? 'border-cyan-400/80 bg-cyan-500/20 text-cyan-200 shadow-cyan-500/20'
                          : 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 shadow-amber-500/10'
                      }`}
                      title="打开入场验证名单 (风险黑名单管理)"
                    >
                      <ShieldAlert size={12} className="text-amber-400 group-hover:scale-110 transition-transform" />
                      <span>入场验证</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded font-mono font-bold">
                        {verificationList.length}
                      </span>
                    </button>
                  </div>

                  {/* 浮动文字加高亮提示 (规则2与规则3) */}
                  <EntryVerificationAlert 
                    alertState={
                      verificationAlert || 
                      (currentRiskMatch.isMatched || currentPosMatch.hasPosition ? {
                        isRiskBlacklist: currentRiskMatch.isMatched,
                        matchedKeyword: currentRiskMatch.matchedKeyword,
                        hasPosition: currentPosMatch.hasPosition,
                        position: currentPosMatch.position,
                        symbol: orderForm.symbol,
                        timestamp: Date.now()
                      } : null)
                    }
                    onDismiss={() => setVerificationAlert(null)}
                  />

                  <div className="relative">
                    <input 
                      type="text" 
                      className={`financial-input w-full uppercase font-mono tracking-wide ${
                        currentRiskMatch.isMatched
                          ? 'border-red-500 ring-2 ring-red-500/40 bg-red-950/20 text-red-100 placeholder-red-400'
                          : currentPosMatch.hasPosition
                          ? 'border-cyan-400 ring-2 ring-cyan-400/40 bg-cyan-950/20 text-cyan-100 placeholder-cyan-400'
                          : ''
                      }`} 
                      value={orderForm.symbol}
                      onChange={e => {
                        const val = e.target.value.toUpperCase();
                        setOrderForm(prev => ({...prev, symbol: val}));
                      }}
                    />
                    {currentRiskMatch.isMatched && (
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/30 border border-red-500/60 text-[11px] text-red-200 font-bold animate-pulse pointer-events-none shadow-[0_0_8px_rgba(239,68,68,0.4)]">
                        <span>⚠️ 风险标的，请谨慎！</span>
                      </div>
                    )}
                    {!currentRiskMatch.isMatched && currentPosMatch.hasPosition && (
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/30 border border-cyan-400/60 text-[11px] text-cyan-200 font-bold pointer-events-none shadow-[0_0_8px_rgba(6,182,212,0.4)]">
                        <span>⚡ 已入场，注意重复下单！</span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="financial-label mb-0">下单数量 (USDT)</label>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      杠杆: <strong className="text-emerald-400 font-bold">{leverage}X</strong>
                    </span>
                  </div>
                  <input 
                    type="number" 
                    step="any"
                    className="w-full bg-[#182C25] border border-emerald-500/40 text-[#5EF2C1] font-mono text-xl p-2 rounded focus:outline-none focus:border-[#4ADE80] font-bold transition-all placeholder-emerald-800 text-center" 
                    value={orderForm.amount || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setOrderForm(prev => ({...prev, amount: val === '' ? 0 : Number(val)}));
                    }}
                  />
                  {/* 1号区域: 杠杆倍数快捷选择 (1X, 2X, 3X, 5X, 10X) */}
                  <div className="grid grid-cols-5 gap-1.5 mt-2">
                    {[1, 2, 3, 5, 10].map(lev => (
                      <button
                        key={lev}
                        type="button"
                        onClick={() => handleSelectLeverage(lev)}
                        className={`py-1 px-0.5 rounded text-xs font-mono font-bold transition-all border text-center cursor-pointer select-none active:scale-95 ${
                          leverage === lev
                            ? 'bg-emerald-500 text-black border-emerald-400 shadow-md shadow-emerald-500/25 ring-1 ring-emerald-400 font-black'
                            : 'bg-[#141416] hover:bg-zinc-800 text-zinc-300 border-zinc-700/60 hover:border-zinc-500'
                        }`}
                        title={`选择开单杠杆倍数: ${lev}X (后续下单将统一使用该杠杆)`}
                      >
                        {lev}X
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4 flex flex-col justify-between">
                <div>
                  <label className="financial-label">订单类型</label>
                  <select 
                    className="financial-input w-full"
                    value={orderForm.type}
                    onChange={e => setOrderForm({...orderForm, type: e.target.value as any})}
                  >
                    <option value="MARKET">市价 (MARKET)</option>
                    <option value="LIMIT">限价 (LIMIT)</option>
                  </select>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleCalculateContractVolume}
                    disabled={isCalculatingVolume}
                    className={`w-full py-2.5 px-4 rounded-lg font-bold text-sm text-white flex items-center justify-center gap-2 border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 active:scale-95 transition-all text-sky-400 ${
                      (!isConnected) ? 'opacity-40 cursor-not-allowed' : ''
                    }`}
                  >
                    {isCalculatingVolume ? (
                      <RefreshCw size={14} className="animate-spin text-sky-400" />
                    ) : (
                      <Calculator size={14} className="text-sky-400" />
                    )}
                    <span>合约量计算</span>
                  </button>

                  {/* 2号区域: 合约比例与计算选择 (3%, 5%, 10%, 20%, 自定义) */}
                  <div className="grid grid-cols-5 gap-1.5 mt-2">
                    {[3, 5, 10, 20].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => handleSelectRatioPercent(pct)}
                        className={`py-1 px-0.5 rounded text-xs font-mono font-bold transition-all border text-center cursor-pointer select-none active:scale-95 ${
                          orderRatioPercent === pct && !isCustomRatio
                            ? 'bg-sky-500 text-black border-sky-400 shadow-md shadow-sky-500/25 ring-1 ring-sky-400 font-black'
                            : 'bg-[#141416] hover:bg-zinc-800 text-zinc-300 border-zinc-700/60 hover:border-zinc-500'
                        }`}
                        title={`按合约余额的 ${pct}% 计算下单金额`}
                      >
                        {pct}%
                      </button>
                    ))}

                    {/* 自定义数值选项 (不能大于 100) */}
                    <div className="relative">
                      {isCustomRatio ? (
                        <div className="relative w-full h-full">
                          <input
                            type="number"
                            min="0.1"
                            max="100"
                            step="any"
                            autoFocus
                            placeholder="1~100"
                            value={customRatioInput}
                            onChange={(e) => handleApplyCustomRatio(e.target.value)}
                            className="w-full h-full py-1 px-0.5 pr-3 text-xs font-mono font-bold bg-sky-500 text-black border border-sky-400 rounded text-center focus:outline-none ring-1 ring-sky-400 placeholder-black/50"
                          />
                          <span className="absolute right-0.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-black pointer-events-none">%</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomRatio(true);
                            if (customRatioInput) {
                              handleApplyCustomRatio(customRatioInput);
                            }
                          }}
                          className={`w-full h-full py-1 px-0.5 rounded text-xs font-mono font-bold transition-all border text-center cursor-pointer select-none active:scale-95 truncate ${
                            isCustomRatio
                              ? 'bg-sky-500 text-black border-sky-400 shadow-md shadow-sky-500/25 ring-1 ring-sky-400 font-black'
                              : 'bg-[#141416] hover:bg-zinc-800 text-zinc-300 border-zinc-700/60 hover:border-zinc-500'
                          }`}
                          title="输入自定义比例 (1~100，如 35 代表 35%)"
                        >
                          {customRatioInput ? `${customRatioInput}%` : '自定义'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-between h-full">
                <div className="w-full">
                  <label className="financial-label invisible select-none">倒计时占位</label>
                  <div className="flex items-center justify-center bg-[#2E183B]/40 border border-fuchsia-500/30 py-2.5 rounded-t-lg border-b-0 text-[#D946EF] select-none text-center w-full shadow-inner">
                    <span className="font-mono text-2xl font-bold tracking-wider">
                      {countdownStr}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 h-[80px]">
                  <button 
                    onClick={() => handlePlaceOrder('BUY')}
                    disabled={isTrading}
                    className={`w-full h-full rounded-b-lg rounded-t-none font-bold text-base flex flex-col items-center justify-center gap-1 transition-all active:scale-95 bg-emerald-300 hover:bg-emerald-400 text-zinc-950 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isTrading && orderForm.side === 'BUY' ? (
                      <RefreshCw className="animate-spin text-zinc-950" />
                    ) : (
                      <>
                        <Zap size={16} className="fill-zinc-950/10 text-zinc-950" />
                        <span>做多下单</span>
                        <span className="text-[10px] opacity-75 font-normal leading-none text-zinc-900">(LONG)</span>
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => handlePlaceOrder('SELL')}
                    disabled={isTrading}
                    className={`w-full h-full rounded-b-lg rounded-t-none font-bold text-base flex flex-col items-center justify-center gap-1 transition-all active:scale-95 bg-red-300 hover:bg-red-400 text-zinc-950 ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isTrading && orderForm.side === 'SELL' ? (
                      <RefreshCw className="animate-spin text-zinc-950" />
                    ) : (
                      <>
                        <Zap size={16} className="fill-zinc-950/10 text-zinc-950" />
                        <span>做空下单</span>
                        <span className="text-[10px] opacity-75 font-normal leading-none text-zinc-900">(SHORT)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Positions & Open Orders Tabbed Module */}
          <section className="financial-card overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="px-4 py-2 border-b border-[#232326] flex items-center justify-between shrink-0 bg-[#161618]">
              <div className="flex items-center gap-2">
                {/* 永续合约持仓 Tab 按钮 (黄色框体) */}
                <button
                  type="button"
                  id="tab-btn-positions"
                  onClick={() => setActiveContractTab('positions')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                    activeContractTab === 'positions'
                      ? 'bg-blue-600/25 text-blue-300 border border-blue-500/50 shadow-sm shadow-blue-500/10'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
                  }`}
                >
                  <TrendingUp size={16} className={activeContractTab === 'positions' ? 'text-blue-400' : 'text-zinc-500'} />
                  <span>永续合约持仓</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-mono font-medium ${
                    activeContractTab === 'positions' ? 'bg-blue-500/30 text-blue-200' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {sortedPositions.length}
                  </span>
                </button>

                {/* 永续合约当前委托 Tab 按钮 (红色框体迁移至黄色框体右边) */}
                <button
                  type="button"
                  id="tab-btn-orders"
                  onClick={() => setActiveContractTab('orders')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                    activeContractTab === 'orders'
                      ? 'bg-amber-600/25 text-amber-300 border border-amber-500/50 shadow-sm shadow-amber-500/10'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
                  }`}
                >
                  <Clock size={16} className={activeContractTab === 'orders' ? 'text-amber-400' : 'text-zinc-500'} />
                  <span>永续合约当前委托</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-mono font-medium ${
                    activeContractTab === 'orders' ? 'bg-amber-500/30 text-amber-200' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {openOrders.length}
                  </span>
                </button>
              </div>

              <div className="text-[12px] font-mono text-zinc-400">
                {activeContractTab === 'positions' ? (
                  <span>共 <strong className="text-zinc-200">{sortedPositions.length}</strong> 个活跃持仓</span>
                ) : (
                  <span>共 <strong className="text-zinc-200">{openOrders.length}</strong> 个活跃委托</span>
                )}
              </div>
            </div>
            
            <div className="overflow-x-auto flex-1 min-h-0 overflow-y-auto custom-scrollbar">
              {activeContractTab === 'positions' ? (
                <table className="w-full text-center border-collapse">
                  <thead className="sticky top-0 bg-[#141416] z-10">
                    <tr className="text-[15px] uppercase tracking-wider text-zinc-300 border-b border-[#232326]">
                      <th className="px-5 py-2 font-medium text-center">合约 / 方向</th>
                      <th className="px-5 py-2 font-medium text-center">开仓时间</th>
                      <th className="px-5 py-2 font-medium text-center">开仓 / 标记</th>
                      <th className="px-5 py-2 font-medium text-center">持仓量 / 市值</th>
                      <th className="px-5 py-2 font-medium text-center">未实现盈亏 (ROE%)</th>
                      <th className="px-5 py-2 font-medium text-center">风控</th>
                      <th className="px-5 py-2 font-medium text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232326]">
                    <AnimatePresence initial={false}>
                      {sortedPositions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-5 py-6 text-center text-zinc-600 italic text-xs">
                            暂无合约持仓。
                          </td>
                        </tr>
                      ) : (
                        sortedPositions.map((pos) => {
                          const liveInfo = livePrices[pos.symbol] || livePrices[pos.symbol.toUpperCase()];
                          const currentPrice = (liveInfo?.lastPrice || liveInfo?.markPrice) || pos.markPrice || pos.entryPrice;
                          const isLong = pos.side === 'BUY';

                          // 依据实时行情计算未实现盈亏与收益率 (ROE%)
                          const livePnl = currentPrice > 0 
                            ? (isLong ? (currentPrice - pos.entryPrice) * pos.amount : (pos.entryPrice - currentPrice) * pos.amount)
                            : pos.pnl;

                          const notional = pos.entryPrice * pos.amount;
                          const livePnlPercent = notional > 0 
                            ? (livePnl / notional) * 100 
                            : pos.pnlPercent;

                          // 依据实时行情计算持仓市值
                          const liveMarketValue = currentPrice > 0 
                            ? (isLong ? currentPrice * pos.amount : (pos.entryPrice * pos.amount + livePnl)) 
                            : (notional + pos.pnl);

                          return (
                            <motion.tr 
                              key={pos.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, x: -20 }}
                              className="hover:bg-[#1C1C1E]/50 transition-colors"
                            >
                              <td className="px-5 py-2 text-center">
                                <div className="font-bold text-[16.5px] text-[#ff8a65] tracking-wide">{pos.symbol}</div>
                                <div className={`text-[9px] font-bold px-1 py-0.2 rounded inline-block mt-0.5 ${
                                  pos.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                                }`}>
                                  {pos.side === 'BUY' ? '多单 (LONG)' : '空单 (SHORT)'}
                                </div>
                              </td>
                              <td className="px-5 py-2 font-mono text-[16.5px] font-bold text-emerald-300 whitespace-nowrap text-center">
                                {formatDateTime(pos.openTime || pos.timestamp)}
                              </td>
                              <td className="px-5 py-2 font-mono text-center whitespace-nowrap">
                                <div className="text-emerald-300 font-bold text-[16.5px]">{formatPrice(pos.symbol, pos.entryPrice)}</div>
                                {currentPrice > 0 && currentPrice !== pos.entryPrice && (
                                  <div className="text-[11px] text-zinc-400 font-medium mt-0.5">
                                    标记: <span className="text-zinc-200">{formatPrice(pos.symbol, currentPrice)}</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-5 py-2 font-mono text-xs text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                  <span className="text-white font-medium">{pos.amount}</span>
                                  <span className="text-zinc-500 font-normal select-none">丨</span>
                                  <span className="text-emerald-300 font-bold text-[16.5px]">
                                    {liveMarketValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                                  </span>
                                </div>
                              </td>
                              <td className="px-5 py-2 text-center whitespace-nowrap">
                                <div className={`font-bold text-[16.5px] font-mono flex items-center justify-center gap-1.5 whitespace-nowrap ${
                                  livePnl >= 0 ? 'text-emerald-500' : 'text-red-500'
                                }`}>
                                  <span className="flex items-center">
                                    {livePnl >= 0 ? <ArrowUpRight size={16} className="stroke-[2.5]" /> : <ArrowDownRight size={16} className="stroke-[2.5]" />}
                                    <span>{livePnl >= 0 ? '+' : ''}{livePnl.toFixed(2)}</span>
                                  </span>
                                  <span>
                                    ({livePnlPercent >= 0 ? '+' : ''}{livePnlPercent.toFixed(2)}%)
                                  </span>
                                </div>
                              </td>
                              <td className="px-5 py-2 text-center">
                                <div className="flex items-center justify-center">
                                  <PositionRiskButton 
                                    position={pos}
                                    config={positionRiskConfigs[pos.id]}
                                    onClick={() => {
                                      setSelectedRiskPosition(pos);
                                      setIsPositionRiskModalOpen(true);
                                    }}
                                  />
                                </div>
                              </td>
                              <td className="px-5 py-2 text-center">
                                <button 
                                  onClick={() => handleClosePosition(pos.id)}
                                  className="w-[105px] h-[47px] bg-emerald-300 hover:bg-emerald-400 text-zinc-950 text-[16.5px] font-bold rounded-md flex items-center justify-center gap-1.5 mx-auto transition-all active:scale-95 shadow-sm whitespace-nowrap"
                                  title="市价平仓"
                                >
                                  <XCircle size={17} className="stroke-[2.5] shrink-0" />
                                  <span>市价平仓</span>
                                </button>
                              </td>
                            </motion.tr>
                          );
                        })
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-center border-collapse">
                  <thead className="sticky top-0 bg-[#141416] z-10">
                    <tr className="text-[15px] uppercase tracking-wider text-zinc-300 border-b border-[#232326]">
                      <th className="px-5 py-2 font-medium text-center">合约 / 方向</th>
                      <th className="px-5 py-2 font-medium text-center">委托时间</th>
                      <th className="px-5 py-2 font-medium text-center">类型</th>
                      <th className="px-5 py-2 font-medium text-center">价格 / 触发价</th>
                      <th className="px-5 py-2 font-medium text-center">条件委托</th>
                      <th className="px-5 py-2 font-medium text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232326]">
                    <AnimatePresence initial={false}>
                      {openOrders.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-5 py-6 text-center text-zinc-600 italic text-xs">
                            暂无活跃委托。
                          </td>
                        </tr>
                      ) : (
                        openOrders.map((order) => (
                          <motion.tr 
                            key={order.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="hover:bg-[#1C1C1E]/50 transition-colors"
                          >
                            <td className="px-5 py-2 text-center">
                              <div className="font-bold text-xs">{order.symbol}</div>
                              <div className={`text-[9px] font-bold px-1 py-0.2 rounded inline-block mt-0.5 ${
                                order.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                              }`}>
                                {order.side === 'BUY' ? '买入' : '卖出'} ({order.positionSide})
                              </div>
                            </td>
                            <td className="px-5 py-2 font-mono text-xs text-zinc-300 whitespace-nowrap text-center">
                              {formatDateTime(order.time)}
                            </td>
                            <td className="px-5 py-2 font-mono text-xs text-zinc-400 text-center">
                              {order.type}
                            </td>
                            <td className="px-5 py-2 font-mono text-xs text-center">
                              {order.price > 0 ? (
                                <>
                                  <div className="text-white">{formatPrice(order.symbol, order.price)}</div>
                                  {order.stopPrice > 0 && (
                                    <div className="text-amber-500 text-[10px]">
                                      触发: {formatPrice(order.symbol, order.stopPrice)}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  {order.stopPrice > 0 ? (
                                    <div className="text-amber-500 font-medium">
                                      触发: {formatPrice(order.symbol, order.stopPrice)}
                                    </div>
                                  ) : (
                                    <div className="text-zinc-500">--</div>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="px-5 py-2 text-center">
                              {order.isAlgo ? (
                                <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 inline-block">
                                  算法止损/止盈
                                </span>
                              ) : (
                                <span className="text-[9px] text-zinc-300 font-medium inline-block">普通委托</span>
                              )}
                            </td>
                            <td className="px-5 py-2 text-center">
                              <button 
                                onClick={() => handleCancelOrder(order)}
                                className="px-2 py-0.5 bg-yellow-400 hover:bg-yellow-500 text-black text-[11px] font-bold rounded flex items-center justify-center gap-1.5 mx-auto transition-colors align-middle"
                              >
                                <XCircle size={11} />
                                撤销
                              </button>
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </div>
      </div>

      <div className={activeMainTab === 'MONITOR' ? 'block' : 'hidden'}>
        <MonitoringAssistant 
          apiConfig={apiConfig}
          isConnected={isConnected}
          onSelectSymbol={(sym) => {
            handleSelectSymbolFromMonitoring(sym);
          }}
          addLog={addLog}
          onSwitchToTrade={() => setActiveMainTab('TRADE')}
          isMuted={isMuted}
          positions={positions}
        />
      </div>

      <div className={activeMainTab === 'MONITOR_4H' ? 'block' : 'hidden'}>
        <MonitoringAssistant4h 
          apiConfig={apiConfig}
          isConnected={isConnected}
          onSelectSymbol={(sym) => {
            handleSelectSymbolFromMonitoring(sym);
          }}
          addLog={addLog}
          onSwitchToTrade={() => setActiveMainTab('TRADE')}
          isMuted={isMuted}
          positions={positions}
        />
      </div>

      <div className={activeMainTab === 'REPORT' ? 'block' : 'hidden'}>
        {renderReportView()}
      </div>

      <div className={activeMainTab === 'WEIGHT_STATS' ? 'block' : 'hidden'}>
        <WeightStatsModule />
      </div>

      {/* 划转面板 (Account Transfer Modal) */}
      <AnimatePresence>
        {isTransferModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              id="transfer_modal"
              className="bg-[#121214] border border-[#232326] rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-[#232326] flex items-center justify-between bg-[#18181B]">
                <div className="flex items-center gap-2">
                  <Wallet size={18} className="text-emerald-400" />
                  <span className="font-bold text-sm text-zinc-100">
                    账户划转 (USDT)
                  </span>
                </div>
                <button 
                  onClick={() => setIsTransferModalOpen(false)}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <XCircle size={18} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-5 space-y-4">
                {/* Transfer Direction Display */}
                <div className="bg-[#18181B] p-3 rounded-lg border border-[#232326] flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 uppercase font-mono">从 (From)</span>
                    <span className="text-zinc-200 text-sm font-bold mt-0.5">
                      {transferType === 'futures_to_spot' ? '合约账户' : '现货账户'}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono mt-1">
                      余额: {transferType === 'futures_to_spot' 
                        ? (balance.futuresBalance || 0).toFixed(2) 
                        : (balance.spotBalance || 0).toFixed(2)} USDT
                    </span>
                  </div>
                  
                  <div className="text-zinc-500 flex items-center justify-center">
                    <ArrowDownRight size={20} className="rotate-45 text-zinc-400" />
                  </div>

                  <div className="flex flex-col text-right">
                    <span className="text-[10px] text-zinc-500 uppercase font-mono">至 (To)</span>
                    <span className="text-zinc-200 text-sm font-bold mt-0.5">
                      {transferType === 'futures_to_spot' ? '现货账户' : '合约账户'}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono mt-1">
                      余额: {transferType === 'futures_to_spot' 
                        ? (balance.spotBalance || 0).toFixed(2) 
                        : (balance.futuresBalance || 0).toFixed(2)} USDT
                    </span>
                  </div>
                </div>

                {/* Amount Input */}
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 flex justify-between items-center">
                    <span>划转数量 (Amount)</span>
                    <button 
                      onClick={() => {
                        const maxVal = transferType === 'futures_to_spot' 
                          ? (balance.futuresBalance || 0) 
                          : (balance.spotBalance || 0);
                        setTransferAmount(maxVal.toString());
                      }}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold font-mono uppercase"
                    >
                      MAX
                    </button>
                  </label>
                  <div className="relative">
                    <input 
                      type="number" 
                      placeholder="0.00"
                      value={transferAmount}
                      onChange={e => setTransferAmount(e.target.value)}
                      className="w-full bg-[#18181B] border border-[#232326] focus:border-emerald-500 rounded p-2.5 text-zinc-100 font-mono text-sm focus:outline-none"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-zinc-500 font-bold font-mono">USDT</span>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-[#18181B] border-t border-[#232326] flex gap-3 justify-end">
                <button 
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button 
                  disabled={isTransferring}
                  onClick={handleTransfer}
                  className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-5 py-2 rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {isTransferring ? '正在处理...' : 'OK'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 入场验证名单子界面弹窗 */}
      <EntryVerificationModal 
        isOpen={isVerificationModalOpen}
        onClose={() => setIsVerificationModalOpen(false)}
        verificationList={verificationList}
        onUpdateList={handleUpdateVerificationList}
      />

      {/* 凯利仓位子界面弹窗 */}
      <KellyModal 
        isOpen={isKellyModalOpen}
        onClose={() => setIsKellyModalOpen(false)}
        currentBalance={balance.balance || balance.available || 0}
        onApplyPositionSize={(size) => {
          setOrderForm(prev => ({ ...prev, amount: Math.round(size * 100) / 100 }));
          addLog(`[凯利仓位] 已将建议仓位金额 ${size.toFixed(2)} USDT 应用至下单面板`, 'INFO');
        }}
      />

      {/* 闹钟子界面弹窗 */}
      <AlarmModal 
        isOpen={isAlarmModalOpen}
        onClose={() => setIsAlarmModalOpen(false)}
        settings={alarmSettings}
        onUpdateSettings={setAlarmSettings}
        isMuted={isMuted}
      />

      {/* 闹钟响铃提醒横幅/弹窗 */}
      <AlarmRingingBanner 
        ringingAlarm={ringingAlarm}
        onDismiss={handleDismissAlarm}
        onSnooze={handleSnoozeAlarm}
      />

      {/* 永续合约持仓专属风控子界面弹窗 */}
      {isPositionRiskModalOpen && selectedRiskPosition && (
        <PositionRiskModal 
          isOpen={isPositionRiskModalOpen}
          onClose={() => {
            setIsPositionRiskModalOpen(false);
            setSelectedRiskPosition(null);
          }}
          position={selectedRiskPosition}
          config={selectedRiskPosition ? positionRiskConfigs[selectedRiskPosition.id] : undefined}
          onSaveConfig={handleSavePositionRiskConfig}
          apiConfig={apiConfig}
          isConnected={isConnected}
          addLog={addLog}
          formatPrice={formatPrice}
          formatQty={formatQty}
        />
      )}

      {/* Footer Status Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#0A0A0B] border-t border-[#232326] px-4 py-2 flex items-center justify-between text-[10px] text-zinc-500 font-mono z-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            币安 WS {isConnected ? '已连接' : '未连接'}
          </div>
          <div>延迟: 12ms</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-zinc-600">API:</span>
            <span className={isConnected ? 'text-emerald-500' : 'text-zinc-500'}>
              {isConnected ? 'VALID' : 'PENDING'}
            </span>
          </div>
          <div>UTC: {new Date().toISOString()}</div>
          <div className="text-blue-500">v1.1.0-STABLE</div>
        </div>
      </footer>
    </div>
  );
}
