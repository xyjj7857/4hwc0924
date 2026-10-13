import { Position, OpenOrder } from '../types';

export interface StageCloseRule {
  id: string; // 'stage_1' | 'stage_2' | 'stage_3'
  enabled: boolean;
  targetN: number;      // 当 N = 几时 (默认: 第1组 N=2 开启, 第2组 N=3 关闭, 第3组 N=30 开启且平仓100%)
  closeRatio: number;   // 平仓现有仓位的百分之多少 (默认 50%)
  executed?: boolean;   // 是否已执行
  executedAt?: number;  // 执行时间戳
  executedAmount?: number; // 当次执行平仓数量
}

export interface TrailingStopRule {
  enabled: boolean;
  minN: number;             // 当 N >= 几时 (默认 3)
  drawdownRatio: number;    // 回撤比例 (默认 80%)
  lastAdjustedN?: number;   // 上一次调整生效时的 N 值
  currentAlgoId?: string;   // 当前动态维护的 algoId
  currentStopPrice?: number;// 当前动态挂单止损价
}

export interface ConditionControlConfig {
  enabled: boolean;
  ruleType: string;
  description?: string;
  // 1、N值阶梯平仓设置 (3组独立配置)
  stageCloseRules: StageCloseRule[];
  // 2、N值动态移动回撤止损调整
  trailingStopRule: TrailingStopRule;
}

export interface PositionRiskConfig {
  positionId: string;
  symbol: string;
  side: 'BUY' | 'SELL';

  // a，时间风控：为当前持仓单设置一个最大持仓时间（单位：分钟，支持小数），默认初始值：240。这一条件在用户设置完成、关闭子界面的时刻开始生效
  timeControl: {
    enabled: boolean;
    maxHoldMinutes: number; // 默认 240
    activatedAt?: number;   // 关闭子界面时刻的时间戳 (Date.now())
  };

  // b，止盈/止损：支持按具体价格或者按（开仓价的）比例设置止盈/止损；止盈和止损独立勾选生效；当用户设置好参数后，点击“提交”即通过api向币安提交止盈委托单或算法止损单；当需要修改止盈止损的时候，支持在重新提交新的止盈止损的时候自动撤销原来的止盈/止损并替换；
  tpSlControl: {
    // 止盈
    tpEnabled: boolean;
    tpMode: 'PERCENT' | 'PRICE';
    tpPercent: number; // 止盈比例 (%)
    tpPrice: number;   // 止盈价格

    // 止损
    slEnabled: boolean;
    slMode: 'PERCENT' | 'PRICE';
    slPercent: number; // 止损比例 (%)
    slPrice: number;   // 止损价格

    // 追踪记录最后提交状态
    lastSubmittedTime?: number;
    submittedOrders?: {
      tpOrderId?: string;
      slOrderId?: string;
      slAlgoId?: string;
    };
  };

  // c，条件风控：1、N值阶梯平仓（3组独立勾选）；2、N值动态移动回撤止损调整
  conditionControl: ConditionControlConfig;

  // d，超时未达预期倍数平仓：该仓单自下单开始后满多少个小时，若币价未超过开仓价的多少倍则自动平仓。默认开启：24小时，1.5倍
  timeoutPriceControl: TimeoutPriceControlConfig;
}

export interface TimeoutPriceControlConfig {
  enabled: boolean;        // 默认开启 (true)
  timeoutHours: number;    // 默认 24 小时
  priceMultiplier: number; // 默认 1.5 倍
  activatedAt?: number;   // 下单开始/激活时间戳
}

export interface PositionTpSlResult {
  hasTp: boolean;
  hasSl: boolean;
  tpOrder?: OpenOrder;
  slOrder?: OpenOrder;
  tpPrice?: number;
  slPrice?: number;
}

/**
 * 精准检测该币对是否有对应的止盈单或止损单
 * 1. 对应止盈单：挂单为平仓方向，类型为 TAKE_PROFIT、TAKE_PROFIT_MARKET、优于开仓价的限价卖/买单，或风控配置已勾选生效
 * 2. 对应止损单：挂单为平仓方向，类型为 STOP_MARKET、STOP、算法条件止损单、带有劣于开仓价触发价的条件单，或风控配置已勾选生效
 */
export function detectPositionTpSl(
  position: Position,
  openOrders: OpenOrder[] = [],
  config?: PositionRiskConfig
): PositionTpSlResult {
  const isLong = position.side === 'BUY';
  const closingSide = isLong ? 'SELL' : 'BUY';
  const posSide = position.positionSide || 'BOTH';

  // 筛选该币对属于当前平仓方向的挂单
  const symbolOrders = openOrders.filter(o => {
    if (!o.symbol || o.symbol.toUpperCase() !== position.symbol.toUpperCase()) return false;
    // 双向持仓模式下严格匹配持仓方向
    if (posSide !== 'BOTH' && o.positionSide && o.positionSide !== 'BOTH') {
      if (o.positionSide.toUpperCase() !== posSide.toUpperCase()) return false;
    }
    // 必须是平仓方向 (多单平仓为 SELL，空单平仓为 BUY)
    if (o.side && o.side.toUpperCase() !== closingSide) return false;
    return true;
  });

  let foundTpOrder: OpenOrder | undefined = undefined;
  let foundSlOrder: OpenOrder | undefined = undefined;

  for (const order of symbolOrders) {
    const oType = (order.type || '').toUpperCase();
    const price = Number(order.price) || 0;
    const stopPrice = Number(order.stopPrice) || 0;

    // 1. 判断止盈挂单
    const isExplicitTp = oType.includes('TAKE_PROFIT');
    const isRecordedTp = Boolean(
      config?.tpSlControl?.submittedOrders?.tpOrderId && 
      order.id === config.tpSlControl.submittedOrders.tpOrderId
    );
    // 普通限价挂单：做多平仓卖出价高于开仓价，或做空平仓买入价低于开仓价，视为止盈单
    const isLimitTp = !order.isAlgo && oType === 'LIMIT' && (
      isLong ? (price > position.entryPrice) : (price < position.entryPrice)
    );

    if (isExplicitTp || isRecordedTp || isLimitTp) {
      if (!foundTpOrder) {
        foundTpOrder = order;
      }
    }

    // 2. 判断止损挂单
    const isExplicitSl = oType.includes('STOP') || oType.includes('CONDITIONAL');
    const isRecordedSl = Boolean(
      (config?.tpSlControl?.submittedOrders?.slAlgoId && order.id === config.tpSlControl.submittedOrders.slAlgoId) ||
      (config?.tpSlControl?.submittedOrders?.slOrderId && order.id === config.tpSlControl.submittedOrders.slOrderId)
    );
    // 币安算法委托单（STOP_MARKET/CONDITIONAL）统一视为止损单
    const isAlgoSl = order.isAlgo && (stopPrice > 0 || isExplicitSl);
    // 带触发价且符合止损方向的条件挂单
    const isTriggerSl = stopPrice > 0 && (
      isLong ? (stopPrice <= position.entryPrice * 1.01) : (stopPrice >= position.entryPrice * 0.99)
    );

    if (isExplicitSl || isRecordedSl || isAlgoSl || isTriggerSl) {
      if (!foundSlOrder) {
        foundSlOrder = order;
      }
    }
  }

  // 严格以当前实际挂单委托列表（openOrders）为准：只有对应平仓委托真实存在时才判定为有效，一旦撤单立即置为 false
  const hasTp = Boolean(foundTpOrder);
  const hasSl = Boolean(foundSlOrder);

  // 提取对应止盈价
  let tpPrice: number | undefined = undefined;
  if (foundTpOrder) {
    tpPrice = (foundTpOrder.price > 0 ? foundTpOrder.price : foundTpOrder.stopPrice) || undefined;
  }

  // 提取对应止损价
  let slPrice: number | undefined = undefined;
  if (foundSlOrder) {
    slPrice = (foundSlOrder.stopPrice && foundSlOrder.stopPrice > 0 ? foundSlOrder.stopPrice : foundSlOrder.price) || undefined;
  }

  return {
    hasTp,
    hasSl,
    tpOrder: foundTpOrder,
    slOrder: foundSlOrder,
    tpPrice,
    slPrice
  };
}

export type RiskButtonDisplay = '止盈 / 止损' | '止盈' | '止损' | '条件风控' | '时间风控' | '死斗';

/**
 * 永续合约持仓表对应的风控列展示规则：
 * 1. 优先展示止盈与止损：
 *    - 若同时存在止盈单与止损单，则展示“止盈 / 止损”
 *    - 若仅有止盈单，则展示“止盈”
 *    - 若仅有止损单，则展示“止损”
 * 2. 若两者均无，保持其他核心逻辑不变：
 *    - “条件风控” ＞ “时间风控” ＞ “死斗” (默认展示“死斗”)
 */
export function getRiskButtonDisplay(
  config?: PositionRiskConfig,
  openOrders: OpenOrder[] = [],
  position?: Position
): RiskButtonDisplay {
  if (position) {
    const { hasTp, hasSl } = detectPositionTpSl(position, openOrders, config);
    if (hasTp && hasSl) return '止盈 / 止损';
    if (hasTp) return '止盈';
    if (hasSl) return '止损';
  } else if (config?.tpSlControl) {
    const hasTp = Boolean(config.tpSlControl.tpEnabled);
    const hasSl = Boolean(config.tpSlControl.slEnabled);
    if (hasTp && hasSl) return '止盈 / 止损';
    if (hasTp) return '止盈';
    if (hasSl) return '止损';
  }

  // 优先级: 条件风控
  if (config?.conditionControl && config.conditionControl.enabled) {
    return '条件风控';
  }

  // 优先级: 时间风控
  if (config?.timeControl && config.timeControl.enabled) {
    return '时间风控';
  }

  // 默认: 死斗
  return '死斗';
}

const STORAGE_KEY = 'binance_position_risk_configs_v1';

export function getLocalPositionRiskConfigs(accountName?: string): Record<string, PositionRiskConfig> {
  try {
    const accKey = accountName ? `binance_position_risk_configs_v1_${accountName}` : STORAGE_KEY;
    const raw = localStorage.getItem(accKey);
    let parsed: Record<string, PositionRiskConfig> = {};
    if (raw) {
      parsed = JSON.parse(raw);
    } else {
      // Check all-accounts map if exists
      const allRaw = localStorage.getItem('binance_all_accounts_position_risk_configs');
      if (allRaw) {
        const all = JSON.parse(allRaw);
        if (accountName && all[accountName]) {
          parsed = all[accountName];
        }
      }
      // Fallback to legacy key if accountName matches or not provided
      if (!parsed && !accountName) {
        const legacyRaw = localStorage.getItem(STORAGE_KEY);
        if (legacyRaw) parsed = JSON.parse(legacyRaw);
      }
    }
    const normalized: Record<string, PositionRiskConfig> = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      if (v && typeof v === 'object') {
        normalized[k] = normalizePositionRiskConfig(v);
      }
    }
    return normalized;
  } catch (err) {
    console.error('Failed to load local position risk configs:', err);
    return {};
  }
}

export function saveLocalPositionRiskConfigs(configs: Record<string, PositionRiskConfig>, accountName?: string): void {
  try {
    const accKey = accountName ? `binance_position_risk_configs_v1_${accountName}` : STORAGE_KEY;
    localStorage.setItem(accKey, JSON.stringify(configs));

    // Also update all-accounts map in localStorage
    if (accountName) {
      let all: Record<string, Record<string, PositionRiskConfig>> = {};
      try {
        const allRaw = localStorage.getItem('binance_all_accounts_position_risk_configs');
        if (allRaw) all = JSON.parse(allRaw);
      } catch {}
      all[accountName] = configs;
      localStorage.setItem('binance_all_accounts_position_risk_configs', JSON.stringify(all));
    }
  } catch (err) {
    console.error('Failed to save local position risk configs:', err);
  }
}

export function getAllLocalPositionRiskConfigs(): Record<string, Record<string, PositionRiskConfig>> {
  try {
    const raw = localStorage.getItem('binance_all_accounts_position_risk_configs');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

export function saveAllLocalPositionRiskConfigs(allConfigs: Record<string, Record<string, PositionRiskConfig>>): void {
  try {
    localStorage.setItem('binance_all_accounts_position_risk_configs', JSON.stringify(allConfigs));
    for (const [acc, cfgs] of Object.entries(allConfigs)) {
      if (acc) {
        localStorage.setItem(`binance_position_risk_configs_v1_${acc}`, JSON.stringify(cfgs));
      }
    }
  } catch (err) {
    console.error('Failed to save all local position risk configs:', err);
  }
}

export function getDefaultConditionControlConfig(): ConditionControlConfig {
  return {
    enabled: true, // 专属持仓风控管理中 条件c默认勾选
    ruleType: 'DYNAMIC_N_STAGE_AND_TRAILING',
    description: 'N值阶梯平仓与动态回撤移动止损',
    stageCloseRules: [
      { id: 'stage_1', enabled: true, targetN: 2, closeRatio: 50 },
      { id: 'stage_2', enabled: false, targetN: 3, closeRatio: 50 },
      { id: 'stage_3', enabled: true, targetN: 30, closeRatio: 100 }
    ],
    trailingStopRule: {
      enabled: true, // 默认勾选
      minN: 3,       // 默认 N>=3
      drawdownRatio: 80 // 默认回撤比例 80%
    }
  };
}

export function normalizeConditionControl(cc?: Partial<ConditionControlConfig>): ConditionControlConfig {
  const defaults = getDefaultConditionControlConfig();
  if (!cc) return defaults;
  return {
    enabled: cc.enabled !== undefined ? cc.enabled : true, // 默认勾选
    ruleType: cc.ruleType || defaults.ruleType,
    description: cc.description || defaults.description,
    stageCloseRules: Array.isArray(cc.stageCloseRules) && cc.stageCloseRules.length === 3
      ? cc.stageCloseRules.map((s, idx) => ({
          id: s.id || `stage_${idx + 1}`,
          enabled: s.enabled !== undefined ? s.enabled : defaults.stageCloseRules[idx].enabled,
          targetN: Number(s.targetN) > 0 ? Number(s.targetN) : defaults.stageCloseRules[idx].targetN,
          closeRatio: Number(s.closeRatio) > 0 ? Number(s.closeRatio) : defaults.stageCloseRules[idx].closeRatio,
          executed: Boolean(s.executed),
          executedAt: s.executedAt,
          executedAmount: s.executedAmount
        }))
      : defaults.stageCloseRules,
    trailingStopRule: {
      enabled: cc.trailingStopRule?.enabled !== undefined ? cc.trailingStopRule.enabled : true,
      minN: Number(cc.trailingStopRule?.minN) > 0 ? Number(cc.trailingStopRule.minN) : 3,
      drawdownRatio: Number(cc.trailingStopRule?.drawdownRatio) > 0 ? Number(cc.trailingStopRule.drawdownRatio) : 80,
      lastAdjustedN: cc.trailingStopRule?.lastAdjustedN,
      currentAlgoId: cc.trailingStopRule?.currentAlgoId,
      currentStopPrice: cc.trailingStopRule?.currentStopPrice
    }
  };
}

export function normalizePositionRiskConfig(cfg: PositionRiskConfig): PositionRiskConfig {
  const tpc = (cfg as any)?.timeoutPriceControl;
  return {
    ...cfg,
    conditionControl: normalizeConditionControl(cfg.conditionControl),
    timeoutPriceControl: {
      enabled: tpc?.enabled !== undefined ? Boolean(tpc.enabled) : true,
      timeoutHours: typeof tpc?.timeoutHours === 'number' && tpc.timeoutHours > 0 ? tpc.timeoutHours : (parseFloat(tpc?.timeoutHours) || 24),
      priceMultiplier: typeof tpc?.priceMultiplier === 'number' && tpc.priceMultiplier > 0 ? tpc.priceMultiplier : (parseFloat(tpc?.priceMultiplier) || 1.5),
      activatedAt: tpc?.activatedAt
    }
  };
}

export function getDefaultPositionRiskConfig(
  posId: string, 
  symbol: string, 
  side: 'BUY' | 'SELL', 
  entryPrice: number,
  activatedAt?: number
): PositionRiskConfig {
  return {
    positionId: posId,
    symbol,
    side,
    timeControl: {
      enabled: false,
      maxHoldMinutes: 240, // 默认 240 分钟
    },
    tpSlControl: {
      tpEnabled: false,
      tpMode: 'PERCENT',
      tpPercent: 5.0,
      tpPrice: side === 'BUY' ? entryPrice * 1.05 : entryPrice * 0.95,
      slEnabled: false,
      slMode: 'PERCENT',
      slPercent: 3.0,
      slPrice: side === 'BUY' ? entryPrice * 0.97 : entryPrice * 1.03,
    },
    conditionControl: getDefaultConditionControlConfig(),
    timeoutPriceControl: {
      enabled: true, // 默认开启
      timeoutHours: 24, // 默认 24 小时
      priceMultiplier: 1.5, // 默认 1.5 倍
      activatedAt: activatedAt || Date.now()
    }
  };
}
