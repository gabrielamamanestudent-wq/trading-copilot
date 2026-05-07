import type { TickerData } from '../types';

function extractRobinhoodData(): TickerData | null {
  try {
    // Robinhood DOM structure
    const symbolEl =
      document.querySelector('[class*="InstrumentHeader"] h1') ||
      document.querySelector('[data-testid="instrument-name"]') ||
      document.querySelector('h1[class*="header"]');

    // Price displayed prominently
    const priceEl =
      document.querySelector('[class*="MarketPrice"] [class*="price"]') ||
      document.querySelector('[data-testid="price"]') ||
      document.querySelector('[class*="bid-price"]') ||
      document.querySelector('span[aria-label*="price"]');

    // Change percent
    const changeEl =
      document.querySelector('[class*="ChangePercent"]') ||
      document.querySelector('[data-testid="change-percent"]') ||
      document.querySelector('[class*="percentChange"]');

    // Get symbol from URL: robinhood.com/stocks/AAPL or /crypto/BTC
    const urlMatch = window.location.pathname.match(/\/(stocks|crypto|options|etfs?)\/([A-Z0-9]+)/i);
    const urlSymbol = urlMatch ? urlMatch[2].toUpperCase() : '';
    const assetType = urlMatch ? urlMatch[1].toLowerCase() : '';

    const rawSymbol = (symbolEl?.textContent?.trim() || urlSymbol || '').split(' ')[0].toUpperCase();
    if (!rawSymbol || rawSymbol.length > 10) return null;

    const rawPrice = priceEl?.textContent?.trim().replace(/[^0-9.]/g, '') || '0';
    const price = parseFloat(rawPrice) || 0;

    const rawChange = changeEl?.textContent?.trim() || '0%';
    const changePct = parseFloat(rawChange.replace(/[^0-9.-]/g, '')) || 0;
    const isNeg = rawChange.includes('-') || rawChange.includes('−') || rawChange.includes('▼');
    const finalChangePct = isNeg ? -Math.abs(changePct) : changePct;

    const assetClass =
      assetType === 'crypto' ? 'CRYPTO' :
      assetType === 'options' ? 'OPTIONS' :
      'STOCK';

    return {
      symbol: rawSymbol,
      price,
      change: (price * finalChangePct) / 100,
      changePct: finalChangePct,
      volume: 0,
      high: price * 1.01,
      low: price * 0.99,
      open: price,
      assetClass,
      platform: 'robinhood',
      timestamp: Date.now(),
    };
  } catch (e) {
    console.error('[Trading Co-Pilot] Robinhood extraction error:', e);
    return null;
  }
}

let lastSymbol = '';
function checkAndSend() {
  const data = extractRobinhoodData();
  if (data && data.symbol && data.symbol !== lastSymbol) {
    lastSymbol = data.symbol;
    chrome.runtime.sendMessage({ type: 'TICKER_DETECTED', data });
  }
}

const observer = new MutationObserver(() => checkAndSend());
observer.observe(document.body, { childList: true, subtree: true });
checkAndSend();
setInterval(() => {
  const data = extractRobinhoodData();
  if (data && data.symbol) chrome.runtime.sendMessage({ type: 'TICKER_DETECTED', data });
}, 5000);

console.log('[Trading Co-Pilot] Robinhood reader active ✓');
