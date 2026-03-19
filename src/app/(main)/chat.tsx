import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  AppState,
  TouchableOpacity,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Avatar from '@/components/Avatar';
import ChatBubble from '@/components/ChatBubble';
import ChatInput from '@/components/ChatInput';
import TypingIndicator from '@/components/TypingIndicator';
import { useChatStore } from '@/stores/chat-store';
import { useCompanionStore } from '@/stores/companion-store';
import { useAuthStore } from '@/stores/auth-store';
import { COLORS } from '@/constants/ignisColors';
import type { Message } from '@/types';

export default function ChatScreen() {
  const flatListRef = useRef<FlatList>(null);
  const appState = useRef(AppState.currentState);

  const { user, signOut } = useAuthStore();
  const { messages, isGenerating, streamingMessageId, error, startConversation, sendMessage, extractMemories, clearChat } =
    useChatStore();
  const { loadState, applySessionStart } = useCompanionStore();

  const userId = user?.id;

  // Initialize on mount
  useEffect(() => {
    if (!userId) return;

    const init = async () => {
      await loadState(userId);
      await applySessionStart();
      await startConversation(userId);
    };

    init();
  }, [userId]);

  // Handle app state changes for memory extraction
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/active/) &&
        nextAppState.match(/inactive|background/)
      ) {
        // App going to background — extract memories
        if (userId) {
          extractMemories(userId);
        }
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [userId]);

  const handleSend = useCallback(
    (content: string) => {
      if (!userId) return;
      sendMessage(content, userId);
    },
    [userId, sendMessage]
  );

  const handleSignOut = async () => {
    if (userId) {
      await extractMemories(userId);
    }
    clearChat();
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  const renderItem = useCallback(
    ({ item }: { item: Message }) => <ChatBubble message={item} />,
    []
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  // Inverted FlatList expects newest-first
  const reversedMessages = [...messages].reverse();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <Avatar />
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Error banner */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={reversedMessages}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          inverted
          contentContainerStyle={styles.messageList}
          ListHeaderComponent={isGenerating && !streamingMessageId ? <TypingIndicator /> : null}
        />

        {/* Input */}
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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    position: 'relative',
  },
  signOutBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
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
