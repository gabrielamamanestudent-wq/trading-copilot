import React, { useState } from 'react';
import type { TradeSignal, TickerData, AppSettings, BrokerID, TradeOrder } from '../types';

interface Props {
  signal: TradeSignal | null;
  ticker: TickerData | null;
  settings: AppSettings;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getRSIClass(rsi: number): string {
  if (rsi >= 70) return 'bearish';
  if (rsi <= 30) return 'bullish';
  return 'neutral';
}

function getMACDClass(histogram: number): string {
  return histogram > 0 ? 'bullish' : histogram < 0 ? 'bearish' : 'neutral';
}

export default function SignalCard({ signal, ticker, settings }: Props) {
  const [qty, setQty] = useState('1');
  const [orderResult, setOrderResult] = useState<{ success: boolean; message: string } | null>(null);
  const [placing, setPlacing] = useState(false);

  if (!signal) {
    return (
      <div className="signal-card">
        <div className="signal-empty">
          <div className="signal-empty-icon">🤖</div>
          <div className="signal-empty-text">
            No signal yet. Click <strong>Analyze</strong> on a ticker or navigate to a trading platform.
          </div>
          {ticker && (
            <div style={{ marginTop: '12px', fontSize: '11px', color: '#94a3b8' }}>
              Watching: <strong style={{ color: '#e2e8f0' }}>{ticker.symbol}</strong>
            </div>
          )}
        </div>
      </div>
    );
  }

  const enabledBrokers = settings.brokers.filter(b => b.enabled && b.apiKey);
  const confidenceColor = signal.confidence >= 70 ? '#00d4aa' : signal.confidence >= 50 ? '#ffd32a' : '#ff4757';

  const placeTrade = async (brokerId: BrokerID, side: 'buy' | 'sell') => {
    setPlacing(true);
    setOrderResult(null);
    const order: TradeOrder = {
      symbol: signal.symbol,
      side,
      qty: parseFloat(qty) || 1,
      orderType: 'market',
      timeInForce: 'day',
      broker: brokerId,
    };
    try {
      const response = await chrome.runtime.sendMessage({ type: 'PLACE_ORDER', order });
      setOrderResult(response);
    } catch (e) {
      setOrderResult({ success: false, message: 'Failed to connect to broker' });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="signal-card">
      {/* Header */}
      <div className="signal-header">
        <span className="signal-symbol">{signal.symbol}</span>
        <span className="signal-time">{formatTime(signal.timestamp)}</span>
      </div>

      {/* Signal Badge */}
      <div className={`signal-badge ${signal.signal}`}>
        {signal.signal === 'STRONG_BUY' && '💚 STRONG BUY'}
        {signal.signal === 'BUY' && '🟢 BUY'}
        {signal.signal === 'HOLD' && '🟡 HOLD'}
        {signal.signal === 'SELL' && '🔴 SELL'}
        {signal.signal === 'STRONG_SELL' && '❤️ STRONG SELL'}
      </div>

      {/* Confidence */}
      <div className="confidence-bar">
        <div className="confidence-label">
          <span>Confidence</span>
          <span style={{ color: confidenceColor, fontWeight: 700 }}>{signal.confidence}%</span>
        </div>
        <div className="confidence-track">
          <div
            className="confidence-fill"
            style={{ width: `${signal.confidence}%`, background: confidenceColor }}
          />
        </div>
      </div>

      {/* Price Targets */}
      <div className="price-targets">
        <div className="price-box entry">
          <div className="price-box-label">Entry</div>
          <div className="price-box-value">${signal.entryPrice.toFixed(2)}</div>
        </div>
        <div className="price-box target">
          <div className="price-box-label">Target</div>
          <div className="price-box-value">${signal.targetPrice.toFixed(2)}</div>
        </div>
        <div className="price-box stoploss">
          <div className="price-box-label">Stop Loss</div>
          <div className="price-box-value">${signal.stopLoss.toFixed(2)}</div>
        </div>
      </div>

      {/* Risk/Reward */}
      <div className="rr-badge">
        ⚖️ Risk/Reward: {signal.riskReward.toFixed(2)}x &nbsp;·&nbsp; {signal.timeframe} timeframe
      </div>

      {/* Technicals */}
      <div className="technicals">
        <div className="technicals-title">Technical Indicators</div>
        <div className="technical-row">
          <span className="tech-label">RSI (14)</span>
          <span className={`tech-value ${getRSIClass(signal.technical.rsi)}`}>
            {signal.technical.rsi.toFixed(1)}
            {signal.technical.rsi >= 70 ? ' — Overbought' : signal.technical.rsi <= 30 ? ' — Oversold' : ''}
          </span>
        </div>
        <div className="technical-row">
          <span className="tech-label">MACD Histogram</span>
          <span className={`tech-value ${getMACDClass(signal.technical.macd.histogram)}`}>
            {signal.technical.macd.histogram.toFixed(3)}
          </span>
        </div>
        <div className="technical-row">
          <span className="tech-label">EMA 20 / 50</span>
          <span className={`tech-value ${signal.technical.ema20 > signal.technical.ema50 ? 'bullish' : 'bearish'}`}>
            {signal.technical.ema20 > signal.technical.ema50 ? '20 > 50 ↑' : '20 < 50 ↓'}
          </span>
        </div>
        <div className="technical-row">
          <span className="tech-label">Bollinger Band</span>
          <span className="tech-value neutral">
            {signal.entryPrice < signal.technical.bollingerBands.lower
              ? '↙ Below Lower'
              : signal.entryPrice > signal.technical.bollingerBands.upper
              ? '↗ Above Upper'
              : 'Within Band'}
          </span>
        </div>
        <div className="technical-row">
          <span className="tech-label">Vol vs Avg</span>
          <span className={`tech-value ${signal.technical.volumeRatio > 1.5 ? 'bullish' : 'neutral'}`}>
            {signal.technical.volumeRatio.toFixed(1)}x
          </span>
        </div>
      </div>

      {/* Reasoning */}
      <div className="reasoning">
        <div className="reasoning-title">🤖 AI Reasoning</div>
        <div className="reasoning-text">{signal.reasoning}</div>
      </div>

      {/* News Drivers */}
      {signal.newsDrivers.length > 0 && (
        <div className="news-drivers">
          <div className="news-drivers-title">📰 News Drivers</div>
          {signal.newsDrivers.slice(0, 3).map((n) => (
            <div key={n.id} className="news-driver-item">
              <div className={`news-sentiment-dot ${n.sentiment}`} />
              <div className="news-driver-text">
                {n.isTrump && '🇺🇸 '}{n.isBreaking && '🚨 '}{n.title}
                <span style={{ marginLeft: '4px', opacity: 0.6 }}>· {n.source}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trade Execution */}
      <div className="trade-actions">
        <div className="trade-actions-title">🏦 Place Trade</div>
        <div className="qty-row">
          <span className="qty-label">Qty</span>
          <input
            className="qty-input"
            type="number"
            value={qty}
            onChange={e => setQty(e.target.value)}
            min="0.001"
            step="1"
          />
          <span style={{ fontSize: '10px', color: '#475569' }}>
            ~${(parseFloat(qty) * signal.entryPrice || 0).toFixed(0)}
          </span>
        </div>

        {enabledBrokers.length === 0 ? (
          <div style={{ fontSize: '11px', color: '#ff8c00', background: 'rgba(255,140,0,0.1)', border: '1px solid #ff8c00', borderRadius: '6px', padding: '8px 10px' }}>
            ⚠️ No brokers configured. Go to the Brokers tab to connect your accounts.
          </div>
        ) : (
          <div className="broker-btns">
            {enabledBrokers.map(broker => (
              <React.Fragment key={broker.id}>
                <button
                  className={`broker-btn ${signal.signal.includes('BUY') ? 'buy' : 'sell'}`}
                  onClick={() => placeTrade(broker.id, signal.signal.includes('BUY') ? 'buy' : 'sell')}
                  disabled={placing}
                >
                  <span>
                    {signal.signal.includes('BUY') ? '🟢 BUY' : '🔴 SELL'} {signal.symbol}
                  </span>
                  <span className="broker-btn-name">
                    via {broker.name} {broker.paperTrading && '(Paper)'}
                  </span>
                </button>
              </React.Fragment>
            ))}
          </div>
        )}
        {orderResult && (
          <div className={`order-result ${orderResult.success ? 'success' : 'error'}`}>
            {orderResult.success ? '✅' : '❌'} {orderResult.message}
          </div>
        )}
      </div>
    </div>
  );
}
