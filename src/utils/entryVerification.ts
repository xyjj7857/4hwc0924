import { Position } from '../types';

/**
 * 规范化单个标的输入（去除首尾空格、转换为大写、去除特殊符号如斜杠）
 */
export function normalizeSingleKeyword(input: string): string {
  if (!input) return '';
  // 去除首尾空格，转大写，去除 /、-、_ 等符号
  let cleaned = input.trim().toUpperCase().replace(/[\/\-_:\s]/g, '');
  // 去除末尾的常见计价货币后缀如 USDT, USDC, BUSD, FDUSD（若用户录入了类似 HBARUSDT）
  cleaned = cleaned.replace(/(USDT|USDC|BUSD|FDUSD)$/, '');
  // 去除常见合约前缀 1000（若用户输入了类似 1000SIREN）
  // 保持关键字本身，但保留原意
  return cleaned;
}

/**
 * 智能拆分用户输入的文本（支持换行、逗号、分号、空格分割的多个币对批量添加）
 */
export function parseVerificationInput(rawText: string): string[] {
  if (!rawText) return [];
  const parts = rawText.split(/[\n,;，；\s]+/);
  const result: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const normalized = normalizeSingleKeyword(trimmed);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

/**
 * 将当前币对与入场验证名单进行智能比对
 * @param symbol 当前输入的币对全名，如 "HBARUSDT", "SIRENUSDT", "1000PEPEUSDT"
 * @param list 入场验证黑名单列表，如 ["HBAR", "SIREN", "LUNC"]
 */
export function matchSymbolWithVerificationList(
  symbol: string,
  list: string[]
): { isMatched: boolean; matchedKeyword?: string; detail?: string } {
  if (!symbol || !list || list.length === 0) {
    return { isMatched: false };
  }

  // 清洗当前币对
  const cleanSymbol = symbol.trim().toUpperCase().replace(/[\/\-_:\s]/g, '');
  if (!cleanSymbol) return { isMatched: false };

  // 基础资产提取 (如 HBARUSDT -> HBAR)
  const baseSymbol = cleanSymbol.replace(/(USDT|USDC|BUSD|FDUSD)$/, '');
  // 去除 1000 后的核心资产 (如 1000SIREN -> SIREN)
  const rawBase = baseSymbol.replace(/^1000/, '');

  for (const item of list) {
    if (!item) continue;
    const cleanItem = item.trim().toUpperCase().replace(/[\/\-_:\s]/g, '');
    if (!cleanItem) continue;

    const baseItem = cleanItem.replace(/(USDT|USDC|BUSD|FDUSD)$/, '').replace(/^1000/, '');

    // 1. 完全一致
    if (cleanSymbol === cleanItem || baseSymbol === cleanItem) {
      return {
        isMatched: true,
        matchedKeyword: item,
        detail: `精确命中黑名单: ${item}`
      };
    }

    // 2. 基础币种一致 (如用户录入 hbar，带入的是 HBARUSDT)
    if (baseSymbol === baseItem || rawBase === baseItem) {
      return {
        isMatched: true,
        matchedKeyword: item,
        detail: `基础标的命中: ${item}`
      };
    }

    // 3. 前缀包含 (如 HBARUSDT 以 HBAR 开头)
    if (cleanSymbol.startsWith(cleanItem) || cleanSymbol.startsWith(baseItem)) {
      return {
        isMatched: true,
        matchedKeyword: item,
        detail: `币对前缀命中: ${item}`
      };
    }

    // 4. 核心子串包含 (如 1000SIRENUSDT 包含 SIREN，且长度 >= 3 避免过短误伤)
    if (baseItem.length >= 3 && (baseSymbol.includes(baseItem) || cleanSymbol.includes(baseItem))) {
      return {
        isMatched: true,
        matchedKeyword: item,
        detail: `关联特征命中: ${item}`
      };
    }
  }

  return { isMatched: false };
}

/**
 * 将当前币对与现有持仓列表进行对比
 * @param symbol 当前输入的币对全名，如 "LSKUSDT"
 * @param positions 活跃持仓列表
 */
export function matchSymbolWithPositions(
  symbol: string,
  positions: Position[]
): { hasPosition: boolean; position?: Position } {
  if (!symbol || !positions || positions.length === 0) {
    return { hasPosition: false };
  }

  const cleanSymbol = symbol.trim().toUpperCase().replace(/[\/\-_:\s]/g, '');
  const baseSymbol = cleanSymbol.replace(/(USDT|USDC|BUSD|FDUSD)$/, '');

  for (const pos of positions) {
    // 仅针对非零持仓
    if (!pos || Math.abs(pos.amount) <= 0) continue;

    const posClean = (pos.symbol || '').trim().toUpperCase().replace(/[\/\-_:\s]/g, '');
    const posBase = posClean.replace(/(USDT|USDC|BUSD|FDUSD)$/, '');

    if (cleanSymbol === posClean || baseSymbol === posBase) {
      return { hasPosition: true, position: pos };
    }
  }

  return { hasPosition: false };
}

const STORAGE_KEY = 'binance_entry_verification_list';

/**
 * 从本地缓存获取入场验证名单
 */
export function getLocalVerificationList(): string[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to parse local verification list:', e);
  }
  return [];
}

/**
 * 保存入场验证名单到本地缓存
 */
export function setLocalVerificationList(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save verification list to localStorage:', e);
  }
}
