export interface ApiConfig {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  baseUrl: string;
  accountName?: string;
}

export interface OrderForm {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  amount: number;
  price?: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  positionSide: string; // 'BOTH', 'LONG', or 'SHORT'
  entryPrice: number;
  markPrice: number;
  amount: number;
  pnl: number;
  pnlPercent: number;
  timestamp: number;
  openTime?: number;
  accumulatedFundingFee?: number;
}

export interface PositionHistory {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  positionSide: string;
  entryPrice: number;
  exitPrice: number;
  amount: number;
  pnl: number; // True PnL (tradePnl + commission + fundingFee)
  tradePnl: number; // Price difference PnL
  commission: number;
  fundingFee: number;
  pnlPercent: number;
  openTime: number;
  closeTime: number;
  timestamp: number;
  account?: string;
}

export type TradeLogCategory = 'OPEN' | 'CLOSE' | 'RISK_SETTING' | 'RISK_TRIGGER';

export interface TradeLog {
  id: string;
  timestamp: number;
  type: 'INFO' | 'SUCCESS' | 'ERROR' | 'TRADE' | 'WARN';
  message: string;
  category?: TradeLogCategory;
  symbol?: string;
}

export interface AccountBalance {
  asset: string;
  balance: number;
  available: number;
  unrealizedPnl: number;
  spotBalance: number;
  futuresBalance: number;
}

export interface OpenOrder {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: string;
  price: number;
  stopPrice?: number;
  isAlgo: boolean;
  time: number;
  positionSide: string;
}

export type AlarmSoundType = 'chime' | 'radar' | 'gentle' | 'tri-tone';

export interface AlarmItem {
  id: string;
  time: string; // "HH:mm" (24-hour format, e.g., "08:00")
  label: string; // User description, e.g. "4h换线", "资金费率"
  enabled: boolean; // Individual toggle
  soundType?: AlarmSoundType;
}

export interface AlarmSettings {
  enabled: boolean; // Master one-click on/off switch
  alarms: AlarmItem[];
  volume: number; // 0 to 1
  soundType: AlarmSoundType;
}
