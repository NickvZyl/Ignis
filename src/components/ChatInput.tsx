import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@/constants/ignisColors';

interface Props {
  onSend: (message: string, imageUri?: string) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const canSend = (text.trim().length > 0 || imageUri !== null) && !disabled;

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim(), imageUri ?? undefined);
    setText('');
    setImageUri(null);
  };

  const openPicker = () => {
    Alert.alert(
      'Attach a photo',
      undefined,
      [
        { text: 'Camera', onPress: pickFromCamera },
        { text: 'Gallery', onPress: pickFromGallery },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  return (
    <View style={{ paddingBottom: insets.bottom }}>
      {imageUri && (
        <View style={styles.previewWrap}>
          <Image source={{ uri: imageUri }} style={styles.preview} />
          <TouchableOpacity style={styles.previewClose} onPress={() => setImageUri(null)}>
            <View style={styles.previewX}>
              <View style={[styles.previewXBar, { transform: [{ rotate: '45deg' }] }]} />
              <View style={[styles.previewXBar, { transform: [{ rotate: '-45deg' }] }]} />
            </View>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.container}>
        <TouchableOpacity style={styles.attachButton} onPress={openPicker} disabled={disabled}>
          <View style={styles.attachPlus}>
            <View style={styles.attachBarH} />
            <View style={styles.attachBarV} />
          </View>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Say something..."
          placeholderTextColor={COLORS.textSecondary}
          multiline
          maxLength={2000}
          editable={!disabled}
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!canSend}
        >
          {disabled ? (
            <ActivityIndicator size="small" color={COLORS.textSecondary} />
          ) : (
            <SendIcon />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SendIcon() {
  return (
    <View style={styles.sendIcon}>
      <View style={styles.arrow} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  attachPlus: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachBarH: {
    position: 'absolute',
    width: 14,
    height: 2,
    backgroundColor: COLORS.textSecondary,
    borderRadius: 1,
  },
  attachBarV: {
    position: 'absolute',
    width: 2,
    height: 14,
    backgroundColor: COLORS.textSecondary,
    borderRadius: 1,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: COLORS.text,
    maxHeight: 120,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.surfaceLight,
  },
  sendIcon: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },
  previewWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: COLORS.background,
    position: 'relative',
    alignSelf: 'flex-start',
  },
  preview: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceLight,
  },
  previewClose: {
    position: 'absolute',
    top: 2,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewX: {
    width: 12,
    height: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewXBar: {
    position: 'absolute',
    width: 12,
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
});
