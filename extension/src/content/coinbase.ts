import type { TickerData } from '../types';

function extractCoinbaseData(): TickerData | null {
  try {
    // Coinbase Advanced Trade / Pro layout
    const priceEl =
      document.querySelector('[data-testid="asset-price"]') ||
      document.querySelector('[class*="spotPrice"]') ||
      document.querySelector('[class*="currentPrice"]') ||
      document.querySelector('span[class*="price"][class*="label"]');

    const changeEl =
      document.querySelector('[data-testid="price-change-percent"]') ||
      document.querySelector('[class*="priceChange"]') ||
      document.querySelector('[class*="percentChange"]');

    // URL: coinbase.com/advanced-trade/spot/BTC-USD or /price/bitcoin
    const urlMatch =
      window.location.pathname.match(/\/spot\/([A-Z0-9]+-[A-Z0-9]+)/i) ||
      window.location.pathname.match(/\/price\/([a-z-]+)/i);
    const urlSymbol = urlMatch ? urlMatch[1].split('-')[0].toUpperCase() : '';

    // Page title usually has symbol
    const titleMatch = document.title.match(/([A-Z]{2,10})\s*[\/\-]/);
    const titleSymbol = titleMatch ? titleMatch[1] : '';

    const rawSymbol = (urlSymbol || titleSymbol || '').toUpperCase();
    if (!rawSymbol) return null;

    const rawPrice = priceEl?.textContent?.trim().replace(/[^0-9.]/g, '') || '0';
    const price = parseFloat(rawPrice) || 0;

    const rawChange = changeEl?.textContent?.trim() || '0%';
    const changePct = parseFloat(rawChange.replace(/[^0-9.-]/g, '')) || 0;
    const isNeg = rawChange.includes('-') || rawChange.includes('▼');
    const finalChangePct = isNeg ? -Math.abs(changePct) : changePct;

    return {
      symbol: rawSymbol,
      price,
      change: (price * finalChangePct) / 100,
      changePct: finalChangePct,
      volume: 0,
      high: price * 1.02,
      low: price * 0.98,
      open: price,
      assetClass: 'CRYPTO',
      platform: 'coinbase',
      timestamp: Date.now(),
    };
  } catch (e) {
    console.error('[Trading Co-Pilot] Coinbase extraction error:', e);
    return null;
  }
}

let lastSymbol = '';
function checkAndSend() {
  const data = extractCoinbaseData();
  if (data && data.symbol && data.symbol !== lastSymbol) {
    lastSymbol = data.symbol;
    chrome.runtime.sendMessage({ type: 'TICKER_DETECTED', data });
  }
}

const observer = new MutationObserver(() => checkAndSend());
observer.observe(document.body, { childList: true, subtree: true });
checkAndSend();
setInterval(() => {
  const data = extractCoinbaseData();
  if (data?.symbol) chrome.runtime.sendMessage({ type: 'TICKER_DETECTED', data });
}, 5000);

console.log('[Trading Co-Pilot] Coinbase reader active ✓');
