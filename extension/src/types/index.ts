export type SignalType = 'BUY' | 'SELL' | 'HOLD' | 'STRONG_BUY' | 'STRONG_SELL';
export type AssetClass = 'STOCK' | 'CRYPTO' | 'FUTURES' | 'FOREX' | 'OPTIONS';
export type Platform = 'tradingview' | 'robinhood' | 'coinbase' | 'tdameritrade' | 'webull' | 'ibkr' | 'alpaca' | 'unknown';
export type BrokerID = 'alpaca' | 'coinbase' | 'ibkr' | 'tdameritrade' | 'robinhood' | 'webull';

export interface TickerData {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  assetClass: AssetClass;
  platform: Platform;
  timestamp: number;
}

export interface TechnicalSignal {
  rsi: number;
  macd: { value: number; signal: number; histogram: number };
  bollingerBands: { upper: number; middle: number; lower: number };
  ema20: number;
  ema50: number;
  vwap: number;
  volumeRatio: number; // current vs avg volume
}

export interface NewsAlert {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impactScore: number; // 0-100
  relatedTickers: string[];
  timestamp: number;
  isTrump: boolean;
  isBreaking: boolean;
}

export interface TradeSignal {
  id: string;
  symbol: string;
  signal: SignalType;
  confidence: number; // 0-100
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskReward: number;
  reasoning: string;
  technical: TechnicalSignal;
  newsDrivers: NewsAlert[];
  assetClass: AssetClass;
  timestamp: number;
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
}

export interface LiveFeedItem {
  id: string;
  type: 'signal' | 'news' | 'alert' | 'trump' | 'breaking';
  title: string;
  body: string;
  signal?: TradeSignal;
  news?: NewsAlert;
  timestamp: number;
  read: boolean;
}

export interface BrokerConfig {
  id: BrokerID;
  name: string;
  apiKey?: string;
  apiSecret?: string;
  accountId?: string;
  paperTrading: boolean;
  enabled: boolean;
  baseUrl: string;
}

export interface TradeOrder {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
  limitPrice?: number;
  stopPrice?: number;
  timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
  broker: BrokerID;
}

export interface TradeResult {
  success: boolean;
  orderId?: string;
  message: string;
  broker: BrokerID;
  filledPrice?: number;
  filledQty?: number;
}

export interface AppSettings {
  brokers: BrokerConfig[];
  newsApiKey?: string;
  polygonApiKey?: string;
  finnhubApiKey?: string;
  alphaVantageApiKey?: string;
  autoSignals: boolean;
  soundAlerts: boolean;
  trumpAlerts: boolean;
  breakingNewsAlerts: boolean;
  defaultPositionSize: number; // in dollars
  riskPerTrade: number; // percentage
  theme: 'dark' | 'light';
  refreshInterval: number; // seconds
}

export interface ScreenData {
  platform: Platform;
  ticker?: TickerData;
  chartTimeframe?: string;
  rawText?: string;
}
