import React, { useState } from'react';
import { Modal, Pressable, ScrollView, View } from'react-native';
import { Image } from'expo-image';
import * as ImagePicker from'expo-image-picker';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { AppTextField } from'./AppTextField';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { MarketplaceListing } from '@/api/types';
import { haptics } from '@/utils/haptics';

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

export function SellItemModal({ visible, onClose, onPublish }: SellItemModalProps) {
 const { colors, spacing, radius, isDark } = useTheme();
 const { isDesktop } = useResponsive();
 const [title, setTitle] = useState('');
 const [description, setDescription] = useState('');
 const [price, setPrice] = useState('');
 const [condition, setCondition] = useState<MarketplaceListing['condition']>('Like New');
 const [category, setCategory] = useState<MarketplaceListing['category']>('Electronics');
 const [photoUri, setPhotoUri] = useState<string | null>(null);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
 setErrorMessage(null);
 }

 async function handlePublish() {
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
 } catch (err: any) {
 haptics.error();
 setErrorMessage(err?.message || 'Failed to publish listing. Please try again.');
 } finally {
 setSubmitting(false);
 }
 }

 const canSubmit = title.trim().length > 0 && price.trim().length > 0;

 return (
 <Modal visible={visible} transparent={isDesktop} animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={onClose}>
 <View
 style={{
 flex: 1,
 backgroundColor: isDesktop ? 'rgba(0, 0, 0, 0.65)' : colors.background,
 justifyContent: isDesktop ? 'center' : 'flex-start',
 alignItems: isDesktop ? 'center' : 'stretch',
 paddingTop: isDesktop ? spacing.lg : 56,
 paddingHorizontal: spacing.lg,
 paddingBottom: isDesktop ? spacing.lg : 0,
 }}
 >
 <View
 style={{
 flex: isDesktop ? undefined : 1,
 backgroundColor: colors.background,
 width: isDesktop ? '100%' : undefined,
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
 showsVerticalScrollIndicator={true}
 contentContainerStyle={{ paddingBottom: isDesktop ? spacing.md : 40 }}
 >
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
 <AppText variant="h1" weight="bold">
 Sell an Item
 </AppText>
 <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
 <Ionicons name="close" size={24} color={colors.textPrimary} />
 </Pressable>
 </View>

 <Pressable
 onPress={pickPhoto}
 accessibilityRole="button"
 accessibilityLabel={photoUri ? 'Change item photo' : 'Add item photo'}
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
 <Image source={{ uri: photoUri }} style={{ width: '100%', height: 180 }} contentFit="cover" transition={200} />
 ) : (
 <>
 <Ionicons name="camera" size={22} color={colors.textSecondary} style={{ marginBottom: spacing.xs }} />
 <AppText tone="secondary" variant="bodySmall">
 Add a photo
 </AppText>
 </>
 )}
 </Pressable>

 <AppTextField label="What are you selling?" placeholder="e.g. TI-84 Graphing Calculator" value={title} onChangeText={setTitle} />
 <AppTextField label="Price" placeholder="e.g. $45" value={price} onChangeText={setPrice} keyboardType="numbers-and-punctuation" />
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
 <AppText
 variant="bodySmall"
 weight="semiBold"
 style={{ color: colors.critical, flex: 1 }}
 >
 {errorMessage}
 </AppText>
 </View>
 ) : null}

 <AppButton label="Publish Listing" onPress={handlePublish} loading={submitting} fullWidth />
 </ScrollView>
 </View>
 </View>
 </Modal>
 );
}
