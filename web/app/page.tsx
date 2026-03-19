'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '@web/stores/auth-store';
import { useCompanionStore } from '@web/stores/companion-store';
import { useChatStore } from '@web/stores/chat-store';
import IgnisScene from '@web/components/IgnisScene';
import ChatBubble from '@web/components/ChatBubble';
import ChatInput from '@web/components/ChatInput';
import TypingIndicator from '@web/components/TypingIndicator';
import AuthForm from '@web/components/AuthForm';
import { loadSchedule } from '@web/lib/schedule';
import type { Message } from '@/types';

export default function Home() {
  const { session, user, initialized, initialize, signOut } = useAuthStore();
  const { loadState, applySessionStart } = useCompanionStore();
  const { messages, isGenerating, streamingMessageId, error, startConversation, sendMessage, sendProactiveMessage, extractMemories, clearChat } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = user?.id;

  // Resizable split between scene and chat
  const [sceneHeight, setSceneHeight] = useState(() => {
    try { const v = localStorage.getItem('ignis_scene_height'); return v ? parseInt(v) : 660; } catch { return 660; }
  });
  const draggingDivider = useRef(false);
  const dividerStartY = useRef(0);
  const dividerStartH = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingDivider.current) return;
      const delta = e.clientY - dividerStartY.current;
      const newH = Math.max(200, Math.min(window.innerHeight - 150, dividerStartH.current + delta));
      setSceneHeight(newH);
    };
    const onUp = () => {
      if (draggingDivider.current) {
        draggingDivider.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem('ignis_scene_height', String(sceneHeight));
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [sceneHeight]);

  const startDividerDrag = useCallback((e: React.MouseEvent) => {
    draggingDivider.current = true;
    dividerStartY.current = e.clientY;
    dividerStartH.current = sceneHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }, [sceneHeight]);

  // Initialize auth
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Initialize companion + conversation when authenticated
  useEffect(() => {
    if (!userId) return;
    const init = async () => {
      await loadState(userId);
      await applySessionStart();
      await startConversation(userId);
    };
    init();
  }, [userId]);

  // Extract memories on page unload / tab close
  useEffect(() => {
    if (!userId) return;
    const handleUnload = () => {
      extractMemories(userId);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [userId, extractMemories]);

  // Smart inactivity watcher — uses model-scheduled checkin time, falls back to 3 min
  const { nextCheckinSeconds, nextCheckinReason } = useChatStore();

  useEffect(() => {
    if (!userId || messages.length === 0) return;

    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant') {
      // Use model-scheduled time if available, otherwise default 3 minutes
      const delayMs = nextCheckinSeconds
        ? nextCheckinSeconds * 1000
        : 3 * 60 * 1000;

      console.log(`[Checkin] timer set: ${Math.round(delayMs / 1000)}s${nextCheckinReason ? ` (${nextCheckinReason})` : ' (default)'}`);

      inactivityTimerRef.current = setTimeout(() => {
        // Don't follow up if Ignis is scheduled to sleep
        const hour = new Date().getHours();
        const schedule = loadSchedule();
        const isSleeping = schedule[hour].label === 'sleeping';
        if (!useChatStore.getState().isGenerating && !isSleeping) {
          sendProactiveMessage(userId);
        }
      }, delayMs);
    }

    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [messages.length, userId, nextCheckinSeconds]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(
    (content: string) => {
      if (!userId) return;
      sendMessage(content, userId);
    },
    [userId, sendMessage],
  );

  const handleSignOut = async () => {
    clearChat();
    await signOut();
  };

  if (!initialized) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-2 border-text-secondary border-t-text rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <AuthForm />;
  }

  return (
    <div className="h-screen flex flex-col bg-bg">
      {/* Scene — scales to fit available height */}
      <div className="relative shrink-0 overflow-hidden" style={{ height: sceneHeight, background: '#0a0a0e' }}>
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            transform: `scale(${Math.min(sceneHeight / 670, 1.5)})`,
            transformOrigin: 'center center',
          }}>
            <IgnisScene />
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-surface-light text-text-secondary text-xs hover:text-text transition z-10"
        >
          Sign Out
        </button>
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={startDividerDrag}
        className="shrink-0 flex items-center justify-center border-y border-border"
        style={{ height: 10, cursor: 'row-resize', background: '#1a1a20' }}
      >
        <div style={{ width: 40, height: 3, borderRadius: 2, background: '#555' }} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-error px-4 py-2 text-white text-sm text-center shrink-0">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-2">
        {messages.map((msg: Message) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
        {isGenerating && !streamingMessageId && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isGenerating} />
    </div>
  );
}
