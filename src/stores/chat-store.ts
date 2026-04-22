import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { postChat } from '@/lib/api';
import type { Message } from '@/types';

interface ChatState {
  conversationId: string | null;
  messages: Message[];
  isGenerating: boolean;
  streamingMessageId: string | null;
  error: string | null;
  startConversation: (userId: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
  sendMessage: (content: string, userId: string) => Promise<void>;
  extractMemories: (userId: string) => Promise<void>;
  clearChat: () => void;
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return token;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversationId: null,
  messages: [],
  isGenerating: false,
  streamingMessageId: null,
  error: null,

  startConversation: async (userId) => {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', existing.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (msgs) msgs.reverse();
      set({
        conversationId: existing.id,
        messages: (msgs || []) as Message[],
        error: null,
      });
      return;
    }

    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: userId })
      .select('id')
      .single();

    if (error) {
      set({ error: `Could not start conversation: ${error.message}` });
      return;
    }
    set({ conversationId: data.id, messages: [], error: null });
  },

  refreshMessages: async () => {
    const conversationId = get().conversationId;
    if (!conversationId) return;
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (msgs) msgs.reverse();
    set({ messages: (msgs || []) as Message[] });
  },

  sendMessage: async (content, userId) => {
    const state = get();
    if (state.isGenerating) return;

    let conversationId = state.conversationId;
    if (!conversationId) {
      await get().startConversation(userId);
      conversationId = get().conversationId;
      if (!conversationId) return;
    }

    set({ isGenerating: true, error: null });

    try {
      // Pull any messages that landed server-side (e.g. scheduled pushes) so
      // Igni sees the full context.
      await get().refreshMessages();

      const { data: userMsg, error: userError } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, role: 'user', content })
        .select()
        .single();
      if (userError) throw userError;

      set((s) => ({ messages: [...s.messages, userMsg as Message] }));

      const accessToken = await getAccessToken();
      const apiMessages = get().messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));

      const res = await postChat({
        messages: apiMessages,
        userId,
        accessToken,
      });

      const { data: assistantMsg, error: assistantError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: res.content,
        })
        .select()
        .single();
      if (assistantError) throw assistantError;

      set((s) => ({
        messages: [...s.messages, assistantMsg as Message],
        isGenerating: false,
      }));
    } catch (err: any) {
      set({
        error: err?.message ?? 'Send failed',
        isGenerating: false,
      });
    }
  },

  extractMemories: async (_userId) => {
    // no-op — web backend handles memory extraction server-side
  },

  clearChat: () => {
    set({ conversationId: null, messages: [], error: null, streamingMessageId: null });
  },
}));
