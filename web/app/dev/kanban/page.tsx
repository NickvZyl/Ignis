'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTodoStore, type Todo, type TodoStatus, type TodoPriority } from '@web/stores/todo-store';
import { supabase } from '@web/lib/supabase';

const FONT = "'Segoe UI', system-ui, sans-serif";

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return mobile;
}

const COLUMNS: { status: TodoStatus; label: string; color: string; bg: string }[] = [
  { status: 'todo',  label: 'To Do',    color: '#A0A0A0', bg: '#1e1e24' },
  { status: 'doing', label: 'Doing',    color: '#F59E0B', bg: '#2a2418' },
  { status: 'done',  label: 'Done',     color: '#3A7D44', bg: '#1a2818' },
];

const PRIORITY_COLORS: Record<TodoPriority, string> = {
  low:    '#6B7280',
  medium: '#F59E0B',
  high:   '#EF4444',
};

const PRIORITY_LABELS: Record<TodoPriority, string> = {
  low:    'Low',
  medium: 'Med',
  high:   'High',
};

// ── Card component ──

function TodoCard({
  todo,
  onUpdate,
  onMove,
  onRemove,
  dragHandlers,
}: {
  todo: Todo;
  onUpdate: (id: string, fields: Partial<Pick<Todo, 'title' | 'description' | 'priority'>>) => void;
  onMove: (id: string, status: TodoStatus) => void;
  onRemove: (id: string) => void;
  dragHandlers: {
    onDragStart: (e: React.DragEvent, id: string) => void;
    onDragEnd: (e: React.DragEvent) => void;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [desc, setDesc] = useState(todo.description);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) titleRef.current?.focus();
  }, [editing]);

  const save = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(todo.title);
      setDesc(todo.description);
      setEditing(false);
      return;
    }
    onUpdate(todo.id, { title: trimmed, description: desc });
    setEditing(false);
  }, [title, desc, todo.id, todo.title, todo.description, onUpdate]);

  const cyclePriority = useCallback(() => {
    const order: TodoPriority[] = ['low', 'medium', 'high'];
    const next = order[(order.indexOf(todo.priority) + 1) % order.length];
    onUpdate(todo.id, { priority: next });
  }, [todo.id, todo.priority, onUpdate]);

  return (
    <div
      draggable={!editing}
      onDragStart={e => dragHandlers.onDragStart(e, todo.id)}
      onDragEnd={dragHandlers.onDragEnd}
      style={{
        background: '#28282e',
        border: '1px solid #3a3a40',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
        cursor: editing ? 'default' : 'grab',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        fontFamily: FONT,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = '#555';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = '#3a3a40';
      }}
    >
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setTitle(todo.title); setDesc(todo.description); setEditing(false); } }}
            style={{
              background: '#1e1e24', color: '#eee', border: '1px solid #555',
              borderRadius: 4, padding: '4px 8px', fontSize: 14, fontFamily: FONT,
              outline: 'none',
            }}
          />
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setTitle(todo.title); setDesc(todo.description); setEditing(false); } }}
            placeholder="Description..."
            rows={2}
            style={{
              background: '#1e1e24', color: '#ccc', border: '1px solid #555',
              borderRadius: 4, padding: '4px 8px', fontSize: 13, fontFamily: FONT,
              outline: 'none', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            <button onClick={() => onRemove(todo.id)}
              style={{ background: '#EF444422', color: '#EF4444', border: '1px solid #EF444444', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              Delete
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { setTitle(todo.title); setDesc(todo.description); setEditing(false); }}
                style={{ background: '#333', color: '#aaa', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={save}
                style={{ background: '#F59E0B', color: '#000', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <span
              onClick={() => setEditing(true)}
              style={{ color: '#eee', fontSize: 14, fontWeight: 500, cursor: 'pointer', flex: 1, lineHeight: '1.3' }}>
              {todo.title}
            </span>
            <button onClick={() => onRemove(todo.id)}
              style={{
                background: '#EF444415', border: '1px solid #EF444430', color: '#EF4444', cursor: 'pointer',
                fontSize: 16, lineHeight: 1, padding: '4px 6px', flexShrink: 0, borderRadius: 4,
                minWidth: 28, minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0.6, transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.6'; }}
              title="Delete">
              \u00d7
            </button>
          </div>
          {todo.description && (
            <p onClick={() => setEditing(true)}
              style={{ color: '#888', fontSize: 12, margin: '4px 0 0', lineHeight: '1.4', cursor: 'pointer' }}>
              {todo.description}
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
            <button onClick={cyclePriority}
              style={{
                background: `${PRIORITY_COLORS[todo.priority]}22`,
                color: PRIORITY_COLORS[todo.priority],
                border: `1px solid ${PRIORITY_COLORS[todo.priority]}44`,
                borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                fontFamily: FONT, fontWeight: 600, minHeight: 28,
              }}>
              {PRIORITY_LABELS[todo.priority]}
            </button>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {COLUMNS.filter(c => c.status !== todo.status).map(c => (
                <button key={c.status} onClick={() => onMove(todo.id, c.status)}
                  style={{
                    background: 'none', border: `1px solid ${c.color}44`, color: c.color,
                    borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer',
                    fontFamily: FONT, opacity: 0.7, transition: 'opacity 0.15s', minHeight: 28,
                  }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.opacity = '1'; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.opacity = '0.7'; }}
                  title={`Move to ${c.label}`}>
                  {'\u2192'} {c.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Add card form ──

function AddCardForm({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = useCallback(() => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle('');
    setOpen(false);
  }, [title, onAdd]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{
          background: 'none', border: '1px dashed #444', borderRadius: 8,
          color: '#666', padding: '8px 12px', width: '100%', cursor: 'pointer',
          fontFamily: FONT, fontSize: 13, transition: 'color 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => { (e.target as HTMLElement).style.color = '#aaa'; (e.target as HTMLElement).style.borderColor = '#666'; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.color = '#666'; (e.target as HTMLElement).style.borderColor = '#444'; }}>
        + Add card
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input
        ref={inputRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setTitle(''); setOpen(false); } }}
        placeholder="Task title..."
        style={{
          background: '#1e1e24', color: '#eee', border: '1px solid #555',
          borderRadius: 4, padding: '6px 10px', fontSize: 13, fontFamily: FONT,
          flex: 1, outline: 'none',
        }}
      />
      <button onClick={submit}
        style={{ background: '#F59E0B', color: '#000', border: 'none', borderRadius: 4, padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
        Add
      </button>
    </div>
  );
}

// ── Main Kanban page ──

export default function KanbanPage() {
  const { todos, loaded, loading, load, add, update, move, remove } = useTodoStore();
  const [userId, setUserId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TodoStatus | null>(null);
  const [activeTab, setActiveTab] = useState<TodoStatus>('todo');
  const dragItemId = useRef<string | null>(null);
  const isMobile = useIsMobile();

  // Auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, []);

  // Override the global overflow:hidden on html/body so this page can scroll
  useEffect(() => {
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, []);

  // Load todos
  useEffect(() => {
    if (userId && !loaded) load(userId);
  }, [userId, loaded, load]);

  // Realtime subscription — auto-refresh when Ignis modifies todos via chat
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('todos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${userId}` }, () => {
        load(userId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  const handleAdd = useCallback((title: string, status: TodoStatus = 'todo') => {
    if (!userId) return;
    add(userId, title, '', 'medium', status);
  }, [userId, add]);

  const handleUpdate = useCallback((id: string, fields: Partial<Pick<Todo, 'title' | 'description' | 'priority'>>) => {
    update(id, fields);
  }, [update]);

  const handleMove = useCallback((id: string, status: TodoStatus) => {
    move(id, status);
  }, [move]);

  const handleRemove = useCallback((id: string) => {
    remove(id);
  }, [remove]);

  // Drag handlers
  const onDragStart = useCallback((e: React.DragEvent, id: string) => {
    dragItemId.current = id;
    e.dataTransfer.effectAllowed = 'move';
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
  }, []);

  const onDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '1';
    dragItemId.current = null;
    setDragOverCol(null);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, status: TodoStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(status);
  }, []);

  const onDrop = useCallback((e: React.DragEvent, status: TodoStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    if (dragItemId.current) {
      const todo = todos.find(t => t.id === dragItemId.current);
      if (todo && todo.status !== status) {
        handleMove(dragItemId.current, status);
      }
    }
  }, [todos, handleMove]);

  if (!userId) {
    return (
      <div style={{ background: '#141418', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontFamily: FONT }}>
        Sign in to use the Kanban board.
      </div>
    );
  }

  const visibleColumns = isMobile ? COLUMNS.filter(c => c.status === activeTab) : COLUMNS;

  return (
    <div style={{ background: '#141418', minHeight: '100vh', fontFamily: FONT, color: '#eee', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{
        padding: isMobile ? '12px 16px' : '16px 24px',
        borderBottom: '1px solid #2a2a30',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? 18 : 22, fontWeight: 600, color: '#F59E0B' }}>
            Kanban Board
          </h1>
          {!isMobile && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
              Ignis can view and manage these tasks during conversation
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#555' }}>
            {todos.length} task{todos.length !== 1 ? 's' : ''}
          </span>
          <a href="/" style={{ color: '#666', fontSize: 13, textDecoration: 'none' }}
            onMouseEnter={e => { (e.target as HTMLElement).style.color = '#aaa'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.color = '#666'; }}>
            Back
          </a>
        </div>
      </div>

      {/* Mobile tab bar */}
      {isMobile && (
        <div style={{
          display: 'flex', borderBottom: '1px solid #2a2a30',
          position: 'sticky', top: 0, zIndex: 10, background: '#141418',
        }}>
          {COLUMNS.map(col => {
            const count = todos.filter(t => t.status === col.status).length;
            const isActive = activeTab === col.status;
            return (
              <button
                key={col.status}
                onClick={() => setActiveTab(col.status)}
                style={{
                  flex: 1, padding: '12px 8px', border: 'none', cursor: 'pointer',
                  background: isActive ? `${col.color}15` : 'transparent',
                  borderBottom: isActive ? `2px solid ${col.color}` : '2px solid transparent',
                  color: isActive ? col.color : '#666',
                  fontFamily: FONT, fontSize: 14, fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {col.label} <span style={{ opacity: 0.6 }}>({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Loading state */}
      {loading && !loaded && (
        <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>Loading...</div>
      )}

      {/* Columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: isMobile ? 0 : 16,
        padding: isMobile ? '12px' : '20px 24px',
        minHeight: isMobile ? undefined : 'calc(100vh - 90px)',
        paddingBottom: isMobile ? 80 : 24,
        alignItems: 'flex-start',
      }}>
        {visibleColumns.map(col => {
          const colTodos = todos
            .filter(t => t.status === col.status)
            .sort((a, b) => a.position - b.position);
          const isDragOver = dragOverCol === col.status;

          return (
            <div
              key={col.status}
              onDragOver={e => onDragOver(e, col.status)}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={e => onDrop(e, col.status)}
              style={{
                background: isMobile ? 'transparent' : (isDragOver ? `${col.color}11` : col.bg),
                border: isMobile ? 'none' : `1px solid ${isDragOver ? col.color + '44' : '#2a2a30'}`,
                borderRadius: isMobile ? 0 : 12,
                padding: isMobile ? '4px 0' : 16,
                minHeight: isMobile ? 100 : 200,
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              {/* Column header — hidden on mobile since tabs show it */}
              {!isMobile && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${col.color}33`,
                }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: col.color }}>
                    {col.label}
                  </h2>
                  <span style={{
                    background: `${col.color}22`, color: col.color,
                    padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                  }}>
                    {colTodos.length}
                  </span>
                </div>
              )}

              {/* Cards */}
              {colTodos.map(todo => (
                <TodoCard
                  key={todo.id}
                  todo={todo}
                  onUpdate={handleUpdate}
                  onMove={handleMove}
                  onRemove={handleRemove}
                  dragHandlers={{ onDragStart, onDragEnd }}
                />
              ))}

              {/* Empty state on mobile */}
              {isMobile && colTodos.length === 0 && (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#444', fontSize: 13 }}>
                  No tasks here yet
                </div>
              )}

              {/* Add form */}
              <AddCardForm onAdd={(title) => handleAdd(title, col.status)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
