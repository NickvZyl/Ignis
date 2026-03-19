'use client';

export default function TypingIndicator() {
  return (
    <div className="px-4 py-1 flex justify-start">
      <div className="flex gap-1 px-4 py-3 bg-assistant-bubble border border-border rounded-2xl rounded-bl-sm">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-text-secondary"
            style={{
              animation: `bounce-dot 0.6s ease-in-out infinite`,
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
