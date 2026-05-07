import type { TickerData, TradeSignal, TechnicalSignal, NewsAlert, SignalType } from '../types';

// Lightweight RSI calculation
function calcRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcMACD(prices: number[]): { value: number; signal: number; histogram: number } {
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  const macdLine = ema12 - ema26;
  // Signal line: 9-period EMA of MACD (simplified)
  const signalLine = macdLine * 0.8; // simplified
  return { value: macdLine, signal: signalLine, histogram: macdLine - signalLine };
}

function calcBollingerBands(prices: number[], period = 20, multiplier = 2) {
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b) / slice.length;
  const stdDev = Math.sqrt(slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / slice.length);
  return {
    upper: mean + multiplier * stdDev,
    middle: mean,
    lower: mean - multiplier * stdDev,
  };
}

function calcVWAP(prices: number[], volumes: number[]): number {
  if (prices.length === 0) return prices[prices.length - 1];
  const totalVol = volumes.reduce((a, b) => a + b, 0);
  if (totalVol === 0) return prices[prices.length - 1];
  const sumPV = prices.reduce((sum, p, i) => sum + p * volumes[i], 0);
  return sumPV / totalVol;
}

function generateReasoning(
  ticker: TickerData,
  tech: TechnicalSignal,
  signal: SignalType,
  news: NewsAlert[]
): string {
  const parts: string[] = [];

  // RSI analysis
  if (tech.rsi <= 30) parts.push(`RSI at ${tech.rsi.toFixed(0)} signals oversold conditions — potential bounce`);
  else if (tech.rsi >= 70) parts.push(`RSI at ${tech.rsi.toFixed(0)} — overbought, watch for reversal`);
  else parts.push(`RSI at ${tech.rsi.toFixed(0)} — neutral momentum`);

  // MACD
  if (tech.macd.histogram > 0) parts.push('MACD histogram positive — bullish momentum building');
  else parts.push('MACD histogram negative — bearish pressure');

  // EMA cross
  if (tech.ema20 > tech.ema50) parts.push('EMA 20 above EMA 50 — uptrend intact');
  else parts.push('EMA 20 below EMA 50 — downtrend in play');

  // Bollinger
  const { upper, lower } = tech.bollingerBands;
  if (ticker.price <= lower) parts.push('Price at lower Bollinger Band — mean reversion likely');
  else if (ticker.price >= upper) parts.push('Price at upper Bollinger Band — potential overextension');

  // Volume
  if (tech.volumeRatio >= 2) parts.push(`Volume ${tech.volumeRatio.toFixed(1)}x above average — strong conviction move`);
  else if (tech.volumeRatio >= 1.5) parts.push(`Volume ${tech.volumeRatio.toFixed(1)}x average — above-average interest`);

  // News drivers
  const trumpNews = news.filter(n => n.isTrump);
  const breakingNews = news.filter(n => n.isBreaking);
  const bullishNews = news.filter(n => n.sentiment === 'BULLISH');
  const bearishNews = news.filter(n => n.sentiment === 'BEARISH');

  if (trumpNews.length > 0) parts.push(`⚠️ Trump post detected — high market impact expected`);
  if (breakingNews.length > 0) parts.push(`🚨 Breaking news affecting ${ticker.symbol}`);
  if (bullishNews.length > bearishNews.length) parts.push(`News sentiment: ${bullishNews.length} bullish vs ${bearishNews.length} bearish stories`);
  else if (bearishNews.length > bullishNews.length) parts.push(`News sentiment: ${bearishNews.length} bearish stories outweigh ${bullishNews.length} bullish`);

  return parts.join('. ') + '.';
}

export function generateSignal(
  ticker: TickerData,
  priceHistory: number[],
  volumeHistory: number[],
  news: NewsAlert[]
): TradeSignal {
  const prices = priceHistory.length > 5 ? priceHistory : [
    ticker.open, ticker.low, ticker.high, ticker.open * 0.99,
    ticker.high * 0.98, ticker.low * 1.01, ticker.price
  ];

  // Calculate technicals
  const rsi = calcRSI(prices);
  const macd = calcMACD(prices);
  const bollingerBands = calcBollingerBands(prices);
  const ema20 = calcEMA(prices, Math.min(20, prices.length));
  const ema50 = calcEMA(prices, Math.min(50, prices.length));
  const vwap = volumeHistory.length > 0 ? calcVWAP(prices, volumeHistory) : ticker.price;
  const avgVolume = volumeHistory.length > 0 ? volumeHistory.reduce((a, b) => a + b, 0) / volumeHistory.length : ticker.volume;
  const volumeRatio = avgVolume > 0 ? ticker.volume / avgVolume : 1;

  const tech: TechnicalSignal = { rsi, macd, bollingerBands, ema20, ema50, vwap, volumeRatio };

  // Score system -100 to +100
  let score = 0;

  // RSI (weight: 25)
  if (rsi <= 25) score += 25;
  else if (rsi <= 35) score += 15;
  else if (rsi >= 75) score -= 25;
  else if (rsi >= 65) score -= 15;

  // MACD (weight: 20)
  if (macd.histogram > 0) score += 20;
  else score -= 20;

  // EMA cross (weight: 20)
  if (ema20 > ema50) score += 20;
  else score -= 20;

  // Price vs Bollinger (weight: 15)
  if (ticker.price < bollingerBands.lower) score += 15;
  else if (ticker.price > bollingerBands.upper) score -= 15;

  // Volume (weight: 10)
  if (volumeRatio >= 2) score += 10;
  else if (volumeRatio < 0.5) score -= 5;

  // News sentiment (weight: 10)
  const newsScore = news.reduce((acc, n) => {
    const weight = n.isTrump || n.isBreaking ? 2 : 1;
    if (n.sentiment === 'BULLISH') return acc + (n.impactScore / 10) * weight;
    if (n.sentiment === 'BEARISH') return acc - (n.impactScore / 10) * weight;
    return acc;
  }, 0);
  score += Math.min(Math.max(newsScore, -10), 10);

  // Price vs VWAP
  if (ticker.price > vwap * 1.005) score -= 5;
  else if (ticker.price < vwap * 0.995) score += 5;

  // Determine signal
  let signal: SignalType;
  if (score >= 50) signal = 'STRONG_BUY';
  else if (score >= 20) signal = 'BUY';
  else if (score <= -50) signal = 'STRONG_SELL';
  else if (score <= -20) signal = 'SELL';
  else signal = 'HOLD';

  // Confidence: normalize score to 50-95 range
  const confidence = Math.min(95, Math.max(50, 50 + Math.abs(score) * 0.45));

  // Calculate targets
  const atr = (ticker.high - ticker.low) * 1.5; // simplified ATR
  const isBuy = signal === 'BUY' || signal === 'STRONG_BUY';

  const entryPrice = ticker.price;
  const targetPrice = isBuy ? ticker.price + atr * 2 : ticker.price - atr * 2;
  const stopLoss = isBuy ? ticker.price - atr : ticker.price + atr;
  const riskReward = Math.abs(targetPrice - entryPrice) / Math.abs(stopLoss - entryPrice);

  const reasoning = generateReasoning(ticker, tech, signal, news);

  return {
    id: `sig_${Date.now()}_${ticker.symbol}`,
    symbol: ticker.symbol,
    signal,
    confidence: Math.round(confidence),
    entryPrice,
    targetPrice,
    stopLoss,
    riskReward,
    reasoning,
    technical: tech,
    newsDrivers: news.slice(0, 5),
    assetClass: ticker.assetClass,
    timestamp: Date.now(),
    timeframe: '15m',
  };
}
