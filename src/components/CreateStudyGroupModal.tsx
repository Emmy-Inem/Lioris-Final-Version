import React, { useState } from'react';
import { Modal, Pressable, ScrollView, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { AppTextField } from'./AppTextField';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';

interface CreateStudyGroupModalProps {
 visible: boolean;
 onClose: () => void;
 onCreate: (payload: { name: string; courseCode: string; description: string; isPublic: boolean }) => void;
}

export function CreateStudyGroupModal({ visible, onClose, onCreate }: CreateStudyGroupModalProps) {
 const { colors, spacing, radius, isDark } = useTheme();
 const { isDesktop } = useResponsive();
 const [name, setName] = useState('');
 const [courseCode, setCourseCode] = useState('');
 const [description, setDescription] = useState('');
 const [isPublic, setIsPublic] = useState(true);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [submitting, setSubmitting] = useState(false);

 function reset() {
 setName('');
 setCourseCode('');
 setDescription('');
 setIsPublic(true);
 setErrorMessage(null);
 }

 async function handleCreate() {
 setErrorMessage(null);
 if (!name.trim()) {
 setErrorMessage('Please enter a name for the study group.');
 haptics.error();
 return;
 }
 if (!courseCode.trim()) {
 setErrorMessage('Please enter a course code (e.g. CSC 301).');
 haptics.error();
 return;
 }
 haptics.medium();
 setSubmitting(true);
 try {
 onCreate({ name: name.trim(), courseCode: courseCode.trim().toUpperCase(), description: description.trim() || 'No description provided.', isPublic });
 onClose();
 reset();
 } catch (err: any) {
 haptics.error();
 setErrorMessage(err?.message || 'Could not create study group. Please try again.');
 } finally {
 setSubmitting(false);
 }
 }

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
 maxWidth: isDesktop ? 580 : undefined,
 maxHeight: isDesktop ? '90%' : undefined,
 borderRadius: isDesktop ? 24 : 0,
 padding: isDesktop ? spacing.xl : 0,
 borderWidth: isDesktop ? 1 : 0,
 borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
 overflow: 'hidden',
 }}
 >
 <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isDesktop ? spacing.md : 40 }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
 <AppText variant="h1" weight="bold">
 New Study Group
 </AppText>
 <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
 <Ionicons name="close" size={24} color={colors.textPrimary} />
 </Pressable>
 </View>

 <AppTextField
 label="Group name"
 placeholder="e.g. CSC 301 Study Squad"
 value={name}
 onChangeText={(t) => { setName(t); if (errorMessage) setErrorMessage(null); }}
 />
 <AppTextField
 label="Course code"
 placeholder="e.g. CSC 301"
 value={courseCode}
 onChangeText={(t) => { setCourseCode(t); if (errorMessage) setErrorMessage(null); }}
 autoCapitalize="characters"
 />
 <AppTextField
 label="Description"
 placeholder="What's this group for? When do you usually meet?"
 value={description}
 onChangeText={setDescription}
 multiline
 />

 <Pressable
 onPress={() => setIsPublic((v) => !v)}
 accessibilityRole="checkbox"
 accessibilityState={{ checked: isPublic }}
 accessibilityLabel="Make this group public"
 style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }}
 >
 <Ionicons name={isPublic ? 'checkbox' : 'square-outline'} size={22} color={isPublic ? colors.brandPrimary : colors.textSecondary} />
 <View style={{ flex: 1 }}>
 <AppText weight="semiBold" variant="bodySmall">
 Public group
 </AppText>
 <AppText tone="secondary" variant="caption">
 Anyone can find and join. Turn off to make it invite-only.
 </AppText>
 </View>
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

 <AppButton label="Create Group" onPress={handleCreate} loading={submitting} fullWidth />
 </ScrollView>
 </View>
 </View>
 </Modal>
 );
}
