import React, { useState, useEffect, useRef } from 'react';
import type { TradeSignal, LiveFeedItem, TickerData, AppSettings, BrokerID } from '../types';
import SignalCard from '../components/SignalCard';
import LiveFeed from '../components/LiveFeed';
import TickerBar from '../components/TickerBar';
import BrokerPanel from '../components/BrokerPanel';
import SettingsPanel from '../components/SettingsPanel';
import AuthPanel from '../components/AuthPanel';
import { persistSignal, subscribeToBreakingNews } from '../utils/supabaseClient';
import './styles.css';

type Tab = 'feed' | 'signal' | 'brokers' | 'settings' | 'cloud';

const DEFAULT_SETTINGS: AppSettings = {
  brokers: [
    { id: 'alpaca', name: 'Alpaca', paperTrading: true, enabled: false, baseUrl: 'https://paper-api.alpaca.markets' },
    { id: 'coinbase', name: 'Coinbase', paperTrading: false, enabled: false, baseUrl: 'https://api.coinbase.com' },
    { id: 'ibkr', name: 'Interactive Brokers', paperTrading: true, enabled: false, baseUrl: 'https://localhost:5000' },
    { id: 'tdameritrade', name: 'TD Ameritrade', paperTrading: false, enabled: false, baseUrl: 'https://api.tdameritrade.com/v1' },
    { id: 'robinhood', name: 'Robinhood', paperTrading: false, enabled: false, baseUrl: 'https://api.robinhood.com' },
    { id: 'webull', name: 'Webull', paperTrading: false, enabled: false, baseUrl: 'https://userapi.webull.com' },
  ],
  autoSignals: true,
  soundAlerts: true,
  trumpAlerts: true,
  breakingNewsAlerts: true,
  defaultPositionSize: 1000,
  riskPerTrade: 2,
  theme: 'dark',
  refreshInterval: 30,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [currentTicker, setCurrentTicker] = useState<TickerData | null>(null);
  const [currentSignal, setCurrentSignal] = useState<TradeSignal | null>(null);
  const [liveFeed, setLiveFeed] = useState<LiveFeedItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [platform, setPlatform] = useState<string>('Detecting...');
  const wsRef = useRef<WebSocket | null>(null);

  // Load settings from chrome storage
  useEffect(() => {
    chrome.storage.local.get(['settings', 'liveFeed'], (result) => {
      if (result.settings) setSettings({ ...DEFAULT_SETTINGS, ...result.settings });
      if (result.liveFeed) setLiveFeed(result.liveFeed.slice(0, 100));
    });
  }, []);

  // Listen for messages from background/content scripts
  useEffect(() => {
    const listener = (message: any) => {
      if (message.type === 'TICKER_UPDATE') {
        setCurrentTicker(message.data);
        setPlatform(message.data.platform);
      }
      if (message.type === 'SIGNAL_UPDATE') {
        setCurrentSignal(message.data);
        setActiveTab('signal');
        // Persist to Supabase in background
        persistSignal(message.data).catch(() => {});
        // Add to feed
        const feedItem: LiveFeedItem = {
          id: message.data.id,
          type: 'signal',
          title: `${message.data.signal} ${message.data.symbol}`,
          body: message.data.reasoning,
          signal: message.data,
          timestamp: Date.now(),
          read: false,
        };
        setLiveFeed(prev => [feedItem, ...prev].slice(0, 100));
        setUnreadCount(c => c + 1);
        // Play sound if enabled
        if (settings.soundAlerts) {
          playAlert(message.data.signal === 'BUY' || message.data.signal === 'STRONG_BUY' ? 'buy' : 'sell');
        }
      }
      if (message.type === 'NEWS_ALERT') {
        const feedItem: LiveFeedItem = {
          id: message.data.id,
          type: message.data.isTrump ? 'trump' : message.data.isBreaking ? 'breaking' : 'news',
          title: message.data.title,
          body: message.data.summary,
          news: message.data,
          timestamp: Date.now(),
          read: false,
        };
        setLiveFeed(prev => [feedItem, ...prev].slice(0, 100));
        setUnreadCount(c => c + 1);
        if (settings.soundAlerts && (message.data.isTrump || message.data.isBreaking)) {
          playAlert('breaking');
        }
      }
      if (message.type === 'PLATFORM_DETECTED') {
        setPlatform(message.platform);
      }
      if (message.type === 'WS_STATUS') {
        setIsConnected(message.connected);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    chrome.runtime.sendMessage({ type: 'GET_STATE' });
    // Subscribe to Supabase real-time breaking news
    let unsubNews: (() => void) | undefined;
    subscribeToBreakingNews((news) => {
      const feedItem: LiveFeedItem = {
        id: news.id, type: news.is_trump ? 'trump' : 'breaking',
        title: news.title, body: news.summary,
        news: { ...news, isTrump: news.is_trump, isBreaking: news.is_breaking, impactScore: news.impact_score, relatedTickers: news.related_tickers, timestamp: new Date(news.published_at).getTime() },
        timestamp: Date.now(), read: false,
      };
      setLiveFeed(prev => [feedItem, ...prev].slice(0, 100));
      setUnreadCount(c => c + 1);
    }).then(unsub => { unsubNews = unsub; });
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      unsubNews?.();
    };
  }, [settings.soundAlerts]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'feed') setUnreadCount(0);
  };

  const playAlert = (type: 'buy' | 'sell' | 'breaking') => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === 'buy') { osc.frequency.value = 880; gain.gain.value = 0.1; }
    else if (type === 'sell') { osc.frequency.value = 440; gain.gain.value = 0.1; }
    else { osc.frequency.value = 660; gain.gain.value = 0.15; }
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 200);
  };

  const requestSignal = () => {
    chrome.runtime.sendMessage({ type: 'REQUEST_SIGNAL', ticker: currentTicker });
  };

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="header-left">
          <div className="logo">⚡</div>
          <div>
            <div className="logo-text">Co-Pilot</div>
            <div className="platform-badge">{platform}</div>
          </div>
        </div>
        <div className="header-right">
          <div className={`ws-dot ${isConnected ? 'connected' : 'disconnected'}`} title={isConnected ? 'Live' : 'Offline'} />
          <span className="ws-label">{isConnected ? 'LIVE' : 'OFFLINE'}</span>
        </div>
      </div>

      {/* Ticker Bar */}
      {currentTicker && <TickerBar ticker={currentTicker} onAnalyze={requestSignal} />}

      {/* Tab Bar */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'feed' ? 'active' : ''}`} onClick={() => handleTabChange('feed')}>
          📡 Feed {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
        </button>
        <button className={`tab ${activeTab === 'signal' ? 'active' : ''}`} onClick={() => handleTabChange('signal')}>
          📊 Signal
        </button>
        <button className={`tab ${activeTab === 'brokers' ? 'active' : ''}`} onClick={() => handleTabChange('brokers')}>
          🏦 Brokers
        </button>
        <button className={`tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => handleTabChange('settings')}>
          ⚙️
        </button>
        <button className={`tab ${activeTab === 'cloud' ? 'active' : ''}`} onClick={() => handleTabChange('cloud')}>
          ☁️
        </button>
      </div>

      {/* Content */}
      <div className="content">
        {activeTab === 'feed' && (
          <LiveFeed items={liveFeed} onSignalClick={(signal) => { setCurrentSignal(signal); setActiveTab('signal'); }} />
        )}
        {activeTab === 'signal' && (
          <SignalCard signal={currentSignal} ticker={currentTicker} settings={settings} />
        )}
        {activeTab === 'brokers' && (
          <BrokerPanel settings={settings} signal={currentSignal} onSettingsChange={setSettings} />
        )}
        {activeTab === 'settings' && (
          <SettingsPanel settings={settings} onSave={(s) => {
            setSettings(s);
            chrome.storage.local.set({ settings: s });
          }} />
        )}
        {activeTab === 'cloud' && (
          <AuthPanel settings={settings} />
        )}
      </div>
    </div>
  );
}
