import { Position, OpenOrder } from '../types';

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

  // c，暂时没有想好，请保留这个条件框架，等我想好后再按规则编写；
  conditionControl: {
    enabled: boolean;
    ruleType: string;
    description?: string;
  };
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
    if (o.symbol.toUpperCase() !== position.symbol.toUpperCase()) return false;
    // 双向持仓模式下严格匹配持仓方向
    if (posSide !== 'BOTH' && o.positionSide && o.positionSide !== 'BOTH') {
      if (o.positionSide !== posSide) return false;
    }
    // 必须是平仓方向 (多单平仓为 SELL，空单平仓为 BUY)
    return o.side === closingSide;
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

  // 结合该持仓专属配置的启用状态进行精准兜底
  const hasTp = Boolean(foundTpOrder || config?.tpSlControl?.tpEnabled);
  const hasSl = Boolean(foundSlOrder || config?.tpSlControl?.slEnabled);

  // 提取对应止盈价
  let tpPrice: number | undefined = undefined;
  if (foundTpOrder) {
    tpPrice = (foundTpOrder.price > 0 ? foundTpOrder.price : foundTpOrder.stopPrice) || undefined;
  }
  if (!tpPrice && config?.tpSlControl?.tpEnabled && config.tpSlControl.tpPrice > 0) {
    tpPrice = config.tpSlControl.tpPrice;
  }

  // 提取对应止损价
  let slPrice: number | undefined = undefined;
  if (foundSlOrder) {
    slPrice = (foundSlOrder.stopPrice && foundSlOrder.stopPrice > 0 ? foundSlOrder.stopPrice : foundSlOrder.price) || undefined;
  }
  if (!slPrice && config?.tpSlControl?.slEnabled && config.tpSlControl.slPrice > 0) {
    slPrice = config.tpSlControl.slPrice;
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
    if (raw) {
      return JSON.parse(raw);
    }
    // Check all-accounts map if exists
    const allRaw = localStorage.getItem('binance_all_accounts_position_risk_configs');
    if (allRaw) {
      const all = JSON.parse(allRaw);
      if (accountName && all[accountName]) {
        return all[accountName];
      }
    }
    // Fallback to legacy key if accountName matches or not provided
    if (!accountName) {
      const legacyRaw = localStorage.getItem(STORAGE_KEY);
      if (legacyRaw) return JSON.parse(legacyRaw);
    }
    return {};
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

export function getDefaultPositionRiskConfig(posId: string, symbol: string, side: 'BUY' | 'SELL', entryPrice: number): PositionRiskConfig {
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
    conditionControl: {
      enabled: false,
      ruleType: 'RESERVED_FRAMEWORK',
      description: '条件风控核心框架已预留，待策略规则完善后嵌入生效'
    }
  };
}
