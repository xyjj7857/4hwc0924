import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import os from "os";
import fs from "fs";
import CryptoJS from "crypto-js";
import Database from "better-sqlite3";
import { userDataStreamManager } from "./server/userDataStream";
import { MarketDataManager } from "./server/marketDataManager";

// Initialize SQLite database
const dbPath = process.env.DATABASE_PATH || "trading.db";
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

const AUDIO_UPLOAD_DIR = path.join(process.cwd(), "uploads", "audio");
try {
  if (!fs.existsSync(AUDIO_UPLOAD_DIR)) {
    fs.mkdirSync(AUDIO_UPLOAD_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Could not create audio upload directory:", e);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  
  CREATE TABLE IF NOT EXISTS position_history (
    id TEXT PRIMARY KEY,
    symbol TEXT,
    side TEXT,
    positionSide TEXT,
    entryPrice REAL,
    exitPrice REAL,
    amount REAL,
    pnl REAL,
    tradePnl REAL,
    commission REAL,
    fundingFee REAL,
    pnlPercent REAL,
    openTime INTEGER,
    closeTime INTEGER,
    timestamp INTEGER,
    account TEXT
  );

  CREATE TABLE IF NOT EXISTS api_credentials (
    account_name TEXT PRIMARY KEY,
    api_key TEXT,
    api_secret TEXT,
    base_url TEXT
  );

  CREATE TABLE IF NOT EXISTS alert_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger_time INTEGER,
    symbol TEXT,
    board_name TEXT,
    change_val TEXT,
    volume_15m REAL
  );

  CREATE TABLE IF NOT EXISTS alert_audios (
    id TEXT PRIMARY KEY,
    name TEXT,
    mime_type TEXT,
    data_base64 TEXT,
    size INTEGER,
    updated_at INTEGER
  );
`);

// Encryption Helper Functions
const ENCRYPTION_KEY = process.env.API_ENCRYPTION_KEY || "BinanceTradingS3cr3tK3y!@#";
const encrypt = (text: string) => {
  if (!text) return "";
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
};
const decrypt = (cipherText: string) => {
  if (!cipherText) return "";
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (err) {
    console.error("Decryption failed:", err);
    return "";
  }
};

// Safe migration to add 'account' column if it doesn't already exist
try {
  db.prepare("SELECT account FROM position_history LIMIT 1").run();
} catch (error) {
  console.log("Missing 'account' column. running migration to add 'account' column...");
  try {
    db.exec("ALTER TABLE position_history ADD COLUMN account TEXT;");
  } catch (alterError) {
    console.error("Failed to add 'account' column to position_history:", alterError);
  }
}

// User Data Stream Credential Lookup Hook
userDataStreamManager.setCredentialLookup((accName: string) => {
  try {
    if (accName && accName !== 'default') {
      const row = db.prepare("SELECT * FROM api_credentials WHERE account_name = ?").get(accName) as any;
      if (row && row.api_key && row.api_secret) {
        return {
          accountName: row.account_name,
          apiKey: row.api_key,
          apiSecret: row.api_secret,
          baseUrl: row.base_url
        };
      }
    }
    // Fallback to active apiConfig in settings table
    const settingsRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("apiConfig") as any;
    if (settingsRow) {
      const parsed = JSON.parse(settingsRow.value);
      if (parsed && parsed.apiKey && parsed.apiSecret) {
        return {
          accountName: parsed.accountName || accName || 'default',
          apiKey: parsed.apiKey,
          apiSecret: parsed.apiSecret,
          baseUrl: parsed.baseUrl
        };
      }
    }
  } catch (e) {
    console.error("Error looking up credentials for userDataStream:", e);
  }
  return null;
});

interface MonitoringConfig {
  settleMin: number;
  settleSec: number;
  minVolume24h: number;
  minVolumeCycle: number;
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
  yMin?: number;
  ySec?: number;
  m1?: number;
  n1?: number;
}

const DEFAULT_CONFIG: MonitoringConfig = {
  settleMin: 14,
  settleSec: 30,
  minVolume24h: 15000000,
  minVolumeCycle: 3000000,
  gainThreshold: 5,
  lossThreshold: 5,
  amplitudeThreshold: 8,
  enableAlertTimeout: true,
  alertTimeoutSeconds: 15,
};

interface MonitorLog {
  id: string;
  timestamp: number;
  type: 'INFO' | 'SUCCESS' | 'ERROR' | 'TRADE';
  message: string;
}

let isRunning = false;
let config: MonitoringConfig = { ...DEFAULT_CONFIG };
let scanResults: any = null;
let scanStats: any = null;
let fundingRates: any[] = [];
let settleCountdown15m = "00:00";
let last15mCycleTrigger = -1;
let lastFundingFetchHour = -1;
let isScanning15m = false;
let isFetchingFunding = false;
let monitorLogs: MonitorLog[] = [];
let symbolsInfo: any[] = [];

// SSE client connections for real-time push streaming
const sseStreamClients = new Set<express.Response>();

function broadcastSSE(event: { type: string; data: any }) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseStreamClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseStreamClients.delete(client);
    }
  }
}

// Initialize configs from DB
try {
  const runRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("monitoring_running") as any;
  if (runRow) {
    isRunning = JSON.parse(runRow.value);
  }
} catch (e) {
  console.error("Failed to load monitoring_running status:", e);
}

try {
  const configRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("monitoring_config") as any;
  if (configRow) {
    const parsed = JSON.parse(configRow.value);
    config = {
      ...DEFAULT_CONFIG,
      ...parsed,
      settleMin: parsed.settleMin ?? parsed.yMin ?? 14,
      settleSec: parsed.settleSec ?? parsed.ySec ?? 30,
      minVolume24h: parsed.minVolume24h ?? parsed.m1 ?? 15000000,
      minVolumeCycle: parsed.minVolumeCycle ?? parsed.n1 ?? 3000000,
    };
  }
} catch (e) {
  console.error("Failed to load monitoring_config:", e);
}

function saveRunningState(state: boolean) {
  try {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("monitoring_running", JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save running state:", e);
  }
}

function saveConfigState(newConfig: MonitoringConfig) {
  try {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("monitoring_config", JSON.stringify(newConfig));
  } catch (e) {
    console.error("Failed to save config state:", e);
  }
}

function addMonitorLog(message: string, type: 'INFO' | 'SUCCESS' | 'ERROR' | 'TRADE' = 'INFO') {
  const log: MonitorLog = {
    id: Math.random().toString(36).substring(2, 11),
    timestamp: Date.now(),
    type,
    message
  };
  monitorLogs.unshift(log);
  if (monitorLogs.length > 500) {
    monitorLogs = monitorLogs.slice(0, 500);
  }
  console.log(`[BACKEND MONITOR] [${type}] ${message}`);
}

// ==========================================
// 全局防封熔断器 (Circuit Breaker - 仅用于实盘交易下单与外部REST调用)
// ==========================================
let circuitBreakerUntil = 0;
const CIRCUIT_BREAKER_DURATION_MS = 2 * 60 * 1000;
let addMonitorLog4hFn: ((message: string, type?: 'INFO' | 'SUCCESS' | 'ERROR' | 'TRADE') => void) | null = null;

function triggerCircuitBreaker(reason: string, status?: number) {
  const now = Date.now();
  circuitBreakerUntil = Math.max(circuitBreakerUntil, now + CIRCUIT_BREAKER_DURATION_MS);
  const msg = `[风控熔断] 收到币安429频率预警，已主动静默冷却2分钟，避免触发封禁`;
  const detail = `[风控熔断详情] 触发原因: ${reason}${status ? ' (HTTP ' + status + ')' : ''}，交易请求静默至 ${new Date(circuitBreakerUntil).toLocaleTimeString()}`;
  console.warn(`[CIRCUIT BREAKER] ${msg} - ${detail}`);
  addMonitorLog(msg, 'ERROR');
  addMonitorLog(detail, 'INFO');
  if (addMonitorLog4hFn) {
    addMonitorLog4hFn(msg, 'ERROR');
    addMonitorLog4hFn(detail, 'INFO');
  }
}

function isCircuitBroken(): boolean {
  return Date.now() < circuitBreakerUntil;
}

function getCircuitBreakerRemainingSeconds(): number {
  return Math.max(0, Math.ceil((circuitBreakerUntil - Date.now()) / 1000));
}

// 【方案 2】：优化镜像节点重试逻辑，区分“网络超时”与“业务限流”
const fetchBinanceBackend = async (endpoint: string, params: Record<string, any> = {}): Promise<any> => {
  if (isCircuitBroken()) {
    const remainSec = getCircuitBreakerRemainingSeconds();
    throw new Error(`[系统熔断中] 熔断机制生效中(剩余 ${remainSec} 秒)，已拦截向币安发起的请求`);
  }

  const safeEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const queryString = new URLSearchParams(params).toString();
  // 币安合约真实且唯一官方高可用根节点
  const candidates = [
    "https://fapi.binance.com"
  ];

  let lastError: any = null;
  for (const base of candidates) {
    try {
      const url = `${base}${safeEndpoint}${queryString ? '?' + queryString : ''}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, { 
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // 【核心规约】：如果收到的状态码是 429（超频）或 418（封禁），严禁重试任何其他镜像节点！
      if (response.status === 429 || response.status === 418) {
        const isBanned = response.status === 418;
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
        const statusText = isBanned ? 'HTTP 418 IP临时封禁' : 'HTTP 429 访问超频警告';
        console.error(`[fetchBinanceBackend] 命中币安业务限流: ${statusText} on ${base}${safeEndpoint} (Retry-After: ${retryAfterSec || 'default'})`);
        // 1. 触发全局熔断机制并记录事件日志
        triggerCircuitBreaker(`节点 [${base}] 返回 ${statusText}`, response.status);
        // 2. 严禁重试任何其他镜像节点，立刻向上抛出异常终止
        throw new Error(`HTTP status ${response.status}: ${statusText}`);
      }
      
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }

      // 主动侦测分钟权重水位，接近阈值时（>2000/2400）自动平滑避震，杜绝触发 429
      const usedWeight = parseInt(response.headers.get('x-mbx-used-weight-1m') || '0', 10);
      if (usedWeight > 2000) {
        console.warn(`[fetchBinanceBackend] 币安权重预警: 当前1分钟累计已用 ${usedWeight}/2400，已接近硬限，执行 3 秒微休眠降频保护`);
        await new Promise(r => setTimeout(r, 3000));
      }

      const text = await response.text();
      return JSON.parse(text);
    } catch (err: any) {
      lastError = err;
      // 如果属于 429 或 418，绝对不进行重试，立即退出循环并向上抛出
      if (err.message && (err.message.includes('429') || err.message.includes('418'))) {
        throw err;
      }
      // 仅当属于网络超时或连接失败时，允许尝试下一个镜像节点
      console.warn(`[fetchBinanceBackend] 节点 ${base} 网络超时或连接失败 (${err.message || err})`);
    }
  }
  throw lastError || new Error("All endpoints failed");
};

// 全市场行情数据流与内存计算引擎管理器 (WebSocket + 本地15m聚合 + 资金费率实时维护)
let lastHourlySnapshotHour = -1;
export const marketDataManager = new MarketDataManager({
  fetchBinanceBackend,
  addLog: addMonitorLog,
  addLog4h: (msg, type) => {
    if (addMonitorLog4hFn) addMonitorLog4hFn(msg, type);
    else console.log(`[4H] ${msg}`);
  },
  isCircuitBroken
});

// 增加全市场 Ticker 内存缓存与节流机制 (避免短时间内重复拉取全量24hr Ticker，单次省下40权重)
let cachedAllTickers: any[] = [];
let lastTickersFetchedAt = 0;
const TICKERS_CACHE_TTL = 20 * 1000; // 20秒缓存有效期

const fetchAllTickers = async (force: boolean = false): Promise<any[]> => {
  const now = Date.now();
  if (!force && cachedAllTickers.length > 0 && (now - lastTickersFetchedAt < TICKERS_CACHE_TTL)) {
    return cachedAllTickers;
  }

  try {
    const needsExchangeInfo = symbolsInfo.length === 0;
    const [tickers, info] = await Promise.all([
      fetchBinanceBackend('/fapi/v1/ticker/24hr'),
      needsExchangeInfo ? fetchBinanceBackend('/fapi/v1/exchangeInfo') : Promise.resolve(null)
    ]);
    
    if (!tickers) {
      throw new Error("Invalid response from Binance ticker API");
    }

    if (info && info.symbols) {
      symbolsInfo = info.symbols;
    }

    const currentSymbols = symbolsInfo.length > 0 ? symbolsInfo : (info?.symbols || []);
    if (currentSymbols.length === 0) {
      // If symbolsInfo wasn't cached yet, try to fallback or parse
      const tickerList = Array.isArray(tickers) ? tickers : [tickers];
      const filtered = tickerList.filter((t: any) => t.symbol && t.symbol.endsWith('USDT'));
      cachedAllTickers = filtered;
      lastTickersFetchedAt = Date.now();
      return filtered;
    }

    const activeSymbols = new Set(
      currentSymbols
        .filter((s: any) => 
          s.status === 'TRADING' && 
          s.contractType === 'PERPETUAL' && 
          s.quoteAsset === 'USDT'
        )
        .map((s: any) => s.symbol)
    );

    const tickerList = Array.isArray(tickers) ? tickers : [tickers];
    const filtered = tickerList.filter((t: any) => activeSymbols.has(t.symbol));
    cachedAllTickers = filtered;
    lastTickersFetchedAt = Date.now();
    return filtered;
  } catch (error: any) {
    console.error("Backend fetchAllTickers failed:", error.message || error);
    // 若拉取失败但存在历史有效缓存，直接降级返回历史缓存，防止全系统瘫痪
    if (cachedAllTickers.length > 0) {
      console.warn("Backend fetchAllTickers 异常，降级使用上一期有效 Ticker 缓存");
      return cachedAllTickers;
    }
    throw error;
  }
};

const fetchKlines = async (symbol: string, interval: string = '15m') => {
  try {
    const data = await fetchBinanceBackend('/fapi/v1/klines', { symbol, interval, limit: '1' });
    if (data && data.length > 0) {
      return {
        open: parseFloat(data[0][1]),
        high: parseFloat(data[0][2]),
        low: parseFloat(data[0][3]),
        close: parseFloat(data[0][4]),
        volume: parseFloat(data[0][7]), // Quote asset volume (USDT)
      };
    }
  } catch (e) {
    console.error(`Failed to fetch kline for ${symbol}`, e);
  }
  return null;
};

// 资金费率内存缓存与防超频节奏化拉取 (升级为基于 @markPrice WebSocket 实时推送)
let lastFundingFetchedAt = 0;
const FUNDING_CACHE_TTL = 3 * 60 * 1000;

const fetchFundingRatesBackend = async (force: boolean = false) => {
  if (isFetchingFunding) return;
  isFetchingFunding = true;
  try {
    const rates = marketDataManager.getFundingRates(config.m1);
    if (rates.length > 0) {
      fundingRates = rates;
      lastFundingFetchedAt = Date.now();
    } else if (force) {
      // 启动早期 WS 尚未收到任何推送时的保底回退
      const tickerList = await fetchAllTickers();
      const premiumData = await fetchBinanceBackend('/fapi/v1/premiumIndex').catch(() => []);
      if (Array.isArray(premiumData)) {
        const tickerMap = new Map(tickerList.map((t: any) => [t.symbol, t]));
        const fallbackRates = premiumData
          .filter((p: any) => p && p.symbol && p.symbol.endsWith('USDT') && (tickerMap.get(p.symbol)?.quoteVolume || 0) > config.m1)
          .map((p: any) => ({
            symbol: p.symbol,
            fundingRate: (parseFloat(p.lastFundingRate) || 0) * 100,
            settlementCycle: '8h',
            volume24h: parseFloat(tickerMap.get(p.symbol)?.quoteVolume || 0),
            nextFundingTime: Number(p.nextFundingTime || 0),
            fetchedAt: Date.now()
          }))
          .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));
        if (fallbackRates.length > 0) {
          fundingRates = fallbackRates.slice(0, 24);
          lastFundingFetchedAt = Date.now();
        }
      }
    }
  } catch (error: any) {
    console.error("Failed to fetch funding rates on backend:", error.message || error);
  } finally {
    isFetchingFunding = false;
  }
};

const runCycleScan15m = async () => {
  if (isScanning15m) return;
  isScanning15m = true;
  addMonitorLog('[15M周期结算] 启动全市场 15m 榜单量化结算与筛选 (本地聚合计算)...', 'INFO');
  
  try {
    const allSymbols = marketDataManager.getAllSymbols();
    if (allSymbols.length === 0) {
      isScanning15m = false;
      return;
    }

    const min24h = config.minVolume24h || config.m1 || 15000000;
    const min15m = config.minVolumeCycle || config.n1 || 3000000;

    let passedCount = 0;
    const finalResults: any[] = [];

    for (const symbol of allSymbols) {
      const vol24h = marketDataManager.getSymbol24hVolume(symbol);
      if (vol24h <= min24h) continue;

      const kline = marketDataManager.getSymbol15mKline(symbol);
      if (kline && kline.volume > min15m) {
        passedCount++;
        finalResults.push({
          symbol,
          volume24h: vol24h,
          volume15m: kline.volume,
          openPrice: kline.open,
          lastPrice: kline.close,
          change: kline.change,
          change24h: marketDataManager.getSymbol24hChange(symbol),
          amplitude: kline.amplitude
        });
      }
    }

    const gainers = [...finalResults].sort((a, b) => b.change - a.change).slice(0, 5);
    const losers = [...finalResults].sort((a, b) => a.change - b.change).slice(0, 5);
    const amplitude15m = [...finalResults].sort((a, b) => (b.amplitude || 0) - (a.amplitude || 0)).slice(0, 5);

    const allQualified24h = allSymbols
      .filter(s => marketDataManager.getSymbol24hVolume(s) > min24h)
      .map(s => ({
        symbol: s,
        volume24h: marketDataManager.getSymbol24hVolume(s),
        volume15m: 0,
        openPrice: 0,
        lastPrice: marketDataManager.getSymbolPrice(s),
        change: 0,
        change24h: marketDataManager.getSymbol24hChange(s)
      }));

    const gainers24h = [...allQualified24h].sort((a, b) => b.change24h - a.change24h).slice(0, 5);
    const losers24h = [...allQualified24h].sort((a, b) => a.change24h - b.change24h).slice(0, 5);

    scanResults = {
      gainers,
      losers,
      amplitude15m,
      gainers24h,
      losers24h,
      timestamp: Date.now()
    };

    scanStats = {
      lastScanTime: new Date().toLocaleTimeString(),
      totalTickers: allSymbols.length,
      passedCount
    };

    addMonitorLog(`[15M周期结算] 结算完成，共 ${passedCount} 个币对达标，已生成最新 Top 5 榜单（0 API消耗）。`, 'SUCCESS');

    // Broadcast SSE
    broadcastSSE({
      type: '15M_STATUS',
      data: {
        results: getLiveEnrichedScanResults15m(),
        scanStats,
        countdown: settleCountdown15m
      }
    });

    // Check for alerts
    const maxGain = gainers.length > 0 ? gainers[0].change : 0;
    const maxLoss = losers.length > 0 ? Math.abs(losers[0].change) : 0;
    const maxAmplitude = amplitude15m.length > 0 ? (amplitude15m[0].amplitude || 0) : 0;
    const now = Date.now();

    if (maxGain >= config.gainThreshold) {
      addMonitorLog(`【价格报警】 触发15分钟多头暴涨点位！当前最高涨幅: +${maxGain.toFixed(2)}% (${gainers[0].symbol})`, 'SUCCESS');
      try {
        const stmt = db.prepare(`
          INSERT INTO alert_logs (trigger_time, symbol, board_name, change_val, volume_15m)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const item of gainers) {
          if (item.change >= config.gainThreshold) {
            stmt.run(now, item.symbol, "15分钟涨幅榜", "+" + item.change.toFixed(2) + "%", item.volume15m);
          }
        }
      } catch (e: any) {
        console.error("Failed to insert gain alert logs:", e);
      }
      broadcastSSE({ type: 'ALERT', data: { type: 'gain', level: '15m', symbol: gainers[0].symbol, val: maxGain } });
    }

    if (maxLoss >= config.lossThreshold) {
      addMonitorLog(`【价格报警】 触发15分钟空头暴跌点位！当前最高跌幅: -${maxLoss.toFixed(2)}% (${losers[0].symbol})`, 'SUCCESS');
      try {
        const stmt = db.prepare(`
          INSERT INTO alert_logs (trigger_time, symbol, board_name, change_val, volume_15m)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const item of losers) {
          if (Math.abs(item.change) >= config.lossThreshold) {
            stmt.run(now, item.symbol, "15分钟跌幅榜", (item.change >= 0 ? "+" : "") + item.change.toFixed(2) + "%", item.volume15m);
          }
        }
      } catch (e: any) {
        console.error("Failed to insert loss alert logs:", e);
      }
      broadcastSSE({ type: 'ALERT', data: { type: 'loss', level: '15m', symbol: losers[0].symbol, val: maxLoss } });
    }

    if (maxAmplitude >= config.amplitudeThreshold) {
      addMonitorLog(`【价格报警】 触发15分钟振幅报警点位！当前最高振幅: ${maxAmplitude.toFixed(2)}% (${amplitude15m[0].symbol})`, 'SUCCESS');
      try {
        const stmt = db.prepare(`
          INSERT INTO alert_logs (trigger_time, symbol, board_name, change_val, volume_15m)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const item of amplitude15m) {
          if (item.amplitude >= config.amplitudeThreshold) {
            stmt.run(now, item.symbol, "15分钟振幅榜", item.amplitude.toFixed(2) + "%", item.volume15m);
          }
        }
      } catch (e: any) {
        console.error("Failed to insert amplitude alert logs:", e);
      }
      broadcastSSE({ type: 'ALERT', data: { type: 'amp', level: '15m', symbol: amplitude15m[0].symbol, val: maxAmplitude } });
    }

  } catch (error: any) {
    console.error("Backend 15m scan failed:", error);
    addMonitorLog('[15M周期结算] 结算失败: ' + String(error.message || error), 'ERROR');
  } finally {
    isScanning15m = false;
  }
};

function runBackgroundMonitor() {
  const CYCLE_MS = 15 * 60 * 1000;
  
  if (isRunning) {
    fetchFundingRatesBackend();
  }

  setInterval(async () => {
    const now = new Date();
    
    const totalSecondsInCycle = (now.getMinutes() % 15) * 60 + now.getSeconds();
    const currentCycleStart = Math.floor(now.getTime() / CYCLE_MS) * CYCLE_MS;

    const settleTargetSec = (config.settleMin ?? 14) * 60 + (config.settleSec ?? 30);

    let diff = settleTargetSec - totalSecondsInCycle;
    if (diff < 0) diff += 15 * 60;
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    settleCountdown15m = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    const currentHour = now.getHours();

    // 需求规约：每小时第 3 分钟拉取一次全市场 24h 列表快照，用于更新永续合约币对信息（新币自动加入订阅）
    if (now.getMinutes() === 3 && now.getSeconds() === 0 && lastHourlySnapshotHour !== currentHour) {
      lastHourlySnapshotHour = currentHour;
      marketDataManager.refresh24hSnapshot(false);
    }

    if (!isRunning) return;

    if (now.getMinutes() === 55 && now.getSeconds() === 0 && lastFundingFetchHour !== currentHour) {
      lastFundingFetchHour = currentHour;
      fetchFundingRatesBackend();
    }

    if (totalSecondsInCycle >= settleTargetSec && last15mCycleTrigger !== currentCycleStart) {
      last15mCycleTrigger = currentCycleStart;
      runCycleScan15m();
    }
  }, 1000);
}

runBackgroundMonitor();


let isRunning4h = false;

interface MonitoringConfig4h extends MonitoringConfig {
  yMin?: number;
  ySec?: number;
  m1?: number;
  n1?: number;
  volumeSpikeC: number;
  volumeSpikeX: number;
  volumeSpikeMinute: number;
}

const DEFAULT_CONFIG_4H: MonitoringConfig4h = {
  settleMin: 58,
  settleSec: 30,
  yMin: 58,
  ySec: 30,
  minVolume24h: 30000000,
  minVolumeCycle: 10000000,
  m1: 30000000,
  n1: 10000000,
  gainThreshold: 10,
  lossThreshold: 10,
  amplitudeThreshold: 15,
  enableAlertTimeout: true,
  alertTimeoutSeconds: 15,
  volumeSpikeC: 10000000,
  volumeSpikeX: 5,
  volumeSpikeMinute: 50,
};

let config4h: MonitoringConfig4h = { ...DEFAULT_CONFIG_4H };

// Independent state for 3 four-hour level boards (4小时涨幅榜、4小时跌幅榜、4小时振幅榜) - 4h刷新周期
let fourHourResults4h = {
  gainers: [] as any[],
  losers: [] as any[],
  amplitude15m: [] as any[],
  updatedAt: 0
};

// Independent state for 1h Volume Spike & 24h boards (1小时放量榜、24小时涨幅榜、24小时跌幅榜)
let volumeSpikeAnd24hResults4h = {
  volumeSpike: [] as any[],
  gainers24h: [] as any[],
  losers24h: [] as any[],
  spikeAlertSymbols: [] as string[],
  updatedAt: 0
};

// Load persisted results from database if available
try {
  const row4h = db.prepare("SELECT value FROM settings WHERE key = ?").get("four_hour_results_4h") as any;
  if (row4h) {
    const parsed = JSON.parse(row4h.value);
    if (parsed) fourHourResults4h = parsed;
  }
} catch (e) {}

try {
  const rowSpike = db.prepare("SELECT value FROM settings WHERE key = ?").get("volume_spike_24h_results_4h") as any;
  if (rowSpike) {
    const parsed = JSON.parse(rowSpike.value);
    if (parsed) volumeSpikeAnd24hResults4h = parsed;
  }
} catch (e) {}

// 依据最新实时行情，对 15m 在榜币对的成交额、涨跌幅、振幅、24h成交额等实时数据动态更新
const getLiveEnrichedScanResults15m = () => {
  let baseResults = scanResults;

  // 若尚未进行首次结算扫描，动态依据内存实时数据生成即时榜单
  if (!baseResults || !baseResults.gainers || baseResults.gainers.length === 0) {
    const allSymbols = marketDataManager.getAllSymbols();
    if (allSymbols.length > 0) {
      const min24h = config.minVolume24h || config.m1 || 15000000;
      const min15m = config.minVolumeCycle || config.n1 || 3000000;
      const finalResults: any[] = [];

      for (const symbol of allSymbols) {
        const vol24h = marketDataManager.getSymbol24hVolume(symbol);
        if (vol24h <= min24h) continue;

        const kline = marketDataManager.getSymbol15mKline(symbol);
        if (kline && kline.volume > min15m) {
          finalResults.push({
            symbol,
            volume24h: vol24h,
            volume15m: kline.volume,
            openPrice: kline.open,
            lastPrice: kline.close,
            change: kline.change,
            change24h: marketDataManager.getSymbol24hChange(symbol),
            amplitude: kline.amplitude
          });
        }
      }

      const gainers = [...finalResults].sort((a, b) => b.change - a.change).slice(0, 5);
      const losers = [...finalResults].sort((a, b) => a.change - b.change).slice(0, 5);
      const amplitude15m = [...finalResults].sort((a, b) => (b.amplitude || 0) - (a.amplitude || 0)).slice(0, 5);

      const allQualified24h = allSymbols
        .filter(s => marketDataManager.getSymbol24hVolume(s) > min24h)
        .map(s => ({
          symbol: s,
          volume24h: marketDataManager.getSymbol24hVolume(s),
          volume15m: 0,
          openPrice: 0,
          lastPrice: marketDataManager.getSymbolPrice(s),
          change: 0,
          change24h: marketDataManager.getSymbol24hChange(s)
        }));

      const gainers24h = [...allQualified24h].sort((a, b) => b.change24h - a.change24h).slice(0, 5);
      const losers24h = [...allQualified24h].sort((a, b) => a.change24h - b.change24h).slice(0, 5);

      baseResults = {
        gainers,
        losers,
        amplitude15m,
        gainers24h,
        losers24h,
        timestamp: Date.now()
      };
    }
  }

  if (!baseResults) return null;

  const enrichItem15m = (item: any) => {
    const kline = marketDataManager.getSymbol15mKline(item.symbol);
    const vol24h = marketDataManager.getSymbol24hVolume(item.symbol);
    const chg24h = marketDataManager.getSymbol24hChange(item.symbol);
    const price = marketDataManager.getSymbolPrice(item.symbol);
    return {
      ...item,
      volume24h: vol24h > 0 ? vol24h : item.volume24h,
      volume15m: kline ? kline.volume : item.volume15m,
      openPrice: kline ? kline.open : item.openPrice,
      lastPrice: price > 0 ? price : (kline ? kline.close : item.lastPrice),
      change: kline ? kline.change : item.change,
      change24h: chg24h !== 0 ? chg24h : item.change24h,
      amplitude: kline ? kline.amplitude : item.amplitude
    };
  };

  const enrichItem24h = (item: any) => {
    const vol24h = marketDataManager.getSymbol24hVolume(item.symbol);
    const chg24h = marketDataManager.getSymbol24hChange(item.symbol);
    const price = marketDataManager.getSymbolPrice(item.symbol);
    return {
      ...item,
      volume24h: vol24h > 0 ? vol24h : item.volume24h,
      lastPrice: price > 0 ? price : item.lastPrice,
      change24h: chg24h !== 0 ? chg24h : item.change24h
    };
  };

  return {
    ...baseResults,
    gainers: (baseResults.gainers || []).map(enrichItem15m),
    losers: (baseResults.losers || []).map(enrichItem15m),
    amplitude15m: (baseResults.amplitude15m || []).map(enrichItem15m),
    gainers24h: (baseResults.gainers24h || []).map(enrichItem24h),
    losers24h: (baseResults.losers24h || []).map(enrichItem24h),
    timestamp: baseResults.timestamp || Date.now()
  };
};

// 依据最新实时行情，对 4h / 1h放量 / 24h 在榜币对的成交额、涨跌幅、振幅、放量倍数等实时数据动态更新
const getFullResults4h = () => {
  // 兜底补齐 4H 结果
  if (!fourHourResults4h || !fourHourResults4h.gainers || fourHourResults4h.gainers.length === 0) {
    const allSymbols = marketDataManager.getAllSymbols();
    if (allSymbols.length > 0) {
      const min24h = config4h.minVolume24h || config4h.m1 || 15000000;
      const min4h = config4h.minVolumeCycle || config4h.n1 || 10000000;
      const finalResults: any[] = [];

      for (const symbol of allSymbols) {
        const vol24h = marketDataManager.getSymbol24hVolume(symbol);
        if (vol24h <= min24h) continue;

        const kline = marketDataManager.getSymbol4hKline(symbol);
        if (kline && kline.volume > min4h) {
          finalResults.push({
            symbol,
            volume24h: vol24h,
            volume15m: kline.volume,
            openPrice: kline.open,
            lastPrice: kline.close,
            change: kline.change,
            change24h: marketDataManager.getSymbol24hChange(symbol),
            amplitude: kline.amplitude
          });
        }
      }

      const gainers = [...finalResults].sort((a, b) => b.change - a.change).slice(0, 5);
      const losers = [...finalResults].sort((a, b) => a.change - b.change).slice(0, 5);
      const amplitude15m = [...finalResults].sort((a, b) => (b.amplitude || 0) - (a.amplitude || 0)).slice(0, 5);

      fourHourResults4h = {
        gainers,
        losers,
        amplitude15m,
        updatedAt: Date.now()
      };
    }
  }

  // 兜底补齐 1H 放量与 24H 结果
  if (!volumeSpikeAnd24hResults4h || !volumeSpikeAnd24hResults4h.gainers24h || volumeSpikeAnd24hResults4h.gainers24h.length === 0) {
    const allSymbols = marketDataManager.getAllSymbols();
    if (allSymbols.length > 0) {
      const thresholdC = config4h.volumeSpikeC ?? 10000000;
      const qualifiedSymbols = allSymbols.filter(s => marketDataManager.getSymbol24hVolume(s) > thresholdC);

      const spikeResults: any[] = [];
      for (const symbol of qualifiedSymbols) {
        const spike = marketDataManager.getSymbol1hSpike(symbol);
        if (spike) {
          spikeResults.push({
            symbol,
            ratio: spike.ratio,
            currVolume: spike.currVolume,
            prevVolume: spike.prevVolume,
            change: spike.change1h
          });
        }
      }

      const sortedBySpike = [...spikeResults].sort((a, b) => b.ratio - a.ratio);
      const volumeSpikeBoard = sortedBySpike.slice(0, 5);
      const min24h = config4h.minVolume24h || config4h.m1 || 10000000;
      const allQualified24h = allSymbols
        .filter((s: string) => marketDataManager.getSymbol24hVolume(s) > min24h)
        .map((s: string) => ({
          symbol: s,
          volume24h: marketDataManager.getSymbol24hVolume(s),
          volume15m: 0,
          openPrice: 0,
          lastPrice: marketDataManager.getSymbolPrice(s),
          change: 0,
          change24h: marketDataManager.getSymbol24hChange(s)
        }));

      const gainers24h = [...allQualified24h].sort((a, b) => b.change24h - a.change24h).slice(0, 5);
      const losers24h = [...allQualified24h].sort((a, b) => a.change24h - b.change24h).slice(0, 5);

      volumeSpikeAnd24hResults4h = {
        volumeSpike: volumeSpikeBoard,
        gainers24h,
        losers24h,
        spikeAlertSymbols: [],
        updatedAt: Date.now()
      };
    }
  }

  const enrichItem4h = (item: any) => {
    const kline = marketDataManager.getSymbol4hKline(item.symbol);
    const vol24h = marketDataManager.getSymbol24hVolume(item.symbol);
    const chg24h = marketDataManager.getSymbol24hChange(item.symbol);
    const price = marketDataManager.getSymbolPrice(item.symbol) || (kline ? kline.close : item.lastPrice);

    let change = kline ? kline.change : item.change;
    let amplitude = kline ? kline.amplitude : item.amplitude;
    let openPrice = kline ? kline.open : item.openPrice;
    let vol4h = kline ? kline.volume : item.volume15m;

    if (kline && kline.open > 0 && price > 0) {
      change = ((price - kline.open) / kline.open) * 100;
      const currentHigh = Math.max(kline.high, price);
      const currentLow = Math.min(kline.low, price);
      if (currentLow > 0) {
        amplitude = ((currentHigh - currentLow) / currentLow) * 100;
      }
    }

    return {
      ...item,
      volume24h: vol24h > 0 ? vol24h : item.volume24h,
      volume15m: vol4h,
      openPrice: openPrice,
      lastPrice: price,
      change: change,
      change24h: chg24h !== 0 ? chg24h : item.change24h,
      amplitude: amplitude
    };
  };

  const enrichItemSpike = (item: any) => {
    const spike = marketDataManager.getSymbol1hSpike(item.symbol);
    return {
      ...item,
      ratio: spike ? spike.ratio : item.ratio,
      currVolume: spike ? spike.currVolume : item.currVolume,
      prevVolume: spike ? spike.prevVolume : item.prevVolume,
      change: spike ? spike.change1h : item.change
    };
  };

  const enrichItem24h = (item: any) => {
    const vol24h = marketDataManager.getSymbol24hVolume(item.symbol);
    const chg24h = marketDataManager.getSymbol24hChange(item.symbol);
    const price = marketDataManager.getSymbolPrice(item.symbol);
    return {
      ...item,
      volume24h: vol24h > 0 ? vol24h : item.volume24h,
      lastPrice: price > 0 ? price : item.lastPrice,
      change24h: chg24h !== 0 ? chg24h : item.change24h
    };
  };

  return {
    gainers: (fourHourResults4h.gainers || []).map(enrichItem4h),
    losers: (fourHourResults4h.losers || []).map(enrichItem4h),
    amplitude15m: (fourHourResults4h.amplitude15m || []).map(enrichItem4h),
    fourHourUpdatedAt: fourHourResults4h.updatedAt || 0,

    volumeSpike: (volumeSpikeAnd24hResults4h.volumeSpike || []).map(enrichItemSpike),
    gainers24h: (volumeSpikeAnd24hResults4h.gainers24h || []).map(enrichItem24h),
    losers24h: (volumeSpikeAnd24hResults4h.losers24h || []).map(enrichItem24h),
    spikeAlertSymbols: volumeSpikeAnd24hResults4h.spikeAlertSymbols || [],
    volumeSpikeUpdatedAt: volumeSpikeAnd24hResults4h.updatedAt || 0,

    timestamp: Math.max(fourHourResults4h.updatedAt || 0, volumeSpikeAnd24hResults4h.updatedAt || 0)
  };
};

let scanStats4h: any = null;
let settleCountdown4h = "00:00:00";
let spikeCountdown1h = "00:00";
let last4hCycleTrigger = -1;
let lastVolumeSpikeTriggerHour = -1;
let isScanning4h = false;
let isScanningVolumeSpike4h = false;
let monitorLogs4h: MonitorLog[] = [];

try {
  const runRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("monitoring_running_4h") as any;
  if (runRow) {
    isRunning4h = Boolean(JSON.parse(runRow.value));
  }
} catch (e) {
  console.error("Failed to load monitoring_running_4h status:", e);
}
try {
  const configRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("monitoring_config_4h") as any;
  if (configRow) {
    const parsed = JSON.parse(configRow.value);
    config4h = {
      ...DEFAULT_CONFIG_4H,
      ...parsed,
      settleMin: parsed.settleMin ?? parsed.yMin ?? 58,
      settleSec: parsed.settleSec ?? parsed.ySec ?? 30,
      yMin: parsed.yMin ?? parsed.settleMin ?? 58,
      ySec: parsed.ySec ?? parsed.settleSec ?? 30,
      minVolume24h: parsed.minVolume24h ?? parsed.m1 ?? 30000000,
      minVolumeCycle: parsed.minVolumeCycle ?? parsed.n1 ?? 10000000,
      m1: parsed.m1 ?? parsed.minVolume24h ?? 30000000,
      n1: parsed.n1 ?? parsed.minVolumeCycle ?? 10000000,
    };
  }
} catch (e) {}

const addMonitorLog4h = (message: string, type: 'INFO' | 'SUCCESS' | 'ERROR' | 'TRADE' = 'INFO') => {
  const newLog: MonitorLog = {
    id: Math.random().toString(36).substring(2, 11),
    timestamp: Date.now(),
    type,
    message
  };
  monitorLogs4h.unshift(newLog);
  if (monitorLogs4h.length > 500) monitorLogs4h = monitorLogs4h.slice(0, 500);
  console.log(`[BACKEND MONITOR 4H] [${type}] ${message}`);
};
addMonitorLog4hFn = addMonitorLog4h;

const runCycleScan4h = async () => {
  if (isScanning4h) return;
  isScanning4h = true;
  addMonitorLog4h('[4H周期结算] 启动全市场 4h 榜单量化结算与筛选 (本地聚合计算)...', 'INFO');
  
  try {
    const allSymbols = marketDataManager.getAllSymbols();
    if (allSymbols.length === 0) {
      isScanning4h = false;
      return;
    }

    const min24h = config4h.minVolume24h || config4h.m1 || 15000000;
    const min4h = config4h.minVolumeCycle || config4h.n1 || 10000000;

    let passedCount = 0;
    const finalResults: any[] = [];

    for (const symbol of allSymbols) {
      const vol24h = marketDataManager.getSymbol24hVolume(symbol);
      if (vol24h <= min24h) continue;

      const kline = marketDataManager.getSymbol4hKline(symbol);
      if (kline && kline.volume > min4h) {
        passedCount++;
        finalResults.push({
          symbol,
          volume24h: vol24h,
          volume15m: kline.volume,
          openPrice: kline.open,
          lastPrice: kline.close,
          change: kline.change,
          change24h: marketDataManager.getSymbol24hChange(symbol),
          amplitude: kline.amplitude
        });
      }
    }

    const gainers = [...finalResults].sort((a, b) => b.change - a.change).slice(0, 5);
    const losers = [...finalResults].sort((a, b) => a.change - b.change).slice(0, 5);
    const amplitude15m = [...finalResults].sort((a, b) => (b.amplitude || 0) - (a.amplitude || 0)).slice(0, 5);

    const now = Date.now();
    fourHourResults4h = {
      gainers,
      losers,
      amplitude15m,
      updatedAt: now
    };

    scanStats4h = {
      lastScanTime: new Date().toLocaleTimeString(),
      totalTickers: allSymbols.length,
      passedCount
    };

    try {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
        "four_hour_results_4h",
        JSON.stringify(fourHourResults4h)
      );
    } catch (e) {}

    addMonitorLog4h(`[4H周期结算] 结算完成，共 ${passedCount} 个币对达标，已重新决出 4h 级别 Top 5 榜单（0 API消耗）。`, 'SUCCESS');

    // Broadcast SSE
    const enriched = getFullResults4h();
    broadcastSSE({
      type: '4H_STATUS',
      data: {
        isRunning: Boolean(isRunning4h),
        config: config4h,
        results: enriched,
        fourHourBoards: {
          gainers: enriched.gainers,
          losers: enriched.losers,
          amplitude15m: enriched.amplitude15m,
          updatedAt: enriched.fourHourUpdatedAt
        },
        spikeAnd24hBoards: {
          volumeSpike: enriched.volumeSpike,
          gainers24h: enriched.gainers24h,
          losers24h: enriched.losers24h,
          spikeAlertSymbols: enriched.spikeAlertSymbols,
          updatedAt: enriched.volumeSpikeUpdatedAt
        },
        scanStats: scanStats4h,
        fundingRates,
        settleCountdown: settleCountdown4h,
        spikeCountdown: spikeCountdown1h,
        dataEngine: marketDataManager.getEngineStatus()
      }
    });

    // Check for alerts
    const maxGain = gainers.length > 0 ? gainers[0].change : 0;
    const maxLoss = losers.length > 0 ? Math.abs(losers[0].change) : 0;
    const maxAmplitude = amplitude15m.length > 0 ? (amplitude15m[0].amplitude || 0) : 0;

    if (maxGain >= config4h.gainThreshold) {
      addMonitorLog4h(`【价格报警4h】 触发4h涨幅报警点位！当前最高涨幅: +${maxGain.toFixed(2)}% (${gainers[0].symbol})`, 'SUCCESS');
      try {
        const stmt = db.prepare(`
          INSERT INTO alert_logs (trigger_time, symbol, board_name, change_val, volume_15m)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const item of gainers) {
          if (item.change >= config4h.gainThreshold) {
            stmt.run(now, item.symbol, "4小时涨幅榜", "+" + item.change.toFixed(2) + "%", item.volume15m);
          }
        }
      } catch (e: any) {}
      broadcastSSE({ type: 'ALERT', data: { type: 'gain', level: '4h', symbol: gainers[0].symbol, val: maxGain } });
    }

    if (maxLoss >= config4h.lossThreshold) {
      addMonitorLog4h(`【价格报警4h】 触发4h跌幅报警点位！当前最高跌幅: -${maxLoss.toFixed(2)}% (${losers[0].symbol})`, 'SUCCESS');
      try {
        const stmt = db.prepare(`
          INSERT INTO alert_logs (trigger_time, symbol, board_name, change_val, volume_15m)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const item of losers) {
          if (Math.abs(item.change) >= config4h.lossThreshold) {
            stmt.run(now, item.symbol, "4小时跌幅榜", (item.change >= 0 ? "+" : "") + item.change.toFixed(2) + "%", item.volume15m);
          }
        }
      } catch (e: any) {}
      broadcastSSE({ type: 'ALERT', data: { type: 'loss', level: '4h', symbol: losers[0].symbol, val: maxLoss } });
    }

    if (maxAmplitude >= config4h.amplitudeThreshold) {
      addMonitorLog4h(`【价格报警4h】 触发4h振幅报警点位！当前最高振幅: ${maxAmplitude.toFixed(2)}% (${amplitude15m[0].symbol})`, 'SUCCESS');
      try {
        const stmt = db.prepare(`
          INSERT INTO alert_logs (trigger_time, symbol, board_name, change_val, volume_15m)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const item of amplitude15m) {
          if (item.amplitude >= config4h.amplitudeThreshold) {
            stmt.run(now, item.symbol, "4小时振幅榜", item.amplitude.toFixed(2) + "%", item.volume15m);
          }
        }
      } catch (e: any) {}
      broadcastSSE({ type: 'ALERT', data: { type: 'amp', level: '4h', symbol: amplitude15m[0].symbol, val: maxAmplitude } });
    }

  } catch (error: any) {
    addMonitorLog4h('[4H周期结算] 结算失败: ' + String(error.message || error), 'ERROR');
  } finally {
    isScanning4h = false;
  }
};

const runVolumeSpikeScanBackend4h = async () => {
  if (isScanningVolumeSpike4h) return;
  isScanningVolumeSpike4h = true;
  addMonitorLog4h('[放量监控4h] 开始执行1小时放量榜与24小时榜单市场扫描 (本地15m聚合计算)...', 'INFO');
  
  try {
    const thresholdC = config4h.volumeSpikeC ?? 10000000;
    const allSymbols = marketDataManager.getAllSymbols();
    const qualifiedSymbols = allSymbols.filter(s => marketDataManager.getSymbol24hVolume(s) > thresholdC);

    const spikeResults: any[] = [];
    for (const symbol of qualifiedSymbols) {
      const spike = marketDataManager.getSymbol1hSpike(symbol);
      if (spike) {
        spikeResults.push({
          symbol,
          ratio: spike.ratio,
          currVolume: spike.currVolume,
          prevVolume: spike.prevVolume,
          change: spike.change1h
        });
      }
    }

    const sortedBySpike = [...spikeResults].sort((a, b) => b.ratio - a.ratio);
    const volumeSpikeBoard = sortedBySpike.slice(0, 5);
    const spikeThresholdX = config4h.volumeSpikeX ?? 5;
    const triggeredSpikes = sortedBySpike.filter(item => item.ratio > spikeThresholdX);

    // Compute 24h gainers & 24h losers from local data
    const min24h = config4h.minVolume24h || config4h.m1 || 10000000;
    const allQualified24h = allSymbols
      .filter((s: string) => marketDataManager.getSymbol24hVolume(s) > min24h)
      .map((s: string) => ({
        symbol: s,
        volume24h: marketDataManager.getSymbol24hVolume(s),
        volume15m: 0,
        openPrice: 0,
        lastPrice: marketDataManager.getSymbolPrice(s),
        change: 0,
        change24h: marketDataManager.getSymbol24hChange(s)
      }));

    const gainers24h = [...allQualified24h].sort((a, b) => b.change24h - a.change24h).slice(0, 5);
    const losers24h = [...allQualified24h].sort((a, b) => a.change24h - b.change24h).slice(0, 5);

    const nowTime = Date.now();
    volumeSpikeAnd24hResults4h = {
      volumeSpike: volumeSpikeBoard,
      gainers24h,
      losers24h,
      spikeAlertSymbols: triggeredSpikes.map(item => item.symbol),
      updatedAt: nowTime
    };

    try {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
        "volume_spike_24h_results_4h",
        JSON.stringify(volumeSpikeAnd24hResults4h)
      );
    } catch (e) {}

    // Broadcast SSE
    const enrichedSpike = getFullResults4h();
    broadcastSSE({
      type: '4H_STATUS',
      data: {
        isRunning: Boolean(isRunning4h),
        config: config4h,
        results: enrichedSpike,
        fourHourBoards: {
          gainers: enrichedSpike.gainers,
          losers: enrichedSpike.losers,
          amplitude15m: enrichedSpike.amplitude15m,
          updatedAt: enrichedSpike.fourHourUpdatedAt
        },
        spikeAnd24hBoards: {
          volumeSpike: enrichedSpike.volumeSpike,
          gainers24h: enrichedSpike.gainers24h,
          losers24h: enrichedSpike.losers24h,
          spikeAlertSymbols: enrichedSpike.spikeAlertSymbols,
          updatedAt: enrichedSpike.volumeSpikeUpdatedAt
        },
        scanStats: scanStats4h,
        fundingRates,
        settleCountdown: settleCountdown4h,
        spikeCountdown: spikeCountdown1h,
        dataEngine: marketDataManager.getEngineStatus()
      }
    });

    if (triggeredSpikes.length > 0) {
      addMonitorLog4h(
        `【放量报警4h】 触发1小时放量报警！最高放量倍数: ${triggeredSpikes[0].ratio.toFixed(2)}倍 (${triggeredSpikes[0].symbol})，阈值: ${spikeThresholdX}倍`, 
        'SUCCESS'
      );
      try {
        const stmt = db.prepare(`
          INSERT INTO alert_logs (trigger_time, symbol, board_name, change_val, volume_15m)
          VALUES (?, ?, ?, ?, ?)
        `);
        const nowStr = new Date().toISOString();
        for (const item of triggeredSpikes) {
          stmt.run(nowStr, item.symbol, "1小时放量榜", item.ratio.toFixed(2) + "x", item.currVolume);
        }
      } catch (e: any) {
        console.error("Failed to insert alert logs for volume spike:", e);
      }
      broadcastSSE({ type: 'ALERT', data: { type: 'spike', level: '4h', symbol: triggeredSpikes[0].symbol, val: triggeredSpikes[0].ratio } });
    } else {
      addMonitorLog4h(`[放量监控4h] 1小时放量榜与24小时榜单扫描完成，未触发放量警报。`, 'INFO');
    }
  } catch (err) {
    console.error("Failed to run 1h volume spike scan:", err);
    addMonitorLog4h(`[放量监控4h] 扫描1小时放量榜发生异常: ${(err as any)?.message || err}`, 'ERROR');
  } finally {
    isScanningVolumeSpike4h = false;
  }
};

function runBackgroundMonitor4h() {
  setInterval(async () => {
    const now = new Date();

    const hoursInBlock = now.getHours() % 4;
    const totalSecondsInCycle = hoursInBlock * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const currentCycleStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(now.getHours() / 4) * 4).getTime();

    // 4h 结算点：以4小时为一个完整周期，结算时刻在周期的第 3 小时 + settleMin 分钟 + settleSec 秒
    const settleMin = config4h.yMin ?? config4h.settleMin ?? 58;
    const settleSec = config4h.ySec ?? config4h.settleSec ?? 30;
    const settleTargetSeconds = (3 * 3600) + (settleMin * 60) + settleSec;

    let diff = settleTargetSeconds - totalSecondsInCycle;
    if (diff < 0) diff += 4 * 60 * 60;
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    settleCountdown4h = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    // 1h 放量倒计时
    const spikeMinute = config4h.volumeSpikeMinute ?? 50;
    let spikeDiff = spikeMinute * 60 - (now.getMinutes() * 60 + now.getSeconds());
    if (spikeDiff < 0) spikeDiff += 3600;
    const sm = Math.floor(spikeDiff / 60);
    const ss = spikeDiff % 60;
    spikeCountdown1h = `${sm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;

    if (!isRunning4h) return;
    
    // Check 1h volume spike scan trigger
    const currentHour = now.getHours();
    if (now.getMinutes() === spikeMinute && now.getSeconds() === 0 && lastVolumeSpikeTriggerHour !== currentHour) {
      lastVolumeSpikeTriggerHour = currentHour;
      runVolumeSpikeScanBackend4h();
    }

    if (totalSecondsInCycle >= settleTargetSeconds && last4hCycleTrigger !== currentCycleStart) {
      last4hCycleTrigger = currentCycleStart;
      runCycleScan4h();
    }
  }, 1000);
}
runBackgroundMonitor4h();

// 周期性（每 1 秒）高频 SSE 广播：
// 1. 全市场实时价格 (0 API 消耗，直接读取内存)
// 2. 15M 监控各榜单实时成交额、实时涨跌幅、实时价格与结算倒计时
// 3. 4H 监控各榜单实时成交额、实时涨跌幅、1H放量倍数与各倒计时
// 4. 资金费率最新排行
setInterval(() => {
  if (sseStreamClients.size === 0) return;

  // 1. 广播实时价格
  broadcastSSE({
    type: 'LIVE_PRICES',
    data: marketDataManager.getLivePrices()
  });

  // 4. 广播资金费率
  const currentRates = marketDataManager.getFundingRates(config.minVolume24h || config.m1 || 15000000);
  if (currentRates.length > 0) {
    fundingRates = currentRates;
    broadcastSSE({
      type: 'FUNDING_RATES',
      data: fundingRates
    });
  }

  // 2. 广播 15M 实时榜单与状态
  const enriched15m = getLiveEnrichedScanResults15m();
  broadcastSSE({
    type: '15M_STATUS',
    data: {
      isRunning: Boolean(isRunning),
      config,
      scanStats,
      results: enriched15m,
      countdown: settleCountdown15m,
      fundingRates
    }
  });

  // 3. 广播 4H 实时榜单与状态
  const enriched4h = getFullResults4h();
  broadcastSSE({
    type: '4H_STATUS',
    data: {
      isRunning: Boolean(isRunning4h),
      config: config4h,
      scanStats: scanStats4h,
      results: enriched4h,
      fundingRates,
      fourHourBoards: {
        gainers: enriched4h.gainers,
        losers: enriched4h.losers,
        amplitude15m: enriched4h.amplitude15m,
        updatedAt: enriched4h.fourHourUpdatedAt
      },
      spikeAnd24hBoards: {
        volumeSpike: enriched4h.volumeSpike,
        gainers24h: enriched4h.gainers24h,
        losers24h: enriched4h.losers24h,
        spikeAlertSymbols: enriched4h.spikeAlertSymbols,
        updatedAt: enriched4h.volumeSpikeUpdatedAt
      },
      settleCountdown: settleCountdown4h,
      spikeCountdown: spikeCountdown1h,
      dataEngine: marketDataManager.getEngineStatus()
    }
  });
}, 1000);

// 系统启动 3 秒及 10 秒后自动执行首次初始化榜单计算，确保开机即有全量实时数据
setTimeout(() => {
  runCycleScan15m().catch(() => {});
  runCycleScan4h().catch(() => {});
  runVolumeSpikeScanBackend4h().catch(() => {});
  fetchFundingRatesBackend(true).catch(() => {});
}, 3000);

setTimeout(() => {
  runCycleScan15m().catch(() => {});
  runCycleScan4h().catch(() => {});
  runVolumeSpikeScanBackend4h().catch(() => {});
}, 12000);


async function startServer() {
  const app = express();
  const PORT = 3000;

  // 启动行情数据管道与 WebSocket 实时流
  marketDataManager.startPipeline().catch(err => {
    console.error("Failed to start market data pipeline:", err);
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Helper for Binance Signature
  const getSignature = (queryString: string, secret: string) => {
    return CryptoJS.HmacSHA256(queryString, secret).toString(CryptoJS.enc.Hex);
  };

  // API routes
  app.get("/api/server-info", async (req, res) => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      res.json({ 
        ip: data.ip,
        hostname: os.hostname()
      });
    } catch (error) {
      const interfaces = os.networkInterfaces();
      let localIp = "127.0.0.1";
      for (const k in interfaces) {
        for (const k2 in interfaces[k]!) {
          const address = interfaces[k][k2]!;
          if (address.family === "IPv4" && !address.internal) {
            localIp = address.address;
            break;
          }
        }
      }
      res.json({ ip: localIp, hostname: os.hostname() });
    }
  });

  // --- Alert Audio Management (Upload, Retrieve, Delete, Stream) ---
  
  // 1. Get all saved audio configurations
  app.get("/api/audio-settings", (req, res) => {
    try {
      const rows = db.prepare("SELECT id, name, mime_type, size, updated_at FROM alert_audios").all() as any[];
      const audios: Record<string, any> = {};
      for (const row of rows) {
        audios[row.id] = {
          id: row.id,
          name: row.name,
          mimeType: row.mime_type,
          size: row.size,
          updatedAt: row.updated_at,
          url: `/api/audio/${row.id}?t=${row.updated_at}`
        };
      }
      res.json({ success: true, audios });
    } catch (error: any) {
      console.error("Failed to fetch audio settings:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 2. Upload / Save audio file (Base64 data)
  app.post("/api/audio-upload", (req, res) => {
    try {
      const { id, name, mimeType, dataBase64, size } = req.body;
      if (!id || !dataBase64) {
        return res.status(400).json({ success: false, error: "Missing required fields (id, dataBase64)" });
      }

      const cleanBase64 = dataBase64.replace(/^data:[^;]+;base64,/, '');
      const audioSize = size || Math.round((cleanBase64.length * 3) / 4);
      const audioMime = mimeType || "audio/mpeg";
      const updatedAt = Date.now();

      // Save to SQLite for indestructible cross-container and cross-session persistence
      db.prepare(`
        INSERT OR REPLACE INTO alert_audios (id, name, mime_type, data_base64, size, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, name || `${id}.mp3`, audioMime, cleanBase64, audioSize, updatedAt);

      // Also save to disk
      try {
        const filePath = path.join(AUDIO_UPLOAD_DIR, `${id}.mp3`);
        fs.writeFileSync(filePath, Buffer.from(cleanBase64, "base64"));
      } catch (fsErr) {
        console.warn("Failed to write audio to disk:", fsErr);
      }

      res.json({
        success: true,
        audio: {
          id,
          name: name || `${id}.mp3`,
          mimeType: audioMime,
          size: audioSize,
          updatedAt,
          url: `/api/audio/${id}?t=${updatedAt}`
        }
      });
    } catch (error: any) {
      console.error("Failed to upload audio:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 3. Delete audio file
  app.delete("/api/audio/:id", (req, res) => {
    try {
      const { id } = req.params;
      db.prepare("DELETE FROM alert_audios WHERE id = ?").run(id);

      try {
        const filePath = path.join(AUDIO_UPLOAD_DIR, `${id}.mp3`);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (fsErr) {
        console.warn("Failed to delete audio from disk:", fsErr);
      }

      res.json({ success: true, message: `Audio ${id} deleted successfully` });
    } catch (error: any) {
      console.error("Failed to delete audio:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 4. Stream audio file
  app.get("/api/audio/:id", (req, res) => {
    try {
      const { id } = req.params;
      const row = db.prepare("SELECT name, mime_type, data_base64 FROM alert_audios WHERE id = ?").get(id) as any;
      if (!row || !row.data_base64) {
        return res.status(404).send("Audio not found");
      }

      const buffer = Buffer.from(row.data_base64, "base64");
      const mimeType = row.mime_type || "audio/mpeg";

      res.setHeader("Content-Type", mimeType);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : buffer.length - 1;
        const chunksize = (end - start) + 1;
        const chunk = buffer.subarray(start, end + 1);
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${buffer.length}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": mimeType,
        });
        res.end(chunk);
      } else {
        res.setHeader("Content-Length", buffer.length);
        res.send(buffer);
      }
    } catch (error: any) {
      console.error("Failed to stream audio:", error);
      res.status(500).send("Error loading audio");
    }
  });

  // Get saved system settings
  app.get("/api/settings", (req, res) => {
    try {
      const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
      const result: Record<string, any> = {};
      for (const row of rows) {
        try {
          result[row.key] = JSON.parse(row.value);
        } catch {
          result[row.key] = row.value;
        }
      }
      res.json(result);
    } catch (error: any) {
      console.error("Failed to fetch settings from DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Save/update system settings
  app.post("/api/settings", (req, res) => {
    try {
      const insert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
      const transaction = db.transaction((settings: Record<string, any>) => {
        for (const [key, value] of Object.entries(settings)) {
          insert.run(key, JSON.stringify(value));
        }
      });
      transaction(req.body);
      res.json({ status: "success" });
    } catch (error: any) {
      console.error("Failed to save settings to DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Real-time Push SSE Event Stream for frontend boards, live prices, and instant alerts
  app.get("/api/stream/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    sseStreamClients.add(res);

    // Send initial snapshot
    const enrichedInitial4h = getFullResults4h();
    const initialData = {
      livePrices: marketDataManager.getLivePrices(),
      status15m: {
        isRunning: Boolean(isRunning),
        config,
        scanStats,
        results: getLiveEnrichedScanResults15m(),
        countdown: settleCountdown15m
      },
      status4h: {
        isRunning: Boolean(isRunning4h),
        config: config4h,
        scanStats: scanStats4h,
        results: enrichedInitial4h,
        fourHourBoards: {
          gainers: enrichedInitial4h.gainers,
          losers: enrichedInitial4h.losers,
          amplitude15m: enrichedInitial4h.amplitude15m,
          updatedAt: enrichedInitial4h.fourHourUpdatedAt
        },
        spikeAnd24hBoards: {
          volumeSpike: enrichedInitial4h.volumeSpike,
          gainers24h: enrichedInitial4h.gainers24h,
          losers24h: enrichedInitial4h.losers24h,
          spikeAlertSymbols: enrichedInitial4h.spikeAlertSymbols,
          updatedAt: enrichedInitial4h.volumeSpikeUpdatedAt
        },
        settleCountdown: settleCountdown4h,
        spikeCountdown: spikeCountdown1h,
        dataEngine: marketDataManager.getEngineStatus()
      },
      fundingRates
    };

    res.write(`data: ${JSON.stringify({ type: "INITIAL_STATE", data: initialData })}\n\n`);

    req.on("close", () => {
      sseStreamClients.delete(res);
    });
  });

  // Monitoring endpoints (15m)
  app.get("/api/monitoring/status", (req, res) => {
    const currentRates = marketDataManager.getFundingRates(config.minVolume24h || config.m1);
    if (currentRates.length > 0) {
      fundingRates = currentRates;
    }

    res.json({
      isRunning: Boolean(isRunning),
      config,
      scanStats,
      results: getLiveEnrichedScanResults15m(),
      fundingRates,
      settleCountdown: settleCountdown15m,
      // Legacy compatibility keys
      phase1Countdown: settleCountdown15m,
      phase2Countdown: settleCountdown15m,
      cache1: [],
      dataEngine: marketDataManager.getEngineStatus(),
      currentTime: new Date().toISOString()
    });
  });

  app.get("/api/monitoring/data-engine/status", (req, res) => {
    res.json(marketDataManager.getEngineStatus());
  });

  app.post("/api/monitoring/toggle", (req, res) => {
    isRunning = !isRunning;
    saveRunningState(isRunning);
    
    if (isRunning) {
      addMonitorLog('[扫描监控] 15M周期量化监控在服务器后端开始启动运行...', 'SUCCESS');
      fetchFundingRatesBackend();
      runCycleScan15m();
    } else {
      addMonitorLog('[扫描监控] 15M周期量化监控已被用户在服务器后端手动停止。', 'INFO');
    }
    
    res.json({ isRunning });
  });

  app.post("/api/monitoring/config", (req, res) => {
    const newConfig = req.body;
    if (newConfig) {
      config = {
        ...config,
        ...newConfig,
        settleMin: newConfig.settleMin ?? newConfig.yMin ?? config.settleMin,
        settleSec: newConfig.settleSec ?? newConfig.ySec ?? config.settleSec,
        minVolume24h: newConfig.minVolume24h ?? newConfig.m1 ?? config.minVolume24h,
        minVolumeCycle: newConfig.minVolumeCycle ?? newConfig.n1 ?? config.minVolumeCycle
      };
      saveConfigState(config);
      addMonitorLog('[扫描监控] 15M监控配置参数已更新并成功同步到后端。', 'SUCCESS');
    }
    res.json({ config });
  });

  app.get("/api/monitoring/logs", (req, res) => {
    res.json(monitorLogs);
  });

  app.post("/api/monitoring/logs/clear", (req, res) => {
    monitorLogs = [];
    res.json({ status: "success" });
  });

  app.post("/api/monitoring/scan-phase1", async (req, res) => {
    addMonitorLog('[扫描监控] 收到用户手动指令：立即执行 15m 榜单全量结算', 'INFO');
    await runCycleScan15m();
    res.json({ status: "success", results: scanResults, scanStats });
  });

  app.post("/api/monitoring/scan-phase2", async (req, res) => {
    addMonitorLog('[扫描监控] 收到用户手动指令：立即执行 15m 榜单全量结算', 'INFO');
    await runCycleScan15m();
    res.json({ status: "success", results: scanResults, scanStats });
  });

  app.post("/api/monitoring/funding/refresh", async (req, res) => {
    addMonitorLog('[资金费率] 收到用户手动指令：立即刷新永续合约资金费率排行', 'INFO');
    try {
      await marketDataManager.refreshFundingInfo();
    } catch (e) {}
    await fetchFundingRatesBackend(true);
    const currentRates = marketDataManager.getFundingRates(config.minVolume24h || config.m1 || 15000000);
    if (currentRates.length > 0) {
      fundingRates = currentRates;
    }
    broadcastSSE({ type: 'FUNDING_RATES', data: fundingRates });
    res.json({ status: "success", fundingRates });
  });

  // Market live prices endpoint (fast local in-memory lookup)
  app.get("/api/market/live-prices", (req, res) => {
    const symbolsParam = req.query.symbols as string | undefined;
    const symbols = symbolsParam ? symbolsParam.split(',').map(s => s.trim().toUpperCase()) : undefined;
    const prices = marketDataManager.getLivePrices(symbols);
    res.json({ prices });
  });

  // 4H Monitoring Endpoints
  app.get("/api/monitoring-4h/status", (req, res) => {
    const currentRates = marketDataManager.getFundingRates(config4h.minVolume24h || config4h.m1 || 15000000);
    if (currentRates.length > 0) {
      fundingRates = currentRates;
    }
    const currentResults = getFullResults4h();
    res.json({
      isRunning: Boolean(isRunning4h),
      config: config4h,
      scanStats: scanStats4h,
      results: currentResults,
      fourHourBoards: {
        gainers: currentResults.gainers,
        losers: currentResults.losers,
        amplitude15m: currentResults.amplitude15m,
        updatedAt: currentResults.fourHourUpdatedAt
      },
      spikeAnd24hBoards: {
        volumeSpike: currentResults.volumeSpike,
        gainers24h: currentResults.gainers24h,
        losers24h: currentResults.losers24h,
        spikeAlertSymbols: currentResults.spikeAlertSymbols,
        updatedAt: currentResults.volumeSpikeUpdatedAt
      },
      fundingRates,
      settleCountdown: settleCountdown4h,
      spikeCountdown: spikeCountdown1h,
      dataEngine: marketDataManager.getEngineStatus(),
      currentTime: new Date().toISOString()
    });
  });

  app.post("/api/monitoring-4h/toggle", async (req, res) => {
    if (typeof req.body?.isRunning === "boolean") {
      isRunning4h = req.body.isRunning;
    } else {
      isRunning4h = !isRunning4h;
    }

    try {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("monitoring_running_4h", JSON.stringify(isRunning4h));
    } catch (e) {}

    if (isRunning4h) {
      addMonitorLog4h('[4H监控] 4H 监控与放量扫描程序已在后端启动，立即执行全市场即时量化结算...', 'SUCCESS');
      await Promise.all([
        runCycleScan4h(),
        runVolumeSpikeScanBackend4h(),
        fetchFundingRatesBackend()
      ]);
    } else {
      addMonitorLog4h('[4H监控] 4H 监控程序已被用户手动中止。', 'INFO');
    }

    const currentResults = getFullResults4h();

    // 立即广播最新 4H 榜单与运行状态
    broadcastSSE({
      type: '4H_STATUS',
      data: {
        isRunning: Boolean(isRunning4h),
        config: config4h,
        scanStats: scanStats4h,
        results: currentResults,
        fourHourBoards: {
          gainers: currentResults.gainers,
          losers: currentResults.losers,
          amplitude15m: currentResults.amplitude15m,
          updatedAt: currentResults.fourHourUpdatedAt
        },
        spikeAnd24hBoards: {
          volumeSpike: currentResults.volumeSpike,
          gainers24h: currentResults.gainers24h,
          losers24h: currentResults.losers24h,
          spikeAlertSymbols: currentResults.spikeAlertSymbols,
          updatedAt: currentResults.volumeSpikeUpdatedAt
        },
        settleCountdown: settleCountdown4h,
        spikeCountdown: spikeCountdown1h,
        dataEngine: marketDataManager.getEngineStatus()
      }
    });

    res.json({
      success: true,
      status: "success",
      isRunning: isRunning4h,
      results: currentResults,
      fourHourBoards: {
        gainers: currentResults.gainers,
        losers: currentResults.losers,
        amplitude15m: currentResults.amplitude15m,
        updatedAt: currentResults.fourHourUpdatedAt
      },
      spikeAnd24hBoards: {
        volumeSpike: currentResults.volumeSpike,
        gainers24h: currentResults.gainers24h,
        losers24h: currentResults.losers24h,
        spikeAlertSymbols: currentResults.spikeAlertSymbols,
        updatedAt: currentResults.volumeSpikeUpdatedAt
      },
      scanStats: scanStats4h
    });
  });

  app.post("/api/monitoring-4h/config", (req, res) => {
    const newConfig = req.body;
    if (newConfig) {
      config4h = {
        ...config4h,
        ...newConfig,
        settleMin: newConfig.yMin ?? newConfig.settleMin ?? config4h.settleMin,
        settleSec: newConfig.ySec ?? newConfig.settleSec ?? config4h.settleSec,
        yMin: newConfig.yMin ?? newConfig.settleMin ?? config4h.yMin,
        ySec: newConfig.ySec ?? newConfig.settleSec ?? config4h.ySec,
        minVolume24h: newConfig.m1 ?? newConfig.minVolume24h ?? config4h.minVolume24h,
        minVolumeCycle: newConfig.n1 ?? newConfig.minVolumeCycle ?? config4h.minVolumeCycle,
        m1: newConfig.m1 ?? newConfig.minVolume24h ?? config4h.m1,
        n1: newConfig.n1 ?? newConfig.minVolumeCycle ?? config4h.n1
      };
      try {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("monitoring_config_4h", JSON.stringify(config4h));
      } catch (e) {}
      addMonitorLog4h('[4H监控] 4H 监控配置参数已更新并成功同步到后端。', 'SUCCESS');
    }
    res.json({ config: config4h });
  });

  app.get("/api/monitoring-4h/logs", (req, res) => {
    res.json(monitorLogs4h);
  });

  app.post("/api/monitoring-4h/logs/clear", (req, res) => {
    monitorLogs4h = [];
    res.json({ status: "success" });
  });

  app.post("/api/monitoring-4h/scan-phase1", async (req, res) => {
    addMonitorLog4h('[4H看板] 收到用户手动指令：开始立即结算 4H 周期量化榜单...', 'INFO');
    await runCycleScan4h();
    const currentResults = getFullResults4h();
    res.json({
      status: "success",
      success: true,
      results: currentResults,
      fourHourBoards: {
        gainers: currentResults.gainers,
        losers: currentResults.losers,
        amplitude15m: currentResults.amplitude15m,
        updatedAt: currentResults.fourHourUpdatedAt
      },
      spikeAnd24hBoards: {
        volumeSpike: currentResults.volumeSpike,
        gainers24h: currentResults.gainers24h,
        losers24h: currentResults.losers24h,
        spikeAlertSymbols: currentResults.spikeAlertSymbols,
        updatedAt: currentResults.volumeSpikeUpdatedAt
      },
      scanStats: scanStats4h
    });
  });

  app.post("/api/monitoring-4h/scan", async (req, res) => {
    addMonitorLog4h('[4H看板] 收到用户手动指令：开始立即结算 4H 周期量化榜单...', 'INFO');
    await runCycleScan4h();
    const currentResults = getFullResults4h();
    res.json({
      status: "success",
      success: true,
      results: currentResults,
      fourHourBoards: {
        gainers: currentResults.gainers,
        losers: currentResults.losers,
        amplitude15m: currentResults.amplitude15m,
        updatedAt: currentResults.fourHourUpdatedAt
      },
      spikeAnd24hBoards: {
        volumeSpike: currentResults.volumeSpike,
        gainers24h: currentResults.gainers24h,
        losers24h: currentResults.losers24h,
        spikeAlertSymbols: currentResults.spikeAlertSymbols,
        updatedAt: currentResults.volumeSpikeUpdatedAt
      },
      scanStats: scanStats4h
    });
  });

  app.post("/api/monitoring-4h/scan-volume-spike", async (req, res) => {
    addMonitorLog4h('[4H看板] 收到用户手动指令：开始立即扫描 1H 放量与 24H 异动...', 'INFO');
    await runVolumeSpikeScanBackend4h();
    const currentResults = getFullResults4h();
    res.json({
      status: "success",
      success: true,
      results: currentResults,
      fourHourBoards: {
        gainers: currentResults.gainers,
        losers: currentResults.losers,
        amplitude15m: currentResults.amplitude15m,
        updatedAt: currentResults.fourHourUpdatedAt
      },
      spikeAnd24hBoards: {
        volumeSpike: currentResults.volumeSpike,
        gainers24h: currentResults.gainers24h,
        losers24h: currentResults.losers24h,
        spikeAlertSymbols: currentResults.spikeAlertSymbols,
        updatedAt: currentResults.volumeSpikeUpdatedAt
      }
    });
  });

  app.post("/api/monitoring-4h/funding/refresh", async (req, res) => {
    addMonitorLog4h('[资金费率] 收到用户手动指令：立即刷新永续合约资金费率排行', 'INFO');
    await fetchFundingRatesBackend(true);
    const currentRates = marketDataManager.getFundingRates(config4h.minVolume24h || config4h.m1 || 15000000);
    if (currentRates.length > 0) {
      fundingRates = currentRates;
    }
    broadcastSSE({ type: 'FUNDING_RATES', data: fundingRates });
    res.json({ status: "success", fundingRates });
  });

  // Save/update specialized api-credentials (stores account name and api info to local database)
  app.post("/api/api-credentials", async (req, res) => {
    try {
      const { accountName, baseUrl, apiKey, apiSecret } = req.body;
      if (!accountName) {
        return res.status(400).json({ error: "Missing required fields (accountName)" });
      }

      db.prepare(`
        INSERT OR REPLACE INTO api_credentials (account_name, api_key, api_secret, base_url)
        VALUES (?, ?, ?, ?)
      `).run(
        accountName,
        apiKey || '',
        apiSecret || '',
        baseUrl || "https://fapi.binance.com"
      );

      if (apiKey && apiSecret) {
        userDataStreamManager.startStream({
          accountName,
          apiKey,
          apiSecret,
          baseUrl: baseUrl || "https://fapi.binance.com"
        }).catch(err => {
          console.warn(`Could not start user data stream immediately for ${accountName}:`, err);
        });
      }

      res.json({ status: "success" });
    } catch (error: any) {
      console.error("Failed to save api-credentials to DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all saved credentials
  app.get("/api/api-credentials", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM api_credentials ORDER BY account_name ASC").all() as any[];
      const list = rows.map(r => ({
        accountName: r.account_name,
        apiKey: r.api_key || "",
        apiSecret: r.api_secret || "",
        baseUrl: (r.base_url && r.base_url.includes("fapi-gcp")) ? "https://fapi.binance.com" : (r.base_url || "https://fapi.binance.com")
      }));
      res.json(list);
    } catch (error: any) {
      console.error("Failed to fetch api-credentials from DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete saved credentials
  app.delete("/api/api-credentials/:accountName", (req, res) => {
    try {
      const { accountName } = req.params;
      db.prepare("DELETE FROM api_credentials WHERE account_name = ?").run(accountName);
      userDataStreamManager.stopStream(accountName, true).catch(() => {});
      res.json({ status: "success" });
    } catch (error: any) {
      console.error("Failed to delete api-credentials from DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // User Data Stream (SSE) endpoint for real-time zero-weight positions & order updates
  app.get("/api/user-data-stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const accountName = (req.query.accountName as string) || "default";
    const clientId = Math.random().toString(36).substring(2, 12);

    userDataStreamManager.addSseClient(clientId, accountName, res);

    req.on("close", () => {
      userDataStreamManager.removeSseClient(clientId);
    });
  });

  // User data stream control endpoints
  app.get("/api/user-data-stream/status", (req, res) => {
    res.json(userDataStreamManager.getStatus());
  });

  app.post("/api/user-data-stream/start", async (req, res) => {
    try {
      const { accountName, apiKey, apiSecret, baseUrl } = req.body;
      if (!accountName || !apiKey) {
        return res.status(400).json({ error: "Missing required accountName or apiKey" });
      }
      const success = await userDataStreamManager.startStream({
        accountName,
        apiKey,
        apiSecret,
        baseUrl
      });
      res.json({ success, status: success ? "CONNECTED" : "FAILED" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to start stream" });
    }
  });

  app.post("/api/user-data-stream/stop", async (req, res) => {
    try {
      const { accountName } = req.body;
      if (accountName) {
        await userDataStreamManager.stopStream(accountName, true);
      }
      res.json({ status: "success" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to stop stream" });
    }
  });

  // Zero-weight real-time prices & mark prices for active positions and monitoring (0 Binance REST API weight)
  app.get("/api/market/live-prices", (req, res) => {
    try {
      const symbolsQuery = req.query.symbols as string;
      const symbols = symbolsQuery ? symbolsQuery.split(",").map(s => s.trim()).filter(Boolean) : undefined;
      const prices = marketDataManager.getLivePrices(symbols);
      res.json({ success: true, prices, timestamp: Date.now() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/market/live-prices", (req, res) => {
    try {
      const symbols = req.body.symbols as string[];
      const prices = marketDataManager.getLivePrices(symbols);
      res.json({ success: true, prices, timestamp: Date.now() });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get alert logs with optional filtering by date (YYYY-MM-DD) and boardName
  app.get("/api/alert-logs", (req, res) => {
    try {
      const { date, boardName } = req.query;
      let queryStr = "SELECT * FROM alert_logs";
      const params: any[] = [];
      const conditions: string[] = [];

      if (date) {
        const startOfDay = new Date(date as string).setHours(0, 0, 0, 0);
        const endOfDay = new Date(date as string).setHours(23, 59, 59, 999);
        conditions.push("trigger_time >= ? AND trigger_time <= ?");
        params.push(startOfDay, endOfDay);
      }

      if (boardName) {
        conditions.push("board_name = ?");
        params.push(boardName);
      }

      if (conditions.length > 0) {
        queryStr += " WHERE " + conditions.join(" AND ");
      }

      queryStr += " ORDER BY trigger_time DESC";

      const rows = db.prepare(queryStr).all(...params);
      res.json(rows);
    } catch (error: any) {
      console.error("Failed to fetch alert logs from DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Clear alert logs
  app.post("/api/alert-logs/clear", (req, res) => {
    try {
      db.prepare("DELETE FROM alert_logs").run();
      res.json({ status: "success" });
    } catch (error: any) {
      console.error("Failed to clear alert logs:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get persistent position history
  app.get("/api/position-history", (req, res) => {
    try {
      const { account, accounts } = req.query;
      let rows;
      const rawAccounts = (accounts as string) || (account as string);

      if (rawAccounts && rawAccounts !== 'ALL_ACCOUNTS' && rawAccounts !== 'all') {
        const accountList = rawAccounts.split(',').map(a => a.trim()).filter(Boolean);
        if (accountList.length === 1) {
          rows = db.prepare("SELECT * FROM position_history WHERE account = ? ORDER BY timestamp DESC").all(accountList[0]);
        } else if (accountList.length > 1) {
          const placeholders = accountList.map(() => '?').join(',');
          rows = db.prepare(`SELECT * FROM position_history WHERE account IN (${placeholders}) ORDER BY timestamp DESC`).all(...accountList);
        } else {
          rows = db.prepare("SELECT * FROM position_history ORDER BY timestamp DESC").all();
        }
      } else {
        rows = db.prepare("SELECT * FROM position_history ORDER BY timestamp DESC").all();
      }
      res.json(rows);
    } catch (error: any) {
      console.error("Failed to fetch position history from DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all unique accounts from database
  app.get("/api/position-history/accounts", (req, res) => {
    try {
      const rows = db.prepare("SELECT DISTINCT account FROM position_history WHERE account IS NOT NULL AND account != '' ORDER BY account ASC").all() as { account: string }[];
      const accounts = rows.map(r => r.account);
      res.json(accounts);
    } catch (error: any) {
      console.error("Failed to fetch accounts from DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Bulk save/upsert position history
  app.post("/api/position-history", (req, res) => {
    try {
      const { history } = req.body;
      if (!Array.isArray(history)) {
        return res.status(400).json({ error: "Invalid history payload, expected an array under 'history' key" });
      }

      const insert = db.prepare(`
        INSERT OR REPLACE INTO position_history (
          id, symbol, side, positionSide, entryPrice, exitPrice, amount, 
          pnl, tradePnl, commission, fundingFee, pnlPercent, openTime, closeTime, timestamp, account
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = db.transaction((items: any[]) => {
        for (const item of items) {
          insert.run(
            item.id,
            item.symbol,
            item.side,
            item.positionSide,
            Number(item.entryPrice) || 0,
            Number(item.exitPrice) || 0,
            Number(item.amount) || 0,
            Number(item.pnl) || 0,
            Number(item.tradePnl) || 0,
            Number(item.commission) || 0,
            Number(item.fundingFee) || 0,
            Number(item.pnlPercent) || 0,
            Number(item.openTime) || 0,
            Number(item.closeTime) || 0,
            Number(item.timestamp) || 0,
            item.account || ""
          );
        }
      });

      transaction(history);
      res.json({ status: "success", count: history.length });
    } catch (error: any) {
      console.error("Failed to save position history to DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Clear position history
  app.post("/api/position-history/clear", (req, res) => {
    try {
      db.prepare("DELETE FROM position_history").run();
      res.json({ status: "success" });
    } catch (error: any) {
      console.error("Failed to clear position history in DB:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Simple in-memory cache for public endpoints to avoid Binance IP bans and rate-limits
  interface CacheEntry {
    data: any;
    timestamp: number;
    status: number;
  }
  const publicCache = new Map<string, CacheEntry>();

  const getCacheDuration = (endpoint: string): number => {
    if (endpoint.includes('/exchangeInfo')) {
      return 15 * 60 * 1000; // 15 minutes cache for exchangeInfo since it is static and huge
    }
    if (endpoint.includes('/ticker/24hr')) {
      return 10 * 1000; // 10 seconds cache for daily tickers
    }
    if (endpoint.includes('/premiumIndex') || endpoint.includes('/fundingInfo')) {
      return 5 * 1000; // 5 seconds cache
    }
    return 3 * 1000; // 3 seconds default cache for others like klines
  };

  // Binance Public Proxy Route (for public market data without signature)
  app.get("/api/binance-public", async (req, res) => {
    const { endpoint } = req.query;
    if (!endpoint) {
      return res.status(400).json({ error: "Missing endpoint parameter" });
    }

    try {
      // Rebuild query parameters excluding endpoint
      const params = { ...req.query };
      delete params.endpoint;

      const queryString = new URLSearchParams(params as any).toString();
      const safeEndpoint = (endpoint as string).startsWith('/') ? (endpoint as string) : `/${endpoint}`;

      const cacheKey = `${safeEndpoint}?${queryString}`;
      const now = Date.now();
      const cached = publicCache.get(cacheKey);
      const ttl = getCacheDuration(safeEndpoint);

      if (cached && (now - cached.timestamp < ttl)) {
        return res.status(cached.status).json(cached.data);
      }

      const isFutures = safeEndpoint.includes('/fapi/') || safeEndpoint.includes('/premiumIndex') || safeEndpoint.includes('/fundingInfo');
      const candidates = isFutures
        ? [
            "https://fapi.binance.com"
          ]
        : [
            "https://api.binance.com",
            "https://api-gcp.binance.com"
          ];

      let lastError: any = null;
      let data: any = null;
      let responseStatus = 200;
      let success = false;

      for (const base of candidates) {
        try {
          const url = `${base}${safeEndpoint}${queryString ? '?' + queryString : ''}`;
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(url, { 
            method: "GET",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            },
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          responseStatus = response.status;
          const responseText = await response.text();
          
          try {
            data = JSON.parse(responseText);
            success = true;
            break;
          } catch (jsonErr) {
            console.warn(`Non-JSON response from public endpoint ${base}${safeEndpoint}, status: ${response.status}`);
            lastError = new Error(`Non-JSON response (status ${response.status})`);
          }
        } catch (fetchErr: any) {
          console.warn(`Failed to connect/fetch public endpoint from ${base}: ${fetchErr.message || fetchErr}`);
          lastError = fetchErr;
        }
      }

      if (success) {
        if (responseStatus === 200) {
          publicCache.set(cacheKey, {
            data,
            timestamp: now,
            status: responseStatus
          });
        }
        return res.status(responseStatus).json(data);
      }

      if (cached) {
        console.warn(`[Public Proxy Cache] Serving stale data on complete fetch failure for: ${safeEndpoint}`);
        return res.status(cached.status).json(cached.data);
      }

      return res.status(500).json({ 
        error: "All Binance Public API endpoints returned errors or non-JSON", 
        details: lastError?.message || "Unknown error" 
      });
    } catch (error: any) {
      console.error("Binance Public Proxy Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Binance Proxy Route
  app.post("/api/binance-proxy", async (req, res) => {
    const { method, endpoint, params, apiKey, apiSecret } = req.body;

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: "Missing API credentials" });
    }

    try {
      const timestamp = Date.now();
      const baseParams = {
        ...(params || {}),
        timestamp: timestamp.toString(),
      };

      const queryString = new URLSearchParams(baseParams).toString();
      const signature = getSignature(queryString, apiSecret);
      
      const safeEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      let baseUrl = req.body.baseUrl || "https://fapi.binance.com";
      if (baseUrl.includes("fapi-gcp.binance.com")) {
        baseUrl = baseUrl.replace("fapi-gcp.binance.com", "fapi.binance.com");
      }

      const isFutures = safeEndpoint.includes('/fapi/') || baseUrl.includes('fapi');
      const candidates = isFutures 
        ? [
            "https://fapi.binance.com"
          ]
        : [
            "https://api.binance.com",
            "https://api-gcp.binance.com"
          ];

      const uniqueCandidates = [baseUrl, ...candidates.filter(c => c !== baseUrl)];

      let response: any = null;
      let responseText = '';
      let data: any = null;
      let lastError: any = null;
      let success = false;
      let finalUrl = '';

      for (const currentBase of uniqueCandidates) {
        try {
          let currentUrl = `${currentBase}${safeEndpoint}`;
          let options: RequestInit = {
            method: method || "GET",
            headers: {
              "X-MBX-APIKEY": apiKey,
            },
          };

          if (options.method === "POST" || options.method === "PUT" || options.method === "DELETE") {
            const bodyParams = new URLSearchParams({
              ...baseParams,
              signature: signature,
            });
            options.body = bodyParams.toString();
            options.headers = {
              ...options.headers,
              "Content-Type": "application/x-www-form-urlencoded",
            };
          } else {
            currentUrl += `?${queryString}&signature=${signature}`;
          }

          finalUrl = currentUrl;
          console.log(`Proxying ${options.method} request to: ${currentUrl}`);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          options.signal = controller.signal;

          const resObj = await fetch(currentUrl, options);
          clearTimeout(timeoutId);

          responseText = await resObj.text();
          response = resObj;

          try {
            data = JSON.parse(responseText);
            success = true;
            break; // Valid JSON payload parsed successfully
          } catch (jsonErr) {
            console.warn(`Non-JSON response from domain ${currentBase}: status ${resObj.status}. Snippet: ${responseText.slice(0, 150)}`);
            lastError = new Error(`Non-JSON response (status ${resObj.status})`);
          }
        } catch (fetchErr: any) {
          console.warn(`Failed to connect/fetch from ${currentBase}: ${fetchErr.message || fetchErr}`);
          lastError = fetchErr;
        }
      }

      if (success && response) {
        return res.status(response.status).json(data);
      }

      // If all candidates failed:
      console.error("All proxies failed for URL:", finalUrl);
      return res.status(response ? response.status : 502).json({
        error: "Binance API returned a non-JSON response (likely blocked by Cloudflare/AWS/GCP network policy on all backend endpoints).",
        status: response ? response.status : 502,
        url: finalUrl,
        details: responseText ? responseText.substring(0, 500) : (lastError?.message || "Connection timed out")
      });
    } catch (error: any) {
      console.error("Binance Proxy Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
