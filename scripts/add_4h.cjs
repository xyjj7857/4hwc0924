const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');

// Modify fetchKlines
code = code.replace(
  "const fetchKlines = async (symbol: string) => {",
  "const fetchKlines = async (symbol: string, interval: string = '15m') => {"
);
code = code.replace(
  "interval: '15m'",
  "interval"
);

const index = code.indexOf('async function startServer()');
const beforeStart = code.slice(0, index);
const afterStart = code.slice(index);

let logic4h = `
let isRunning4h = false;
let config4h: MonitoringConfig = { ...DEFAULT_CONFIG };
let cache14h: string[] = [];
let scanResults4h: any = null;
let scanStats4h: any = null;
let phase1Countdown4h = "00:00";
let phase2Countdown4h = "00:00";
let lastPhase1Trigger4h = -1;
let lastPhase2Trigger4h = -1;
let isScanningPhase14h = false;
let isScanningPhase24h = false;
let monitorLogs4h: MonitorLog[] = [];

try {
  const runRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("monitoring_running_4h") as any;
  if (runRow) {
    isRunning4h = JSON.parse(runRow.value);
  }
} catch (e) {
  console.error("Failed to load monitoring_running_4h status:", e);
}
try {
  const configRow = db.prepare("SELECT value FROM settings WHERE key = ?").get("monitoring_config_4h") as any;
  if (configRow) {
    config4h = { ...DEFAULT_CONFIG, ...JSON.parse(configRow.value) };
  }
} catch (e) {}

const addMonitorLog4h = (message: string, type: 'INFO' | 'SUCCESS' | 'ERROR' | 'TRADE' | 'WARNING' = 'INFO') => {
  const newLog: MonitorLog = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    timestamp: Date.now(),
    message,
    type,
    category: 'MONITOR'
  };
  monitorLogs4h.unshift(newLog);
  if (monitorLogs4h.length > 200) monitorLogs4h = monitorLogs4h.slice(0, 200);
};

const runPhase1Backend4h = async () => {
  if (isScanningPhase14h) return;
  isScanningPhase14h = true;
  addMonitorLog4h('[爆仓监控4h] 阶段一：启动全市场扫描筛选中...', 'INFO');
  try {
    const tickers = await fetchAllTickers();
    if (tickers.length === 0) {
      isScanningPhase14h = false;
      return;
    }
    const filteredBy24h = tickers.filter((t: any) => parseFloat(t.quoteVolume) > config4h.m);
    
    let passed4hCount = 0;
    const results: string[] = [];
    for (let i = 0; i < filteredBy24h.length; i += 10) {
      const batch = filteredBy24h.slice(i, i + 10);
      await Promise.all(batch.map(async (t: any) => {
        try {
          const kline = await fetchKlines(t.symbol, '4h');
          if (kline && kline.volume > config4h.n) {
            results.push(t.symbol);
            passed4hCount++;
          }
        } catch (e) {
        }
      }));
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    
    scanStats4h = {
      lastScanTime: new Date().toLocaleTimeString(),
      totalTickers: tickers.length,
      passed24h: filteredBy24h.length,
      passed15m: passed4hCount 
    };
    cache14h = results;
    addMonitorLog4h(\`[扫描监控4h] 阶段一全市场扫描完成，共有 \${results.length} 组交易对通过 4h/24h 额度阈值存入缓存。\`, 'SUCCESS');
    
    setTimeout(() => {
      cache14h = [];
      addMonitorLog4h('[扫描监控4h] 阶段一临时缓存已超时清空，等待下一轮循环扫描...', 'INFO');
    }, 5 * 60 * 1000);
  } catch (error: any) {
    addMonitorLog4h('[扫描监控4h] 阶段一扫描失败: ' + String(error.message || error), 'ERROR');
  } finally {
    isScanningPhase14h = false;
  }
};

const runPhase2Backend4h = async () => {
  if (isScanningPhase24h) return;
  isScanningPhase24h = true;
  addMonitorLog4h('[扫描监控4h] 阶段二：对缓存池币种进行二次量化过滤...', 'INFO');
  
  if (cache14h.length === 0) {
    addMonitorLog4h('[扫描监控4h] 检测到当前缓存池为空，正在自动执行阶段一全市场扫描以填充缓存...', 'INFO');
    await runPhase1Backend4h();
  }
  if (cache14h.length === 0) {
    addMonitorLog4h('[扫描监控4h] 阶段一扫描完成后缓存池仍为空（未发现满足当前阈值的交易对），跳过本次二次过滤。请根据市场行情调整阶段一或二的阈值。', 'INFO');
    isScanningPhase24h = false;
    return;
  }
  try {
    const tickers = await fetchAllTickers();
    const tickerMap = new Map<string, any>(tickers.map((t: any) => [t.symbol, t]));
    const finalResults: any[] = [];
    for (let i = 0; i < cache14h.length; i += 10) {
      const batch = cache14h.slice(i, i + 10);
      await Promise.all(batch.map(async (symbol) => {
        const ticker = tickerMap.get(symbol);
        if (!ticker || parseFloat(ticker.quoteVolume) <= config4h.m1) return;
        
        const kline = await fetchKlines(symbol, '4h');
        if (kline && kline.volume > config4h.n1) {
          const change = ((kline.close - kline.open) / kline.open) * 100;
          const amplitude = ((kline.high - kline.low) / kline.low) * 100;
          finalResults.push({
            symbol,
            volume24h: parseFloat(ticker.quoteVolume),
            volume15m: kline.volume, 
            openPrice: kline.open,
            lastPrice: kline.close,
            change,
            change24h: parseFloat(ticker.priceChangePercent),
            amplitude
          });
        }
      }));
    }

    const gainers = [...finalResults].sort((a, b) => b.change - a.change).slice(0, 5);
    const losers = [...finalResults].sort((a, b) => a.change - b.change).slice(0, 5);
    const amplitude15m = [...finalResults].sort((a, b) => (b.amplitude || 0) - (a.amplitude || 0)).slice(0, 5); 

    const allQualified24h = tickers
      .filter((t: any) => parseFloat(t.quoteVolume) > config4h.m1)
      .map((t: any) => ({
        symbol: t.symbol,
        volume24h: parseFloat(t.quoteVolume),
        volume15m: 0,
        openPrice: 0,
        lastPrice: parseFloat(t.lastPrice),
        change: 0,
        change24h: parseFloat(t.priceChangePercent)
      }));

    const gainers24h = [...allQualified24h].sort((a, b) => b.change24h - a.change24h).slice(0, 5);
    const losers24h = [...allQualified24h].sort((a, b) => a.change24h - b.change24h).slice(0, 5);

    scanResults4h = {
      gainers,
      losers,
      amplitude15m,
      gainers24h,
      losers24h,
      timestamp: Date.now()
    };
    addMonitorLog4h(\`[扫描监控4h] 阶段二二次量化过滤完成，已重新载入 4h 涨跌板块和 24h 数据。\`, 'SUCCESS');

    // Check for alerts
    const now = Date.now();
    const maxGain = gainers.length > 0 ? gainers[0].change : 0;
    const maxLoss = losers.length > 0 ? Math.abs(losers[0].change) : 0;
    const maxAmplitude = amplitude15m.length > 0 ? (amplitude15m[0].amplitude || 0) : 0;

    if (maxGain >= config4h.upThreshold) {
      addMonitorLog4h(\`【价格报警4h】 触发4h涨幅报警点位！当前最高涨幅: +\${maxGain.toFixed(2)}%\`, 'SUCCESS');
      try {
        const stmt = db.prepare(\`
          INSERT INTO alert_logs (trigger_time, symbol, board_name, change_val, volume_15m)
          VALUES (?, ?, ?, ?, ?)
        \`);
        for (const item of gainers) {
          if (item.change >= config4h.upThreshold) {
            stmt.run(now, item.symbol, "4小时涨幅榜", "+" + item.change.toFixed(2) + "%", item.volume15m);
          }
        }
      } catch (e: any) {}
    }

    if (maxLoss >= config4h.downThreshold) {
      addMonitorLog4h(\`【价格报警4h】 触发4h跌幅报警点位！当前最高跌幅: -\${maxLoss.toFixed(2)}%\`, 'SUCCESS');
      try {
        const stmt = db.prepare(\`
          INSERT INTO alert_logs (trigger_time, symbol, board_name, change_val, volume_15m)
          VALUES (?, ?, ?, ?, ?)
        \`);
        for (const item of losers) {
          if (Math.abs(item.change) >= config4h.downThreshold) {
            stmt.run(now, item.symbol, "4小时跌幅榜", (item.change >= 0 ? "+" : "") + item.change.toFixed(2) + "%", item.volume15m);
          }
        }
      } catch (e: any) {}
    }

    if (maxAmplitude >= config4h.amplitudeThreshold) {
      addMonitorLog4h(\`【价格报警4h】 触发4h振幅报警点位！当前最高振幅: \${maxAmplitude.toFixed(2)}%\`, 'SUCCESS');
      try {
        const stmt = db.prepare(\`
          INSERT INTO alert_logs (trigger_time, symbol, board_name, change_val, volume_15m)
          VALUES (?, ?, ?, ?, ?)
        \`);
        for (const item of amplitude15m) {
          if (item.amplitude >= config4h.amplitudeThreshold) {
            stmt.run(now, item.symbol, "4小时振幅榜", item.amplitude.toFixed(2) + "%", item.volume15m);
          }
        }
      } catch (e: any) {}
    }

  } catch (error: any) {
    addMonitorLog4h('[扫描监控4h] 阶段二二次过滤失败: ' + String(error.message || error), 'ERROR');
  } finally {
    isScanningPhase24h = false;
  }
};

function runBackgroundMonitor4h() {
  const CYCLE_MS = 4 * 60 * 60 * 1000;
  
  setInterval(async () => {
    const now = new Date();
    if (!isRunning4h) return;

    // Time elapsed within current 4h block
    const msInCycle = now.getTime() % CYCLE_MS;
    const totalSecondsInCycle = Math.floor(msInCycle / 1000);
    const currentCycleStart = Math.floor(now.getTime() / CYCLE_MS) * CYCLE_MS;

    const xCountdownSeconds = config4h.xMin * 60 + config4h.xSec;
    const xTargetSeconds = 14400 - xCountdownSeconds;
    
    if (totalSecondsInCycle >= xTargetSeconds && lastPhase1Trigger4h !== currentCycleStart) {
      lastPhase1Trigger4h = currentCycleStart;
      runPhase1Backend4h();
    }

    const yCountdownSeconds = config4h.yMin * 60 + config4h.ySec;
    const yTargetSeconds = 14400 - yCountdownSeconds;
    
    if (totalSecondsInCycle >= yTargetSeconds && lastPhase2Trigger4h !== currentCycleStart) {
      lastPhase2Trigger4h = currentCycleStart;
      runPhase2Backend4h();
    }

    const updateCountdown = (targetSec: number) => {
      let diff = targetSec - totalSecondsInCycle;
      if (diff < 0) diff += 4 * 60 * 60;
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      if (h > 0) {
        return \`\${h.toString().padStart(2, '0')}:\${m.toString().padStart(2, '0')}:\${s.toString().padStart(2, '0')}\`;
      }
      return \`\${m.toString().padStart(2, '0')}:\${s.toString().padStart(2, '0')}\`;
    };

    phase1Countdown4h = updateCountdown(xTargetSeconds);
    phase2Countdown4h = updateCountdown(yTargetSeconds);

  }, 1000);
}
runBackgroundMonitor4h();

`;

let apiRoutes4h = `
  app.get("/api/monitoring-4h/status", (req, res) => {
    res.json({
      isRunning: isRunning4h,
      config: config4h,
      scanStats: scanStats4h,
      results: scanResults4h,
      fundingRates: fundingRates, 
      phase1Countdown: phase1Countdown4h,
      phase2Countdown: phase2Countdown4h,
      cache1: cache14h
    });
  });

  app.post("/api/monitoring-4h/toggle", (req, res) => {
    isRunning4h = req.body.isRunning;
    try {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
        "monitoring_running_4h",
        JSON.stringify(isRunning4h)
      );
    } catch (e) {}
    addMonitorLog4h(isRunning4h ? "【系统】用户启动了监控引擎4h" : "【系统】用户停止了监控引擎4h", isRunning4h ? "SUCCESS" : "WARNING");
    res.json({ success: true, isRunning: isRunning4h });
  });

  app.post("/api/monitoring-4h/config", (req, res) => {
    config4h = { ...config4h, ...req.body };
    try {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
        "monitoring_config_4h",
        JSON.stringify(config4h)
      );
    } catch (e) {}
    res.json({ success: true });
  });

  app.get("/api/monitoring-4h/logs", (req, res) => {
    res.json(monitorLogs4h);
  });

  app.post("/api/monitoring-4h/logs/clear", (req, res) => {
    monitorLogs4h = [];
    res.json({ success: true });
  });

  app.post("/api/monitoring-4h/scan-phase1", async (req, res) => {
    runPhase1Backend4h();
    res.json({ success: true, message: "Phase 1 scan 4h triggered" });
  });

  app.post("/api/monitoring-4h/scan-phase2", async (req, res) => {
    runPhase2Backend4h();
    res.json({ success: true, message: "Phase 2 scan 4h triggered" });
  });
  
  app.post("/api/monitoring-4h/funding/refresh", async (req, res) => {
    fetchFundingRatesBackend();
    res.json({ success: true, message: "Funding fetch triggered" });
  });
`;

let finalCode = beforeStart + logic4h + "\nasync function startServer() {\n" + afterStart.split("async function startServer() {\n")[1];
const appListenIndex = finalCode.lastIndexOf('app.listen(');
const finalCodeWithRoutes = finalCode.slice(0, appListenIndex) + apiRoutes4h + "\n  " + finalCode.slice(appListenIndex);

fs.writeFileSync('server.ts', finalCodeWithRoutes);
console.log("Successfully modified server.ts");
