import React from 'react';
import type { TickerData } from '../types';

interface Props {
  ticker: TickerData;
  onAnalyze: () => void;
}

export default function TickerBar({ ticker, onAnalyze }: Props) {
  const isPositive = ticker.change >= 0;
  const assetIcon = {
    STOCK: '📈', CRYPTO: '₿', FUTURES: '⚡', FOREX: '💱', OPTIONS: '🎯'
  }[ticker.assetClass] || '📊';

  return (
    <div className="ticker-bar">
      <div className="ticker-info">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '16px' }}>{assetIcon}</span>
          <span className="ticker-symbol">{ticker.symbol}</span>
          <span className={`ticker-change ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? '▲' : '▼'} {Math.abs(ticker.changePct).toFixed(2)}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
          <span className="ticker-price">${ticker.price.toFixed(2)}</span>
          <span className={`ticker-change ${isPositive ? 'positive' : 'negative'}`} style={{ fontSize: '11px' }}>
            {isPositive ? '+' : ''}{ticker.change.toFixed(2)}
          </span>
        </div>
        <div className="ticker-meta">
          Vol: {ticker.volume > 1_000_000 ? `${(ticker.volume / 1_000_000).toFixed(1)}M` : ticker.volume > 1000 ? `${(ticker.volume / 1000).toFixed(0)}K` : ticker.volume}
          &nbsp;·&nbsp;H: ${ticker.high.toFixed(2)} &nbsp;L: ${ticker.low.toFixed(2)}
        </div>
      </div>
      <button className="analyze-btn" onClick={onAnalyze}>
        🤖 Analyze
      </button>
    </div>
  );
}
