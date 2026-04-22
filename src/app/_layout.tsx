import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/stores/auth-store';
import { registerNotificationTapListener } from '@/lib/push';

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    const sub = registerNotificationTapListener((data) => {
      if (data?.type === 'proactive' || data?.type === 'checkin' || !data?.type) {
        router.replace('/(main)/chat');
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0F0F0F' },
          animation: 'fade',
        }}
      />
    </>
  );
}
