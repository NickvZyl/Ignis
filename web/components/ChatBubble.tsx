'use client';

import { useChatStore } from '@web/stores/chat-store';
import type { Message } from '@/types';

export default function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const streamingId = useChatStore((s) => s.streamingMessageId);
  const isStreaming = message.id === streamingId;

  return (
    <div className={`px-4 py-1 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-user-bubble text-white rounded-br-sm'
            : 'bg-assistant-bubble text-text border border-border rounded-bl-sm'
        }`}
      >
        {message.content}
        {isStreaming && (
          <span className="text-text-secondary" style={{ animation: 'blink 0.8s step-end infinite' }}>
            &#x258C;
          </span>
        )}
      </div>
    </div>
  );
}
