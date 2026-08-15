import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { createEvent } from '@/api/events';
import { EventCategory } from '@/api/types';
import { haptics } from '@/utils/haptics';

const EVENT_TYPES = ['Lioris Live Event (In-App)', 'Physical Event', 'External Event'] as const;
const CATEGORY_LABELS: Record<string, EventCategory> = {
  Academic: 'academic',
  Career: 'career',
  Social: 'student',
};
const CATEGORIES = Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>;

interface PublishEventModalProps {
  visible: boolean;
  onClose: () => void;
  onPublish: () => void;
}

export function PublishEventModal({ visible, onClose, onPublish }: PublishEventModalProps) {
  const { colors, spacing, radius } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<(typeof EVENT_TYPES)[number]>('Lioris Live Event (In-App)');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Academic');
  const [sponsored, setSponsored] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bannerUri, setBannerUri] = useState<string | null>(null);

  async function pickBanner() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setBannerUri(result.assets[0].uri);
  }

  async function handleHost() {
    haptics.medium();
    setSubmitting(true);
    try {
      const startAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3);
      const endAt = new Date(startAt.getTime() + 1000 * 60 * 90);
      await createEvent({
        title: title.trim(),
        description: description.trim() || 'No description provided.',
        category: CATEGORY_LABELS[category],
        location: eventType === 'Lioris Live Event (In-App)' ? 'Lioris Live (In-App)' : 'TBD',
        visibilityScope: 'student',
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        imageUrl: bannerUri,
        sponsored,
      });
      onPublish();
      onClose();
      setTitle('');
      setDescription('');
      setBannerUri(null);
      setSponsored(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 56, paddingHorizontal: spacing.lg }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <AppText variant="h1" weight="bold" style={{ marginBottom: spacing.lg }}>
            Publish Event
          </AppText>

          <AppTextField label="" placeholder="Event Title" value={title} onChangeText={setTitle} />
          <AppTextField
            label=""
            placeholder="Event Objective description"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginBottom: spacing.lg }}>
            <Ionicons name="sparkles" size={12} color={colors.brandPrimary} />
            <AppText variant="caption" weight="semiBold" tone="brand">
              Auto-generate with Gemini AI
            </AppText>
          </View>

          <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
            Event Type:
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
            {EVENT_TYPES.map((type) => {
              const selected = eventType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => setEventType(type)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={type}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.pill,
                    backgroundColor: selected ? colors.pastelPrimaryBg : 'transparent',
                    borderWidth: selected ? 0 : 1,
                    borderColor: colors.border,
                  }}
                >
                  <AppText variant="bodySmall" weight="semiBold" tone={selected ? 'brand' : 'secondary'}>
                    {type}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {eventType === 'Lioris Live Event (In-App)' ? (
            <View style={{ backgroundColor: colors.pastelPrimaryBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg }}>
              <AppText variant="bodySmall" style={{ color: colors.sectionLabel }}>
                ✨ Lioris Live: This event will be hosted natively on the Lioris streaming
                framework within the app. A live room will be generated 15 minutes before the
                start time.
              </AppText>
            </View>
          ) : null}

          <Pressable
            onPress={pickBanner}
            accessibilityRole="button"
            accessibilityLabel={bannerUri ? 'Change event banner' : 'Upload event banner'}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              backgroundColor: colors.pastelPrimaryBg,
              alignItems: 'center',
              paddingVertical: bannerUri ? 0 : spacing.lg,
              marginBottom: spacing.lg,
              overflow: 'hidden',
            }}
          >
            {bannerUri ? (
              <Image source={{ uri: bannerUri }} style={{ width: '100%', height: 140 }} contentFit="cover" transition={200} />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={22} color={colors.brandPrimary} style={{ marginBottom: spacing.xs }} />
                <AppText weight="semiBold" tone="brand">
                  Upload Event Banner (Photo)
                </AppText>
              </>
            )}
          </Pressable>

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
            {CATEGORIES.map((cat) => {
              const selected = category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={cat}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.pill,
                    backgroundColor: selected ? colors.pastelPrimaryBg : 'transparent',
                    borderWidth: selected ? 0 : 1,
                    borderColor: colors.border,
                  }}
                >
                  <AppText variant="bodySmall" weight="semiBold" tone={selected ? 'brand' : 'secondary'}>
                    {cat}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => setSponsored((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: sponsored }}
            accessibilityLabel="Feature as sponsored event"
            style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl }}
          >
            <Ionicons
              name={sponsored ? 'checkbox' : 'square-outline'}
              size={20}
              color={sponsored ? colors.brandPrimary : colors.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <AppText weight="semiBold" tone="brand">
                Feature as Sponsored Event 🌟
              </AppText>
              <AppText tone="secondary" variant="caption">
                Place this event under the top Showcase & Sponsored carousel
              </AppText>
            </View>
          </Pressable>
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', paddingVertical: spacing.md }}>
          <AppButton label="Cancel" variant="ghost" onPress={onClose} />
          <AppButton label="Host Event" onPress={handleHost} disabled={!title.trim()} loading={submitting} />
        </View>
      </View>
    </Modal>
  );
}
