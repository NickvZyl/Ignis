'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@web/lib/supabase';
import type { User } from '@supabase/supabase-js';

const FONT = "'Segoe UI', system-ui, sans-serif";

interface MessageRow {
  id: string;
  content: string;
  createdAt: string;
  conversationId: string;
  callCount: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  latencyMs: number;
  cacheHitRatio: number;
  model: string;
}

interface CallRow {
  id: string;
  route: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost_estimate_usd: number;
  latency_ms: number;
  tools_used: string[];
  error: string | null;
  created_at: string;
}

interface Summary {
  today: {
    cost: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    cacheHitRatio: number;
  };
  week: { cost: number };
  byRoute: Record<string, { cost: number; calls: number; model: string }>;
}

function fmtUsd(n: number, digits = 4) {
  return `$${n.toFixed(digits)}`;
}

function fmtTokens(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function Preview({ text }: { text: string }) {
  const cleaned = text.replace(/\[(CHECKIN|GOTO|FOLLOWUP):[^\]]*\]/g, '').trim();
  const truncated = cleaned.length > 80 ? cleaned.slice(0, 80) + '…' : cleaned;
  return <span>{truncated}</span>;
}

function RelativeTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return <span>just now</span>;
  if (mins < 60) return <span>{mins}m ago</span>;
  const hours = Math.round(mins / 60);
  if (hours < 24) return <span>{hours}h ago</span>;
  return <span>{Math.round(hours / 24)}d ago</span>;
}

export default function CostsPage() {
  // Read the session directly — the iframe doesn't inherit the parent's zustand
  // auth-store state (zustand is per-JS-context). Supabase session comes from
  // localStorage, which IS shared across same-origin iframes.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [rows, setRows] = useState<MessageRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('not signed in');
      const res = await fetch(`/api/admin/llm-logs?limit=80`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) throw new Error('Not authorized — your user id is not in ADMIN_USER_IDS');
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const body = await res.json();
      setRows(body.rows);
      setSummary(body.summary);
      if (!selectedId && body.rows.length > 0) setSelectedId(body.rows[0].id);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoadingList(false);
    }
  }, [selectedId]);

  const fetchDetail = useCallback(async (messageId: string) => {
    setLoadingDetail(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('not signed in');
      const res = await fetch(`/api/admin/llm-logs?messageId=${messageId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const body = await res.json();
      setCalls(body.calls);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  if (user === undefined) {
    return <div style={{ padding: 40, color: '#888', fontFamily: FONT }}>Loading session…</div>;
  }
  if (!user) {
    return (
      <div style={{ padding: 40, color: '#888', fontFamily: FONT }}>
        Not signed in in this context. Reload the main app tab first.
      </div>
    );
  }

  const selectedRow = rows.find((r) => r.id === selectedId);

  return (
    <div style={{ fontFamily: FONT, background: '#0a0a0e', color: '#e5e5e5', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header / summary */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #222', display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, color: '#888', letterSpacing: 1 }}>TODAY</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{summary ? fmtUsd(summary.today.cost) : '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#888', letterSpacing: 1 }}>7 DAYS</div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{summary ? fmtUsd(summary.week.cost, 3) : '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#888', letterSpacing: 1 }}>CACHE HIT (24H)</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: summary && summary.today.cacheHitRatio > 0.4 ? '#4ade80' : '#f59e0b' }}>
            {summary ? `${Math.round(summary.today.cacheHitRatio * 100)}%` : '—'}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {summary && (
          <div style={{ fontSize: 11, color: '#888' }}>
            Today spend by route:{' '}
            {Object.entries(summary.byRoute)
              .sort((a, b) => b[1].cost - a[1].cost)
              .map(([r, v]) => `${r} ${fmtUsd(v.cost, 3)} (${v.calls})`)
              .join('  ·  ') || 'no activity'}
          </div>
        )}
        <button
          onClick={fetchList}
          style={{ padding: '6px 12px', fontSize: 11, background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e5e5e5', cursor: 'pointer' }}
        >
          refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#3f1d1d', color: '#fca5a5', fontSize: 12 }}>{error}</div>
      )}

      {/* Two-pane body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(280px, 400px) 1fr', overflow: 'hidden' }}>
        {/* LEFT — message list */}
        <div style={{ borderRight: '1px solid #222', overflowY: 'auto' }}>
          {loadingList && <div style={{ padding: 16, color: '#888', fontSize: 12 }}>Loading…</div>}
          {!loadingList && rows.length === 0 && (
            <div style={{ padding: 16, color: '#888', fontSize: 12 }}>
              No logged messages yet. (Messages sent before the Anthropic migration won't appear.)
            </div>
          )}
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                background: r.id === selectedId ? '#1a1a24' : 'transparent',
                borderLeft: r.id === selectedId ? '3px solid #f59e0b' : '3px solid transparent',
                borderBottom: '1px solid #1a1a1a', color: '#e5e5e5', cursor: 'pointer',
                fontFamily: FONT, fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b' }}>{fmtUsd(r.totalCost)}</span>
                <span style={{ fontSize: 10, color: '#666' }}>·</span>
                <span style={{ fontSize: 11, color: '#888' }}>{(r.latencyMs / 1000).toFixed(1)}s</span>
                <span style={{ fontSize: 10, color: '#666' }}>·</span>
                <span style={{ fontSize: 11, color: '#888' }}>{r.model.replace('claude-', '')}</span>
                {r.callCount > 1 && (
                  <>
                    <span style={{ fontSize: 10, color: '#666' }}>·</span>
                    <span style={{ fontSize: 10, color: '#a78bfa' }}>{r.callCount} rounds</span>
                  </>
                )}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: '#555' }}><RelativeTime iso={r.createdAt} /></span>
              </div>
              <div style={{ color: '#ccc', fontSize: 12 }}>
                <Preview text={r.content} />
              </div>
              <div style={{ marginTop: 4, fontSize: 10, color: '#666' }}>
                in {fmtTokens(r.inputTokens)} · out {fmtTokens(r.outputTokens)} · cache {fmtTokens(r.cacheRead)}
                {r.cacheHitRatio > 0 && (
                  <span style={{ color: r.cacheHitRatio > 0.5 ? '#4ade80' : '#f59e0b', marginLeft: 8 }}>
                    hit {Math.round(r.cacheHitRatio * 100)}%
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* RIGHT — selected message detail */}
        <div style={{ overflowY: 'auto', padding: 24 }}>
          {!selectedRow && <div style={{ color: '#888', fontSize: 12 }}>Select a message on the left.</div>}
          {selectedRow && (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: '#888', letterSpacing: 1, marginBottom: 6 }}>MESSAGE</div>
                <div style={{ background: '#161622', padding: 12, borderRadius: 6, fontSize: 13, color: '#ddd', whiteSpace: 'pre-wrap' }}>
                  {selectedRow.content}
                </div>
                <div style={{ marginTop: 6, fontSize: 10, color: '#666' }}>
                  {new Date(selectedRow.createdAt).toLocaleString()} · id {selectedRow.id.slice(0, 8)}
                </div>
              </div>

              {/* Top-line numbers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                <Stat label="TOTAL COST" value={fmtUsd(selectedRow.totalCost)} accent="#f59e0b" />
                <Stat label="LATENCY" value={`${(selectedRow.latencyMs / 1000).toFixed(2)}s`} />
                <Stat label="CALLS" value={String(selectedRow.callCount)} />
                <Stat
                  label="CACHE HIT"
                  value={`${Math.round(selectedRow.cacheHitRatio * 100)}%`}
                  accent={selectedRow.cacheHitRatio > 0.5 ? '#4ade80' : '#f59e0b'}
                />
              </div>

              {/* Token breakdown explanation */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: '#888', letterSpacing: 1, marginBottom: 8 }}>WHERE THE TOKENS WENT</div>
                <TokenBar
                  segments={[
                    { label: 'fresh input', value: selectedRow.inputTokens, color: '#f59e0b', note: 'full price — new prompt content' },
                    { label: 'cache read', value: selectedRow.cacheRead, color: '#4ade80', note: '~0.1× price — reused from cache' },
                    { label: 'cache write', value: selectedRow.cacheWrite, color: '#a78bfa', note: '~1.25× price — written to cache this call' },
                    { label: 'output', value: selectedRow.outputTokens, color: '#60a5fa', note: 'generated response' },
                  ]}
                />
              </div>

              {/* Per-call rows */}
              <div>
                <div style={{ fontSize: 10, color: '#888', letterSpacing: 1, marginBottom: 8 }}>
                  {selectedRow.callCount > 1 ? `CALLS (${selectedRow.callCount} rounds)` : 'CALL'}
                </div>
                {loadingDetail && <div style={{ color: '#888', fontSize: 12 }}>Loading…</div>}
                {calls?.map((c, i) => (
                  <div
                    key={c.id}
                    style={{ padding: 12, background: '#131320', borderRadius: 6, marginBottom: 8, fontSize: 12 }}
                  >
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: '#666' }}>#{i + 1}</span>
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>{fmtUsd(Number(c.cost_estimate_usd))}</span>
                      <span style={{ color: '#888' }}>·</span>
                      <span style={{ color: '#aaa' }}>{c.model.replace('claude-', '')}</span>
                      <span style={{ color: '#888' }}>·</span>
                      <span style={{ color: '#aaa' }}>{c.latency_ms}ms</span>
                      {c.tools_used?.length > 0 && (
                        <>
                          <span style={{ color: '#888' }}>·</span>
                          <span style={{ color: '#a78bfa' }}>tools: {c.tools_used.join(', ')}</span>
                        </>
                      )}
                      {c.error && (
                        <>
                          <span style={{ color: '#888' }}>·</span>
                          <span style={{ color: '#f87171' }}>error</span>
                        </>
                      )}
                    </div>
                    <div style={{ color: '#888', fontSize: 11, display: 'flex', gap: 16 }}>
                      <span>in: <b style={{ color: '#ccc' }}>{c.input_tokens}</b></span>
                      <span>out: <b style={{ color: '#ccc' }}>{c.output_tokens}</b></span>
                      <span style={{ color: '#4ade80' }}>cache_r: <b>{c.cache_read_tokens}</b></span>
                      <span style={{ color: '#a78bfa' }}>cache_w: <b>{c.cache_creation_tokens}</b></span>
                    </div>
                    {c.error && (
                      <div style={{ marginTop: 6, color: '#fca5a5', fontSize: 11, fontFamily: 'monospace' }}>{c.error}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = '#e5e5e5' }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ padding: '10px 12px', background: '#131320', borderRadius: 6 }}>
      <div style={{ fontSize: 9, color: '#888', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: accent }}>{value}</div>
    </div>
  );
}

function TokenBar({ segments }: { segments: Array<{ label: string; value: number; color: string; note: string }> }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <div style={{ color: '#666', fontSize: 12 }}>No tokens</div>;
  return (
    <div>
      <div style={{ display: 'flex', height: 20, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
        {segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.label}
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              title={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}
            />
          ) : null,
        )}
      </div>
      <div style={{ fontSize: 11, color: '#aaa' }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2 }} />
            <span style={{ width: 100, color: '#ccc' }}>{s.label}</span>
            <span style={{ width: 60 }}>{fmtTokens(s.value)}</span>
            <span style={{ color: '#666' }}>— {s.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
