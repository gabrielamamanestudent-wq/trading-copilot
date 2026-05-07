const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('⚠️  Supabase not configured — signals/trades will not be persisted.');
  console.warn('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env');
}

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// ── SIGNALS ──────────────────────────────────────────────────────────────
async function saveSignal(signal, userId = null) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('signals').insert({
    user_id:       userId,
    symbol:        signal.symbol,
    signal_type:   signal.signal,
    confidence:    signal.confidence,
    entry_price:   signal.entryPrice,
    target_price:  signal.targetPrice,
    stop_loss:     signal.stopLoss,
    risk_reward:   signal.riskReward,
    reasoning:     signal.reasoning,
    timeframe:     signal.timeframe,
    asset_class:   signal.assetClass,
    rsi:           signal.technical?.rsi,
    macd_histogram: signal.technical?.macd?.histogram,
    ema20:         signal.technical?.ema20,
    ema50:         signal.technical?.ema50,
    volume_ratio:  signal.technical?.volumeRatio,
    outcome:       'OPEN',
  }).select().single();
  if (error) console.error('Supabase saveSignal:', error.message);
  return data;
}

async function getRecentSignals(symbol, limit = 20) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('symbol', symbol)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) console.error('Supabase getRecentSignals:', error.message);
  return data || [];
}

async function updateSignalOutcome(signalId, outcome, outcomePrice) {
  if (!supabase) return;
  const { error } = await supabase.from('signals').update({
    outcome,
    outcome_price: outcomePrice,
    outcome_pct:   null, // calculated on client or via trigger
  }).eq('id', signalId);
  if (error) console.error('Supabase updateSignalOutcome:', error.message);
}

// ── NEWS ─────────────────────────────────────────────────────────────────
async function saveNewsAlert(news) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('news_alerts').upsert({
    external_id:     news.id,
    title:           news.title,
    summary:         news.summary,
    source:          news.source,
    url:             news.url,
    sentiment:       news.sentiment,
    impact_score:    news.impactScore,
    related_tickers: news.relatedTickers || [],
    is_trump:        news.isTrump || false,
    is_breaking:     news.isBreaking || false,
    published_at:    new Date(news.timestamp).toISOString(),
  }, { onConflict: 'external_id' }).select().single();
  if (error) console.error('Supabase saveNewsAlert:', error.message);
  return data;
}

async function getRecentNews(limit = 50, trumpOnly = false) {
  if (!supabase) return [];
  let query = supabase
    .from('news_alerts')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit);
  if (trumpOnly) query = query.eq('is_trump', true);
  const { data, error } = await query;
  if (error) console.error('Supabase getRecentNews:', error.message);
  return data || [];
}

// ── TRADES ───────────────────────────────────────────────────────────────
async function saveTrade(trade, userId = null) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('trades').insert({
    user_id:         userId,
    signal_id:       trade.signalId || null,
    broker:          trade.broker,
    broker_order_id: trade.orderId,
    symbol:          trade.symbol,
    side:            trade.side,
    qty:             trade.qty,
    order_type:      trade.orderType || 'market',
    filled_price:    trade.filledPrice,
    filled_qty:      trade.qty,
    status:          trade.success ? 'filled' : 'rejected',
    paper_trade:     trade.paperTrade || false,
  }).select().single();
  if (error) console.error('Supabase saveTrade:', error.message);
  return data;
}

async function getTradeHistory(userId, limit = 50) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('trades')
    .select('*, signals(symbol, signal_type, confidence, reasoning)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) console.error('Supabase getTradeHistory:', error.message);
  return data || [];
}

// ── PRICE HISTORY ─────────────────────────────────────────────────────────
async function savePriceBars(symbol, bars, timeframe = '5m') {
  if (!supabase || !bars.length) return;
  const rows = bars.map(b => ({
    symbol,
    timeframe,
    open:      b.o,
    high:      b.h,
    low:       b.l,
    close:     b.c,
    volume:    b.v,
    timestamp: new Date(b.t).toISOString(),
  }));
  const { error } = await supabase.from('price_history')
    .upsert(rows, { onConflict: 'symbol,timeframe,timestamp' });
  if (error) console.error('Supabase savePriceBars:', error.message);
}

async function getPriceHistory(symbol, timeframe = '5m', limit = 100) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('symbol', symbol)
    .eq('timeframe', timeframe)
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) console.error('Supabase getPriceHistory:', error.message);
  return (data || []).reverse();
}

// ── USER SETTINGS ────────────────────────────────────────────────────────
async function getUserSettings(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') console.error('Supabase getUserSettings:', error.message);
  return data;
}

async function upsertUserSettings(userId, settings) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('user_settings').upsert({
    user_id:               userId,
    auto_signals:          settings.autoSignals,
    sound_alerts:          settings.soundAlerts,
    trump_alerts:          settings.trumpAlerts,
    breaking_news_alerts:  settings.breakingNewsAlerts,
    default_position_size: settings.defaultPositionSize,
    risk_per_trade:        settings.riskPerTrade,
    refresh_interval:      settings.refreshInterval,
    theme:                 settings.theme,
  }, { onConflict: 'user_id' }).select().single();
  if (error) console.error('Supabase upsertUserSettings:', error.message);
  return data;
}

// ── REAL-TIME SUBSCRIPTIONS ──────────────────────────────────────────────
function subscribeToNews(callback) {
  if (!supabase) return null;
  return supabase
    .channel('news_alerts_realtime')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'news_alerts',
      filter: 'is_breaking=eq.true',
    }, (payload) => callback(payload.new))
    .subscribe();
}

module.exports = {
  supabase,
  saveSignal,
  getRecentSignals,
  updateSignalOutcome,
  saveNewsAlert,
  getRecentNews,
  saveTrade,
  getTradeHistory,
  savePriceBars,
  getPriceHistory,
  getUserSettings,
  upsertUserSettings,
  subscribeToNews,
};
