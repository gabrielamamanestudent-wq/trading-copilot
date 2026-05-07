import React, { useState } from 'react';
import type { AppSettings, BrokerConfig, BrokerID, TradeSignal } from '../types';

interface Props {
  settings: AppSettings;
  signal: TradeSignal | null;
  onSettingsChange: (s: AppSettings) => void;
}

const BROKER_DESCRIPTIONS: Record<BrokerID, string> = {
  alpaca: 'Stocks & ETFs · Free API · Paper trading',
  coinbase: 'Crypto · BTC, ETH, 200+ assets',
  ibkr: 'Stocks, Options, Futures, Forex · Requires TWS/Gateway',
  tdameritrade: 'Stocks, Options, Futures · Now Schwab',
  robinhood: 'Stocks & Crypto · Unofficial API',
  webull: 'Stocks, Options · Unofficial API',
};

const BROKER_LINKS: Record<BrokerID, string> = {
  alpaca: 'https://alpaca.markets/docs/api-references/',
  coinbase: 'https://docs.cdp.coinbase.com/advanced-trade/docs/welcome',
  ibkr: 'https://ibkrcampus.com/campus/ibkr-api-page/cpapi-v1/',
  tdameritrade: 'https://developer.tdameritrade.com/apis',
  robinhood: 'https://robinhood.com',
  webull: 'https://webull.com',
};

export default function BrokerPanel({ settings, signal, onSettingsChange }: Props) {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const updateBroker = (id: BrokerID, updates: Partial<BrokerConfig>) => {
    const newBrokers = settings.brokers.map(b => b.id === id ? { ...b, ...updates } : b);
    const newSettings = { ...settings, brokers: newBrokers };
    onSettingsChange(newSettings);
    chrome.storage.local.set({ settings: newSettings });
  };

  const toggleKey = (id: string) => setShowKeys(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="broker-panel">
      <div style={{ marginBottom: '12px', fontSize: '11px', color: '#94a3b8', lineHeight: '1.5', background: 'rgba(79,142,247,0.08)', border: '1px solid rgba(79,142,247,0.2)', borderRadius: '8px', padding: '8px 10px' }}>
        🔐 API keys are stored <strong>locally</strong> in your browser only. Never sent to any server.
      </div>

      {settings.brokers.map(broker => (
        <div key={broker.id} className="broker-config-card">
          <div className="broker-config-header">
            <div>
              <div className="broker-config-name">{broker.name}</div>
              <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>
                {BROKER_DESCRIPTIONS[broker.id]}
              </div>
              {broker.paperTrading && <span className="paper-badge" style={{ marginTop: '4px' }}>📄 PAPER</span>}
            </div>
            <button
              className={`broker-toggle ${broker.enabled ? 'on' : ''}`}
              onClick={() => updateBroker(broker.id, { enabled: !broker.enabled })}
            />
          </div>

          {broker.enabled && (
            <>
              <div className="broker-input-label">API Key</div>
              <div style={{ position: 'relative' }}>
                <input
                  className="broker-input"
                  type={showKeys[broker.id + '_key'] ? 'text' : 'password'}
                  placeholder="Enter API key..."
                  value={broker.apiKey || ''}
                  onChange={e => updateBroker(broker.id, { apiKey: e.target.value })}
                />
                <button
                  onClick={() => toggleKey(broker.id + '_key')}
                  style={{ position: 'absolute', right: '8px', top: '6px', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '13px' }}
                >
                  {showKeys[broker.id + '_key'] ? '🙈' : '👁'}
                </button>
              </div>

              <div className="broker-input-label">API Secret</div>
              <div style={{ position: 'relative' }}>
                <input
                  className="broker-input"
                  type={showKeys[broker.id + '_secret'] ? 'text' : 'password'}
                  placeholder="Enter API secret..."
                  value={broker.apiSecret || ''}
                  onChange={e => updateBroker(broker.id, { apiSecret: e.target.value })}
                />
                <button
                  onClick={() => toggleKey(broker.id + '_secret')}
                  style={{ position: 'absolute', right: '8px', top: '6px', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '13px' }}
                >
                  {showKeys[broker.id + '_secret'] ? '🙈' : '👁'}
                </button>
              </div>

              {broker.id === 'ibkr' && (
                <>
                  <div className="broker-input-label">Account ID</div>
                  <input
                    className="broker-input"
                    type="text"
                    placeholder="Enter IBKR Account ID..."
                    value={broker.accountId || ''}
                    onChange={e => updateBroker(broker.id, { accountId: e.target.value })}
                  />
                </>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: '#94a3b8' }}>
                  <input
                    type="checkbox"
                    checked={broker.paperTrading}
                    onChange={e => updateBroker(broker.id, { paperTrading: e.target.checked })}
                    style={{ accentColor: '#ffd32a' }}
                  />
                  Paper Trading
                </label>
                <a href={BROKER_LINKS[broker.id]} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '10px', color: '#4f8ef7', textDecoration: 'none' }}>
                  Get API keys ↗
                </a>
              </div>
            </>
          )}
        </div>
      ))}

      {/* Account Balance Summary */}
      <div style={{ background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: '8px', padding: '10px 12px', marginTop: '4px' }}>
        <div style={{ fontSize: '10px', color: '#00d4aa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
          Connected Brokers
        </div>
        {settings.brokers.filter(b => b.enabled && b.apiKey).length === 0 ? (
          <div style={{ fontSize: '11px', color: '#475569' }}>No brokers connected yet</div>
        ) : (
          settings.brokers.filter(b => b.enabled && b.apiKey).map(b => (
            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0', borderBottom: '1px solid #1e2d4d' }}>
              <span style={{ color: '#94a3b8' }}>{b.name}</span>
              <span style={{ color: '#00d4aa' }}>✓ Connected {b.paperTrading && '(Paper)'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
