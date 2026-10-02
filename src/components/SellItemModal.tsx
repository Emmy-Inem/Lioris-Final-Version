import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, View, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { MarketplaceListing } from '@/api/types';
import { updateListing } from '@/api/marketplace';
import { useSignedUrl } from '@/api/signedUrls';
import { haptics } from '@/utils/haptics';

const CATEGORIES: MarketplaceListing['category'][] = ['Electronics', 'Books/Academic', 'Furniture/Room Accessories'];
const CONDITIONS: MarketplaceListing['condition'][] = ['New', 'Like New', 'Fair'];
/** A seller can attach up to this many photos per listing. */
const MAX_PHOTOS = 4;

/** True for a value with no URI scheme at all - an already-uploaded bare storage path, as opposed to a fresh on-device pick (file://, content://, data:...) or a pasted http(s) link. Mirrors src/api/marketplace.ts's persistListingImage. */
function isStoredPath(value: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(value.trim());
}

/**
 * One photo preview tile. A freshly picked on-device photo renders directly;
 * an existing listing photo is a bare storage path in the private
 * `campus-media` bucket and needs a signed URL first - the same
 * useSignedUrl pattern ChatThread.tsx/PodSpace.tsx use for their own media.
 */
function PhotoThumb({ value, radius, onRemove }: { value: string; radius: number; onRemove: () => void }) {
  const stored = isStoredPath(value);
  const { url, loading } = useSignedUrl('campus-media', stored ? value : null);
  const uri = stored ? url : value;

  return (
    <View style={{ width: '47%', height: 100, position: 'relative' }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%', borderRadius: radius, backgroundColor: '#000' }} contentFit="cover" transition={200} />
      ) : (
        <View
          style={{
            width: '100%',
            height: '100%',
            borderRadius: radius,
            backgroundColor: 'rgba(0,0,0,0.08)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {loading ? <ActivityIndicator size="small" /> : <Ionicons name="image-outline" size={20} color="#888" />}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remove photo"
        onPress={onRemove}
        hitSlop={8}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          backgroundColor: 'rgba(0,0,0,0.7)',
          borderRadius: 13,
          width: 26,
          height: 26,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="close" size={15} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

interface SellItemModalProps {
  visible: boolean;
  onClose: () => void;
  onPublish?: (payload: {
    title: string;
    description: string;
    price: string;
    condition: MarketplaceListing['condition'];
    category: MarketplaceListing['category'];
    imageUrl?: string | null;
    imageUrls?: string[] | null;
  }) => Promise<void>;
  /** When set, the modal edits this listing (via updateListing) instead of publishing a new one. */
  listing?: MarketplaceListing | null;
  /** Called with the saved listing after a successful edit. */
  onUpdated?: (updated: MarketplaceListing) => void;
}

export function SellItemModal({ visible, onClose, onPublish, listing, onUpdated }: SellItemModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<MarketplaceListing['condition']>('Like New');
  const [category, setCategory] = useState<MarketplaceListing['category']>('Electronics');
  /** Up to MAX_PHOTOS entries - either a bare storage path (kept from an existing listing) or a fresh on-device uri/data url, submitted as-is to createListing/updateListing. */
  const [photos, setPhotos] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pickPhotos() {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = remaining > 1;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = (e: Event) => {
        const files = Array.from((e.target as HTMLInputElement).files ?? []).slice(0, remaining);
        document.body.removeChild(input);
        if (files.length === 0) return;
        files.forEach((file) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            if (dataUrl) {
              setPhotos((prev) => (prev.length >= MAX_PHOTOS ? prev : [...prev, dataUrl]));
              haptics.light();
            }
          };
          reader.readAsDataURL(file);
        });
      };
      input.click();
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // Cropping (allowsEditing) is mutually exclusive with multi-select.
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      const picked = result.assets.slice(0, remaining).map((a) => a.uri);
      setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
      haptics.light();
    }
  }

  function removePhoto(index: number) {
    haptics.light();
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function reset() {
    setTitle('');
    setDescription('');
    setPrice('');
    setPhotos([]);
    setErrorMessage(null);
  }

  // Edit mode: prefill the form from the listing being edited every time the
  // modal opens for it. The create path (no `listing`) never runs this, so
  // its behavior - including not resetting on close - is unchanged.
  useEffect(() => {
    if (!visible || !listing) return;
    setTitle(listing.title);
    setDescription(listing.description);
    setPrice(listing.price);
    setCondition(listing.condition);
    setCategory(listing.category);
    const existing = listing.imageUrls && listing.imageUrls.length > 0 ? listing.imageUrls : listing.imageUrl ? [listing.imageUrl] : [];
    setPhotos(existing.slice(0, MAX_PHOTOS));
    setErrorMessage(null);
  }, [visible, listing]);

  async function handleSubmit() {
    setErrorMessage(null);
    if (!title.trim()) {
      setErrorMessage('Please enter an item title.');
      haptics.error();
      return;
    }
    if (!price.trim()) {
      setErrorMessage('Please specify an asking price (e.g. ₦15,000).');
      haptics.error();
      return;
    }
    haptics.medium();
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || 'No description provided.',
        price: price.trim(),
        condition,
        category,
        imageUrl: photos[0] ?? null,
        imageUrls: photos.length > 0 ? photos : null,
      };
      if (listing) {
        const updated = await updateListing(listing.id, payload);
        onUpdated?.(updated);
      } else {
        await onPublish?.(payload);
      }
      onClose();
      reset();
    } catch (err: any) {
      haptics.error();
      setErrorMessage(err?.message || (listing ? 'Failed to update listing. Please try again.' : 'Failed to publish listing. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent={isDesktop} animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          backgroundColor: isDesktop ? 'rgba(0, 0, 0, 0.65)' : colors.background,
          justifyContent: isDesktop ? 'center' : 'flex-start',
          alignItems: isDesktop ? 'center' : 'stretch',
          paddingTop: isDesktop ? spacing.lg : Math.max(insets.top, 16),
          paddingHorizontal: isDesktop ? spacing.lg : spacing.md,
          paddingBottom: isDesktop ? spacing.lg : Math.max(insets.bottom, 16),
        }}
      >
        <View
          style={{
            flex: isDesktop ? undefined : 1,
            backgroundColor: colors.background,
            width: isDesktop ? '100%' : '100%',
            maxWidth: isDesktop ? 600 : undefined,
            maxHeight: isDesktop ? '90%' : undefined,
            borderRadius: isDesktop ? 24 : 0,
            padding: isDesktop ? spacing.xl : 0,
            borderWidth: isDesktop ? 1 : 0,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
            overflow: 'hidden',
          }}
        >
          <ScrollView
            style={{ flex: 1, width: '100%' }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: isDesktop ? spacing.md : 40, paddingHorizontal: isDesktop ? 0 : spacing.xs }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
              <AppText variant="h1" weight="bold">
                {listing ? 'Edit Listing' : 'Sell an Item'}
              </AppText>
              <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </Pressable>
            </View>

            {photos.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm }}>
                {photos.map((p, i) => (
                  <PhotoThumb key={p + i} value={p} radius={radius.md} onRemove={() => removePhoto(i)} />
                ))}
              </View>
            ) : null}

            <Pressable
              onPress={pickPhotos}
              disabled={photos.length >= MAX_PHOTOS}
              accessibilityRole="button"
              accessibilityLabel={photos.length > 0 ? 'Add another photo' : 'Add a photo'}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderStyle: 'dashed',
                borderRadius: radius.md,
                alignItems: 'center',
                paddingVertical: spacing.md,
                marginBottom: spacing.lg,
                opacity: photos.length >= MAX_PHOTOS ? 0.5 : 1,
              }}
            >
              <Ionicons name="camera" size={22} color={colors.textSecondary} style={{ marginBottom: spacing.xs }} />
              <AppText tone="secondary" variant="bodySmall">
                {photos.length > 0 ? `Add another photo (${photos.length}/${MAX_PHOTOS})` : 'Add photos (up to 4)'}
              </AppText>
            </Pressable>

            <AppTextField label="What are you selling?" placeholder="e.g. TI-84 Graphing Calculator" value={title} onChangeText={setTitle} />
            <AppTextField label="Price" placeholder="e.g. ₦15,000" value={price} onChangeText={setPrice} keyboardType="numbers-and-punctuation" />
            <AppTextField
              label="Description"
              placeholder="Condition details, why you're selling, pickup info..."
              value={description}
              onChangeText={setDescription}
              multiline
            />

            <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
              Category
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
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

            <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
              Condition
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl }}>
              {CONDITIONS.map((cond) => {
                const selected = condition === cond;
                return (
                  <Pressable
                    key={cond}
                    onPress={() => setCondition(cond)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
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
                    <AppText variant="bodySmall" weight="semiBold" tone={selected ? 'brand' : 'secondary'}>
                      {cond}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {errorMessage ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEE2E2',
                  borderColor: colors.critical,
                  borderWidth: 1,
                  borderRadius: radius.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  marginBottom: spacing.md,
                }}
              >
                <Ionicons name="alert-circle" size={18} color={colors.critical} />
                <AppText variant="bodySmall" weight="semiBold" style={{ color: colors.critical, flex: 1 }}>
                  {errorMessage}
                </AppText>
              </View>
            ) : null}

            <AppButton label={listing ? 'Save Changes' : 'Publish Listing'} onPress={handleSubmit} loading={submitting} fullWidth />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
