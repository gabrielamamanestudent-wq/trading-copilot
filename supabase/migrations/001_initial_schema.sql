-- ============================================================
-- Trading Co-Pilot — Supabase Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- SIGNALS TABLE — stores every AI-generated trade signal
-- ============================================================
CREATE TABLE IF NOT EXISTS signals (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol      TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('BUY','SELL','HOLD','STRONG_BUY','STRONG_SELL')),
  confidence  INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  entry_price NUMERIC(18,6) NOT NULL,
  target_price NUMERIC(18,6),
  stop_loss   NUMERIC(18,6),
  risk_reward NUMERIC(10,4),
  reasoning   TEXT,
  timeframe   TEXT DEFAULT '15m',
  asset_class TEXT DEFAULT 'STOCK',
  platform    TEXT,
  -- Technical indicators snapshot
  rsi         NUMERIC(8,4),
  macd_histogram NUMERIC(12,6),
  ema20       NUMERIC(18,6),
  ema50       NUMERIC(18,6),
  volume_ratio NUMERIC(10,4),
  -- Outcome tracking (filled after trade closes)
  outcome     TEXT CHECK (outcome IN ('WIN','LOSS','BREAKEVEN','OPEN','MISSED')),
  outcome_price NUMERIC(18,6),
  outcome_pct NUMERIC(10,4),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_user_id ON signals(user_id);
CREATE INDEX idx_signals_symbol ON signals(symbol);
CREATE INDEX idx_signals_created_at ON signals(created_at DESC);

-- ============================================================
-- NEWS ALERTS TABLE — breaking news + Trump tweets
-- ============================================================
CREATE TABLE IF NOT EXISTS news_alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id     TEXT UNIQUE, -- from Finnhub/NewsAPI
  title           TEXT NOT NULL,
  summary         TEXT,
  source          TEXT,
  url             TEXT,
  sentiment       TEXT CHECK (sentiment IN ('BULLISH','BEARISH','NEUTRAL')),
  impact_score    INTEGER CHECK (impact_score BETWEEN 0 AND 100),
  related_tickers TEXT[] DEFAULT '{}',
  is_trump        BOOLEAN DEFAULT FALSE,
  is_breaking     BOOLEAN DEFAULT FALSE,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_news_created_at ON news_alerts(created_at DESC);
CREATE INDEX idx_news_is_trump ON news_alerts(is_trump) WHERE is_trump = TRUE;
CREATE INDEX idx_news_tickers ON news_alerts USING gin(related_tickers);

-- ============================================================
-- TRADES TABLE — executed trade log across all brokers
-- ============================================================
CREATE TABLE IF NOT EXISTS trades (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id       UUID REFERENCES signals(id) ON DELETE SET NULL,
  broker          TEXT NOT NULL,
  broker_order_id TEXT,
  symbol          TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('buy','sell')),
  qty             NUMERIC(18,6) NOT NULL,
  order_type      TEXT DEFAULT 'market',
  limit_price     NUMERIC(18,6),
  stop_price      NUMERIC(18,6),
  filled_price    NUMERIC(18,6),
  filled_qty      NUMERIC(18,6),
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','filled','cancelled','rejected','partial')),
  paper_trade     BOOLEAN DEFAULT FALSE,
  pnl             NUMERIC(18,6),
  pnl_pct         NUMERIC(10,4),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_created_at ON trades(created_at DESC);

-- ============================================================
-- USER SETTINGS TABLE — synced across devices
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  auto_signals          BOOLEAN DEFAULT TRUE,
  sound_alerts          BOOLEAN DEFAULT TRUE,
  trump_alerts          BOOLEAN DEFAULT TRUE,
  breaking_news_alerts  BOOLEAN DEFAULT TRUE,
  default_position_size NUMERIC(12,2) DEFAULT 1000,
  risk_per_trade        NUMERIC(5,2) DEFAULT 2,
  refresh_interval      INTEGER DEFAULT 30,
  theme                 TEXT DEFAULT 'dark',
  -- Encrypted broker configs (stored as jsonb, keys are encrypted client-side)
  broker_configs        JSONB DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PRICE HISTORY TABLE — for charting + backtesting
-- ============================================================
CREATE TABLE IF NOT EXISTS price_history (
  id          BIGSERIAL PRIMARY KEY,
  symbol      TEXT NOT NULL,
  timeframe   TEXT NOT NULL DEFAULT '5m',
  open        NUMERIC(18,6),
  high        NUMERIC(18,6),
  low         NUMERIC(18,6),
  close       NUMERIC(18,6),
  volume      BIGINT,
  timestamp   TIMESTAMPTZ NOT NULL,
  UNIQUE(symbol, timeframe, timestamp)
);

CREATE INDEX idx_price_history_symbol_ts ON price_history(symbol, timestamp DESC);

-- ============================================================
-- WATCHLIST TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS watchlist (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol      TEXT NOT NULL,
  asset_class TEXT DEFAULT 'STOCK',
  notes       TEXT,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE signals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist     ENABLE ROW LEVEL SECURITY;

-- Signals: users see only their own
CREATE POLICY "Users see own signals"
  ON signals FOR ALL
  USING (auth.uid() = user_id);

-- Trades: users see only their own
CREATE POLICY "Users see own trades"
  ON trades FOR ALL
  USING (auth.uid() = user_id);

-- Settings: users manage their own
CREATE POLICY "Users manage own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id);

-- Watchlist: users manage their own
CREATE POLICY "Users manage own watchlist"
  ON watchlist FOR ALL
  USING (auth.uid() = user_id);

-- News: public read, server-only write (via service role)
CREATE POLICY "News is publicly readable"
  ON news_alerts FOR SELECT
  USING (TRUE);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER signals_updated_at       BEFORE UPDATE ON signals       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trades_updated_at        BEFORE UPDATE ON trades        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Signal win rate stats view
CREATE OR REPLACE VIEW signal_stats AS
SELECT
  user_id,
  symbol,
  signal_type,
  COUNT(*) as total_signals,
  COUNT(*) FILTER (WHERE outcome = 'WIN') as wins,
  COUNT(*) FILTER (WHERE outcome = 'LOSS') as losses,
  ROUND(
    COUNT(*) FILTER (WHERE outcome = 'WIN')::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE outcome IN ('WIN','LOSS')), 0) * 100, 1
  ) as win_rate_pct,
  ROUND(AVG(outcome_pct) FILTER (WHERE outcome_pct IS NOT NULL), 2) as avg_pnl_pct,
  ROUND(AVG(confidence), 1) as avg_confidence
FROM signals
GROUP BY user_id, symbol, signal_type;
