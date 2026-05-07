import React, { useState } from 'react';
import type { AppSettings } from '../types';

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
}

export default function SettingsPanel({ settings, onSave }: Props) {
  const [local, setLocal] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);

  const toggle = (key: keyof AppSettings) => {
    setLocal(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
  };
  const setNum = (key: keyof AppSettings, val: string) => {
    setLocal(prev => ({ ...prev, [key]: parseFloat(val) || 0 }));
  };

  const save = () => {
    onSave(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="settings-panel">
      <div className="settings-section">
        <div className="settings-section-title">Signals & Alerts</div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Auto-Signals</div>
            <div className="settings-sublabel">Generate signals when ticker changes</div>
          </div>
          <button className={`toggle-switch ${local.autoSignals ? 'on' : ''}`} onClick={() => toggle('autoSignals')} />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">🇺🇸 Trump Tweet Alerts</div>
            <div className="settings-sublabel">Alert on market-moving tweets</div>
          </div>
          <button className={`toggle-switch ${local.trumpAlerts ? 'on' : ''}`} onClick={() => toggle('trumpAlerts')} />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">🚨 Breaking News</div>
            <div className="settings-sublabel">Fed, earnings, geopolitical events</div>
          </div>
          <button className={`toggle-switch ${local.breakingNewsAlerts ? 'on' : ''}`} onClick={() => toggle('breakingNewsAlerts')} />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">🔊 Sound Alerts</div>
            <div className="settings-sublabel">Audio cues for signals and news</div>
          </div>
          <button className={`toggle-switch ${local.soundAlerts ? 'on' : ''}`} onClick={() => toggle('soundAlerts')} />
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Risk Management</div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Position Size ($)</div>
            <div className="settings-sublabel">Default dollar amount per trade</div>
          </div>
          <input
            className="settings-input"
            type="number"
            value={local.defaultPositionSize}
            onChange={e => setNum('defaultPositionSize', e.target.value)}
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Risk Per Trade (%)</div>
            <div className="settings-sublabel">Max % of account to risk</div>
          </div>
          <input
            className="settings-input"
            type="number"
            value={local.riskPerTrade}
            onChange={e => setNum('riskPerTrade', e.target.value)}
            min="0.1" max="10" step="0.1"
          />
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Data Feed</div>

        <div className="settings-row">
          <div>
            <div className="settings-label">Refresh Interval (sec)</div>
            <div className="settings-sublabel">How often to fetch price data</div>
          </div>
          <input
            className="settings-input"
            type="number"
            value={local.refreshInterval}
            onChange={e => setNum('refreshInterval', e.target.value)}
            min="5" max="300"
          />
        </div>

        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '10px', color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>API Keys (Data Providers)</div>
          {[
            { key: 'polygonApiKey', label: 'Polygon.io', link: 'https://polygon.io', placeholder: 'Free tier: 5 req/min' },
            { key: 'finnhubApiKey', label: 'Finnhub', link: 'https://finnhub.io', placeholder: 'Free: stocks + news' },
            { key: 'newsApiKey', label: 'NewsAPI', link: 'https://newsapi.org', placeholder: 'Free: 100 req/day' },
          ].map(({ key, label, link, placeholder }) => (
            <div key={key} style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{label}</span>
                <a href={link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', color: '#4f8ef7', textDecoration: 'none' }}>Get key ↗</a>
              </div>
              <input
                style={{ width: '100%', background: '#0f1629', border: '1px solid #1e2d4d', borderRadius: '6px', padding: '6px 10px', color: '#e2e8f0', fontSize: '11px', fontFamily: 'SF Mono, monospace', outline: 'none' }}
                type="password"
                placeholder={placeholder}
                value={(local as any)[key] || ''}
                onChange={e => setLocal(prev => ({ ...prev, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </div>

      <button className="save-btn" onClick={save}>
        {saved ? '✅ Saved!' : '💾 Save Settings'}
      </button>

      <div style={{ marginTop: '16px', padding: '10px', background: 'rgba(79,142,247,0.06)', borderRadius: '8px', border: '1px solid rgba(79,142,247,0.15)' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#4f8ef7', marginBottom: '4px' }}>ℹ️ About Trading Co-Pilot</div>
        <div style={{ fontSize: '10px', color: '#475569', lineHeight: 1.5 }}>
          This tool provides signals for informational purposes only. Not financial advice. Always do your own research. Past signals do not guarantee future results.
        </div>
      </div>
    </div>
  );
}
