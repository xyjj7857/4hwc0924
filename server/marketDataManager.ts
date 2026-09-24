import WebSocket from 'ws';

export interface KlineCandle {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;       // Base asset volume
  quoteVolume: number;  // Quote asset volume (USDT)
  trades: number;
  isClosed: boolean;
}

export interface SymbolMarketData {
  symbol: string;
  candles15m: KlineCandle[];
  quoteVolume24h: number;
  priceChangePercent24h: number;
  lastPrice: number;
  markPrice: number;
  fundingRate: number;
  nextFundingTime: number;
  fundingIntervalHours: number;
  lastUpdated: number;
}

export interface HistorySyncProgress {
  total: number;
  loaded: number;
  percent: number;
  isComplete: boolean;
  statusText: string;
}

export interface SymbolAllTimeStats {
  listingOpen: number; // 上线首根K线开盘价
  listingTime: number; // 上线时间
  historicalHigh: number; // 上线以来历史最高价
  historicalLow: number; // 上线以来历史最低价
  highTime: number; // 最高价发生时间
  lowTime: number; // 最低价发生时间
  laterExtreme: 'high' | 'low' | 'same'; // 'high': 后创高, 'low': 后创低
}

export class MarketDataManager {
  private symbolsMap: Map<string, SymbolMarketData> = new Map();
  private contractUniverse: Set<string> = new Set();
  private wsClients: WebSocket[] = [];
  private markPriceWs: WebSocket | null = null;
  private miniTickerWs: WebSocket | null = null;
  private klineWsSockets: (WebSocket | null)[] = [];
  private miniTickerReconnectTimer: NodeJS.Timeout | null = null;
  private markPriceReconnectTimer: NodeJS.Timeout | null = null;
  private klineReconnectTimers: Map<number, NodeJS.Timeout> = new Map();
  private isShuttingDown: boolean = false;
  private pipelineStarted: boolean = false;
  private fundingInfoMap: Map<string, number> = new Map(); // symbol -> intervalHours
  private allTimeStatsMap: Map<string, SymbolAllTimeStats> = new Map();
  private allTimeFetchingPromises: Map<string, Promise<SymbolAllTimeStats | null>> = new Map();

  public historySyncProgress: HistorySyncProgress = {
    total: 0,
    loaded: 0,
    percent: 0,
    isComplete: false,
    statusText: '未初始化'
  };

  private fetchBinanceBackend: (endpoint: string, params?: Record<string, any>) => Promise<any>;
  private addLog: (message: string, type?: 'INFO' | 'SUCCESS' | 'ERROR' | 'TRADE') => void;
  private addLog4h: (message: string, type?: 'INFO' | 'SUCCESS' | 'ERROR' | 'TRADE') => void;
  private isCircuitBroken: () => boolean;

  constructor(options: {
    fetchBinanceBackend: (endpoint: string, params?: Record<string, any>) => Promise<any>;
    addLog: (message: string, type?: 'INFO' | 'SUCCESS' | 'ERROR' | 'TRADE') => void;
    addLog4h: (message: string, type?: 'INFO' | 'SUCCESS' | 'ERROR' | 'TRADE') => void;
    isCircuitBroken: () => boolean;
  }) {
    this.fetchBinanceBackend = options.fetchBinanceBackend;
    this.addLog = options.addLog;
    this.addLog4h = options.addLog4h;
    this.isCircuitBroken = options.isCircuitBroken;
  }

  private ensureFallbackUniverse(): void {
    if (this.contractUniverse.size === 0) {
      const defaultSymbols = [
        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 
        'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'SUIUSDT', 
        'NEARUSDT', 'DOTUSDT', 'OPUSDT', 'ARBUSDT', 'PEPEUSDT', 
        'ETCUSDT', 'LTCUSDT', 'FILUSDT', 'ATOMUSDT', 'INJUSDT', 
        'RENDERUSDT', 'TIAUSDT', 'APTUSDT', 'RUNEUSDT'
      ];
      const now = Date.now();
      for (const sym of defaultSymbols) {
        this.contractUniverse.add(sym);
        if (!this.symbolsMap.has(sym)) {
          this.symbolsMap.set(sym, {
            symbol: sym,
            candles15m: [], // 彻底剔除假 K 线，只留空等待真实数据加载，杜绝价格与振幅污染
            quoteVolume24h: 0,
            priceChangePercent24h: 0,
            lastPrice: 0,
            markPrice: 0,
            fundingRate: 0,
            nextFundingTime: 0,
            fundingIntervalHours: 8,
            lastUpdated: now
          });
        }
      }
      this.addLog(`[行情数据源] 已启用内置纯净永续合约基础底座共 ${this.contractUniverse.size} 个币对。`, 'INFO');
    }
  }

  /**
   * 启动初始化全流程：
   * 1. 获取全市场 24H 快照确定 USDT 永续合约 Universe（官方真实数据）
   * 2. 建立 WebSocket 连接（15m Kline + Mark Price + MiniTicker 全市场价格流）
   * 3. 异步平滑分批回填每个币最近 200 根 15m 官方真实 K线
   */
  public async startPipeline(): Promise<void> {
    if (this.pipelineStarted) return;
    this.pipelineStarted = true;

    try {
      this.addLog('[行情数据源] 正在启动行情订阅与本地维护引擎...', 'INFO');

      // 第一步：拉取全市场 24h 快照确定 USDT 永续合约 Universe（若网络异常则在 catch 中兜底）
      await this.refresh24hSnapshot(true);

      // 第二步：拉取资金费率结算周期信息与初始费率指数
      await this.refreshFundingInfo();

      // 第三步：建立全市场各 WebSocket 订阅（统一路由至 /market/ws）
      this.initMiniTickerStream();
      this.initMarkPriceStream();
      this.initKlineStreams();

      // 第四步：异步平滑补齐全市场 200 根 15m 历史 K 线
      this.startHistoryBackfill();

      // 第五步：异步获取全市场币对自上线以来的开盘价与全历史极值（ATH/ATL及出现先后顺序）
      this.startAllTimeStatsSync();
    } catch (err: any) {
      this.addLog(`[行情数据源] 启动失败: ${err.message || err}`, 'ERROR');
      this.ensureFallbackUniverse();
    }
  }

  /**
   * 建立全市场 MiniTicker WebSocket 流（秒级全量更新所有币种最新价和24h成交额与涨跌幅）
   * 必须包含 /market 路由路径方可接收市场级推送
   */
  private initMiniTickerStream(): void {
    if (this.isShuttingDown) return;

    // 清理此前待触发的重连定时器，严防并发重连
    if (this.miniTickerReconnectTimer) {
      clearTimeout(this.miniTickerReconnectTimer);
      this.miniTickerReconnectTimer = null;
    }

    // 彻底解绑并销毁旧实例，吸收旧实例未就绪错误，杜绝旧实例 close 回调触发级联重连
    if (this.miniTickerWs) {
      const oldWs = this.miniTickerWs;
      this.miniTickerWs = null;
      try {
        oldWs.removeAllListeners();
        oldWs.on('error', () => {});
        oldWs.terminate();
      } catch (e) {}
    }

    const wsUrl = 'wss://fstream.binance.com/market/ws/!miniTicker@arr';
    this.addLog('[行情数据源] 正在建立全市场 @miniTicker 秒级实时价格 WebSocket 流...', 'INFO');

    try {
      const ws = new WebSocket(wsUrl);
      this.miniTickerWs = ws;

      ws.on('open', () => {
        if (this.miniTickerWs !== ws) return;
        this.addLog('[行情数据源] 全市场 @miniTicker 实时价格 WebSocket 流已就绪！', 'SUCCESS');
      });

      ws.on('message', (data: WebSocket.Data) => {
        if (this.miniTickerWs !== ws) return;
        try {
          const raw = JSON.parse(data.toString());
          const arr = Array.isArray(raw) ? raw : (raw?.data && Array.isArray(raw.data) ? raw.data : null);
          if (Array.isArray(arr)) {
            for (const item of arr) {
              if (!item || !item.s || typeof item.s !== 'string') continue;
              const symbol = item.s;
              // 严格仅更新纯 USDT 永续合约
              if (!this.contractUniverse.has(symbol)) continue;

              const closePrice = parseFloat(item.c) || 0;
              const openPrice = parseFloat(item.o) || 0;
              const quoteVol = parseFloat(item.q) || 0;
              const change24h = openPrice > 0 ? ((closePrice - openPrice) / openPrice) * 100 : 0;

              const record = this.symbolsMap.get(symbol);
              if (record) {
                record.lastPrice = closePrice;
                if (quoteVol > 0) record.quoteVolume24h = quoteVol;
                if (!isNaN(change24h)) record.priceChangePercent24h = change24h;
                record.lastUpdated = Date.now();
              }
            }
          }
        } catch (parseErr) {
          // ignore
        }
      });

      ws.on('error', (err) => {
        if (this.miniTickerWs !== ws) return;
        console.warn('[MarketDataManager] miniTicker WS 遇到网络波动:', err.message || err);
      });

      ws.on('close', () => {
        // 核心防抖：只有当前活跃实例异常断开时才触发重连，切断级联重连回路
        if (this.isShuttingDown || this.miniTickerWs !== ws) return;
        this.miniTickerWs = null;
        this.addLog('[行情数据源] miniTicker WS 断开，3秒后自动重连...', 'INFO');
        if (this.miniTickerReconnectTimer) clearTimeout(this.miniTickerReconnectTimer);
        this.miniTickerReconnectTimer = setTimeout(() => {
          this.initMiniTickerStream();
        }, 3000);
      });
    } catch (e: any) {
      console.error('[MarketDataManager] 启动 miniTicker WS 失败:', e);
      if (this.miniTickerReconnectTimer) clearTimeout(this.miniTickerReconnectTimer);
      this.miniTickerReconnectTimer = setTimeout(() => this.initMiniTickerStream(), 3000);
    }
  }

  /**
   * 拉取 fundingInfo 获取结算周期 (例如 4h / 8h) 并结合 premiumIndex 预填费率与结算时间
   */
  public async refreshFundingInfo(): Promise<void> {
    try {
      const [infoData, premiumData] = await Promise.all([
        this.fetchBinanceBackend('/fapi/v1/fundingInfo').catch(() => []),
        this.fetchBinanceBackend('/fapi/v1/premiumIndex').catch(() => [])
      ]);

      if (Array.isArray(infoData)) {
        for (const item of infoData) {
          if (item.symbol && item.fundingIntervalHours) {
            this.fundingInfoMap.set(item.symbol, Number(item.fundingIntervalHours));
            const rec = this.symbolsMap.get(item.symbol);
            if (rec) {
              rec.fundingIntervalHours = Number(item.fundingIntervalHours);
            }
          }
        }
      }

      if (Array.isArray(premiumData)) {
        for (const item of premiumData) {
          if (!item || !item.symbol || typeof item.symbol !== 'string') continue;
          const symbol = item.symbol;
          if (!this.contractUniverse.has(symbol)) continue;

          const rate = parseFloat(item.lastFundingRate) || 0;
          const nextT = Number(item.nextFundingTime) || 0;
          const markP = parseFloat(item.markPrice) || 0;

          const rec = this.symbolsMap.get(symbol);
          if (rec) {
            rec.fundingRate = rate;
            if (nextT > 0) rec.nextFundingTime = nextT;
            if (markP > 0) rec.markPrice = markP;
          }
        }
      }
    } catch (e: any) {
      console.warn('[MarketDataManager] fundingInfo 获取跳过:', e.message || e);
    }
  }

  /**
   * 刷新全市场 24H 列表快照并更新永续合约 Universe
   */
  public async refresh24hSnapshot(isInitial: boolean = false): Promise<void> {
    try {
      const [data, exchangeInfo] = await Promise.all([
        this.fetchBinanceBackend('/fapi/v1/ticker/24hr'),
        this.fetchBinanceBackend('/fapi/v1/exchangeInfo').catch(() => null)
      ]);
      if (!Array.isArray(data)) return;

      const perpetualSymbols = new Set<string>();
      if (exchangeInfo && Array.isArray(exchangeInfo.symbols)) {
        for (const s of exchangeInfo.symbols) {
          if (s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT') {
            perpetualSymbols.add(s.symbol);
          }
        }
      }

      // 仅保留币安官方定义为 PERPETUAL 且 quoteAsset 为 USDT 的纯永续合约
      const usdtTickers = data.filter((t: any) => {
        if (typeof t.symbol !== 'string') return false;
        if (perpetualSymbols.size > 0) {
          return perpetualSymbols.has(t.symbol);
        }
        return t.symbol.endsWith('USDT') && !t.symbol.includes('_');
      });
      const newCoins: string[] = [];

      for (const t of usdtTickers) {
        const symbol = t.symbol;
        const quoteVol = parseFloat(t.quoteVolume) || 0;
        const changePercent = parseFloat(t.priceChangePercent) || 0;
        const lastPrice = parseFloat(t.lastPrice) || 0;
        const now = Date.now();
        let existing = this.symbolsMap.get(symbol);
        if (!existing) {
          existing = {
            symbol,
            candles15m: [], // 坚决不使用任何虚构估计的假K线，严格保证K线数据真实纯净
            quoteVolume24h: quoteVol,
            priceChangePercent24h: changePercent,
            lastPrice,
            markPrice: lastPrice,
            fundingRate: 0,
            nextFundingTime: 0,
            fundingIntervalHours: this.fundingInfoMap.get(symbol) || 8,
            lastUpdated: now
          };
          this.symbolsMap.set(symbol, existing);
          if (!isInitial) {
            newCoins.push(symbol);
          }
        } else {
          existing.quoteVolume24h = quoteVol;
          existing.priceChangePercent24h = changePercent;
          existing.lastPrice = lastPrice;
          existing.lastUpdated = now;
        }

        this.contractUniverse.add(symbol);
      }

      if (isInitial) {
        this.addLog(`[行情数据源] 首次全市场 24H 快照加载成功，已严格过滤交割合约，共载入 ${this.contractUniverse.size} 个活跃 USDT 永续合约。`, 'SUCCESS');
      } else if (newCoins.length > 0) {
        this.addLog(`[新币发现] 检测到 ${newCoins.length} 个新上线永续合约: ${newCoins.join(', ')}，已自动并入订阅名单！`, 'SUCCESS');
        this.subscribeNewCoins(newCoins);
      } else {
        console.log(`[MarketDataManager] 每小时 24H 快照对齐完毕，当前永续合约 Universe 规模: ${this.contractUniverse.size}`);
      }
    } catch (err: any) {
      this.addLog(`[行情数据源] 刷新 24H 快照异常: ${err.message || err}`, 'ERROR');
      this.ensureFallbackUniverse();
    }
  }

  /**
   * 建立全市场 Mark Price WebSocket 流（单流覆盖所有全币种实时资金费率）
   * 必须使用 /market/ws/!markPrice@arr@1s
   */
  private initMarkPriceStream(): void {
    if (this.isShuttingDown) return;

    // 清除此前待触发的重连定时器
    if (this.markPriceReconnectTimer) {
      clearTimeout(this.markPriceReconnectTimer);
      this.markPriceReconnectTimer = null;
    }

    // 彻底解绑旧实例的所有监听器，杜绝 close 回调触发级联重连
    if (this.markPriceWs) {
      const oldWs = this.markPriceWs;
      this.markPriceWs = null;
      try {
        oldWs.removeAllListeners();
        oldWs.on('error', () => {});
        oldWs.terminate();
      } catch (e) {}
    }

    const wsUrl = 'wss://fstream.binance.com/market/ws/!markPrice@arr@1s';
    this.addLog('[行情数据源] 正在建立全市场 @markPrice 实时 WebSocket 连接...', 'INFO');

    try {
      const ws = new WebSocket(wsUrl);
      this.markPriceWs = ws;

      ws.on('open', () => {
        if (this.markPriceWs !== ws) return;
        this.addLog('[行情数据源] 全市场 @markPrice 资金费率 WebSocket 流已就绪！', 'SUCCESS');
      });

      ws.on('message', (data: WebSocket.Data) => {
        if (this.markPriceWs !== ws) return;
        try {
          const raw = JSON.parse(data.toString());
          const arr = Array.isArray(raw) ? raw : (raw?.data && Array.isArray(raw.data) ? raw.data : null);
          if (Array.isArray(arr)) {
            for (const item of arr) {
              if (!item || !item.s || typeof item.s !== 'string') continue;
              const symbol = item.s;
              if (!this.contractUniverse.has(symbol)) continue;

              const markPrice = parseFloat(item.p) || 0;
              const fundingRate = parseFloat(item.r) || 0;
              const nextFundingTime = item.T ? Number(item.T) : 0;

              const record = this.symbolsMap.get(symbol);
              if (record) {
                record.markPrice = markPrice;
                record.fundingRate = fundingRate;
                if (nextFundingTime > 0) record.nextFundingTime = nextFundingTime;
                record.lastUpdated = Date.now();
              }
            }
          }
        } catch (parseErr) {
          // ignore parsing error
        }
      });

      ws.on('error', (err) => {
        if (this.markPriceWs !== ws) return;
        console.warn('[MarketDataManager] MarkPrice WS 遇到网络波动:', err.message || err);
      });

      ws.on('close', () => {
        // 核心防抖：只有当前活跃实例异常断开时才触发重连，切断级联重连回路
        if (this.isShuttingDown || this.markPriceWs !== ws) return;
        this.markPriceWs = null;
        this.addLog('[行情数据源] MarkPrice WS 连接断开，3秒后自动重连...', 'INFO');
        if (this.markPriceReconnectTimer) clearTimeout(this.markPriceReconnectTimer);
        this.markPriceReconnectTimer = setTimeout(() => {
          this.initMarkPriceStream();
        }, 3000);
      });
    } catch (e: any) {
      console.error('[MarketDataManager] 启动 MarkPrice WS 失败:', e);
      if (this.markPriceReconnectTimer) clearTimeout(this.markPriceReconnectTimer);
      this.markPriceReconnectTimer = setTimeout(() => this.initMarkPriceStream(), 3000);
    }
  }

  /**
   * 建立全市场 15m K 线 WebSocket 流
   * 路由至 /market/ws 接收全市场实时 K 线推送
   */
  private initKlineStreams(): void {
    const allSymbols = Array.from(this.contractUniverse);
    if (allSymbols.length === 0) return;

    // 清理旧连接与定时器
    for (const [idx, timer] of this.klineReconnectTimers.entries()) {
      clearTimeout(timer);
    }
    this.klineReconnectTimers.clear();

    for (const ws of this.klineWsSockets) {
      if (ws) {
        try {
          ws.removeAllListeners();
          ws.on('error', () => {});
          ws.terminate();
        } catch (e) {}
      }
    }
    this.klineWsSockets = [];
    this.wsClients = [];

    const half = Math.ceil(allSymbols.length / 2);
    const groups = [
      allSymbols.slice(0, half),
      allSymbols.slice(half)
    ];

    this.addLog(`[行情数据源] 正在建立 15m K线实时 WebSocket 流 (总数: ${allSymbols.length} 币对，分两组连接)...`, 'INFO');

    groups.forEach((group, index) => {
      this.createKlineWsConnection(group, index + 1);
    });
  }

  private createKlineWsConnection(symbols: string[], groupIndex: number): void {
    if (this.isShuttingDown) return;

    const existingTimer = this.klineReconnectTimers.get(groupIndex);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.klineReconnectTimers.delete(groupIndex);
    }

    const oldWs = this.klineWsSockets[groupIndex];
    if (oldWs) {
      this.klineWsSockets[groupIndex] = null;
      try {
        oldWs.removeAllListeners();
        oldWs.on('error', () => {});
        oldWs.terminate();
      } catch (e) {}
    }

    const wsUrl = 'wss://fstream.binance.com/market/ws';
    const ws = new WebSocket(wsUrl);
    this.klineWsSockets[groupIndex] = ws;
    this.wsClients[groupIndex] = ws;

    const streams = symbols.map(s => `${s.toLowerCase()}@kline_15m`);

    ws.on('open', () => {
      if (this.klineWsSockets[groupIndex] !== ws) return;
      console.log(`[MarketDataManager] Kline WS 组 #${groupIndex} 已打开，开始订阅 ${streams.length} 个 15m 流...`);
      // 币安订阅请求分批发送，每批 100 个，间隔 50ms 防止拥塞
      for (let i = 0; i < streams.length; i += 100) {
        const batch = streams.slice(i, i + 100);
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN && this.klineWsSockets[groupIndex] === ws) {
            ws.send(JSON.stringify({
              method: 'SUBSCRIBE',
              params: batch,
              id: groupIndex * 1000 + i + 1
            }));
          }
        }, (i / 100) * 50);
      }
      this.addLog(`[行情数据源] 15m K线 WebSocket 组 #${groupIndex} (${symbols.length} 币对) 订阅已就绪！`, 'SUCCESS');
    });

    ws.on('message', (data: WebSocket.Data) => {
      if (this.klineWsSockets[groupIndex] !== ws) return;
      try {
        const raw = JSON.parse(data.toString());
        const msg = raw.data || raw;
        if (msg && (msg.e === 'kline' || msg.k)) {
          const k = msg.k;
          const symbol = msg.s || (raw.stream ? raw.stream.split('@')[0].toUpperCase() : '');
          if (symbol && k) {
            this.handleLiveKlineMessage(symbol, k);
          }
        }
      } catch (err) {
        // ignore
      }
    });

    ws.on('error', (err) => {
      if (this.klineWsSockets[groupIndex] !== ws) return;
      console.warn(`[MarketDataManager] Kline WS 组 #${groupIndex} 出错:`, err.message || err);
    });

    ws.on('close', () => {
      if (this.isShuttingDown || this.klineWsSockets[groupIndex] !== ws) return;
      this.klineWsSockets[groupIndex] = null;
      console.warn(`[MarketDataManager] Kline WS 组 #${groupIndex} 断开，5秒后自动重连...`);
      const timer = setTimeout(() => {
        this.createKlineWsConnection(symbols, groupIndex);
      }, 5000);
      this.klineReconnectTimers.set(groupIndex, timer);
    });
  }

  /**
   * 处理实时收到的 15m K 线数据，更新本地 200 根滑动窗口
   */
  private handleLiveKlineMessage(symbol: string, k: any): void {
    const candle: KlineCandle & { isLiveWs?: boolean } = {
      openTime: Number(k.t),
      closeTime: Number(k.T),
      open: parseFloat(k.o) || 0,
      high: parseFloat(k.h) || 0,
      low: parseFloat(k.l) || 0,
      close: parseFloat(k.c) || 0,
      volume: parseFloat(k.v) || 0,
      quoteVolume: parseFloat(k.q) || 0,
      trades: Number(k.n) || 0,
      isClosed: Boolean(k.x)
    };
    (candle as any).isLiveWs = true;

    let record = this.symbolsMap.get(symbol);
    if (!record) {
      record = {
        symbol,
        candles15m: [],
        quoteVolume24h: 0,
        priceChangePercent24h: 0,
        lastPrice: candle.close,
        markPrice: candle.close,
        fundingRate: 0,
        nextFundingTime: 0,
        fundingIntervalHours: 8,
        lastUpdated: Date.now()
      };
      this.symbolsMap.set(symbol, record);
    }

    record.lastPrice = candle.close;
    record.lastUpdated = Date.now();

    const candles = record.candles15m;
    if (candles.length === 0) {
      candles.push(candle);
    } else {
      const last = candles[candles.length - 1];
      if (last.openTime === candle.openTime) {
        // 更新当前未完结的一根 K 线
        candles[candles.length - 1] = candle;
      } else if (candle.openTime > last.openTime) {
        // 新一根 15m K 线产生，推入数组并限制最多保留 200 根
        candles.push(candle);
        if (candles.length > 200) {
          record.candles15m = candles.slice(-200);
        }
      }
    }
  }

  /**
   * 动态追加新上线的币对
   */
  private subscribeNewCoins(symbols: string[]): void {
    if (symbols.length === 0 || this.wsClients.length === 0) return;
    const streams = symbols.map(s => `${s.toLowerCase()}@kline_15m`);
    // 发送到第一个连接
    const targetWs = this.wsClients[0];
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      targetWs.send(JSON.stringify({
        method: 'SUBSCRIBE',
        params: streams,
        id: Date.now()
      }));
    }
    // 异步补齐新币的历史 200 根 K 线
    this.backfillSymbols(symbols);
  }

  /**
   * 异步平滑分批获取全市场 200 根 15m 历史 K 线
   * 优先回填 24H 成交额最高的流动性币对，确保开机 1 秒内头部币种全部就绪
   */
  private async startHistoryBackfill(): Promise<void> {
    const allSymbols = Array.from(this.contractUniverse).sort((a, b) => {
      const volA = this.getSymbol24hVolume(a);
      const volB = this.getSymbol24hVolume(b);
      return volB - volA;
    });
    const total = allSymbols.length;
    this.historySyncProgress = {
      total,
      loaded: 0,
      percent: 0,
      isComplete: false,
      statusText: '异步历史回填中...'
    };

    this.addLog(`[行情数据源] 开始后台平滑补齐全市场 200 根 15m 权威历史数据（共 ${total} 个币对，按流动性优先对齐）...`, 'INFO');
    await this.backfillSymbols(allSymbols);
  }

  private async backfillSymbols(symbols: string[]): Promise<void> {
    const BATCH_SIZE = 8;
    let loadedCount = this.historySyncProgress.loaded;

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      // 若处于熔断静默期，等待解除
      while (this.isCircuitBroken()) {
        await new Promise(r => setTimeout(r, 2000));
      }

      const batch = symbols.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (symbol) => {
        try {
          const rawKlines = await this.fetchBinanceBackend('/fapi/v1/klines', {
            symbol,
            interval: '15m',
            limit: '200'
          });

          if (Array.isArray(rawKlines) && rawKlines.length > 0) {
            const historicalCandles: KlineCandle[] = rawKlines.map((item: any) => ({
              openTime: Number(item[0]),
              closeTime: Number(item[6]),
              open: parseFloat(item[1]) || 0,
              high: parseFloat(item[2]) || 0,
              low: parseFloat(item[3]) || 0,
              close: parseFloat(item[4]) || 0,
              volume: parseFloat(item[5]) || 0,
              quoteVolume: parseFloat(item[7]) || 0,
              trades: Number(item[8]) || 0,
              isClosed: true
            }));

            let record = this.symbolsMap.get(symbol);
            if (!record) {
              record = {
                symbol,
                candles15m: historicalCandles,
                quoteVolume24h: 0,
                priceChangePercent24h: 0,
                lastPrice: historicalCandles[historicalCandles.length - 1].close,
                markPrice: historicalCandles[historicalCandles.length - 1].close,
                fundingRate: 0,
                nextFundingTime: 0,
                fundingIntervalHours: 8,
                lastUpdated: Date.now()
              };
              this.symbolsMap.set(symbol, record);
            } else {
              // 权威官方真实 K 线覆盖：若末尾有实时 WebSocket 接收到的未闭合蜡烛，平滑合并
              const liveCandles = record.candles15m;
              const lastCandle = liveCandles.length > 0 ? liveCandles[liveCandles.length - 1] : null;
              if (lastCandle && (lastCandle as any).isLiveWs) {
                const merged = historicalCandles.filter(c => c.openTime < lastCandle.openTime);
                merged.push(lastCandle);
                record.candles15m = merged.slice(-200);
              } else {
                record.candles15m = historicalCandles.slice(-200);
              }
            }
          }
        } catch (e: any) {
          // 单个币对拉取失败不中断整个流程
        } finally {
          loadedCount++;
        }
      }));

      // 更新进度
      const percent = Math.min(100, Math.round((loadedCount / this.historySyncProgress.total) * 100));
      this.historySyncProgress.loaded = loadedCount;
      this.historySyncProgress.percent = percent;

      // 平滑休眠 150ms 防频控
      await new Promise(r => setTimeout(r, 150));
    }

    this.historySyncProgress.isComplete = true;
    this.historySyncProgress.statusText = '已完成 (100%)';
    this.addLog(`[行情数据源] 全市场 200 根 15m 历史 K 线数据已全部补齐完毕（共 ${symbols.length} 个币对），标记“数据完整”，正式由 WebSocket 实时流接管！`, 'SUCCESS');
    this.addLog4h(`[行情数据源4h] 4H K线聚合所需的 15m 官方真实历史底座已完全就绪（200根深度），本地聚合计算引擎启动！`, 'SUCCESS');
  }

  /**
   * 异步平滑分批获取全市场所有币对自上线以来的全历史开盘价与最高/最低极值
   * 采用 1M（月线，最多 500 根，完全覆盖自上线至今的历史数据）批量拉取
   */
  private async startAllTimeStatsSync(): Promise<void> {
    const allSymbols = Array.from(this.contractUniverse).sort((a, b) => {
      const volA = this.getSymbol24hVolume(a);
      const volB = this.getSymbol24hVolume(b);
      return volB - volA;
    });

    this.addLog(`[行情数据源] 开始异步同步全市场 ${allSymbols.length} 个币对自上线以来的开盘价与全历史极值...`, 'INFO');

    const BATCH_SIZE = 12;
    for (let i = 0; i < allSymbols.length; i += BATCH_SIZE) {
      if (this.isShuttingDown) break;
      while (this.isCircuitBroken()) {
        await new Promise(r => setTimeout(r, 2000));
      }
      const batch = allSymbols.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(sym => this.fetchSymbolAllTimeStats(sym)));
      await new Promise(r => setTimeout(r, 100));
    }

    this.addLog(`[行情数据源] 全市场币对上线开盘价与全历史极值同步完成！已缓存 ${this.allTimeStatsMap.size} 个币对。`, 'SUCCESS');
  }

  /**
   * 获取单个币对自上线以来的全历史开盘价与最高/最低极值（带去重保护）
   */
  public async fetchSymbolAllTimeStats(symbol: string): Promise<SymbolAllTimeStats | null> {
    if (this.allTimeStatsMap.has(symbol)) {
      return this.allTimeStatsMap.get(symbol)!;
    }
    if (this.allTimeFetchingPromises.has(symbol)) {
      return this.allTimeFetchingPromises.get(symbol)!;
    }

    const promise = (async () => {
      try {
        const raw = await this.fetchBinanceBackend('/fapi/v1/klines', {
          symbol,
          interval: '1M',
          limit: '500'
        });

        if (!Array.isArray(raw) || raw.length === 0) {
          return null;
        }

        const listingOpen = parseFloat(raw[0][1]) || 0;
        const listingTime = Number(raw[0][0]) || 0;

        let ath = -Infinity;
        let athTime = 0;
        let atl = Infinity;
        let atlTime = 0;

        for (const k of raw) {
          const h = parseFloat(k[2]) || 0;
          const l = parseFloat(k[3]) || 0;
          const t = Number(k[0]);
          if (h >= ath && h > 0) {
            ath = h;
            athTime = t;
          }
          if (l > 0 && l <= atl) {
            atl = l;
            atlTime = t;
          }
        }

        let laterExtreme: 'high' | 'low' | 'same' = 'same';
        if (athTime > atlTime) {
          laterExtreme = 'high';
        } else if (atlTime > athTime) {
          laterExtreme = 'low';
        } else if (athTime > 0) {
          // 同一月份出现最高和最低（如新上线币），拉取当月日线进一步精确区分先后
          try {
            const nextMonth = athTime + 32 * 86400000;
            const daily = await this.fetchBinanceBackend('/fapi/v1/klines', {
              symbol,
              interval: '1d',
              startTime: String(athTime),
              endTime: String(nextMonth),
              limit: '35'
            });
            if (Array.isArray(daily) && daily.length > 0) {
              let dayAth = -Infinity;
              let dayAthTime = 0;
              let dayAtl = Infinity;
              let dayAtlTime = 0;
              for (const d of daily) {
                const dh = parseFloat(d[2]) || 0;
                const dl = parseFloat(d[3]) || 0;
                const dt = Number(d[0]);
                if (dh >= dayAth && dh > 0) {
                  dayAth = dh;
                  dayAthTime = dt;
                }
                if (dl > 0 && dl <= dayAtl) {
                  dayAtl = dl;
                  dayAtlTime = dt;
                }
              }
              if (dayAthTime > dayAtlTime) laterExtreme = 'high';
              else if (dayAtlTime > dayAthTime) laterExtreme = 'low';
            }
          } catch (e) {
            // 保持 same
          }
        }

        const stats: SymbolAllTimeStats = {
          listingOpen,
          listingTime,
          historicalHigh: ath > 0 && ath !== -Infinity ? ath : listingOpen,
          historicalLow: atl > 0 && atl !== Infinity ? atl : listingOpen,
          highTime: athTime,
          lowTime: atlTime,
          laterExtreme
        };

        this.allTimeStatsMap.set(symbol, stats);
        return stats;
      } catch (err) {
        return null;
      } finally {
        this.allTimeFetchingPromises.delete(symbol);
      }
    })();

    this.allTimeFetchingPromises.set(symbol, promise);
    return promise;
  }

  // ================= 业务查询与聚合 API =================

  /**
   * 获取所有活跃币对 Symbol 列表
   */
  public getAllSymbols(): string[] {
    if (this.contractUniverse.size === 0) {
      this.ensureFallbackUniverse();
    }
    return Array.from(this.contractUniverse);
  }

  /**
   * 获取某币对当前 15m K 线（直接由最新内存推送计算）
   */
  public getSymbol15mKline(symbol: string): {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number; // quoteVolume (USDT)
    change: number;
    amplitude: number;
  } | null {
    const record = this.symbolsMap.get(symbol);
    if (!record || record.candles15m.length === 0) return null;

    const latest = record.candles15m[record.candles15m.length - 1];
    const open = latest.open;
    const high = latest.high;
    const low = latest.low;
    const close = latest.close;
    const volume = latest.quoteVolume; // 阶段一门槛 N 比对的是 USDT 额度

    const change = open > 0 ? ((close - open) / open) * 100 : 0;
    const amplitude = low > 0 ? ((high - low) / low) * 100 : 0;

    return {
      open,
      high,
      low,
      close,
      volume,
      change,
      amplitude
    };
  }

  /**
   * 本地完全基于已订阅的 15m 真实 K 线数据流聚合生成当前未完结 4H K 线数据
   * 严禁订阅 4 小时数据流，4H 周期对齐 UTC 00:00, 04:00, 08:00, 12:00, 16:00, 20:00
   * 聚合要素：
   *  - 未完结4H开盘价: 当前4H窗口内首根 15m K线的开盘价
   *  - 未完结4H最高价: 当前4H窗口内所有 15m K线最高价与最新现价的极大值
   *  - 未完结4H最低价: 当前4H窗口内所有 15m K线最低价与最新现价的极小值
   *  - 未完结4H最新价: 当前最新推送价 (或末尾 15m 蜡烛的收盘价)
   *  - 未完结4H成交额: 当前4H窗口内所有 15m K线的成交额累加和
   *  - 4H涨跌幅 / 高涨幅 / 振幅: 纯基于上述 15m 聚合数据实时计算
   */
  public getSymbol4hKline(symbol: string): {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number; // quoteVolume (USDT)
    change: number;
    highChange: number;
    amplitude: number;
    periodStartTime: number;
    candlesCount: number;
  } | null {
    const record = this.symbolsMap.get(symbol);
    if (!record || record.candles15m.length === 0) return null;

    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
    const now = Date.now();
    const current4hStart = Math.floor(now / FOUR_HOURS_MS) * FOUR_HOURS_MS;

    // 按时间顺序对 15m K 线排序（防御性保证）
    const sorted15m = [...record.candles15m].sort((a, b) => a.openTime - b.openTime);

    // 筛选当前 4H 窗口区间内的所有有效 15m 蜡烛
    const in4hCandles = sorted15m.filter(c => c.openTime >= current4hStart && c.open > 0 && c.close > 0);

    // 优先寻找时间戳严格对齐 4H 开盘起始点 (如 00:00, 04:00, 08:00, 12:00, 16:00, 20:00) 的 15m 蜡烛
    const exactStartCandle = sorted15m.find(c => c.openTime === current4hStart && c.open > 0);

    let open = 0;
    let high = 0;
    let low = Infinity;
    let volume = 0;

    if (exactStartCandle) {
      open = exactStartCandle.open;
    } else if (in4hCandles.length > 0) {
      open = in4hCandles[0].open;
    } else {
      // 容错：若刚跨入新 4H 周期首秒，第一根 15m 尚未收到首个 tick，则取上一根 15m 的收盘价作为新 4H 开盘价
      const lastCandle = sorted15m[sorted15m.length - 1];
      if (lastCandle && lastCandle.closeTime >= current4hStart - 60000) {
        open = lastCandle.close;
      } else {
        return null;
      }
    }

    if (in4hCandles.length > 0) {
      high = Math.max(...in4hCandles.map(c => c.high));
      low = Math.min(...in4hCandles.map(c => c.low));
      volume = in4hCandles.reduce((sum, c) => sum + (c.quoteVolume || 0), 0);
    } else {
      high = open;
      low = open;
      volume = 0;
    }

    const livePrice = record.lastPrice > 0 ? record.lastPrice : (in4hCandles.length > 0 ? in4hCandles[in4hCandles.length - 1].close : open);
    const close = livePrice > 0 ? livePrice : open;

    if (close > 0) {
      high = Math.max(high, close);
      low = Math.min(low, close);
    }

    const change = open > 0 ? ((close - open) / open) * 100 : 0;
    const highChange = close > 0 && open > 0 ? ((close - open) / close) * 100 : change;
    const amplitude = (low > 0 && high >= low) ? ((high - low) / low) * 100 : 0;

    return {
      open,
      high,
      low: isFinite(low) ? low : open,
      close,
      volume,
      change,
      highChange,
      amplitude,
      periodStartTime: current4hStart,
      candlesCount: in4hCandles.length
    };
  }

  /**
   * 获取指定币对自上线以来的全历史开盘价、最高价与最低价，
   * 并判断最高价与最低价哪个后出现（'high': 后出现历史最高，'low': 后出现历史最低，'same': 同时/同根）
   */
  public getSymbolHistoricalExtremes(symbol: string): {
    listingOpen: number;
    listingTime: number;
    historicalHigh: number;
    historicalLow: number;
    highTime: number;
    lowTime: number;
    laterExtreme: 'high' | 'low' | 'same';
    candlesCount: number;
  } {
    const record = this.symbolsMap.get(symbol);
    const livePrice = record && record.lastPrice > 0 ? record.lastPrice : 0;
    const candles = record?.candles15m || [];

    const stats = this.allTimeStatsMap.get(symbol);
    if (stats) {
      let ath = stats.historicalHigh;
      let atl = stats.historicalLow;
      let athTime = stats.highTime;
      let atlTime = stats.lowTime;
      let laterExtreme = stats.laterExtreme;

      // 结合当前最新实时价格，若破上线以来的全历史最高或最低，动态更新并修正后创方向
      const now = Date.now();
      if (livePrice > 0) {
        if (livePrice > ath) {
          ath = livePrice;
          athTime = now;
          laterExtreme = 'high';
        }
        if (livePrice < atl && atl > 0) {
          atl = livePrice;
          atlTime = now;
          laterExtreme = 'low';
        }
      }

      return {
        listingOpen: stats.listingOpen,
        listingTime: stats.listingTime,
        historicalHigh: ath,
        historicalLow: atl,
        highTime: athTime,
        lowTime: atlTime,
        laterExtreme,
        candlesCount: candles.length
      };
    }

    // 若全历史极值尚未拉取完成，触发单个币对异步拉取，同时用当前本地 200 根 K 线安全兜底
    if (!this.allTimeFetchingPromises.has(symbol)) {
      this.fetchSymbolAllTimeStats(symbol).catch(() => {});
    }

    // 兜底逻辑：用已有的 15m K线
    let maxHigh = -Infinity;
    let maxHighTime = 0;
    let minLow = Infinity;
    let minLowTime = 0;
    let fallbackListingOpen = candles.length > 0 ? candles[0].open : livePrice;
    let fallbackListingTime = candles.length > 0 ? candles[0].openTime : Date.now();

    for (const c of candles) {
      if (c.high >= maxHigh && c.high > 0) {
        maxHigh = c.high;
        maxHighTime = c.openTime;
      }
      if (c.low > 0 && c.low <= minLow) {
        minLow = c.low;
        minLowTime = c.openTime;
      }
    }

    const now = Date.now();
    if (livePrice > 0) {
      if (livePrice >= maxHigh) {
        maxHigh = livePrice;
        maxHighTime = now;
      }
      if (livePrice <= minLow) {
        minLow = livePrice;
        minLowTime = now;
      }
    }

    let laterExtreme: 'high' | 'low' | 'same' = 'same';
    if (maxHighTime > minLowTime) {
      laterExtreme = 'high';
    } else if (minLowTime > maxHighTime) {
      laterExtreme = 'low';
    }

    return {
      listingOpen: fallbackListingOpen,
      listingTime: fallbackListingTime,
      historicalHigh: maxHigh > 0 && maxHigh !== -Infinity ? maxHigh : livePrice,
      historicalLow: minLow > 0 && minLow !== Infinity ? minLow : livePrice,
      highTime: maxHighTime,
      lowTime: minLowTime,
      laterExtreme,
      candlesCount: candles.length
    };
  }

  /**
   * 获取近 24H 成交额（由最近 96 根 15m K线累加，若未攒满则采用 24H 快照）
   */
  public getSymbol24hVolume(symbol: string): number {
    const record = this.symbolsMap.get(symbol);
    if (!record) return 0;

    if (record.candles15m.length >= 96) {
      return record.candles15m.slice(-96).reduce((sum, c) => sum + c.quoteVolume, 0);
    }
    // 历史尚未攒满 96 根时，使用 24H REST 快照成交额
    return record.quoteVolume24h || 0;
  }

  /**
   * 获取 24H 涨跌幅
   */
  public getSymbol24hChange(symbol: string): number {
    const record = this.symbolsMap.get(symbol);
    return record?.priceChangePercent24h || 0;
  }

  /**
   * 获取最新现价
   */
  public getSymbolPrice(symbol: string): number {
    const record = this.symbolsMap.get(symbol);
    return record?.lastPrice || record?.markPrice || 0;
  }

  /**
   * 获取标记价格
   */
  public getSymbolMarkPrice(symbol: string): number {
    const record = this.symbolsMap.get(symbol);
    return record?.markPrice || record?.lastPrice || 0;
  }

  /**
   * 获取指定币对的资金费率与结算周期信息
   */
  public getSymbolFundingInfo(symbol: string): { fundingRate: number; fundingIntervalHours: number; settlementCycle: string; nextFundingTime: number } {
    const record = this.symbolsMap.get(symbol);
    const intervalHours = record?.fundingIntervalHours || this.fundingInfoMap.get(symbol) || 8;
    const ratePercent = (record?.fundingRate || 0) * 100;
    let nextFunding = record?.nextFundingTime || 0;
    if (!nextFunding || nextFunding <= Date.now()) {
      const cycleMs = intervalHours * 3600 * 1000;
      nextFunding = Math.floor(Date.now() / cycleMs) * cycleMs + cycleMs;
    }
    return {
      fundingRate: ratePercent,
      fundingIntervalHours: intervalHours,
      settlementCycle: `${intervalHours}h`,
      nextFundingTime: nextFunding
    };
  }

  /**
   * 批量获取指定或全量币对的实时价格与标记价 (0 API 权重)
   */
  public getLivePrices(symbols?: string[]): Record<string, { lastPrice: number; markPrice: number; change24h: number }> {
    const result: Record<string, { lastPrice: number; markPrice: number; change24h: number }> = {};
    if (symbols && symbols.length > 0) {
      for (const rawSym of symbols) {
        const sym = rawSym.trim().toUpperCase();
        const record = this.symbolsMap.get(sym);
        if (record) {
          result[sym] = {
            lastPrice: record.lastPrice || record.markPrice || 0,
            markPrice: record.markPrice || record.lastPrice || 0,
            change24h: record.priceChangePercent24h || 0
          };
        }
      }
    } else {
      for (const [sym, record] of this.symbolsMap.entries()) {
        result[sym] = {
          lastPrice: record.lastPrice || record.markPrice || 0,
          markPrice: record.markPrice || record.lastPrice || 0,
          change24h: record.priceChangePercent24h || 0
        };
      }
    }
    return result;
  }

  /**
   * 获取资金费率排行榜（利用 @markPrice 实时推送 + 24H 额度筛选）
   * 榜单规则保持不变：过滤 volume24h > m1，按结算周期升序排，同周期按绝对值降序排，取 Top 24
   */
  public getFundingRates(min24hVolume: number): any[] {
    let list: any[] = [];

    for (const [symbol, record] of this.symbolsMap.entries()) {
      const vol24h = this.getSymbol24hVolume(symbol);
      if (vol24h <= min24hVolume) continue;

      const intervalHours = record.fundingIntervalHours || 8;
      const ratePercent = record.fundingRate * 100;

      let nextFunding = record.nextFundingTime;
      if (!nextFunding || nextFunding <= Date.now()) {
        const cycleMs = intervalHours * 3600 * 1000;
        nextFunding = Math.floor(Date.now() / cycleMs) * cycleMs + cycleMs;
      }

      list.push({
        symbol,
        fundingRate: ratePercent,
        settlementCycle: `${intervalHours}h`,
        volume24h: vol24h,
        nextFundingTime: nextFunding,
        fetchedAt: Date.now()
      });
    }

    // 若当前因筛选门槛较高暂无结果，但内存中已有行情数据，降级展示全量数据中最活跃/有费率的币对
    if (list.length === 0 && this.symbolsMap.size > 0) {
      for (const [symbol, record] of this.symbolsMap.entries()) {
        const vol24h = this.getSymbol24hVolume(symbol);
        const intervalHours = record.fundingIntervalHours || 8;
        const ratePercent = record.fundingRate * 100;

        let nextFunding = record.nextFundingTime;
        if (!nextFunding || nextFunding <= Date.now()) {
          const cycleMs = intervalHours * 3600 * 1000;
          nextFunding = Math.floor(Date.now() / cycleMs) * cycleMs + cycleMs;
        }

        list.push({
          symbol,
          fundingRate: ratePercent,
          settlementCycle: `${intervalHours}h`,
          volume24h: vol24h,
          nextFundingTime: nextFunding,
          fetchedAt: Date.now()
        });
      }
    }

    list.sort((a, b) => {
      const cycleA = parseFloat(a.settlementCycle);
      const cycleB = parseFloat(b.settlementCycle);
      if (cycleA !== cycleB) {
        return cycleA - cycleB;
      }
      return Math.abs(b.fundingRate) - Math.abs(a.fundingRate);
    });

    return list.slice(0, 24);
  }

  /**
   * 本地利用 15m K 线计算 1小时放量指标 (前一小时 vs 当前一小时)
   */
  public getSymbol1hSpike(symbol: string): {
    ratio: number;
    currVolume: number;
    prevVolume: number;
    change1h: number;
  } | null {
    const record = this.symbolsMap.get(symbol);
    if (!record || record.candles15m.length === 0) return null;

    const ONE_HOUR_MS = 60 * 60 * 1000;
    const currentHourStart = Math.floor(Date.now() / ONE_HOUR_MS) * ONE_HOUR_MS;
    const prevHourStart = currentHourStart - ONE_HOUR_MS;

    const currHourCandles = record.candles15m.filter(c => c.openTime >= currentHourStart);
    let prevHourCandles = record.candles15m.filter(c => c.openTime >= prevHourStart && c.openTime < currentHourStart);

    // 容错：若刚好在前一小时的数据分段未严格落在精确时间戳内，取 currentHourStart 之前的最后 4 根 15m K线
    if (prevHourCandles.length === 0) {
      const priorCandles = record.candles15m.filter(c => c.openTime < currentHourStart);
      if (priorCandles.length > 0) {
        prevHourCandles = priorCandles.slice(-4);
      }
    }

    const currVol = currHourCandles.reduce((s, c) => s + c.quoteVolume, 0);
    const prevVol = prevHourCandles.reduce((s, c) => s + c.quoteVolume, 0);

    const open = currHourCandles.length > 0 
      ? currHourCandles[0].open 
      : (record.lastPrice || 0);
    const close = record.lastPrice || (currHourCandles.length > 0 ? currHourCandles[currHourCandles.length - 1].close : open);
    const change1h = open > 0 ? ((close - open) / open) * 100 : 0;
    const ratio = prevVol > 0 ? (currVol / prevVol) : (currVol > 0 ? 1 : 0);

    return {
      ratio: isFinite(ratio) ? ratio : 0,
      currVolume: currVol,
      prevVolume: prevVol,
      change1h: isFinite(change1h) ? change1h : 0
    };
  }

  /**
   * 获取数据引擎健康状态
   */
  public getEngineStatus() {
    let klineConnectedCount = 0;
    for (const ws of this.wsClients) {
      if (ws && ws.readyState === WebSocket.OPEN) klineConnectedCount++;
    }

    return {
      universeCount: this.contractUniverse.size,
      klineStreamsActive: klineConnectedCount > 0,
      klineConnectionsCount: klineConnectedCount,
      markPriceActive: this.markPriceWs?.readyState === WebSocket.OPEN,
      historySync: this.historySyncProgress
    };
  }

  public destroy() {
    this.isShuttingDown = true;

    if (this.miniTickerReconnectTimer) {
      clearTimeout(this.miniTickerReconnectTimer);
      this.miniTickerReconnectTimer = null;
    }
    if (this.markPriceReconnectTimer) {
      clearTimeout(this.markPriceReconnectTimer);
      this.markPriceReconnectTimer = null;
    }
    for (const [idx, timer] of this.klineReconnectTimers.entries()) {
      clearTimeout(timer);
    }
    this.klineReconnectTimers.clear();

    for (const ws of this.wsClients) {
      if (ws) {
        try {
          ws.removeAllListeners();
          ws.terminate();
        } catch (e) {}
      }
    }
    this.wsClients = [];
    this.klineWsSockets = [];

    if (this.markPriceWs) {
      const ws = this.markPriceWs;
      this.markPriceWs = null;
      try {
        ws.removeAllListeners();
        ws.terminate();
      } catch (e) {}
    }
    if (this.miniTickerWs) {
      const ws = this.miniTickerWs;
      this.miniTickerWs = null;
      try {
        ws.removeAllListeners();
        ws.terminate();
      } catch (e) {}
    }
  }
}
