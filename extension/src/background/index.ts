import type { TickerData, NewsAlert, AppSettings, TradeOrder, BrokerConfig } from '../types';
import { generateSignal } from '../utils/signalEngine';
import { executeTrade, fetchAlpacaBars, fetchPolygonPrice, fetchCoinGeckoPrice } from '../utils/brokerAPI';

// === STATE ===
let currentTicker: TickerData | null = null;
let priceHistory: number[] = [];
let volumeHistory: number[] = [];
let recentNews: NewsAlert[] = [];
let settings: AppSettings | null = null;
let wsConnection: WebSocket | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

// === CRYPTO SYMBOL MAP (CoinGecko IDs) ===
const CRYPTO_MAP: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple',
  DOGE: 'dogecoin', ADA: 'cardano', AVAX: 'avalanche-2', DOT: 'polkadot',
  MATIC: 'matic-network', LINK: 'chainlink', UNI: 'uniswap', ATOM: 'cosmos',
};

// === LOAD SETTINGS ===
async function loadSettings(): Promise<AppSettings> {
  return new Promise(resolve => {
    chrome.storage.local.get(['settings'], (result) => {
      resolve(result.settings || {
        brokers: [], autoSignals: true, soundAlerts: true,
        trumpAlerts: true, breakingNewsAlerts: true,
        defaultPositionSize: 1000, riskPerTrade: 2,
        theme: 'dark', refreshInterval: 30,
      });
    });
  });
}

// === FETCH PRICE DATA ===
async function fetchPriceData(ticker: TickerData): Promise<TickerData | null> {
  if (!settings) return null;

  // Try Alpaca for stocks
  const alpaca = settings.brokers.find(b => b.id === 'alpaca' && b.enabled && b.apiKey);
  if (alpaca && ticker.assetClass === 'STOCK') {
    const bars = await fetchAlpacaBars(ticker.symbol, alpaca.apiKey!, alpaca.apiSecret!);
    if (bars.length > 0) {
      const latestBar = bars[bars.length - 1];
      priceHistory = bars.map((b: any) => b.c);
      volumeHistory = bars.map((b: any) => b.v);
      return {
        ...ticker,
        price: latestBar.c,
        open: latestBar.o,
        high: Math.max(...bars.map((b: any) => b.h)),
        low: Math.min(...bars.map((b: any) => b.l)),
        volume: bars.reduce((sum: number, b: any) => sum + b.v, 0),
        change: latestBar.c - bars[0].o,
        changePct: ((latestBar.c - bars[0].o) / bars[0].o) * 100,
        timestamp: Date.now(),
      };
    }
  }

  // Try Polygon
  if (settings.polygonApiKey && ticker.assetClass === 'STOCK') {
    const data = await fetchPolygonPrice(ticker.symbol, settings.polygonApiKey);
    if (data) {
      const newPrice = data.price;
      priceHistory = [...priceHistory.slice(-49), newPrice];
      volumeHistory = [...volumeHistory.slice(-49), data.volume || ticker.volume];
      return { ...ticker, price: newPrice, volume: data.volume || ticker.volume, timestamp: Date.now() };
    }
  }

  // Try CoinGecko for crypto
  const coinId = CRYPTO_MAP[ticker.symbol.toUpperCase()];
  if (coinId && ticker.assetClass === 'CRYPTO') {
    const data = await fetchCoinGeckoPrice(coinId);
    if (data) {
      priceHistory = [...priceHistory.slice(-49), data.price];
      return {
        ...ticker,
        price: data.price,
        change: (data.price * data.change24h) / 100,
        changePct: data.change24h,
        volume: data.volume,
        timestamp: Date.now(),
      };
    }
  }

  return null;
}

// === FETCH NEWS ===
async function fetchNews(symbol: string): Promise<NewsAlert[]> {
  if (!settings?.newsApiKey && !settings?.finnhubApiKey) return [];
  const news: NewsAlert[] = [];

  // Finnhub news
  if (settings.finnhubApiKey) {
    try {
      const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString().split('T')[0];
      const to = new Date().toISOString().split('T')[0];
      const res = await fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${settings.finnhubApiKey}`
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        data.slice(0, 10).forEach((item: any) => {
          const isTrump = /trump|tariff|executive order|white house/i.test(item.headline + item.summary);
          const isBullish = /beat|surge|gain|bull|upgrade|buy|strong|record|rally/i.test(item.headline);
          const isBearish = /miss|fall|bear|downgrade|sell|weak|loss|drop|cut|tariff|sanction/i.test(item.headline);
          news.push({
            id: `fh_${item.id}`,
            title: item.headline,
            summary: item.summary || item.headline,
            source: item.source,
            url: item.url,
            sentiment: isBullish && !isBearish ? 'BULLISH' : isBearish && !isBullish ? 'BEARISH' : 'NEUTRAL',
            impactScore: isTrump ? 85 : 50,
            relatedTickers: [symbol],
            timestamp: item.datetime * 1000,
            isTrump,
            isBreaking: isTrump || /breaking|alert|urgent/i.test(item.headline),
          });
        });
      }
    } catch {}
  }

  // NewsAPI general market news
  if (settings.newsApiKey) {
    try {
      const query = encodeURIComponent(`${symbol} stock OR ${symbol} market`);
      const res = await fetch(
        `https://newsapi.org/v2/everything?q=${query}&sortBy=publishedAt&pageSize=5&apiKey=${settings.newsApiKey}`
      );
      const data = await res.json();
      if (data.articles) {
        data.articles.forEach((item: any, i: number) => {
          const isTrump = /trump|tariff|executive order|white house/i.test(item.title + item.description);
          const isBullish = /beat|surge|gain|bull|upgrade|buy|strong|record|rally/i.test(item.title);
          const isBearish = /miss|fall|bear|downgrade|sell|weak|loss|drop|cut/i.test(item.title);
          news.push({
            id: `na_${i}_${Date.now()}`,
            title: item.title,
            summary: item.description || item.title,
            source: item.source?.name || 'NewsAPI',
            url: item.url,
            sentiment: isBullish && !isBearish ? 'BULLISH' : isBearish && !isBullish ? 'BEARISH' : 'NEUTRAL',
            impactScore: isTrump ? 90 : 40,
            relatedTickers: [symbol],
            timestamp: new Date(item.publishedAt).getTime(),
            isTrump,
            isBreaking: isTrump,
          });
        });
      }
    } catch {}
  }

  return news.sort((a, b) => b.timestamp - a.timestamp);
}

// === WEBSOCKET CONNECTION ===
function connectWebSocket() {
  // Connect to backend server for real-time signal broadcasting
  try {
    wsConnection = new WebSocket('ws://localhost:3001');
    wsConnection.onopen = () => {
      chrome.runtime.sendMessage({ type: 'WS_STATUS', connected: true });
      broadcastToSidePanel({ type: 'WS_STATUS', connected: true });
    };
    wsConnection.onclose = () => {
      chrome.runtime.sendMessage({ type: 'WS_STATUS', connected: false });
      broadcastToSidePanel({ type: 'WS_STATUS', connected: false });
      // Reconnect after 5 seconds
      setTimeout(connectWebSocket, 5000);
    };
    wsConnection.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // Forward real-time signals from server to side panel
        if (msg.type === 'SIGNAL_UPDATE' || msg.type === 'NEWS_ALERT') {
          broadcastToSidePanel(msg);
        }
      } catch {}
    };
  } catch {}
}

// === BROADCAST TO ALL EXTENSION VIEWS ===
function broadcastToSidePanel(message: any) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

// === MAIN POLL LOOP ===
async function pollData() {
  if (!currentTicker || !settings) return;

  const updated = await fetchPriceData(currentTicker);
  if (updated) {
    currentTicker = updated;
    broadcastToSidePanel({ type: 'TICKER_UPDATE', data: updated });
  }

  // Auto-generate signal
  if (settings.autoSignals && priceHistory.length > 0) {
    const news = await fetchNews(currentTicker.symbol);
    recentNews = news;
    const signal = generateSignal(currentTicker, priceHistory, volumeHistory, news);
    broadcastToSidePanel({ type: 'SIGNAL_UPDATE', data: signal });

    // Alert on high-impact news
    const breaking = news.filter(n => n.isBreaking || n.isTrump);
    breaking.forEach(n => {
      if (settings?.trumpAlerts || settings?.breakingNewsAlerts) {
        broadcastToSidePanel({ type: 'NEWS_ALERT', data: n });
        // Chrome notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: n.isTrump ? '🇺🇸 Trump Alert' : '🚨 Breaking News',
          message: n.title.slice(0, 100),
        });
      }
    });
  }
}

// === MESSAGE HANDLER ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'TICKER_DETECTED') {
      currentTicker = message.data;
      settings = await loadSettings();
      broadcastToSidePanel({ type: 'TICKER_UPDATE', data: currentTicker });
      broadcastToSidePanel({ type: 'PLATFORM_DETECTED', platform: message.data.platform });

      // Start polling
      if (pollInterval) clearInterval(pollInterval);
      const interval = (settings.refreshInterval || 30) * 1000;
      pollInterval = setInterval(pollData, interval);
      await pollData(); // Immediate first poll
    }

    if (message.type === 'REQUEST_SIGNAL') {
      if (currentTicker) {
        const ticker = message.ticker || currentTicker;
        const news = await fetchNews(ticker.symbol);
        const signal = generateSignal(ticker, priceHistory, volumeHistory, news);
        broadcastToSidePanel({ type: 'SIGNAL_UPDATE', data: signal });
        sendResponse(signal);
      }
    }

    if (message.type === 'PLACE_ORDER') {
      settings = await loadSettings();
      const order: TradeOrder = message.order;
      const brokerConfig = settings.brokers.find(b => b.id === order.broker && b.enabled);
      if (!brokerConfig) {
        sendResponse({ success: false, message: 'Broker not configured or not enabled' });
        return;
      }
      const result = await executeTrade(brokerConfig, order);
      sendResponse(result);
    }

    if (message.type === 'GET_STATE') {
      sendResponse({ ticker: currentTicker, news: recentNews });
    }
  })();
  return true; // Keep message channel open for async
});

// === INIT ===
(async () => {
  settings = await loadSettings();
  connectWebSocket();
  // Open side panel when extension icon is clicked
  chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id! });
  });
})();
