'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { Message } from '@/types';

interface Props {
  onSend: (message: string, replyToId?: string) => void;
  disabled: boolean;
  replyTo?: Message | null;
  onCancelReply?: () => void;
}

export default function ChatInput({ onSend, disabled, replyTo, onCancelReply }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Refocus textarea whenever generation finishes
  useEffect(() => {
    if (!disabled) textareaRef.current?.focus({ preventScroll: true });
  }, [disabled]);

  // Focus when reply is set
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus({ preventScroll: true });
  }, [replyTo]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, replyTo?.id);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  }, [text, disabled, onSend, replyTo]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(120, el.scrollHeight) + 'px';
    }
  };

  return (
    <div className="bg-bg shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Reply preview bar */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border">
          <div className="w-0.5 h-8 bg-accent rounded-full shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-accent font-medium" style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '8px' }}>
              Replying to {replyTo.role === 'user' ? 'yourself' : 'Igni'}
            </div>
            <div className="text-[12px] text-text-secondary truncate">
              {replyTo.content}
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="text-text-secondary hover:text-text p-1 shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 py-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Say something to Igni..."
          rows={1}
          maxLength={2000}
          className="flex-1 bg-surface-light rounded-2xl px-4 py-2.5 text-[15px] text-text resize-none max-h-[120px] outline-none border border-border placeholder:text-text-secondary focus:shadow-[0_0_0_1px_var(--color-accent-dim)] transition-shadow"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center shrink-0 disabled:bg-surface-light disabled:text-text-secondary hover:brightness-110 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
