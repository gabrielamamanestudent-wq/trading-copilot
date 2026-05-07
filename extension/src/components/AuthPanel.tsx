import React, { useState, useEffect } from 'react';
import {
  signInWithEmail, signUpWithEmail, getSession, signOut, syncSettingsToSupabase
} from '../utils/supabaseClient';
import type { AppSettings } from '../types';

interface Props {
  settings: AppSettings;
}

export default function AuthPanel({ settings }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [user, setUser] = useState<any>(null);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['supabaseUrl', 'supabaseAnonKey'], (result) => {
      if (result.supabaseUrl) { setSupabaseUrl(result.supabaseUrl); setConfigured(true); }
      if (result.supabaseAnonKey) setSupabaseKey(result.supabaseAnonKey);
    });
    getSession().then(s => { if (s?.user) setUser(s.user); });
  }, []);

  const saveSupabaseConfig = () => {
    chrome.storage.local.set({ supabaseUrl, supabaseAnonKey: supabaseKey });
    setConfigured(true);
    setSuccess('Supabase connected!');
    setTimeout(() => setSuccess(''), 2000);
  };

  const handleAuth = async () => {
    setLoading(true); setError(''); setSuccess('');
    const fn = mode === 'signin' ? signInWithEmail : signUpWithEmail;
    const { data, error: err } = await fn(email, password) as any;
    setLoading(false);
    if (err) { setError(err.message || 'Authentication failed'); return; }
    if (data?.user) {
      setUser(data.user);
      setSuccess(mode === 'signin' ? 'Signed in! Settings syncing...' : 'Account created!');
      await syncSettingsToSupabase(settings);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    setSuccess('Signed out');
  };

  const handleSync = async () => {
    setLoading(true);
    await syncSettingsToSupabase(settings);
    setLoading(false);
    setSuccess('Settings synced to cloud ✓');
    setTimeout(() => setSuccess(''), 2000);
  };

  return (
    <div style={{ padding: '14px' }}>
      {/* Supabase Connection */}
      <div style={{ background: '#131d35', border: '1px solid #1e2d4d', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#4f8ef7', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
          🔗 Supabase Connection
        </div>
        <div style={{ fontSize: '10px', color: '#475569', marginBottom: '8px' }}>
          Get your URL + anon key from{' '}
          <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" style={{ color: '#4f8ef7' }}>
            supabase.com/dashboard
          </a>{' '}→ Settings → API
        </div>
        <div style={{ fontSize: '10px', color: '#475569', marginBottom: '3px', textTransform: 'uppercase' }}>Project URL</div>
        <input
          style={{ width: '100%', background: '#0f1629', border: '1px solid #1e2d4d', borderRadius: '6px', padding: '6px 10px', color: '#e2e8f0', fontSize: '11px', marginBottom: '6px', outline: 'none', fontFamily: 'monospace' }}
          placeholder="https://xxxx.supabase.co"
          value={supabaseUrl}
          onChange={e => setSupabaseUrl(e.target.value)}
        />
        <div style={{ fontSize: '10px', color: '#475569', marginBottom: '3px', textTransform: 'uppercase' }}>Anon Key</div>
        <input
          style={{ width: '100%', background: '#0f1629', border: '1px solid #1e2d4d', borderRadius: '6px', padding: '6px 10px', color: '#e2e8f0', fontSize: '11px', marginBottom: '8px', outline: 'none', fontFamily: 'monospace' }}
          type="password"
          placeholder="eyJhbGciOiJ..."
          value={supabaseKey}
          onChange={e => setSupabaseKey(e.target.value)}
        />
        <button
          onClick={saveSupabaseConfig}
          style={{ width: '100%', padding: '8px', background: configured ? 'rgba(0,212,170,0.1)' : '#4f8ef7', color: configured ? '#00d4aa' : 'white', border: `1px solid ${configured ? '#00d4aa' : '#4f8ef7'}`, borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
        >
          {configured ? '✅ Connected' : '🔌 Connect Supabase'}
        </button>
      </div>

      {/* Auth */}
      {configured && !user && (
        <div style={{ background: '#131d35', border: '1px solid #1e2d4d', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
            👤 Account — Sync Across Devices
          </div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            {(['signin', 'signup'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{ flex: 1, padding: '6px', background: mode === m ? '#4f8ef7' : 'transparent', color: mode === m ? 'white' : '#475569', border: '1px solid #1e2d4d', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                {m === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>
          <input
            style={{ width: '100%', background: '#0f1629', border: '1px solid #1e2d4d', borderRadius: '6px', padding: '7px 10px', color: '#e2e8f0', fontSize: '12px', marginBottom: '6px', outline: 'none' }}
            type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
          />
          <input
            style={{ width: '100%', background: '#0f1629', border: '1px solid #1e2d4d', borderRadius: '6px', padding: '7px 10px', color: '#e2e8f0', fontSize: '12px', marginBottom: '8px', outline: 'none' }}
            type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
          />
          {error && <div style={{ color: '#ff4757', fontSize: '11px', marginBottom: '6px' }}>❌ {error}</div>}
          <button onClick={handleAuth} disabled={loading}
            style={{ width: '100%', padding: '9px', background: '#4f8ef7', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </div>
      )}

      {/* Logged in state */}
      {configured && user && (
        <div style={{ background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#00d4aa' }}>✅ Signed In</div>
              <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>{user.email}</div>
            </div>
            <button onClick={handleSignOut}
              style={{ background: 'none', border: '1px solid #1e2d4d', borderRadius: '6px', padding: '5px 10px', color: '#94a3b8', fontSize: '11px', cursor: 'pointer' }}>
              Sign Out
            </button>
          </div>
          <button onClick={handleSync} disabled={loading}
            style={{ width: '100%', padding: '8px', background: 'rgba(79,142,247,0.1)', color: '#4f8ef7', border: '1px solid #4f8ef7', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            {loading ? 'Syncing...' : '☁️ Sync Settings to Cloud'}
          </button>
          <div style={{ marginTop: '8px', fontSize: '10px', color: '#475569' }}>
            Signals, news alerts & trade history auto-saved to your Supabase project. API keys stay local only.
          </div>
        </div>
      )}

      {success && (
        <div style={{ background: 'rgba(0,212,170,0.1)', border: '1px solid #00d4aa', borderRadius: '6px', padding: '8px 10px', fontSize: '11px', color: '#00d4aa' }}>
          {success}
        </div>
      )}

      {/* Info box */}
      <div style={{ background: 'rgba(79,142,247,0.06)', border: '1px solid rgba(79,142,247,0.15)', borderRadius: '8px', padding: '10px 12px', marginTop: '10px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#4f8ef7', marginBottom: '4px' }}>☁️ What gets synced</div>
        <div style={{ fontSize: '10px', color: '#475569', lineHeight: 1.6 }}>
          ✓ All trade signals &amp; history<br />
          ✓ News alerts &amp; Trump posts<br />
          ✓ Executed trades log<br />
          ✓ Settings &amp; watchlist<br />
          🔒 Broker API keys stay <strong>local only</strong>
        </div>
      </div>
    </div>
  );
}
