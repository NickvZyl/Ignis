'use client';

import { useCompanionStore } from '@web/stores/companion-store';
import { EMOTION_COLORS, ROLE_COLORS } from '@/constants/ignisColors';

const EMOTION_DESC: Record<string, string> = {
  bright: 'energised',
  intense: 'passionate',
  grounded: 'calm',
  reflective: 'thoughtful',
  deep: 'introspective',
  warm: 'affectionate',
  eager: 'motivated',
};

export default function Avatar() {
  const emotionalState = useCompanionStore((s) => s.emotionalState);
  const emotion = emotionalState?.active_emotion ?? 'warm';
  const role = emotionalState?.active_role ?? null;
  const drift = emotionalState?.drift ?? 0;

  const emotionColor = EMOTION_COLORS[emotion];
  const glowIntensity = 1 - drift;
  const glowRadius = Math.round(20 * glowIntensity);

  return (
    <div className="flex flex-col items-center py-4">
      <div
        className="w-[100px] h-[100px] rounded-full flex items-start justify-center pt-2"
        style={{
          backgroundColor: emotionColor,
          boxShadow: `0 0 ${glowRadius}px ${glowRadius / 2}px ${emotionColor}${Math.round(glowIntensity * 80).toString(16).padStart(2, '0')}`,
          transition: 'background-color 0.8s ease, box-shadow 0.6s ease',
        }}
      >
        {role !== null && (
          <div
            className="w-[48px] h-[48px] rounded-lg border-2 border-bg"
            style={{
              backgroundColor: ROLE_COLORS[role],
              transition: 'background-color 0.8s ease',
            }}
          />
        )}
      </div>
      <span className="mt-2 text-xs text-text-secondary italic">
        {emotion}{role ? ` · ${role}` : ''}
      </span>
    </div>
  );
}
