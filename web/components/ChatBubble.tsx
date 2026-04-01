'use client';

import { useRef, useState, useCallback } from 'react';
import { useChatStore } from '@web/stores/chat-store';
import { useCompanionStore } from '@web/stores/companion-store';
import { EMOTION_COLORS } from '@/constants/ignisColors';
import type { Message } from '@/types';

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

function formatTimestamp(dateStr: string, prevDateStr?: string): string | null {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  // Show date separator if first message or different day from previous
  if (prevDateStr) {
    const prev = new Date(prevDateStr);
    if (d.toDateString() === prev.toDateString()) return null;
  }

  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

interface Props {
  message: Message;
  prevMessage?: Message;
  onReply: (message: Message) => void;
  allMessages: Message[];
}

export default function ChatBubble({ message, prevMessage, onReply, allMessages }: Props) {
  const isUser = message.role === 'user';
  const streamingId = useChatStore((s) => s.streamingMessageId);
  const isStreaming = message.id === streamingId;
  const activeEmotion = useCompanionStore((s) => s.emotionalState?.active_emotion ?? 'calm');
  const emotionColor = EMOTION_COLORS[activeEmotion] ?? '#7EC8B8';

  // Swipe state
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const [swipeX, setSwipeX] = useState(0);
  const swiping = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swiping.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // Only swipe right, and only if horizontal movement dominates
    if (!swiping.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiping.current = true;
    }

    if (swiping.current && dx > 0) {
      setSwipeX(Math.min(80, dx * 0.5));
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (swipeX > 50) {
      onReply(message);
    }
    setSwipeX(0);
    swiping.current = false;
  }, [swipeX, message, onReply]);

  // Mouse drag for desktop
  const mouseStartX = useRef(0);
  const mouseSwiping = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    mouseStartX.current = e.clientX;
    mouseSwiping.current = false;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - mouseStartX.current;
      if (!mouseSwiping.current && Math.abs(dx) > 10) {
        mouseSwiping.current = true;
      }
      if (mouseSwiping.current && dx > 0) {
        setSwipeX(Math.min(80, dx * 0.5));
      }
    };

    const onMouseUp = () => {
      if (swipeX > 50) {
        onReply(message);
      }
      setSwipeX(0);
      mouseSwiping.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [swipeX, message, onReply]);

  // Reply context
  const replyTo = message.reply_to_id
    ? allMessages.find((m) => m.id === message.reply_to_id)
    : null;

  // Date separator
  const dateSeparator = formatTimestamp(message.created_at, prevMessage?.created_at);

  // Show time gap between messages (> 5 min)
  const showTime = (() => {
    if (!prevMessage) return true;
    const gap = new Date(message.created_at).getTime() - new Date(prevMessage.created_at).getTime();
    return gap > 5 * 60 * 1000; // 5 minutes
  })();

  return (
    <>
      {dateSeparator && (
        <div className="flex justify-center py-3">
          <span className="text-[9px] text-text-secondary bg-surface-light px-3 py-1.5 rounded-full" style={{ fontFamily: "'Press Start 2P', monospace" }}>
            {dateSeparator}
          </span>
        </div>
      )}

      {showTime && !dateSeparator && (
        <div className="flex justify-center py-1.5">
          <span className="text-[8px] text-text-secondary" style={{ fontFamily: "'Press Start 2P', monospace" }}>
            {formatTime(message.created_at)}
          </span>
        </div>
      )}

      <div
        className={`px-4 py-1 flex ${isUser ? 'justify-end' : 'justify-start'}`}
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: swipeX === 0 ? 'transform 0.2s ease-out' : 'none',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
      >
        {/* Reply arrow indicator */}
        {swipeX > 20 && (
          <div
            className="absolute left-2 flex items-center justify-center"
            style={{ opacity: Math.min(1, swipeX / 50) }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 10 20 15 15 20" />
              <path d="M4 4v7a4 4 0 0 0 4 4h12" />
            </svg>
          </div>
        )}

        <div className="max-w-[80%] flex flex-col">
          {/* Reply preview */}
          {replyTo && (
            <div
              className="text-[12px] px-3 py-1.5 mb-0.5 rounded-lg border-l-2 bg-surface text-text-secondary"
              style={{ borderLeftColor: isUser ? '#6b4a32' : emotionColor }}
            >
              <div className="font-medium text-[11px] mb-0.5" style={{ opacity: 0.7, fontFamily: "'Press Start 2P', monospace", fontSize: '8px' }}>
                {replyTo.role === 'user' ? 'You' : 'Igni'}
              </div>
              <div className="line-clamp-2">{replyTo.content}</div>
            </div>
          )}

          {/* Message bubble */}
          <div
            className={`px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed whitespace-pre-wrap ${
              isUser
                ? 'bg-user-bubble text-text rounded-br-sm border border-user-bubble-border'
                : 'bg-assistant-bubble text-text rounded-bl-sm'
            }`}
            style={!isUser ? { borderLeft: `2px solid ${emotionColor}` } : undefined}
          >
            {message.image_url && (
              <img
                src={message.image_url}
                alt="Shared image"
                className="max-w-full rounded-lg mb-2 cursor-pointer"
                style={{ maxHeight: '240px', objectFit: 'contain' }}
                onClick={() => window.open(message.image_url!, '_blank')}
              />
            )}
            {message.content}
            {isStreaming && (
              <span className="text-text-secondary" style={{ animation: 'blink 0.8s step-end infinite' }}>
                &#x258C;
              </span>
            )}
          </div>

          {/* Inline timestamp */}
          <div className={`mt-0.5 px-1 ${isUser ? 'text-right' : 'text-left'}`} style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '7px', color: 'var(--color-text-secondary)' }}>
            {formatTime(message.created_at)}
          </div>
        </div>
      </div>
    </>
  );
}
