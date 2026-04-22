import React from 'react';
import { View, Text, StyleSheet, Image, Linking, Pressable } from 'react-native';
import { COLORS } from '@/constants/ignisColors';
import { useChatStore } from '@/stores/chat-store';
import type { Message } from '@/types';

interface Props {
  message: Message;
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

function renderWithLinks(content: string) {
  const parts = content.split(URL_PATTERN);
  return parts.map((part, i) => {
    if (part.match(URL_PATTERN)) {
      return (
        <Text
          key={i}
          style={styles.link}
          onPress={() => Linking.openURL(part).catch(() => {})}
        >
          {part}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

export default function ChatBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const streamingId = useChatStore((s) => s.streamingMessageId);
  const isStreaming = message.id === streamingId;

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        {message.image_url && (
          <Image
            source={{ uri: message.image_url }}
            style={styles.image}
            resizeMode="cover"
          />
        )}
        {!!message.content && (
          <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>
            {renderWithLinks(message.content)}
            {isStreaming && <Text style={styles.cursor}>{'▌'}</Text>}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    overflow: 'hidden',
  },
  userBubble: {
    backgroundColor: COLORS.userBubble,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: COLORS.assistantBubble,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: 10,
    marginBottom: 6,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  userText: {
    color: '#FFFFFF',
  },
  assistantText: {
    color: COLORS.text,
  },
  cursor: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  link: {
    color: '#60A5FA',
    textDecorationLine: 'underline',
  },
});
