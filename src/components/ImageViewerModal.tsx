import React from 'react';
import { Modal, Pressable, StyleSheet, View, Share, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image, ImageSource } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useSignedUrl } from '@/api/signedUrls';

interface ImageViewerModalProps {
  visible: boolean;
  onClose: () => void;
  imageSource: ImageSource | string | null;
  caption?: string;
}

const STOCK_IMAGES: Record<string, any> = {
  event_tech_hackathon: require('../../assets/images/event_tech_hackathon.jpg'),
  event_academic_symposium: require('../../assets/images/event_academic_symposium.jpg'),
  campus_students_photo: require('../../assets/images/campus_students_photo.jpg'),
  campus_library_study: require('../../assets/images/campus_library_study.jpg'),
  student_rep_group: require('../../assets/images/student_rep_group.jpg'),
  hero_student_3d: require('../../assets/images/hero_student_3d.jpg'),
};

export function ImageViewerModal({
  visible,
  onClose,
  imageSource,
  caption,
}: ImageViewerModalProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isString = typeof imageSource === 'string';
  const stockSource = isString ? STOCK_IMAGES[imageSource] : null;
  const isFileUri = isString && imageSource.startsWith('file');

  const mediaPath = isString && !stockSource && !isFileUri ? imageSource : null;
  const { url: signedUrl, loading } = useSignedUrl('campus-media', visible ? mediaPath : null);

  if (!visible || !imageSource) return null;

  async function handleShare() {
    try {
      await Share.share({
        message: caption ? `Campus Photo: ${caption}` : 'Campus Media from Lioris App',
      });
    } catch {}
  }

  const resolvedSource = stockSource
    ? stockSource
    : isFileUri
    ? { uri: imageSource as string }
    : signedUrl
    ? { uri: signedUrl }
    : isString && imageSource.startsWith('http')
    ? { uri: imageSource }
    : !isString
    ? imageSource
    : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View accessibilityViewIsModal style={styles.container}>
        {/* Top Header Bar */}
        <View style={[styles.topBar, { top: Math.max(insets.top, 16) }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.iconButton} accessibilityLabel="Close Fullscreen View">
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>

          <View style={styles.actionsRight}>
            <Pressable onPress={handleShare} hitSlop={12} style={styles.iconButton} accessibilityLabel="Share Image">
              <Ionicons name="share-outline" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        {/* Main Centered Full-Screen Image */}
        <Pressable accessibilityRole="button" accessibilityLabel="Close image viewer" style={[styles.imageWrapper, { width, height: height * 0.82 }]} onPress={onClose}>
          {loading && !resolvedSource ? (
            <ActivityIndicator size="large" color="#FFFFFF" />
          ) : resolvedSource ? (
            <Image
              source={resolvedSource}
              accessibilityLabel={caption || 'Full screen image'}
              style={styles.fullImage}
              contentFit="contain"
              transition={300}
            />
          ) : null}
        </Pressable>

        {/* Caption Bar */}
        {caption ? (
          <View style={[styles.captionBar, { bottom: Math.max(insets.bottom, 24) }]}>
            <AppText variant="bodySmall" weight="medium" tone="inverse" style={{ textAlign: 'center' }}>
              {caption}
            </AppText>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  captionBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
});
