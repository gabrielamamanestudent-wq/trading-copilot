import type { BrokerConfig, TradeOrder, TradeResult } from '../types';

// === ALPACA ===
async function placeAlpacaOrder(config: BrokerConfig, order: TradeOrder): Promise<TradeResult> {
  const baseUrl = config.paperTrading
    ? 'https://paper-api.alpaca.markets/v2'
    : 'https://api.alpaca.markets/v2';

  const body: any = {
    symbol: order.symbol,
    qty: order.qty.toString(),
    side: order.side,
    type: order.orderType,
    time_in_force: order.timeInForce,
  };
  if (order.orderType === 'limit' || order.orderType === 'stop_limit') {
    body.limit_price = order.limitPrice?.toString();
  }
  if (order.orderType === 'stop' || order.orderType === 'stop_limit') {
    body.stop_price = order.stopPrice?.toString();
  }

  try {
    const res = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': config.apiKey!,
        'APCA-API-SECRET-KEY': config.apiSecret!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, message: data.message || 'Alpaca order failed', broker: 'alpaca' };
    }
    return {
      success: true,
      orderId: data.id,
      message: `Order placed: ${order.side.toUpperCase()} ${order.qty} ${order.symbol} @ market ${config.paperTrading ? '(Paper)' : ''}`,
      broker: 'alpaca',
      filledPrice: data.filled_avg_price ? parseFloat(data.filled_avg_price) : undefined,
    };
  } catch (e: any) {
    return { success: false, message: `Network error: ${e.message}`, broker: 'alpaca' };
  }
}

// === COINBASE ADVANCED TRADE ===
async function placeCoinbaseOrder(config: BrokerConfig, order: TradeOrder): Promise<TradeResult> {
  const productId = order.symbol.includes('-') ? order.symbol : `${order.symbol}-USD`;
  const body: any = {
    client_order_id: `copilot_${Date.now()}`,
    product_id: productId,
    side: order.side.toUpperCase(),
    order_configuration: {
      market_market_ioc: {
        [order.side === 'buy' ? 'quote_size' : 'base_size']: order.qty.toString(),
      },
    },
  };

  try {
    const res = await fetch('https://api.coinbase.com/api/v3/brokerage/orders', {
      method: 'POST',
      headers: {
        'CB-ACCESS-KEY': config.apiKey!,
        'CB-ACCESS-SECRET': config.apiSecret!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, message: data.error_response?.message || 'Coinbase order failed', broker: 'coinbase' };
    }
    return {
      success: true,
      orderId: data.success_response?.order_id,
      message: `Order placed: ${order.side.toUpperCase()} ${order.qty} ${productId}`,
      broker: 'coinbase',
    };
  } catch (e: any) {
    return { success: false, message: `Network error: ${e.message}`, broker: 'coinbase' };
  }
}

// === INTERACTIVE BROKERS (Client Portal API) ===
async function placeIBKROrder(config: BrokerConfig, order: TradeOrder): Promise<TradeResult> {
  // IBKR Client Portal runs locally on port 5000
  const body = [{
    acctId: config.accountId,
    conid: 0, // Would need conid lookup
    orderType: order.orderType.toUpperCase(),
    side: order.side === 'buy' ? 'BUY' : 'SELL',
    quantity: order.qty,
    tif: order.timeInForce.toUpperCase(),
    price: order.limitPrice,
  }];

  try {
    const res = await fetch(`${config.baseUrl}/v1/api/iserver/account/${config.accountId}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders: body }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, message: 'IBKR order failed — ensure TWS/Gateway is running', broker: 'ibkr' };
    }
    return {
      success: true,
      orderId: data[0]?.order_id?.toString(),
      message: `IBKR order submitted: ${order.side.toUpperCase()} ${order.qty} ${order.symbol}`,
      broker: 'ibkr',
    };
  } catch (e: any) {
    return {
      success: false,
      message: 'IBKR: Cannot connect. Make sure Client Portal Gateway is running on localhost:5000',
      broker: 'ibkr'
    };
  }
}

// === TD AMERITRADE / SCHWAB ===
async function placeTDOrder(config: BrokerConfig, order: TradeOrder): Promise<TradeResult> {
  const body = {
    orderType: order.orderType.toUpperCase(),
    session: 'NORMAL',
    duration: order.timeInForce === 'gtc' ? 'GOOD_TILL_CANCEL' : 'DAY',
    orderStrategyType: 'SINGLE',
    orderLegCollection: [{
      instruction: order.side === 'buy' ? 'BUY' : 'SELL',
      quantity: order.qty,
      instrument: { symbol: order.symbol, assetType: 'EQUITY' },
    }],
  };

  try {
    const res = await fetch(`${config.baseUrl}/accounts/${config.accountId}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, message: `TD Ameritrade error: ${text}`, broker: 'tdameritrade' };
    }
    return {
      success: true,
      message: `TD Ameritrade order placed: ${order.side.toUpperCase()} ${order.qty} ${order.symbol}`,
      broker: 'tdameritrade',
    };
  } catch (e: any) {
    return { success: false, message: `Network error: ${e.message}`, broker: 'tdameritrade' };
  }
}

// === DISPATCH ===
export async function executeTrade(config: BrokerConfig, order: TradeOrder): Promise<TradeResult> {
  if (!config.apiKey) {
    return { success: false, message: 'No API key configured for this broker', broker: config.id };
  }
  switch (config.id) {
    case 'alpaca': return placeAlpacaOrder(config, order);
    case 'coinbase': return placeCoinbaseOrder(config, order);
    case 'ibkr': return placeIBKROrder(config, order);
    case 'tdameritrade': return placeTDOrder(config, order);
    default:
      return { success: false, message: `${config.name} integration coming soon`, broker: config.id };
  }
}

// === PRICE DATA ===
export async function fetchAlpacaPrice(symbol: string, apiKey: string, apiSecret: string) {
  try {
    const res = await fetch(`https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`, {
      headers: { 'APCA-API-KEY-ID': apiKey, 'APCA-API-SECRET-KEY': apiSecret },
    });
    const data = await res.json();
    return data.quote ? {
      price: (data.quote.ap + data.quote.bp) / 2,
      bid: data.quote.bp,
      ask: data.quote.ap,
    } : null;
  } catch { return null; }
}

export async function fetchAlpacaBars(symbol: string, apiKey: string, apiSecret: string, limit = 50) {
  try {
    const end = new Date().toISOString();
    const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=5Min&start=${start}&end=${end}&limit=${limit}`,
      { headers: { 'APCA-API-KEY-ID': apiKey, 'APCA-API-SECRET-KEY': apiSecret } }
    );
    const data = await res.json();
    return data.bars || [];
  } catch { return []; }
}

export async function fetchPolygonPrice(symbol: string, apiKey: string) {
  try {
    const res = await fetch(
      `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${apiKey}`
    );
    const data = await res.json();
    return data.results ? { price: data.results.p, volume: data.results.s } : null;
  } catch { return null; }
}

export async function fetchCoinGeckoPrice(coinId: string) {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`
    );
    const data = await res.json();
    const coin = data[coinId];
    return coin ? { price: coin.usd, change24h: coin.usd_24h_change, volume: coin.usd_24h_vol } : null;
  } catch { return null; }
}
