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

export type RiskButtonDisplay = '条件风控' | '时间风控' | '死斗';

/**
 * 规则5：当用户设置完风控条件后，永续合约持仓表对应的风控列信息组件界面展示规则为：
 * 当a、b、c都设置并勾选的情况下，展示优先级为：“条件风控”＞“时间风控”＞“死斗”，默认状态下展示“死斗”；
 */
export function getRiskButtonDisplay(config?: PositionRiskConfig): RiskButtonDisplay {
  if (!config) return '死斗';

  // 优先级 1: 条件风控
  if (config.conditionControl && config.conditionControl.enabled) {
    return '条件风控';
  }

  // 优先级 2: 时间风控
  if (config.timeControl && config.timeControl.enabled) {
    return '时间风控';
  }

  // 优先级 3 / 默认: 死斗
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
