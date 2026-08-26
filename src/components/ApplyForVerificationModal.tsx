import React, { useEffect, useState } from'react';
import { Modal, Pressable, View } from'react-native';
import { Image } from'expo-image';
import * as ImagePicker from'expo-image-picker';
import { Ionicons } from'@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from'react-native-reanimated';
import { AppText } from'./AppText';
import { AppTextField } from'./AppTextField';
import { AppButton } from'./AppButton';
import { useTheme } from'@/theme/ThemeProvider';
import { haptics } from'@/utils/haptics';

const DOCUMENT_TYPES = ['Student ID', 'Admission Letter', 'Staff ID', 'Alumni Certificate'] as const;

interface ApplyForVerificationModalProps {
 visible: boolean;
 onClose: () => void;
 onSubmit: (payload: {
 institutionClaimed: string;
 documentType: (typeof DOCUMENT_TYPES)[number];
 documentReference: string;
 documentPhotoUri?: string | null;
 photoBlob?: Blob;
 }) => void;
}

/**
 * Backs the Profile screen's "Apply for Verification" banner for
 * accounts that didn't auto-verify at registration.
 */
export function ApplyForVerificationModal({ visible, onClose, onSubmit }: ApplyForVerificationModalProps) {
 const { colors, spacing, radius, isDark } = useTheme();
 const [institutionClaimed, setInstitutionClaimed] = useState('');
 const [documentType, setDocumentType] = useState<(typeof DOCUMENT_TYPES)[number]>('Student ID');
 const [documentReference, setDocumentReference] = useState('');
 const [documentPhotoUri, setDocumentPhotoUri] = useState<string | null>(null);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const opacity = useSharedValue(0);
 const scale = useSharedValue(0.92);

 useEffect(() => {
 if (visible) {
 opacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
 scale.value = withSpring(1, { damping: 16, stiffness: 220 });
 setErrorMessage(null);
 } else {
 opacity.value = 0;
 scale.value = 0.92;
 }
 }, [visible, opacity, scale]);

 const animatedStyle = useAnimatedStyle(() => ({
 opacity: opacity.value,
 transform: [{ scale: scale.value }],
 }));

 async function pickDocumentPhoto() {
 const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
 if (!permission.granted) return;
 const result = await ImagePicker.launchImageLibraryAsync({
 mediaTypes: ['images'],
 quality: 0.8,
 });
 if (!result.canceled && result.assets[0]) {
 setDocumentPhotoUri(result.assets[0].uri);
 if (errorMessage) setErrorMessage(null);
 }
 }

 async function handleSubmit() {
 setErrorMessage(null);
 if (!institutionClaimed.trim()) {
 setErrorMessage('Please enter your university or institution name.');
 haptics.error();
 return;
 }
 if (!documentReference.trim()) {
 setErrorMessage('Please enter your document ID or matric number.');
 haptics.error();
 return;
 }
 haptics.success();
 let photoBlob: Blob | undefined;
 if (documentPhotoUri) {
 try {
 const res = await fetch(documentPhotoUri);
 photoBlob = await res.blob();
 } catch {
 // pass
 }
 }
 onSubmit({
 institutionClaimed: institutionClaimed.trim(),
 documentType,
 documentReference: documentReference.trim(),
 documentPhotoUri,
 photoBlob,
 });
 onClose();
 setDocumentPhotoUri(null);
 setInstitutionClaimed('');
 setDocumentReference('');
 setErrorMessage(null);
 }

 return (
 <Modal visible={visible} transparent animationType="fade"onRequestClose={onClose}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
 <Animated.View style={[{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: '100%' }, animatedStyle]}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
 <Ionicons name="shield-checkmark"size={20} color={colors.brandPrimary} />
 <AppText variant="h3"weight="bold">
 Apply for Verification
 </AppText>
 </View>
 <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.lg }}>
 Submit your school and a supporting document reference. A reviewer approves or
 rejects this manually - it isn't granted automatically.
 </AppText>

 <AppTextField label="Your school"value={institutionClaimed} onChangeText={setInstitutionClaimed} placeholder="e.g. Obafemi Awolowo University" />

 <AppText weight="semiBold"variant="bodySmall"style={{ marginBottom: spacing.sm }}>
 Document type
 </AppText>
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
 {DOCUMENT_TYPES.map((type) => {
 const selected = documentType === type;
 return (
 <Pressable
 key={type}
 onPress={() => setDocumentType(type)}
 accessibilityRole="radio"accessibilityState={{ checked: selected }}
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
 <AppText variant="bodySmall"weight="semiBold"tone={selected ? 'brand' : 'secondary'}>
 {type}
 </AppText>
 </Pressable>
 );
 })}
 </View>

 <AppTextField
 label="Document reference / ID number"value={documentReference}
 onChangeText={setDocumentReference}
 placeholder="e.g. Matric No. OAU/2021/04521"
 />

 <Pressable
 onPress={pickDocumentPhoto}
 accessibilityRole="button"accessibilityLabel={documentPhotoUri ? 'Change uploaded document photo' : 'Upload supporting document'}
 style={{
 borderWidth: 1,
 borderColor: colors.border,
 borderStyle: documentPhotoUri ? 'solid' : 'dashed',
 borderRadius: radius.md,
 alignItems: 'center',
 paddingVertical: documentPhotoUri ? 0 : spacing.lg,
 marginBottom: spacing.lg,
 overflow: 'hidden',
 }}
 >
 {documentPhotoUri ? (
 <Image source={{ uri: documentPhotoUri }} style={{ width: '100%', height: 120 }} contentFit="cover"transition={200} />
 ) : (
 <>
 <Ionicons name="cloud-upload-outline"size={20} color={colors.textSecondary} style={{ marginBottom: spacing.xs }} />
 <AppText tone="secondary"variant="bodySmall">
 Upload supporting document (photo)
 </AppText>
 </>
 )}
 </Pressable>

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

 <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
 <AppButton label="Cancel" variant="ghost" onPress={onClose} />
 <AppButton label="Submit for review" onPress={handleSubmit} />
 </View>
 </Animated.View>
 </View>
 </Modal>
 );
}
