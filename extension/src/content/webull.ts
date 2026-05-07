import type { TickerData } from '../types';

function extractWebullData(): TickerData | null {
  try {
    // Webull DOM
    const symbolEl =
      document.querySelector('.quotehead-ticker-name') ||
      document.querySelector('[class*="ticker"]') ||
      document.querySelector('h1[class*="symbol"]');

    const priceEl =
      document.querySelector('.web-quote-body-up .web-rate-main-price') ||
      document.querySelector('.web-quote-body-down .web-rate-main-price') ||
      document.querySelector('[class*="rateMain"]') ||
      document.querySelector('[class*="lastPrice"]');

    const changeEl =
      document.querySelector('[class*="changePercent"]') ||
      document.querySelector('[class*="rateChange"]');

    const urlMatch = window.location.pathname.match(/\/stock\/([A-Z0-9]+)/i) ||
      window.location.pathname.match(/\/us-market\/([A-Z0-9]+)/i);
    const urlSymbol = urlMatch ? urlMatch[1].toUpperCase() : '';

    const rawSymbol = (symbolEl?.textContent?.trim() || urlSymbol || '').split(' ')[0].toUpperCase();
    if (!rawSymbol || rawSymbol.length > 10) return null;

    const rawPrice = priceEl?.textContent?.trim().replace(/[^0-9.]/g, '') || '0';
    const price = parseFloat(rawPrice) || 0;

    const rawChange = changeEl?.textContent?.trim() || '0%';
    const changePct = parseFloat(rawChange.replace(/[^0-9.-]/g, '')) || 0;
    const isNeg = rawChange.includes('-');
    const finalChangePct = isNeg ? -Math.abs(changePct) : changePct;

    return {
      symbol: rawSymbol,
      price,
      change: (price * finalChangePct) / 100,
      changePct: finalChangePct,
      volume: 0,
      high: price * 1.01,
      low: price * 0.99,
      open: price,
      assetClass: 'STOCK',
      platform: 'webull',
      timestamp: Date.now(),
    };
  } catch (e) {
    console.error('[Trading Co-Pilot] Webull extraction error:', e);
    return null;
  }
}

let lastSymbol = '';
function checkAndSend() {
  const data = extractWebullData();
  if (data && data.symbol && data.symbol !== lastSymbol) {
    lastSymbol = data.symbol;
    chrome.runtime.sendMessage({ type: 'TICKER_DETECTED', data });
  }
}

const observer = new MutationObserver(() => checkAndSend());
observer.observe(document.body, { childList: true, subtree: true });
checkAndSend();
setInterval(() => {
  const data = extractWebullData();
  if (data?.symbol) chrome.runtime.sendMessage({ type: 'TICKER_DETECTED', data });
}, 5000);

console.log('[Trading Co-Pilot] Webull reader active ✓');
