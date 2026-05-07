require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fetch = require('node-fetch');
const db = require('./supabase');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// === TRACKED TICKERS (per connected client) ===
const clientTickers = new Map(); // socketId -> symbol[]
let globalNews = [];
let lastTrumpCheckTime = 0;

// === FINNHUB WEBSOCKET (real-time trades) ===
const { WebSocket } = require('ws');
let finnhubWs = null;
const subscribedSymbols = new Set();

function connectFinnhub() {
  if (!process.env.FINNHUB_API_KEY) return;
  finnhubWs = new WebSocket(`wss://ws.finnhub.io?token=${process.env.FINNHUB_API_KEY}`);

  finnhubWs.on('open', () => {
    console.log('✅ Finnhub WS connected');
    subscribedSymbols.forEach(sym => {
      finnhubWs.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
    });
  });

  finnhubWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'trade' && msg.data) {
        msg.data.forEach(trade => {
          io.emit('PRICE_UPDATE', {
            symbol: trade.s,
            price: trade.p,
            volume: trade.v,
            timestamp: trade.t,
          });
        });
      }
    } catch {}
  });

  finnhubWs.on('close', () => {
    console.log('Finnhub WS closed, reconnecting in 5s...');
    setTimeout(connectFinnhub, 5000);
  });

  finnhubWs.on('error', (err) => {
    console.error('Finnhub WS error:', err.message);
  });
}

function subscribeFinnhub(symbol) {
  if (subscribedSymbols.has(symbol)) return;
  subscribedSymbols.add(symbol);
  if (finnhubWs?.readyState === WebSocket.OPEN) {
    finnhubWs.send(JSON.stringify({ type: 'subscribe', symbol }));
    console.log(`📊 Subscribed to ${symbol}`);
  }
}

// === NEWS FETCHER ===
async function fetchBreakingNews(symbol) {
  const news = [];

  if (process.env.FINNHUB_API_KEY) {
    try {
      const from = new Date(Date.now() - 4 * 3600 * 1000).toISOString().split('T')[0];
      const to = new Date().toISOString().split('T')[0];
      const res = await fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${process.env.FINNHUB_API_KEY}`
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        data.slice(0, 5).forEach(item => {
          const isTrump = /trump|tariff|executive order|white house|oval office/i.test(item.headline + item.summary);
          const isBreaking = isTrump || /breaking|alert|urgent|flash/i.test(item.headline);
          const isBullish = /beat|surge|gain|bull|upgrade|buy|strong|record|rally|soar/i.test(item.headline);
          const isBearish = /miss|fall|bear|downgrade|sell|weak|loss|drop|cut|tariff|sanction|crash/i.test(item.headline);

          const newsItem = {
            id: `fh_${item.id}_${Date.now()}`,
            title: item.headline,
            summary: item.summary || item.headline,
            source: item.source,
            url: item.url,
            sentiment: isBullish && !isBearish ? 'BULLISH' : isBearish && !isBullish ? 'BEARISH' : 'NEUTRAL',
            impactScore: isTrump ? 90 : isBreaking ? 75 : 50,
            relatedTickers: [symbol],
            timestamp: item.datetime * 1000,
            isTrump,
            isBreaking,
          };

          news.push(newsItem);

          // Broadcast high-impact news immediately
          if (isBreaking || isTrump) {
            io.emit('NEWS_ALERT', { type: 'NEWS_ALERT', data: newsItem });
            console.log(`🚨 ${isTrump ? 'TRUMP' : 'BREAKING'}: ${item.headline.slice(0, 60)}`);
          }
          // Persist to Supabase
          db.saveNewsAlert(newsItem).catch(() => {});
        });
      }
    } catch (e) {
      console.error('Finnhub news error:', e.message);
    }
  }

  // General market news from NewsAPI
  if (process.env.NEWS_API_KEY) {
    try {
      const query = encodeURIComponent(`${symbol} stock market`);
      const res = await fetch(
        `https://newsapi.org/v2/everything?q=${query}&sortBy=publishedAt&pageSize=3&apiKey=${process.env.NEWS_API_KEY}`
      );
      const data = await res.json();
      if (data.articles) {
        data.articles.forEach((item, i) => {
          const isTrump = /trump|tariff|executive order|white house/i.test(item.title + (item.description || ''));
          const newsItem = {
            id: `na_${i}_${Date.now()}`,
            title: item.title,
            summary: item.description || item.title,
            source: item.source?.name || 'NewsAPI',
            url: item.url,
            sentiment: /surge|gain|bull|rally|beat/i.test(item.title) ? 'BULLISH' :
                       /fall|drop|miss|bear|loss|cut/i.test(item.title) ? 'BEARISH' : 'NEUTRAL',
            impactScore: isTrump ? 90 : 45,
            relatedTickers: [symbol],
            timestamp: new Date(item.publishedAt).getTime(),
            isTrump,
            isBreaking: isTrump,
          };
          news.push(newsItem);
          if (isTrump) {
            io.emit('NEWS_ALERT', { type: 'NEWS_ALERT', data: newsItem });
          }
        });
      }
    } catch (e) {
      console.error('NewsAPI error:', e.message);
    }
  }

  return news;
}

// === MARKET NEWS POLLING (every 2 minutes) ===
async function pollMarketNews() {
  if (subscribedSymbols.size === 0) return;
  const symbols = Array.from(subscribedSymbols).slice(0, 5); // Limit API calls
  for (const symbol of symbols) {
    await fetchBreakingNews(symbol);
    await new Promise(r => setTimeout(r, 500)); // Rate limit
  }
}

// === GENERAL MARKET NEWS (Trump, Fed, macro) ===
async function pollGeneralNews() {
  if (!process.env.NEWS_API_KEY) return;
  const queries = ['trump market', 'federal reserve interest rate', 'stock market today'];

  for (const query of queries) {
    try {
      const res = await fetch(
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=3&language=en&apiKey=${process.env.NEWS_API_KEY}`
      );
      const data = await res.json();
      if (data.articles) {
        data.articles.forEach(item => {
          const isTrump = /trump/i.test(item.title + (item.description || ''));
          const isFed = /federal reserve|fed rate|interest rate|fomc/i.test(item.title);
          const isNew = new Date(item.publishedAt).getTime() > lastTrumpCheckTime;

          if ((isTrump || isFed) && isNew) {
            const newsItem = {
              id: `gen_${Date.now()}_${Math.random()}`,
              title: item.title,
              summary: item.description || item.title,
              source: item.source?.name || 'News',
              url: item.url,
              sentiment: isTrump ? 'BEARISH' : 'NEUTRAL', // Trump news often bearish
              impactScore: 85,
              relatedTickers: ['SPY', 'QQQ', 'DJI'],
              timestamp: new Date(item.publishedAt).getTime(),
              isTrump,
              isBreaking: true,
            };
            io.emit('NEWS_ALERT', { type: 'NEWS_ALERT', data: newsItem });
            console.log(`${isTrump ? '🇺🇸 TRUMP' : '🏦 FED'}: ${item.title.slice(0, 80)}`);
          }
        });
      }
    } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  lastTrumpCheckTime = Date.now();
}

// === SOCKET.IO EVENTS ===
io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);
  clientTickers.set(socket.id, []);

  socket.on('SUBSCRIBE', ({ symbols }) => {
    clientTickers.set(socket.id, symbols);
    symbols.forEach(sym => subscribeFinnhub(sym));
    console.log(`📡 ${socket.id} subscribing to: ${symbols.join(', ')}`);
  });

  socket.on('REQUEST_NEWS', async ({ symbol }) => {
    const news = await fetchBreakingNews(symbol);
    socket.emit('NEWS_FEED', news);
  });

  socket.on('disconnect', () => {
    clientTickers.delete(socket.id);
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// === REST ENDPOINTS ===
app.get('/health', (req, res) => res.json({ status: 'ok', clients: io.engine.clientsCount }));

app.get('/news/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  // Try Supabase cache first, fall back to live fetch
  const cached = await db.getRecentNews(20);
  if (cached.length > 0) return res.json(cached);
  const news = await fetchBreakingNews(symbol);
  res.json(news);
});

app.get('/market-news', async (req, res) => {
  const trump = req.query.trump === 'true';
  const fromDb = await db.getRecentNews(50, trump);
  res.json(fromDb.length > 0 ? fromDb : globalNews.slice(0, 20));
});

// Signal history endpoint
app.get('/signals/:symbol', async (req, res) => {
  const signals = await db.getRecentSignals(req.params.symbol.toUpperCase());
  res.json(signals);
});

// Save signal from extension
app.post('/signals', async (req, res) => {
  const { signal, userId } = req.body;
  const saved = await db.saveSignal(signal, userId);
  res.json(saved || { ok: true });
});

// Save trade execution
app.post('/trades', async (req, res) => {
  const { trade, userId } = req.body;
  const saved = await db.saveTrade(trade, userId);
  res.json(saved || { ok: true });
});

// Price history
app.get('/prices/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = '5m', limit = '100' } = req.query;
  const prices = await db.getPriceHistory(symbol, timeframe, parseInt(limit));
  res.json(prices);
});

// === START SERVER ===
connectFinnhub();
setInterval(pollMarketNews, 2 * 60 * 1000);     // Every 2 min
setInterval(pollGeneralNews, 3 * 60 * 1000);    // Every 3 min
pollGeneralNews(); // Initial check

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🚀 Trading Co-Pilot Backend          ║
║   Port: ${PORT}                           ║
║   WebSocket: ws://localhost:${PORT}       ║
║   Health: http://localhost:${PORT}/health ║
╚════════════════════════════════════════╝
  `);
});
