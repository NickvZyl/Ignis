import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { chatCompletion, chatCompletionStream, getEmbedding } from '@/lib/openrouter';
import { buildSystemPrompt, buildMemoryExtractionPrompt } from '@/prompts/system';
import { useCompanionStore } from './companion-store';
import { CONFIG } from '@/constants/config';
import type { Message, Memory, ChatCompletionMessage } from '@/types';

// Temporary ID prefix for the streaming placeholder message
const STREAMING_ID = '__streaming__';

interface ChatState {
  messages: Message[];
  conversationId: string | null;
  isGenerating: boolean;
  streamingMessageId: string | null;
  error: string | null;

  startConversation: (userId: string) => Promise<void>;
  sendMessage: (content: string, userId: string) => Promise<void>;
  extractMemories: (userId: string) => Promise<void>;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  conversationId: null,
  isGenerating: false,
  streamingMessageId: null,
  error: null,

  startConversation: async (userId: string) => {
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: userId })
      .select()
      .single();

    if (error) throw error;
    set({ conversationId: data.id, messages: [], error: null });
  },

  sendMessage: async (content: string, userId: string) => {
    const { conversationId, messages } = get();
    if (!conversationId || get().isGenerating) return;

    set({ isGenerating: true, error: null });

    try {
      // 1. Persist user message
      const { data: userMsg, error: userError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: 'user',
          content,
        })
        .select()
        .single();

      if (userError) throw userError;

      const updatedMessages = [...messages, userMsg as Message];
      set({ messages: updatedMessages });

      // 2. Process emotional impact
      const companionStore = useCompanionStore.getState();
      const signals = await companionStore.processMessage(content);

      // 3. Update user message with emotional signals
      if (signals) {
        await supabase
          .from('messages')
          .update({ emotional_signals: signals })
          .eq('id', userMsg.id);
      }

      // 4. Retrieve relevant memories
      const memories = await retrieveMemories(content, userId);

      // 5. Build system prompt
      const emotionalState = useCompanionStore.getState().emotionalState;
      if (!emotionalState) throw new Error('Emotional state not loaded');

      const systemPrompt = buildSystemPrompt(emotionalState, memories);

      // 6. Build message history for API
      const apiMessages: ChatCompletionMessage[] = [
        { role: 'system', content: systemPrompt },
        ...updatedMessages.slice(-20).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ];

      // 7. Create streaming placeholder message
      const streamId = STREAMING_ID + Date.now();
      const placeholder: Message = {
        id: streamId,
        conversation_id: conversationId,
        role: 'assistant',
        content: '',
        emotional_signals: null,
        created_at: new Date().toISOString(),
      };

      set({
        messages: [...get().messages, placeholder],
        streamingMessageId: streamId,
      });

      // 8. Stream response from OpenRouter
      const fullText = await chatCompletionStream(apiMessages, (token) => {
        const current = get().messages;
        const idx = current.findIndex((m) => m.id === streamId);
        if (idx === -1) return;

        const updated = [...current];
        updated[idx] = { ...updated[idx], content: updated[idx].content + token };
        set({ messages: updated });
      });

      // 9. Persist final assistant message to Supabase
      const { data: assistantMsg, error: assistantError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: fullText,
        })
        .select()
        .single();

      if (assistantError) throw assistantError;

      // 10. Replace placeholder with persisted message
      const current = get().messages;
      const idx = current.findIndex((m) => m.id === streamId);
      if (idx !== -1) {
        const updated = [...current];
        updated[idx] = assistantMsg as Message;
        set({ messages: updated, streamingMessageId: null });
      }
    } catch (error: any) {
      // Remove placeholder if streaming failed
      const streamId = get().streamingMessageId;
      if (streamId) {
        set({
          messages: get().messages.filter((m) => m.id !== streamId),
          streamingMessageId: null,
        });
      }
      set({ error: error.message || 'Failed to send message' });
    } finally {
      set({ isGenerating: false });
    }
  },

  extractMemories: async (userId: string) => {
    const { messages, conversationId } = get();
    if (messages.length < CONFIG.emotional.minConversationForMemory) return;

    try {
      const conversationText = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      const extractionPrompt = buildMemoryExtractionPrompt(conversationText);
      const result = await chatCompletion([
        { role: 'user', content: extractionPrompt },
      ]);

      // Parse the JSON response
      let extracted: Array<{ content: string; memory_type: string; importance: number }>;
      try {
        extracted = JSON.parse(result);
      } catch {
        return; // Failed to parse, skip
      }

      if (!Array.isArray(extracted) || extracted.length === 0) return;

      // Generate embeddings and store memories
      for (const mem of extracted.slice(0, 3)) {
        try {
          const embedding = await getEmbedding(mem.content);
          await supabase.from('memories').insert({
            user_id: userId,
            content: mem.content,
            memory_type: mem.memory_type,
            importance: mem.importance,
            embedding: JSON.stringify(embedding),
          });
        } catch {
          // Skip failed individual memories
        }
      }

      // Update conversation summary
      if (conversationId) {
        const emotionalState = useCompanionStore.getState().emotionalState;
        await supabase
          .from('conversations')
          .update({
            summary: extracted.map((m) => m.content).join('; '),
            emotional_snapshot: emotionalState
              ? {
                  valence: emotionalState.valence,
                  arousal: emotionalState.arousal,
                  active_emotion: emotionalState.active_emotion,
                }
              : null,
            ended_at: new Date().toISOString(),
          })
          .eq('id', conversationId);
      }
    } catch {
      // Memory extraction is best-effort
    }
  },

  clearChat: () => {
    set({ messages: [], conversationId: null, isGenerating: false, streamingMessageId: null, error: null });
  },
}));

async function retrieveMemories(query: string, userId: string): Promise<Memory[]> {
  try {
    const embedding = await getEmbedding(query);
    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: JSON.stringify(embedding),
      match_user_id: userId,
      match_threshold: 0.5,
      match_count: CONFIG.emotional.memoryTopK,
    });

    if (error) throw error;
    return data || [];
  } catch {
    return []; // Memory retrieval is best-effort
  }
}
