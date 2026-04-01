import { create } from 'zustand';
import { supabase } from '@web/lib/supabase';

// ── Types ──

export type TodoStatus = 'todo' | 'doing' | 'done';
export type TodoPriority = 'low' | 'medium' | 'high';

export interface Todo {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: TodoStatus;
  priority: TodoPriority;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface TodoStore {
  todos: Todo[];
  loaded: boolean;
  loading: boolean;

  load(userId: string): Promise<void>;
  add(userId: string, title: string, description?: string, priority?: TodoPriority, status?: TodoStatus): Promise<Todo | null>;
  update(id: string, fields: Partial<Pick<Todo, 'title' | 'description' | 'priority' | 'status' | 'position'>>): Promise<void>;
  move(id: string, newStatus: TodoStatus): Promise<void>;
  remove(id: string): Promise<void>;
  reorder(id: string, newPosition: number): Promise<void>;
}

export const useTodoStore = create<TodoStore>((set, get) => ({
  todos: [],
  loaded: false,
  loading: false,

  async load(userId: string) {
    if (get().loading) return;
    set({ loading: true });

    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[TodoStore] Load failed:', error.message);
      set({ loading: false });
      return;
    }

    set({ todos: data ?? [], loaded: true, loading: false });
  },

  async add(userId, title, description = '', priority = 'medium', status = 'todo') {
    const todos = get().todos;
    const sameLane = todos.filter(t => t.status === status);
    const position = sameLane.length > 0
      ? Math.max(...sameLane.map(t => t.position)) + 1
      : 0;

    const { data, error } = await supabase
      .from('todos')
      .insert({ user_id: userId, title, description, priority, status, position })
      .select()
      .single();

    if (error) {
      console.error('[TodoStore] Add failed:', error.message);
      return null;
    }

    set({ todos: [...get().todos, data] });
    return data;
  },

  async update(id, fields) {
    const { error } = await supabase
      .from('todos')
      .update(fields)
      .eq('id', id);

    if (error) {
      console.error('[TodoStore] Update failed:', error.message);
      return;
    }

    set({
      todos: get().todos.map(t => t.id === id ? { ...t, ...fields, updated_at: new Date().toISOString() } : t),
    });
  },

  async move(id, newStatus) {
    const todos = get().todos;
    const sameLane = todos.filter(t => t.status === newStatus);
    const position = sameLane.length > 0
      ? Math.max(...sameLane.map(t => t.position)) + 1
      : 0;

    const { error } = await supabase
      .from('todos')
      .update({ status: newStatus, position })
      .eq('id', id);

    if (error) {
      console.error('[TodoStore] Move failed:', error.message);
      return;
    }

    set({
      todos: get().todos.map(t => t.id === id ? { ...t, status: newStatus, position, updated_at: new Date().toISOString() } : t),
    });
  },

  async remove(id) {
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[TodoStore] Remove failed:', error.message);
      return;
    }

    set({ todos: get().todos.filter(t => t.id !== id) });
  },

  async reorder(id, newPosition) {
    const { error } = await supabase
      .from('todos')
      .update({ position: newPosition })
      .eq('id', id);

    if (error) {
      console.error('[TodoStore] Reorder failed:', error.message);
      return;
    }

    set({
      todos: get().todos.map(t => t.id === id ? { ...t, position: newPosition, updated_at: new Date().toISOString() } : t),
    });
  },
}));
