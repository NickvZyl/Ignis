'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '@web/stores/auth-store';
import { useCompanionStore } from '@web/stores/companion-store';
import { useChatStore } from '@web/stores/chat-store';
import { useRoomStore } from '@web/stores/room-store';
import IgnisScene from '@web/components/IgnisScene';
import ChatBubble from '@web/components/ChatBubble';
import ChatInput from '@web/components/ChatInput';
import TypingIndicator from '@web/components/TypingIndicator';
import AuthForm from '@web/components/AuthForm';
import { loadSchedule, getCurrentSlot, syncScheduleFromCloud } from '@web/lib/schedule';
import { useReflectionStore } from '@web/stores/reflection-store';
import { useBackgroundStore } from '@web/stores/background-store';
import { useActivityStore } from '@web/stores/activity-store';
import { EMOTION_COLORS, ROLE_COLORS } from '@/constants/ignisColors';
import type { Message } from '@/types';

export default function Home() {
  const { session, user, initialized, initialize, signOut } = useAuthStore();
  const { loadState, applySessionStart } = useCompanionStore();
  const { messages, isGenerating, streamingMessageId, error, startConversation, sendMessage, sendProactiveMessage, extractMemories, clearChat } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [devModal, setDevModal] = useState<string | null>(null);
  const { mode, setMode } = useRoomStore();
  const emotionalState = useCompanionStore((s) => s.emotionalState);
  const activeEmotion = emotionalState?.active_emotion ?? 'calm';
  const activeRole = emotionalState?.active_role ?? null;
  const userId = user?.id;

  // Resizable split between scene and chat
  const [sceneHeight, setSceneHeight] = useState(() => {
    try { const v = localStorage.getItem('ignis_scene_height'); return v ? parseInt(v) : 660; } catch { return 660; }
  });
  const draggingDivider = useRef(false);
  const dividerStartY = useRef(0);
  const dividerStartH = useRef(0);
  const [isMobile, setIsMobile] = useState(false);
  const [winWidth, setWinWidth] = useState(1024);
  const initialHeightRef = useRef(0);

  useEffect(() => {
    initialHeightRef.current = window.innerHeight;
    setIsMobile(window.innerWidth < 768);
    setWinWidth(window.innerWidth);
    const onResize = () => {
      setIsMobile(window.innerWidth < 768);
      setWinWidth(window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!draggingDivider.current) return;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const delta = clientY - dividerStartY.current;
      const newH = Math.max(150, Math.min((initialHeightRef.current || 768) - 120, dividerStartH.current + delta));
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
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [sceneHeight]);

  const startDividerDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    draggingDivider.current = true;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dividerStartY.current = clientY;
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
  const syncFromCloud = useRoomStore(s => s.syncFromCloud);
  useEffect(() => {
    if (!userId) return;
    const init = async () => {
      // Phase 1: All independent data fetches in parallel
      await Promise.all([
        syncFromCloud(),
        syncScheduleFromCloud(),
        loadState(userId),
        useActivityStore.getState().loadToday(userId),
        useReflectionStore.getState().loadSelfMemories(userId),
      ]);

      // Phase 2: Depends on loadState completing (emotional state needed)
      const es = useCompanionStore.getState().emotionalState;
      const hoursSince = es
        ? (Date.now() - new Date(es.last_interaction_at).getTime()) / (1000 * 60 * 60)
        : 0;

      await Promise.all([
        applySessionStart(),
        startConversation(userId),
      ]);

      // Phase 3: Auto-greet if returning after absence
      if (hoursSince >= 2) {
        const schedule = loadSchedule();
        const isSleeping = schedule[getCurrentSlot()].label === 'sleeping';
        if (!isSleeping) {
          useChatStore.getState().sendReturnGreeting(userId, hoursSince);
        }
      }
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

  // Reflection timer — runs every 60 minutes, internal 45-min cooldown prevents over-firing
  useEffect(() => {
    if (!userId) return;
    const reflectionInterval = setInterval(() => {
      if (!useChatStore.getState().isGenerating) {
        useReflectionStore.getState().runReflectionCycle(userId);
      }
    }, 60 * 60 * 1000);
    return () => clearInterval(reflectionInterval);
  }, [userId]);

  // Activity logging — track slot transitions and log to activity store
  const lastSlotRef = useRef(getCurrentSlot());
  useEffect(() => {
    if (!userId) return;
    const slotCheckInterval = setInterval(() => {
      const currentSlot = getCurrentSlot();
      if (currentSlot !== lastSlotRef.current) {
        lastSlotRef.current = currentSlot;
        const schedule = loadSchedule();
        const block = schedule[currentSlot];
        const emotion = useCompanionStore.getState().emotionalState?.active_emotion ?? null;
        useActivityStore.getState().logTransition(userId, block.scene, block.primary, block.label, emotion);

        // Apply environmental influence on emotion (time of day + activity)
        useCompanionStore.getState().applyEnvironment(block.label, new Date().getHours());

        // Trigger dream consolidation when entering sleep (once per night)
        if (block.label === 'sleeping') {
          const prevSlot = (currentSlot - 1 + 96) % 96;
          const prevBlock = schedule[prevSlot];
          if (prevBlock.label !== 'sleeping') {
            // Just transitioned into sleep — trigger dream
            console.log('[Dream] sleep transition detected, triggering consolidation');
            useReflectionStore.getState().triggerDreamConsolidation(userId);
          }
        }

        // Trigger real background activity (reading, working, garden, etc.)
        if (block.label !== 'sleeping') {
          useBackgroundStore.getState().runBackgroundActivity(userId, block.label, block.primary, block.scene);
        }

        // 30% chance to trigger reflection on scene transition (when awake)
        if (block.label !== 'sleeping' && Math.random() < 0.3 && !useChatStore.getState().isGenerating) {
          useReflectionStore.getState().runReflectionCycle(userId);
        }
      }
    }, 15_000); // check every 15 seconds
    return () => clearInterval(slotCheckInterval);
  }, [userId]);

  // Checkin timer — fires on model-scheduled [CHECKIN:] tags
  const { nextCheckinSeconds, nextCheckinReason } = useChatStore();

  useEffect(() => {
    if (!userId || messages.length === 0 || !nextCheckinSeconds) return;

    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);

    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role !== 'assistant') return;

    const delayMs = nextCheckinSeconds * 1000;
    console.log(`[Checkin] timer set: ${Math.round(delayMs / 1000)}s (${nextCheckinReason || 'scheduled'})`);

    inactivityTimerRef.current = setTimeout(() => {
      const schedule = loadSchedule();
      const isSleeping = schedule[getCurrentSlot()].label === 'sleeping';
      if (!useChatStore.getState().isGenerating && !isSleeping) {
        sendProactiveMessage(userId);
      }
    }, delayMs);

    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [messages.length, userId, nextCheckinSeconds]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(
    (content: string, replyToId?: string) => {
      if (!userId) return;
      sendMessage(content, userId, replyToId);
      setReplyTo(null);
    },
    [userId, sendMessage],
  );

  const handleReply = useCallback((message: Message) => {
    setReplyTo(message);
  }, []);

  const handleSignOut = async () => {
    clearChat();
    await signOut();
  };

  if (!initialized) {
    return (
      <div className="flex items-center justify-center bg-bg" style={{ height: '100svh' }}>
        <div className="w-8 h-8 border-2 border-text-secondary border-t-text rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <AuthForm />;
  }

  // Scene height: fixed pixel value, computed once on mount, never changes
  const mobileSceneH = isMobile
    ? Math.min(sceneHeight, (initialHeightRef.current || 768) * 0.45)
    : sceneHeight;
  const dividerH = isMobile ? 20 : 10;

  return (
    <div className="bg-bg" style={{ height: '100dvh', overflow: 'hidden', display: 'grid', gridTemplateRows: `${mobileSceneH}px ${dividerH}px 1fr auto` }}>
      {/* Scene — row 1: fixed pixel height, grid won't shrink it */}
      <div className="relative overflow-hidden" style={{
        background: '#0a0a0e',
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
        zIndex: 1,
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            transform: `scale(${isMobile
              ? (winWidth - 8) / 768
              : Math.min(sceneHeight / 670, 1.5)
            })`,
            transformOrigin: 'center center',
          }}>
            <IgnisScene />
          </div>
        </div>
        {/* Menu button */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="absolute top-2 right-2 md:top-4 md:right-4 w-9 h-9 rounded-lg bg-surface-light flex items-center justify-center z-10 hover:brightness-125 transition"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9A8B7A" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>

        {/* Menu popup */}
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
            <div
              className="absolute top-12 right-2 md:top-14 md:right-4 z-30 rounded-xl border border-border overflow-hidden"
              style={{ background: '#2a1a0f', fontFamily: "'Press Start 2P', monospace", minWidth: 180 }}
            >
              {/* Emotion status */}
              <div className="px-3 py-2.5 border-b border-border">
                <div className="flex items-center gap-2 text-[8px] tracking-wider">
                  <span style={{ color: EMOTION_COLORS[activeEmotion] }}>● {activeEmotion.toUpperCase()}</span>
                  {activeRole && <span style={{ color: ROLE_COLORS[activeRole], opacity: 0.6 }}>▪ {activeRole.toUpperCase()}</span>}
                </div>
              </div>

              {/* Edit mode toggle */}
              <button
                onClick={() => { setMode(mode === 'edit' ? 'live' : 'edit'); setMenuOpen(false); }}
                className="w-full px-3 py-2.5 text-[8px] tracking-wider text-left hover:bg-surface-light transition-colors"
                style={{ color: mode === 'edit' ? '#F5D03B' : '#9A8B7A' }}
              >
                {mode === 'edit' ? '✓ EDIT MODE' : 'EDIT MODE'}
              </button>

              {/* Dev tools */}
              <div className="border-t border-border">
                {[
                  { label: 'PIXEL', href: '/dev/editor', color: '#06B6D4' },
                  { label: 'GALLERY', href: '/dev/gallery', color: '#F59E0B' },
                  { label: 'RESIZE', href: '/dev/resize', color: '#d070d0' },
                  { label: 'ZONES', href: '/dev/zones', color: '#e06080' },
                  { label: 'SCHEDULE', href: '/dev/schedule', color: '#a0e0a0' },
                ].map(({ label, href, color }) => (
                  <button
                    key={label}
                    onClick={() => { setDevModal(href); setMenuOpen(false); }}
                    className="w-full px-3 py-2 text-[8px] tracking-wider text-left hover:bg-surface-light transition-colors"
                    style={{ color }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Sign out */}
              <button
                onClick={() => { setMenuOpen(false); handleSignOut(); }}
                className="w-full px-3 py-2.5 text-[8px] tracking-wider text-left border-t border-border hover:bg-surface-light transition-colors"
                style={{ color: '#EF4444' }}
              >
                SIGN OUT
              </button>
            </div>
          </>
        )}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={startDividerDrag}
        onTouchStart={startDividerDrag}
        className="flex items-center justify-center"
        style={{ cursor: 'row-resize', background: 'linear-gradient(to bottom, #0a0a0e, #1a0e08)', touchAction: 'none' }}
      >
        <div style={{ width: 40, height: 3, borderRadius: 2, background: '#8B6914' }} />
      </div>

      {/* Messages — row 3 (1fr): takes all remaining space, scrolls internally */}
      <div className="overflow-y-auto py-2" style={{ minHeight: 0 }}>
        {messages.map((msg: Message, i: number) => (
          <ChatBubble
            key={msg.id}
            message={msg}
            prevMessage={messages[i - 1]}
            onReply={handleReply}
            allMessages={messages}
          />
        ))}
        {isGenerating && !streamingMessageId && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-900/80 text-red-200 text-xs flex items-center justify-between gap-2"
          style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '7px', lineHeight: '1.6' }}>
          <span>{error}</span>
          <button onClick={() => useChatStore.setState({ error: null })} className="text-red-400 hover:text-white shrink-0">✕</button>
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={isGenerating}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />

      {/* Dev tool modal */}
      {devModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          onKeyDown={(e) => { if (e.key === 'Escape') setDevModal(null); }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className="absolute inset-0 bg-black/60" onClick={() => setDevModal(null)} />
          <div className="relative z-10 w-[90vw] max-w-[1200px] flex justify-end mb-1">
            <button
              onClick={() => setDevModal(null)}
              className="px-3 py-1.5 rounded-md text-[8px] tracking-wider text-white"
              style={{ fontFamily: "'Press Start 2P', monospace", background: '#e04040' }}
            >
              CLOSE
            </button>
          </div>
          <iframe
            src={devModal}
            className="relative z-10 w-[95vw] max-w-[1400px] h-[90vh] rounded-xl border-none"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
          />
        </div>
      )}
    </div>
  );
}
