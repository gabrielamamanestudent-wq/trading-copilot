// TradingView content script — full upgrade 2025
// Reads: symbol, price, OHLCV, timeframe, indicators, asset class
import type { TickerData } from '../types';

// ── SELECTORS ─────────────────────────────────────────────────────────────
// TradingView uses obfuscated class names — we use multiple fallbacks
const SEL = {
  // Symbol name in header/legend
  symbol: [
    '[data-name="legend-series-item"] [class*="title"]',
    '[class*="paneTitle"] [class*="symbol"]',
    '[class*="symbolTitle"]',
    '[class*="symbol-short"]',
    '[class*="symbol-description"] [class*="symbol"]',
    '.chart-markup-table [class*="legend"] [class*="title"]',
    '[data-symbol]',
  ],
  // Last traded price
  price: [
    '[class*="lastPrice"]',
    '[class*="last-price"]',
    '[data-field="last_price"]',
    '[class*="priceWrapper"] [class*="value"]',
    '[class*="price-axis__last-value"]',
    '[class*="currentPrice"]',
  ],
  // Change percent
  change: [
    '[class*="changePercent"]',
    '[class*="change-percent"]',
    '[data-field="change_percent"]',
    '[class*="percentChange"]',
  ],
  // OHLCV from legend bar
  ohlcv: [
    '[class*="legendMainSourceWrapper"] [class*="value"]',
    '[class*="legend-series-item"] [class*="value"]',
    '[data-name="legend-series-item"] [class*="valueItem"]',
  ],
  // Active timeframe button
  timeframe: [
    '[class*="interval-dialog"] [class*="active"]',
    '[class*="intervalButton"][class*="isActive"]',
    '[data-active="true"][class*="button"][class*="interval"]',
    '[class*="timeframeButton"][aria-pressed="true"]',
    '[class*="toolbar"] [class*="active"][class*="interval"]',
  ],
  // Indicators on chart
  indicators: [
    '[data-name="legend-series-item"] [class*="title"]',
    '[class*="pane-legend"] [class*="title"]',
  ],
};

function trySelectors(selectors: string[]): Element | null {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) return el;
    } catch {}
  }
  return null;
}

function trySelectorsAll(selectors: string[]): Element[] {
  for (const sel of selectors) {
    try {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) return Array.from(els);
    } catch {}
  }
  return [];
}

// ── SYMBOL EXTRACTION ─────────────────────────────────────────────────────
function extractSymbol(): string {
  // 1. Try DOM
  const el = trySelectors(SEL.symbol);
  if (el) {
    const text = el.textContent?.trim().replace(/[^A-Z0-9./-]/gi, '').toUpperCase() || '';
    if (text.length >= 1 && text.length <= 12) return text.replace(/.*[:/]/, '');
  }

  // 2. Try data-symbol attribute
  const dsEl = document.querySelector('[data-symbol]');
  if (dsEl) {
    const sym = dsEl.getAttribute('data-symbol') || '';
    if (sym) return sym.replace(/.*:/, '').toUpperCase();
  }

  // 3. Try page title — "AAPL • 182.63 — TradingView"
  const titleMatch = document.title.match(/^([A-Z0-9.]{1,10})\s*[•·\-]/);
  if (titleMatch) return titleMatch[1];

  // 4. Try URL — /chart/XXXXX/?symbol=NASDAQ:AAPL
  const urlSearch = new URLSearchParams(window.location.search);
  const urlSymbol = urlSearch.get('symbol') || '';
  if (urlSymbol) return urlSymbol.replace(/.*:/, '').toUpperCase();

  // 5. Try path
  const pathMatch = window.location.pathname.match(/\/symbols\/([A-Z0-9]+)/i);
  if (pathMatch) return pathMatch[1].toUpperCase();

  return '';
}

// ── PRICE EXTRACTION ──────────────────────────────────────────────────────
function extractPrice(): number {
  const el = trySelectors(SEL.price);
  if (el) {
    const raw = el.textContent?.replace(/[^0-9.]/g, '') || '';
    const val = parseFloat(raw);
    if (val > 0) return val;
  }
  // Try from title: "AAPL • 182.63"
  const titleMatch = document.title.match(/[•·]\s*([\d,]+\.?\d*)/);
  if (titleMatch) return parseFloat(titleMatch[1].replace(',', ''));
  return 0;
}

// ── CHANGE EXTRACTION ─────────────────────────────────────────────────────
function extractChange(): number {
  const el = trySelectors(SEL.change);
  if (!el) return 0;
  const text = el.textContent?.trim() || '';
  const val = parseFloat(text.replace(/[^0-9.-]/g, '')) || 0;
  const isNeg = text.includes('−') || text.includes('-') || text.includes('▼');
  return isNeg ? -Math.abs(val) : val;
}

// ── OHLCV EXTRACTION ──────────────────────────────────────────────────────
function extractOHLCV(price: number): { open: number; high: number; low: number; volume: number } {
  const els = trySelectorsAll(SEL.ohlcv);
  if (els.length >= 4) {
    const vals = els.map(el => {
      const raw = el.textContent?.trim().replace(/[^0-9.KMB]/g, '') || '0';
      // Handle volume like "1.2M" or "450K"
      if (raw.endsWith('M')) return parseFloat(raw) * 1_000_000;
      if (raw.endsWith('K')) return parseFloat(raw) * 1_000;
      if (raw.endsWith('B')) return parseFloat(raw) * 1_000_000_000;
      return parseFloat(raw) || 0;
    });
    return {
      open:   vals[0] || price,
      high:   vals[1] || price * 1.01,
      low:    vals[2] || price * 0.99,
      volume: vals[4] || vals[3] || 0,
    };
  }
  return { open: price, high: price * 1.01, low: price * 0.99, volume: 0 };
}

// ── TIMEFRAME EXTRACTION ──────────────────────────────────────────────────
function extractTimeframe(): string {
  // Try active button
  const el = trySelectors(SEL.timeframe);
  if (el) {
    const text = el.textContent?.trim() || '';
    if (text) return text;
  }

  // Try all interval buttons and find active one
  const allBtns = document.querySelectorAll('[class*="interval"], [class*="timeframe"]');
  for (const btn of allBtns) {
    const isActive = btn.classList.toString().includes('active') ||
      btn.getAttribute('aria-pressed') === 'true' ||
      btn.getAttribute('data-active') === 'true';
    if (isActive) {
      const text = btn.textContent?.trim();
      if (text && text.length <= 4) return text;
    }
  }
  return '15m';
}

// ── ASSET CLASS DETECTION ─────────────────────────────────────────────────
const CRYPTO_SYMBOLS = new Set([
  'BTC','ETH','SOL','XRP','DOGE','ADA','AVAX','DOT','MATIC','LINK',
  'UNI','ATOM','LTC','BCH','ALGO','NEAR','FTM','SAND','MANA','APE',
  'BNB','SHIB','PEPE','ARB','OP',
]);

function detectAssetClass(symbol: string): 'STOCK' | 'CRYPTO' | 'FUTURES' | 'FOREX' | 'OPTIONS' {
  if (CRYPTO_SYMBOLS.has(symbol)) return 'CRYPTO';
  const path = window.location.href.toLowerCase();
  if (path.includes('forex') || path.includes(':eurusd') || path.includes(':gbpusd')) return 'FOREX';
  if (path.includes('futures') || path.includes(':es1!') || path.includes(':nq1!') || symbol.endsWith('1!')) return 'FUTURES';
  if (path.includes('crypto') || path.includes('coinbase') || path.includes('binance')) return 'CRYPTO';
  return 'STOCK';
}

// ── ACTIVE INDICATORS ─────────────────────────────────────────────────────
function extractIndicators(): string[] {
  const indicators: string[] = [];
  const els = trySelectorsAll(SEL.indicators);
  const knownIndicators = ['RSI','MACD','EMA','SMA','BB','VWAP','ATR','ADX','OBV','Stoch'];
  els.forEach(el => {
    const text = el.textContent?.trim() || '';
    knownIndicators.forEach(ind => {
      if (text.toUpperCase().includes(ind) && !indicators.includes(ind)) {
        indicators.push(ind);
      }
    });
  });
  return indicators;
}

// ── OVERLAY BADGE ─────────────────────────────────────────────────────────
function injectOverlayBadge(symbol: string, price: number) {
  const existing = document.getElementById('copilot-badge');
  if (existing) { existing.remove(); }

  const badge = document.createElement('div');
  badge.id = 'copilot-badge';
  badge.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(10, 14, 26, 0.92);
    border: 1px solid #4f8ef7;
    border-radius: 8px;
    padding: 6px 12px;
    font-family: -apple-system, sans-serif;
    font-size: 12px;
    color: #e2e8f0;
    z-index: 99999;
    display: flex;
    align-items: center;
    gap: 8px;
    backdrop-filter: blur(8px);
    pointer-events: none;
  `;
  badge.innerHTML = `⚡ <strong style="color:#4f8ef7">${symbol}</strong> <span style="color:#00d4aa">$${price.toFixed(2)}</span> <span style="color:#475569;font-size:10px">Co-Pilot Active</span>`;
  document.body.appendChild(badge);
  setTimeout(() => badge?.remove(), 3000);
}

// ── MAIN EXTRACTION ───────────────────────────────────────────────────────
function extractTradingViewData(): TickerData | null {
  try {
    const symbol = extractSymbol();
    if (!symbol || symbol.length > 12) return null;

    const price     = extractPrice();
    const changePct = extractChange();
    const ohlcv     = extractOHLCV(price);
    const assetClass = detectAssetClass(symbol);

    return {
      symbol,
      price,
      change:    (price * changePct) / 100,
      changePct,
      volume:    ohlcv.volume,
      high:      ohlcv.high,
      low:       ohlcv.low,
      open:      ohlcv.open,
      assetClass,
      platform:  'tradingview',
      timestamp: Date.now(),
    };
  } catch (e) {
    console.error('[Co-Pilot] TradingView extraction error:', e);
    return null;
  }
}

// ── SEND TO BACKGROUND ────────────────────────────────────────────────────
let lastSymbol = '';
let lastPrice  = 0;

function checkAndSend() {
  const data = extractTradingViewData();
  if (!data?.symbol) return;

  const timeframe  = extractTimeframe();
  const indicators = extractIndicators();
  const symbolChanged = data.symbol !== lastSymbol;
  const priceChanged  = Math.abs(data.price - lastPrice) > 0.001;

  if (symbolChanged || priceChanged) {
    lastSymbol = data.symbol;
    lastPrice  = data.price;

    chrome.runtime.sendMessage({
      type: 'TICKER_DETECTED',
      data: { ...data, timeframe, indicators },
    });

    if (symbolChanged && data.price > 0) {
      injectOverlayBadge(data.symbol, data.price);
    }
  }
}

// ── OBSERVERS & POLLING ───────────────────────────────────────────────────
// Watch for SPA navigation (symbol changes)
const observer = new MutationObserver(() => checkAndSend());
observer.observe(document.body, { childList: true, subtree: true, characterData: true });

// URL change detection (TradingView updates URL on symbol change)
let lastUrl = window.location.href;
setInterval(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    lastSymbol = ''; // Force re-send on URL change
    setTimeout(checkAndSend, 500);
  }
}, 500);

// Price polling every 3 seconds
setInterval(checkAndSend, 3000);

// Initial run
setTimeout(checkAndSend, 1500);

console.log('[⚡ Trading Co-Pilot] TradingView reader v2 active ✓');
