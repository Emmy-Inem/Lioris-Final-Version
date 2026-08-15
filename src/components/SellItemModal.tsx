import React, { useState } from'react';
import { Modal, Pressable, ScrollView, View } from'react-native';
import { Image } from'expo-image';
import * as ImagePicker from'expo-image-picker';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { AppTextField } from'./AppTextField';
import { AppButton } from'./AppButton';
import { useTheme } from'@/theme/ThemeProvider';
import { MarketplaceListing } from'@/api/types';
import { haptics } from'@/utils/haptics';

const CATEGORIES: MarketplaceListing['category'][] = ['Electronics', 'Books/Academic', 'Furniture/Room Accessories'];
const CONDITIONS: MarketplaceListing['condition'][] = ['New', 'Like New', 'Fair'];

interface SellItemModalProps {
  visible: boolean;
  onClose: () => void;
  onPublish: (payload: {
    title: string;
    description: string;
    price: string;
    condition: MarketplaceListing['condition'];
    category: MarketplaceListing['category'];
    imageUrl?: string | null;
  }) => void;
}

/**
 * `createListing` (src/api/marketplace.ts) already existed, already
 * correctly persisted a new listing — it just had no UI anywhere in
 * the app that called it. This is that UI, built to match
 * PublishEventModal's established pattern (photo picker, category/
 * condition chips, same modal chrome) rather than inventing a new one.
 */
export function SellItemModal({ visible, onClose, onPublish }: SellItemModalProps) {
  const { colors, spacing, radius } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<MarketplaceListing['condition']>('Like New');
  const [category, setCategory] = useState<MarketplaceListing['category']>('Electronics');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  }

  function reset() {
    setTitle('');
    setDescription('');
    setPrice('');
    setPhotoUri(null);
  }

  async function handlePublish() {
    haptics.medium();
    setSubmitting(true);
    try {
      onPublish({
        title: title.trim(),
        description: description.trim() || 'No description provided.',
        price: price.trim(),
        condition,
        category,
        imageUrl: photoUri,
      });
      onClose();
      reset();
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = title.trim().length > 0 && price.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide"onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 56, paddingHorizontal: spacing.lg }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
            <AppText variant="h1"weight="bold">
              Sell an Item
            </AppText>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button"accessibilityLabel="Close">
              <Ionicons name="close"size={24} color={colors.textPrimary} />
            </Pressable>
          </View>

          <Pressable
            onPress={pickPhoto}
            accessibilityRole="button"accessibilityLabel={photoUri ? 'Change item photo' : 'Add item photo'}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderStyle: photoUri ? 'solid' : 'dashed',
              borderRadius: radius.md,
              alignItems: 'center',
              paddingVertical: photoUri ? 0 : spacing.lg,
              marginBottom: spacing.lg,
              overflow: 'hidden',
            }}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={{ width: '100%', height: 180 }} contentFit="cover"transition={200} />
            ) : (
              <>
                <Ionicons name="camera"size={22} color={colors.textSecondary} style={{ marginBottom: spacing.xs }} />
                <AppText tone="secondary"variant="bodySmall">
                  Add a photo
                </AppText>
              </>
            )}
          </Pressable>

          <AppTextField label="What are you selling?"placeholder="e.g. TI-84 Graphing Calculator"value={title} onChangeText={setTitle} />
          <AppTextField label="Price"placeholder="e.g. $45"value={price} onChangeText={setPrice} keyboardType="numbers-and-punctuation" />
          <AppTextField
            label="Description"placeholder="Condition details, why you're selling, pickup info..."value={description}
            onChangeText={setDescription}
            multiline
          />

          <AppText weight="bold"variant="bodySmall"style={{ marginBottom: spacing.sm }}>
            Category
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
            {CATEGORIES.map((cat) => {
              const selected = category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  accessibilityRole="radio"accessibilityState={{ checked: selected }}
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
                  <AppText variant="bodySmall"weight="semiBold"tone={selected ? 'brand' : 'secondary'}>
                    {cat}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <AppText weight="bold"variant="bodySmall"style={{ marginBottom: spacing.sm }}>
            Condition
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
            {CONDITIONS.map((cond) => {
              const selected = condition === cond;
              return (
                <Pressable
                  key={cond}
                  onPress={() => setCondition(cond)}
                  accessibilityRole="radio"accessibilityState={{ checked: selected }}
                  accessibilityLabel={cond}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.pill,
                    backgroundColor: selected ? colors.pastelPrimaryBg : 'transparent',
                    borderWidth: selected ? 0 : 1,
                    borderColor: colors.border,
                  }}
                >
                  <AppText variant="bodySmall"weight="semiBold"tone={selected ? 'brand' : 'secondary'}>
                    {cond}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <AppButton label="Publish Listing"onPress={handlePublish} loading={submitting} disabled={!canSubmit} fullWidth />
        </ScrollView>
      </View>
    </Modal>
  );
}
