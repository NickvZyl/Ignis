'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@web/stores/auth-store';
import { useReflectionStore } from '@web/stores/reflection-store';
import { useActivityStore } from '@web/stores/activity-store';
import { supabase } from '@web/lib/supabase';
import { slotToTime } from '@web/lib/schedule';
import type { SelfMemory, ActivityEntry } from '@/types';

const FONT = "'Segoe UI', system-ui, sans-serif";

const TYPE_COLORS: Record<string, string> = {
  observation: '#60A5FA',
  pattern: '#F59E0B',
  feeling: '#EC4899',
  wonder: '#A78BFA',
  connection: '#34D399',
};

function RelativeTime({ iso }: { iso: string }) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return <span>just now</span>;
  if (mins < 60) return <span>{mins}m ago</span>;
  const hours = Math.round(mins / 60);
  if (hours < 24) return <span>{hours}h ago</span>;
  return <span>{Math.round(hours / 24)}d ago</span>;
}

export default function ReflectionsPage() {
  const { user } = useAuthStore();
  const userId = user?.id;
  const { runReflectionCycle, isReflecting, lastReflectionAt } = useReflectionStore();
  const { summarizeDay } = useActivityStore();

  const [memories, setMemories] = useState<SelfMemory[]>([]);
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const [memRes, actRes] = await Promise.all([
      supabase
        .from('self_memories')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('activity_log')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(50),
    ]);

    setMemories((memRes.data || []) as SelfMemory[]);
    setActivities((actRes.data || []) as ActivityEntry[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleTrigger = async () => {
    if (!userId) return;
    await runReflectionCycle(userId);
    // Refresh after a short delay to let DB catch up
    setTimeout(load, 2000);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('self_memories').delete().eq('id', id);
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  if (!userId) {
    return <div style={{ padding: 40, color: '#888', fontFamily: FONT }}>Sign in to view reflections.</div>;
  }

  return (
    <div style={{ background: '#141418', minHeight: '100vh', color: '#ccc', fontFamily: FONT, padding: 20, overflow: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 24, color: '#aaa', fontWeight: 600 }}>Igni Reflections</div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
            {lastReflectionAt > 0
              ? `Last reflection: ${new Date(lastReflectionAt).toLocaleTimeString()}`
              : 'No reflections yet this session'}
          </div>
        </div>
        <button
          onClick={handleTrigger}
          disabled={isReflecting}
          style={{
            fontFamily: FONT, fontSize: 14, padding: '8px 20px', borderRadius: 6,
            background: isReflecting ? '#333' : '#F59E0B', color: isReflecting ? '#666' : '#000',
            border: 'none', cursor: isReflecting ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          {isReflecting ? 'REFLECTING...' : 'TRIGGER REFLECTION'}
        </button>
      </div>

      {/* Activity Summary */}
      <div style={{ background: '#1e1e24', borderRadius: 8, padding: 16, marginBottom: 24, border: '1px solid #333' }}>
        <div style={{ fontSize: 14, color: '#888', marginBottom: 8, fontWeight: 600 }}>TODAY'S ACTIVITY</div>
        <div style={{ fontSize: 14, color: '#aaa' }}>{summarizeDay()}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Self Memories */}
        <div>
          <div style={{ fontSize: 16, color: '#aaa', fontWeight: 600, marginBottom: 12 }}>
            Self Memories ({memories.length})
          </div>
          {loading ? (
            <div style={{ color: '#666' }}>Loading...</div>
          ) : memories.length === 0 ? (
            <div style={{ color: '#666', fontSize: 14 }}>No self-memories yet. Trigger a reflection cycle.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {memories.map(m => (
                <div key={m.id} style={{
                  background: '#1e1e24', borderRadius: 8, padding: 12,
                  border: `1px solid ${TYPE_COLORS[m.memory_type] || '#444'}33`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontSize: 14, color: '#ddd', flex: 1 }}>{m.content}</div>
                    <button
                      onClick={() => handleDelete(m.id)}
                      style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0 }}
                      title="Delete"
                    >&times;</button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 12, color: '#888', flexWrap: 'wrap' }}>
                    <span style={{
                      background: `${TYPE_COLORS[m.memory_type] || '#666'}22`,
                      color: TYPE_COLORS[m.memory_type] || '#888',
                      padding: '2px 8px', borderRadius: 4,
                    }}>{m.memory_type}</span>
                    <span>imp: {m.importance.toFixed(2)}</span>
                    <span>surfaced: {m.times_surfaced}x</span>
                    <span><RelativeTime iso={m.created_at} /></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity Log */}
        <div>
          <div style={{ fontSize: 16, color: '#aaa', fontWeight: 600, marginBottom: 12 }}>
            Activity Log ({activities.length})
          </div>
          {loading ? (
            <div style={{ color: '#666' }}>Loading...</div>
          ) : activities.length === 0 ? (
            <div style={{ color: '#666', fontSize: 14 }}>No activity logged yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {activities.map(a => {
                const start = new Date(a.started_at);
                const end = a.ended_at ? new Date(a.ended_at) : null;
                const durationMin = end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;

                return (
                  <div key={a.id} style={{
                    background: '#1e1e24', borderRadius: 6, padding: '8px 12px',
                    border: '1px solid #333', display: 'flex', alignItems: 'center', gap: 12,
                    fontSize: 13,
                  }}>
                    <span style={{ color: '#666', minWidth: 45 }}>
                      {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ color: '#c09870', minWidth: 60 }}>{a.scene}</span>
                    <span style={{ color: '#aaa', flex: 1 }}>
                      {a.activity_label || 'idle'}{a.furniture ? ` at ${a.furniture}` : ''}
                    </span>
                    {a.emotion && <span style={{ color: '#888', fontSize: 12 }}>{a.emotion}</span>}
                    <span style={{ color: '#555', fontSize: 12, minWidth: 45, textAlign: 'right' }}>
                      {durationMin !== null ? `${durationMin}m` : 'now'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
