import React from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from 'react-native-reanimated';
import { EMOTION_COLORS, ROLE_COLORS, COLORS } from '@/constants/ignisColors';
import { CONFIG } from '@/constants/config';
import { useCompanionStore } from '@/stores/companion-store';
import type { EmotionLabel, RoleLabel } from '@/types';

function colorToRGB(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

export default function Avatar() {
  const emotionalState = useCompanionStore((s) => s.emotionalState);
  const emotion = emotionalState?.active_emotion ?? 'calm';
  const role = emotionalState?.active_role ?? null;
  const drift = emotionalState?.drift ?? 0;

  const emotionColor = EMOTION_COLORS[emotion];
  const emotionRGB = colorToRGB(emotionColor);

  const eR = useSharedValue(emotionRGB.r);
  const eG = useSharedValue(emotionRGB.g);
  const eB = useSharedValue(emotionRGB.b);

  // Role color (only used when role is not null)
  const roleColor = role ? ROLE_COLORS[role] : EMOTION_COLORS.calm;
  const roleRGB = colorToRGB(roleColor);
  const rR = useSharedValue(roleRGB.r);
  const rG = useSharedValue(roleRGB.g);
  const rB = useSharedValue(roleRGB.b);

  // Glow intensity: inverse of drift (engaged = bright glow, drifting = dim)
  const glowIntensity = useSharedValue(1 - drift);

  React.useEffect(() => {
    const rgb = colorToRGB(EMOTION_COLORS[emotion]);
    eR.value = withTiming(rgb.r, { duration: 800 });
    eG.value = withTiming(rgb.g, { duration: 800 });
    eB.value = withTiming(rgb.b, { duration: 800 });
  }, [emotion]);

  React.useEffect(() => {
    if (role) {
      const rgb = colorToRGB(ROLE_COLORS[role]);
      rR.value = withTiming(rgb.r, { duration: 800 });
      rG.value = withTiming(rgb.g, { duration: 800 });
      rB.value = withTiming(rgb.b, { duration: 800 });
    }
  }, [role]);

  React.useEffect(() => {
    glowIntensity.value = withTiming(1 - drift, { duration: 600 });
  }, [drift]);

  const emotionStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgb(${Math.round(eR.value)}, ${Math.round(eG.value)}, ${Math.round(eB.value)})`,
  }));

  const glowStyle = useAnimatedStyle(() => {
    const intensity = glowIntensity.value;
    if (Platform.OS === 'ios') {
      return {
        shadowColor: `rgb(${Math.round(eR.value)}, ${Math.round(eG.value)}, ${Math.round(eB.value)})`,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4 * intensity,
        shadowRadius: 12 * intensity,
      };
    }
    // Android: elevation for glow
    return {
      elevation: Math.round(8 * intensity),
    };
  });

  const roleStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgb(${Math.round(rR.value)}, ${Math.round(rG.value)}, ${Math.round(rB.value)})`,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.emotionCircle, emotionStyle, glowStyle]}>
        {role !== null && (
          <Animated.View style={[styles.roleSquare, roleStyle]} />
        )}
      </Animated.View>
      <Text style={styles.emotionLabel}>{emotion}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  emotionCircle: {
    width: CONFIG.app.avatarSize,
    height: CONFIG.app.avatarSize,
    borderRadius: CONFIG.app.avatarSize / 2,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 6,
  },
  roleSquare: {
    width: CONFIG.app.roleIndicatorSize,
    height: CONFIG.app.roleIndicatorSize,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  emotionLabel: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
});
