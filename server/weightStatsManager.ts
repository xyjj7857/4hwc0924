/**
 * Binance API Weight & Rate Limit Statistics Manager (币安 API 权重与调用频次监控引擎)
 * 遵循币安合约/现货官方技术规约：
 * - IP 限额标准：2400 权重 / 分钟 (1-minute sliding window)
 * - 响应 Header：x-mbx-used-weight-1m (币安网关返回的当前 1 分钟已用权重)
 * - 逐条记录流水明细
 * - 形成平滑的曲线图数据
 * - 仅在启动时进行统计，未启动时零开销
 */

export interface ApiCallRecord {
  id: string;
  timestamp: number;
  timeStr: string;      // HH:mm:ss.SSS
  minuteKey: string;    // HH:mm
  method: string;       // GET, POST, DELETE, etc.
  endpoint: string;     // e.g. /fapi/v1/klines
  symbol?: string;      // e.g. BTCUSDT
  source: string;       // e.g. 行情数据引擎 / 4H监控 / 交易辅助 / 公共代理
  weight: number;       // 本次调用所占权重
  usedWeight1m: number; // 币安返回的当前1分钟累计权重(x-mbx-used-weight-1m)或估算值
  status: number;       // HTTP 状态码 (200, 429, etc.)
  durationMs: number;   // 耗时毫秒
  error?: string;
}

export interface MinuteStatPoint {
  minute: string;       // HH:mm
  timestamp: number;    // 当前分钟的起始时间戳
  requestCount: number; // 当前分钟请求调用次数
  usedWeight: number;   // 当前分钟最高权重或币安官方 header 返回的已用权重
  calcWeight: number;   // 当前分钟所有请求权重之和
  peakWeight: number;   // 当前分钟出现的峰值权重
  errorCount: number;   // 报错次数(如429/网络错误)
}

export interface WeightStatsStatus {
  isRunning: boolean;
  startTime: number | null;
  upTimeSeconds: number;
  limit1m: number;              // 币安官方硬限: 2400
  warningThreshold1m: number;   // 预警阈值: 1800
  currentMinute: {
    minute: string;
    requests: number;
    usedWeight: number;
    calcWeight: number;
  };
  peakWeightAllTime: number;    // 运行期间记录到的历史峰值权重
  totalRequests: number;        // 启动以来的累计请求次数
  totalWeight: number;          // 启动以来的累计估算权重
  minuteStats: MinuteStatPoint[]; // 分钟平滑曲线数据点(按时间正序)
  recentRecords: ApiCallRecord[]; // 逐条明细流水(倒序排列，最新的在前)
  endpointBreakdown: Record<string, { count: number; weight: number; lastCalled: number }>;
}

export function calculateBinanceWeight(endpoint: string, params: Record<string, any> = {}): number {
  const ep = (endpoint || '').toLowerCase();

  // 1. Ticker 24hr: 单币对为 1，全市场（无 symbol）为 40
  if (ep.includes('/ticker/24hr')) {
    return params.symbol ? 1 : 40;
  }
  // 2. Price Ticker: 单币对 1，全市场 2
  if (ep.includes('/ticker/price')) {
    return params.symbol ? 1 : 2;
  }
  // 3. Book Ticker: 单币对 1，全市场 5
  if (ep.includes('/ticker/bookticker')) {
    return params.symbol ? 1 : 5;
  }
  // 4. Klines: limit<=100: 1; limit<=500: 2; limit<=1000: 5; >1000: 10
  if (ep.includes('/klines')) {
    const limit = parseInt(params.limit || '500', 10);
    if (limit <= 100) return 1;
    if (limit <= 500) return 2;
    if (limit <= 1000) return 5;
    return 10;
  }
  // 5. Premium Index: 资金费率与指数价格，通常为 1
  if (ep.includes('/premiumindex')) {
    return 1;
  }
  // 6. Funding Info: 资金费率周期信息，为 1
  if (ep.includes('/fundinginfo')) {
    return 1;
  }
  // 7. Exchange Info: 交易对基础规则，为 1
  if (ep.includes('/exchangeinfo')) {
    return 1;
  }
  // 8. Open Orders: 单币对 1，全市场 40
  if (ep.includes('/openorders')) {
    return params.symbol ? 1 : 40;
  }
  // 9. All Orders: 历史挂单，为 5
  if (ep.includes('/allorders')) {
    return 5;
  }
  // 10. Account / Balance: 账户信息为 5
  if (ep.includes('/account') || ep.includes('/balance')) {
    return 5;
  }
  // 11. Position Risk: 单币对 1，全市场 5
  if (ep.includes('/positionrisk')) {
    return params.symbol ? 1 : 5;
  }
  // 12. User Trades: 历史成交为 5
  if (ep.includes('/usertrades')) {
    return 5;
  }
  // 13. Batch Orders: 批量下单为 5
  if (ep.includes('/batchorders')) {
    return 5;
  }
  // 14. Single Order (POST / DELETE): 挂单/撤单单次权重为 1
  if (ep.includes('/order')) {
    return 1;
  }
  // 15. ListenKey: 用户数据流维持为 1
  if (ep.includes('/listenkey')) {
    return 1;
  }
  // 16. Ping / Time: 系统探活为 1
  if (ep.includes('/ping') || ep.includes('/time')) {
    return 1;
  }

  // 默认兜底单次权重 1
  return 1;
}

class WeightStatsManager {
  private isRunning: boolean = false;
  private startTime: number | null = null;
  private limit1m: number = 2400; // 币安官方 IP 分钟限额
  private warningThreshold1m: number = 1800; // 预警线
  private currentMinuteKey: string = '';
  private currentMinutePoint: MinuteStatPoint | null = null;
  private minuteHistory: Map<string, MinuteStatPoint> = new Map();
  private recentRecords: ApiCallRecord[] = [];
  private endpointBreakdown: Map<string, { count: number; weight: number; lastCalled: number }> = new Map();
  private totalRequests: number = 0;
  private totalWeight: number = 0;
  private peakWeightAllTime: number = 0;
  private tickerInterval: NodeJS.Timeout | null = null;
  private lastKnownOfficialWeight: number = 0;

  constructor() {
    // 默认未启动状态，满足用户规约：“该模块启动时才统计，不启动时不统计”
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    if (!this.startTime) {
      this.startTime = Date.now();
    }
    
    // 初始化当前分钟
    this.ensureCurrentMinutePoint();

    // 启动分钟轮转检查定时器 (每 3 秒检查一次分钟滚动)
    if (!this.tickerInterval) {
      this.tickerInterval = setInterval(() => {
        if (!this.isRunning) return;
        this.ensureCurrentMinutePoint();
      }, 3000);
    }
    console.log(`[WeightStatsManager] 权重统计模块已启动，开始记录 API 调用频次与权重曲线`);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.tickerInterval) {
      clearInterval(this.tickerInterval);
      this.tickerInterval = null;
    }
    console.log(`[WeightStatsManager] 权重统计模块已停止，停止记录 API 调用与权重`);
  }

  public clear(): void {
    this.minuteHistory.clear();
    this.recentRecords = [];
    this.endpointBreakdown.clear();
    this.totalRequests = 0;
    this.totalWeight = 0;
    this.peakWeightAllTime = 0;
    this.lastKnownOfficialWeight = 0;
    this.currentMinutePoint = null;
    this.currentMinuteKey = '';
    if (this.isRunning) {
      this.startTime = Date.now();
      this.ensureCurrentMinutePoint();
    } else {
      this.startTime = null;
    }
    console.log(`[WeightStatsManager] 权重统计历史数据已清空`);
  }

  private getMinuteKey(timestamp: number): string {
    const d = new Date(timestamp);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  private getMinuteStartTimestamp(timestamp: number): number {
    const d = new Date(timestamp);
    d.setSeconds(0, 0);
    return d.getTime();
  }

  private ensureCurrentMinutePoint(): MinuteStatPoint {
    const now = Date.now();
    const key = this.getMinuteKey(now);
    
    if (key !== this.currentMinuteKey || !this.currentMinutePoint) {
      // 切换分钟
      this.currentMinuteKey = key;
      const startMs = this.getMinuteStartTimestamp(now);

      if (!this.minuteHistory.has(key)) {
        // 如果存在之前的分钟记录，平滑填充中间缺失的分钟点
        if (this.currentMinutePoint && this.currentMinutePoint.timestamp < startMs - 60000) {
          let fillTime = this.currentMinutePoint.timestamp + 60000;
          while (fillTime < startMs) {
            const fillKey = this.getMinuteKey(fillTime);
            if (!this.minuteHistory.has(fillKey)) {
              this.minuteHistory.set(fillKey, {
                minute: fillKey,
                timestamp: fillTime,
                requestCount: 0,
                usedWeight: 0,
                calcWeight: 0,
                peakWeight: 0,
                errorCount: 0
              });
            }
            fillTime += 60000;
          }
        }

        const newPoint: MinuteStatPoint = {
          minute: key,
          timestamp: startMs,
          requestCount: 0,
          usedWeight: 0,
          calcWeight: 0,
          peakWeight: 0,
          errorCount: 0
        };
        this.minuteHistory.set(key, newPoint);
        this.currentMinutePoint = newPoint;

        // 仅保留最近 120 个分钟数据点
        while (this.minuteHistory.size > 120) {
          const firstKey = this.minuteHistory.keys().next().value;
          if (firstKey) this.minuteHistory.delete(firstKey);
          else break;
        }
      } else {
        this.currentMinutePoint = this.minuteHistory.get(key)!;
      }
    }

    return this.currentMinutePoint;
  }

  /**
   * 记录单次 API 调用
   * 如果模块未启动，直接返回，零性能损耗
   */
  public recordApiCall(params: {
    endpoint: string;
    method?: string;
    queryParams?: Record<string, any>;
    status?: number;
    durationMs?: number;
    source?: string;
    headers?: any; // Headers or Record<string, string>
    error?: string;
  }): void {
    if (!this.isRunning) return;

    const now = Date.now();
    const minutePoint = this.ensureCurrentMinutePoint();

    const method = (params.method || 'GET').toUpperCase();
    const endpoint = params.endpoint.startsWith('/') ? params.endpoint : `/${params.endpoint}`;
    const queryParams = params.queryParams || {};
    const symbol = queryParams.symbol || '';
    const status = params.status || 200;
    const durationMs = params.durationMs || 0;
    const source = params.source || '行情数据引擎';

    // 1. 计算单次 API 规范权重
    const singleWeight = calculateBinanceWeight(endpoint, queryParams);

    // 2. 读取币安官方 Header (x-mbx-used-weight-1m)
    let headerWeight: number | null = null;
    if (params.headers) {
      try {
        let val: string | null = null;
        if (typeof params.headers.get === 'function') {
          val = params.headers.get('x-mbx-used-weight-1m');
        } else if (typeof params.headers === 'object') {
          val = params.headers['x-mbx-used-weight-1m'] || params.headers['X-MBX-USED-WEIGHT-1M'];
        }
        if (val) {
          const parsed = parseInt(val, 10);
          if (!isNaN(parsed) && parsed >= 0) {
            headerWeight = parsed;
            this.lastKnownOfficialWeight = parsed;
          }
        }
      } catch {
        // ignore header parse error
      }
    }

    // 本次展示的 1m 累计权重
    const effectiveUsedWeight = headerWeight !== null ? headerWeight : (minutePoint.calcWeight + singleWeight);

    // 3. 更新当前分钟统计数据
    minutePoint.requestCount += 1;
    minutePoint.calcWeight += singleWeight;
    minutePoint.usedWeight = effectiveUsedWeight;
    minutePoint.peakWeight = Math.max(minutePoint.peakWeight, effectiveUsedWeight);
    if (status >= 400) {
      minutePoint.errorCount += 1;
    }

    // 4. 更新全局累计统计
    this.totalRequests += 1;
    this.totalWeight += singleWeight;
    this.peakWeightAllTime = Math.max(this.peakWeightAllTime, effectiveUsedWeight);

    // 5. 格式化精确时间字符串 HH:mm:ss.SSS
    const dateObj = new Date(now);
    const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}:${String(dateObj.getSeconds()).padStart(2, '0')}.${String(dateObj.getMilliseconds()).padStart(3, '0')}`;

    // 6. 生成逐条流水记录
    const record: ApiCallRecord = {
      id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now,
      timeStr,
      minuteKey: minutePoint.minute,
      method,
      endpoint,
      symbol: symbol ? String(symbol) : undefined,
      source,
      weight: singleWeight,
      usedWeight1m: effectiveUsedWeight,
      status,
      durationMs: Math.round(durationMs),
      error: params.error
    };

    // 保留最近 300 条逐条记录 (最新的在前)
    this.recentRecords.unshift(record);
    if (this.recentRecords.length > 300) {
      this.recentRecords.pop();
    }

    // 7. 更新接口分类细分统计
    const cleanEndpoint = endpoint.split('?')[0];
    const prevEp = this.endpointBreakdown.get(cleanEndpoint) || { count: 0, weight: 0, lastCalled: 0 };
    prevEp.count += 1;
    prevEp.weight += singleWeight;
    prevEp.lastCalled = now;
    this.endpointBreakdown.set(cleanEndpoint, prevEp);
  }

  /**
   * 获取当前统计状态快照
   */
  public getStatus(): WeightStatsStatus {
    const now = Date.now();
    const upTimeSeconds = this.startTime && this.isRunning 
      ? Math.floor((now - this.startTime) / 1000) 
      : 0;

    const minutePoint = this.isRunning ? this.ensureCurrentMinutePoint() : null;

    // 分钟历史按时间戳排序
    const minuteStats = Array.from(this.minuteHistory.values()).sort((a, b) => a.timestamp - b.timestamp);

    // 转换为普通对象格式的 endpointBreakdown
    const endpointBreakdown: Record<string, { count: number; weight: number; lastCalled: number }> = {};
    this.endpointBreakdown.forEach((val, key) => {
      endpointBreakdown[key] = { ...val };
    });

    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      upTimeSeconds,
      limit1m: this.limit1m,
      warningThreshold1m: this.warningThreshold1m,
      currentMinute: {
        minute: minutePoint?.minute || '--:--',
        requests: minutePoint?.requestCount || 0,
        usedWeight: minutePoint?.usedWeight || 0,
        calcWeight: minutePoint?.calcWeight || 0
      },
      peakWeightAllTime: this.peakWeightAllTime,
      totalRequests: this.totalRequests,
      totalWeight: this.totalWeight,
      minuteStats,
      recentRecords: [...this.recentRecords],
      endpointBreakdown
    };
  }
}

export const weightStatsManager = new WeightStatsManager();
