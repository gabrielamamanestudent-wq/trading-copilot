// TradingView content script — extracts ticker, price, change from DOM
import type { TickerData } from '../types';

function extractTradingViewData(): TickerData | null {
  try {
    // TradingView DOM selectors (updated for 2024/2025 layout)
    const symbolEl =
      document.querySelector('[class*="symbol-short"]') ||
      document.querySelector('[data-name="legend-series-item"] [class*="title"]') ||
      document.querySelector('.chart-markup-table .pane-legend-title__description') ||
      document.querySelector('[class*="symbolTitle"]') ||
      document.querySelector('title');

    const priceEl =
      document.querySelector('[class*="last-price"]') ||
      document.querySelector('[data-field="last_price"]') ||
      document.querySelector('.chart-markup-table [class*="price-axis__last"]') ||
      document.querySelector('[class*="priceWrapper"] [class*="value"]');

    const changeEl =
      document.querySelector('[class*="change-percent"]') ||
      document.querySelector('[data-field="change_percent"]') ||
      document.querySelector('[class*="changePercent"]');

    // Extract symbol from URL if DOM fails
    const urlMatch = window.location.pathname.match(/\/chart\/[^/]+\/([A-Z0-9]+)/i) ||
      window.location.search.match(/symbol=([A-Z0-9:]+)/i);
    const urlSymbol = urlMatch ? urlMatch[1].replace(/.*:/, '') : null;

    const rawSymbol = (symbolEl?.textContent?.trim() || urlSymbol || '').toUpperCase().replace(/.*:/, '');
    if (!rawSymbol || rawSymbol.length > 10) return null;

    const rawPrice = priceEl?.textContent?.trim().replace(/[^0-9.]/g, '') || '0';
    const price = parseFloat(rawPrice) || 0;

    const rawChange = changeEl?.textContent?.trim() || '0%';
    const changePct = parseFloat(rawChange.replace(/[^0-9.-]/g, '')) || 0;
    const isNeg = rawChange.includes('−') || rawChange.includes('-');
    const finalChangePct = isNeg ? -Math.abs(changePct) : changePct;

    // Try to get OHLCV from legend
    const legendValues = document.querySelectorAll('[class*="legendMainSourceWrapper"] [class*="value"]');
    let open = 0, high = 0, low = 0, volume = 0;
    if (legendValues.length >= 4) {
      const vals = Array.from(legendValues).map(el => parseFloat(el.textContent?.replace(/[^0-9.]/g, '') || '0'));
      [open, high, low] = vals;
      volume = vals[4] || 0;
    }

    // Detect asset class
    const path = window.location.pathname.toLowerCase();
    const assetClass =
      path.includes('forex') || path.includes('fx') ? 'FOREX' :
      path.includes('futures') || path.includes('cme') ? 'FUTURES' :
      path.includes('crypto') || ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'].includes(rawSymbol) ? 'CRYPTO' :
      'STOCK';

    return {
      symbol: rawSymbol,
      price: price || 0,
      change: (price * finalChangePct) / 100,
      changePct: finalChangePct,
      volume: volume || 0,
      high: high || price * 1.01,
      low: low || price * 0.99,
      open: open || price,
      assetClass,
      platform: 'tradingview',
      timestamp: Date.now(),
    };
  } catch (e) {
    console.error('[Trading Co-Pilot] TradingView extraction error:', e);
    return null;
  }
}

function sendTickerUpdate(data: TickerData) {
  chrome.runtime.sendMessage({ type: 'TICKER_DETECTED', data });
}

// Initial extraction
let lastSymbol = '';
function checkAndSend() {
  const data = extractTradingViewData();
  if (data && data.symbol && data.symbol !== lastSymbol) {
    lastSymbol = data.symbol;
    sendTickerUpdate(data);
  }
}

// Watch for DOM changes (TradingView is a SPA)
const observer = new MutationObserver(() => checkAndSend());
observer.observe(document.body, { childList: true, subtree: true });
checkAndSend();

// Poll every 5 seconds for price updates
setInterval(() => {
  const data = extractTradingViewData();
  if (data && data.symbol) sendTickerUpdate(data);
}, 5000);

console.log('[Trading Co-Pilot] TradingView reader active ✓');
