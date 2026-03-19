import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/auth-store';
import { COLORS } from '@/constants/ignisColors';

export default function Index() {
  const { initialized, session } = useAuthStore();

  useEffect(() => {
    if (!initialized) return;

    if (session) {
      router.replace('/(main)/chat');
    } else {
      router.replace('/(auth)/sign-in');
    }
  }, [initialized, session]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
