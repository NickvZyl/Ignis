import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Text,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import ChatBubble from '@/components/ChatBubble';
import ChatInput from '@/components/ChatInput';
import TypingIndicator from '@/components/TypingIndicator';
import { useChatStore } from '@/stores/chat-store';
import { useAuthStore } from '@/stores/auth-store';
import { registerForPush } from '@/lib/push';
import { postPresence } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { COLORS } from '@/constants/ignisColors';
import type { Message } from '@/types';

export default function ChatScreen() {
  const flatListRef = useRef<FlatList>(null);

  const { user, signOut } = useAuthStore();
  const { messages, isGenerating, streamingMessageId, error, startConversation, refreshMessages, sendMessage, clearChat } =
    useChatStore();

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    startConversation(userId);
    registerForPush(userId).catch((e) => console.warn('[push] registration failed', e));

    const pingPresence = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) postPresence(token);
    };
    pingPresence();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        pingPresence();
        refreshMessages();
      }
    });
    return () => sub.remove();
  }, [userId]);

  const handleSend = useCallback(
    (content: string) => {
      if (!userId) return;
      sendMessage(content, userId);
    },
    [userId, sendMessage]
  );

  const handleSignOut = async () => {
    clearChat();
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  const renderItem = useCallback(
    ({ item }: { item: Message }) => <ChatBubble message={item} />,
    []
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const reversedMessages = [...messages].reverse();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Ignis</Text>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <FlatList
          ref={flatListRef}
          data={reversedMessages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          inverted
          contentContainerStyle={styles.messageList}
          ListHeaderComponent={isGenerating && !streamingMessageId ? <TypingIndicator /> : null}
        />

        <ChatInput onSend={handleSend} disabled={isGenerating} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: '#F59E0B',
    fontSize: 22,
    fontWeight: '700',
  },
  signOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceLight,
  },
  signOutText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  errorBanner: {
    backgroundColor: COLORS.error,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
  },
  messageList: {
    paddingVertical: 8,
  },
});
