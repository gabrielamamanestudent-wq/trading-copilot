import React from 'react';
import type { LiveFeedItem, TradeSignal } from '../types';

interface Props {
  items: LiveFeedItem[];
  onSignalClick: (signal: TradeSignal) => void;
}

const TYPE_ICONS: Record<string, string> = {
  trump: '🇺🇸',
  breaking: '🚨',
  news: '📰',
  signal: '📊',
  alert: '⚡',
};

const SIGNAL_ICONS: Record<string, string> = {
  BUY: '🟢',
  STRONG_BUY: '💚',
  SELL: '🔴',
  STRONG_SELL: '❤️',
  HOLD: '🟡',
};

function timeAgo(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function LiveFeed({ items, onSignalClick }: Props) {
  if (items.length === 0) {
    return (
      <div className="feed">
        <div className="feed-header">
          <span className="feed-title">Live Feed</span>
        </div>
        <div className="feed-empty">
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📡</div>
          <div>Waiting for signals and news...</div>
          <div style={{ fontSize: '11px', marginTop: '8px', color: '#475569' }}>
            Navigate to TradingView, Robinhood, Coinbase, or any trading platform
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="feed">
      <div className="feed-header">
        <span className="feed-title">Live Feed · {items.length} items</span>
        <span style={{ fontSize: '10px', color: '#4f8ef7' }}>Discord-style</span>
      </div>
      {items.map((item) => {
        const isSignal = item.type === 'signal';
        const signalType = item.signal?.signal || '';
        const feedClass = [
          'feed-item',
          !item.read ? 'unread' : '',
          item.type === 'trump' ? 'trump' : '',
          item.type === 'breaking' ? 'breaking' : '',
          isSignal && (signalType === 'BUY' || signalType === 'STRONG_BUY') ? 'signal-buy' : '',
          isSignal && (signalType === 'SELL' || signalType === 'STRONG_SELL') ? 'signal-sell' : '',
        ].filter(Boolean).join(' ');

        return (
          <div
            key={item.id}
            className={feedClass}
            onClick={() => { if (isSignal && item.signal) onSignalClick(item.signal); }}
          >
            <div className="feed-icon">
              {isSignal ? (SIGNAL_ICONS[signalType] || '📊') : TYPE_ICONS[item.type] || '📌'}
            </div>
            <div className="feed-body">
              <div className="feed-item-title">{item.title}</div>
              <div className="feed-item-body">{item.body}</div>
              <div className="feed-item-time">
                {timeAgo(item.timestamp)}
                {item.news?.source && ` · ${item.news.source}`}
                {isSignal && item.signal && (
                  <span style={{ color: '#4f8ef7', marginLeft: '6px' }}>
                    {item.signal.confidence}% confidence
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
