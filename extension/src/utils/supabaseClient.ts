import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { TradeSignal, TradeOrder, TradeResult, AppSettings } from '../types';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  // Keys stored in extension storage (user sets them in settings)
  return null;
}

export async function initSupabase(): Promise<SupabaseClient | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['supabaseUrl', 'supabaseAnonKey'], (result) => {
      if (result.supabaseUrl && result.supabaseAnonKey) {
        client = createClient(result.supabaseUrl, result.supabaseAnonKey);
        resolve(client);
      } else {
        resolve(null);
      }
    });
  });
}

// ── AUTH ────────────────────────────────────────────────────────────────────
export async function signInWithEmail(email: string, password: string) {
  const sb = await initSupabase();
  if (!sb) return { error: 'Supabase not configured' };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signUpWithEmail(email: string, password: string) {
  const sb = await initSupabase();
  if (!sb) return { error: 'Supabase not configured' };
  const { data, error } = await sb.auth.signUp({ email, password });
  return { data, error };
}

export async function getSession() {
  const sb = await initSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function signOut() {
  const sb = await initSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

// ── SIGNALS ─────────────────────────────────────────────────────────────────
export async function persistSignal(signal: TradeSignal): Promise<void> {
  const sb = await initSupabase();
  if (!sb) return;
  const session = await getSession();
  await sb.from('signals').insert({
    user_id:        session?.user?.id,
    symbol:         signal.symbol,
    signal_type:    signal.signal,
    confidence:     signal.confidence,
    entry_price:    signal.entryPrice,
    target_price:   signal.targetPrice,
    stop_loss:      signal.stopLoss,
    risk_reward:    signal.riskReward,
    reasoning:      signal.reasoning,
    timeframe:      signal.timeframe,
    asset_class:    signal.assetClass,
    rsi:            signal.technical?.rsi,
    macd_histogram: signal.technical?.macd?.histogram,
    ema20:          signal.technical?.ema20,
    ema50:          signal.technical?.ema50,
    volume_ratio:   signal.technical?.volumeRatio,
    outcome:        'OPEN',
  });
}

export async function fetchSignalHistory(symbol: string, limit = 20) {
  const sb = await initSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from('signals')
    .select('*')
    .eq('symbol', symbol)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// ── TRADES ──────────────────────────────────────────────────────────────────
export async function persistTrade(order: TradeOrder, result: TradeResult, signalId?: string): Promise<void> {
  const sb = await initSupabase();
  if (!sb) return;
  const session = await getSession();
  await sb.from('trades').insert({
    user_id:         session?.user?.id,
    signal_id:       signalId || null,
    broker:          result.broker,
    broker_order_id: result.orderId,
    symbol:          order.symbol,
    side:            order.side,
    qty:             order.qty,
    order_type:      order.orderType,
    limit_price:     order.limitPrice,
    stop_price:      order.stopPrice,
    filled_price:    result.filledPrice,
    filled_qty:      result.filledQty || order.qty,
    status:          result.success ? 'filled' : 'rejected',
  });
}

export async function fetchTradeHistory(limit = 50) {
  const sb = await initSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from('trades')
    .select('*, signals(symbol, signal_type, confidence)')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// ── SETTINGS SYNC ───────────────────────────────────────────────────────────
export async function syncSettingsToSupabase(settings: AppSettings): Promise<void> {
  const sb = await initSupabase();
  if (!sb) return;
  const session = await getSession();
  if (!session?.user?.id) return;
  // Don't store broker API keys in Supabase — keep them local only
  const safeSettings = {
    user_id:               session.user.id,
    auto_signals:          settings.autoSignals,
    sound_alerts:          settings.soundAlerts,
    trump_alerts:          settings.trumpAlerts,
    breaking_news_alerts:  settings.breakingNewsAlerts,
    default_position_size: settings.defaultPositionSize,
    risk_per_trade:        settings.riskPerTrade,
    refresh_interval:      settings.refreshInterval,
    theme:                 settings.theme,
  };
  await sb.from('user_settings').upsert(safeSettings, { onConflict: 'user_id' });
}

export async function fetchSettingsFromSupabase(): Promise<Partial<AppSettings> | null> {
  const sb = await initSupabase();
  if (!sb) return null;
  const session = await getSession();
  if (!session?.user?.id) return null;
  const { data } = await sb
    .from('user_settings')
    .select('*')
    .eq('user_id', session.user.id)
    .single();
  if (!data) return null;
  return {
    autoSignals:         data.auto_signals,
    soundAlerts:         data.sound_alerts,
    trumpAlerts:         data.trump_alerts,
    breakingNewsAlerts:  data.breaking_news_alerts,
    defaultPositionSize: parseFloat(data.default_position_size),
    riskPerTrade:        parseFloat(data.risk_per_trade),
    refreshInterval:     data.refresh_interval,
    theme:               data.theme,
  };
}

// ── REAL-TIME NEWS SUBSCRIPTION ─────────────────────────────────────────────
export async function subscribeToBreakingNews(
  callback: (news: any) => void
): Promise<() => void> {
  const sb = await initSupabase();
  if (!sb) return () => {};
  const channel = sb
    .channel('breaking_news')
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'news_alerts',
    }, (payload) => callback(payload.new))
    .subscribe();
  return () => sb.removeChannel(channel);
}

// ── WATCHLIST ────────────────────────────────────────────────────────────────
export async function addToWatchlist(symbol: string, assetClass: string) {
  const sb = await initSupabase();
  if (!sb) return;
  const session = await getSession();
  if (!session?.user?.id) return;
  await sb.from('watchlist').upsert(
    { user_id: session.user.id, symbol, asset_class: assetClass },
    { onConflict: 'user_id,symbol' }
  );
}

export async function getWatchlist() {
  const sb = await initSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from('watchlist')
    .select('*')
    .order('added_at', { ascending: false });
  return data || [];
}
