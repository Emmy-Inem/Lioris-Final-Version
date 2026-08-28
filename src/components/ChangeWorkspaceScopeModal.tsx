import React, { useState } from'react';
import { Alert, Modal, Pressable, ScrollView, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { AppTextField } from'./AppTextField';
import { AppButton } from'./AppButton';
import { SolidCard } from'./SolidCard';
import { useTheme } from'@/theme/ThemeProvider';
import { useAuth } from'@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useViewScope } from'@/hooks/useViewScope';
import { LAUNCH_INSTITUTIONS, createInstitution } from'@/api/institutions';

interface ChangeWorkspaceScopeModalProps {
 visible: boolean;
 onClose: () => void;
 homeInstitution: string;
 homeInstitutionCode: string;
 scope: 'campus' | 'global';
 onSelectScope: (scope: 'campus' | 'global') => void;
}

export function ChangeWorkspaceScopeModal({
 visible,
 onClose,
 homeInstitution,
 homeInstitutionCode,
 scope,
 onSelectScope,
}: ChangeWorkspaceScopeModalProps) {
 const { colors, spacing, radius, setCustomAccent } = useTheme();
 const { isDesktop } = useResponsive();
 const { user } = useAuth();
 const { activeCampusCode, setActiveCampusCode } = useViewScope();
 const isAdmin = user?.role === 'admin';

 // Guest explored workspaces list
 const [guestWorkspaces, setGuestWorkspaces] = useState<{ code: string; name: string; description: string }[]>(
 LAUNCH_INSTITUTIONS.filter((inst) => inst.code !== homeInstitutionCode).map((inst) => ({
 code: inst.code,
 name: inst.name,
 description: `${inst.shortName} Campus Community`,
 })),
 );

 // New custom workspace modal state
 const [createModalOpen, setCreateModalOpen] = useState(false);
 const [newCampusName, setNewCampusName] = useState('');
 const [newCampusCode, setNewCampusCode] = useState('');
 const [isSubmitting, setIsSubmitting] = useState(false);

 function removeGuest(code: string) {
 setGuestWorkspaces((prev) => prev.filter((w) => w.code !== code));
 }

 async function handleAddCustomWorkspace() {
 if (!newCampusName.trim() || !newCampusCode.trim()) return;
 const code = newCampusCode.trim().toUpperCase();
 const name = newCampusName.trim();
 setIsSubmitting(true);
 try {
 await createInstitution({
 code,
 name,
 shortName: code,
 location: 'Nigeria',
 domain: `${code.toLowerCase()}.edu.ng`,
 });
 setGuestWorkspaces((prev) => [...prev, { code, name, description: `${code} Campus Community` }]);
 setNewCampusName('');
 setNewCampusCode('');
 setCreateModalOpen(false);
 Alert.alert('Campus Node Added', `Successfully added ${name} (${code}) to available workspaces.`);
 } catch (err: any) {
 Alert.alert('Error', err.message || 'Failed to add institution node.');
 } finally {
 setIsSubmitting(false);
 }
 }

 return (
 <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
 <View
 style={{
 flex: 1,
 backgroundColor: 'rgba(0,0,0,0.6)',
 justifyContent: isDesktop ? 'center' : 'flex-end',
 alignItems: isDesktop ? 'center' : 'stretch',
 padding: isDesktop ? spacing.lg : 0,
 }}
 >
 <Pressable style={{ position: 'absolute', inset: 0 }} onPress={onClose} accessible={false} />
 <View
 style={{
 backgroundColor: colors.surface,
 borderRadius: isDesktop ? 24 : undefined,
 borderTopLeftRadius: 24,
 borderTopRightRadius: 24,
 padding: spacing.lg,
 maxHeight: '85%',
 maxWidth: isDesktop ? 560 : undefined,
 width: isDesktop ? '100%' : undefined,
 alignSelf: 'center',
 }}
 >
 <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
 <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
 </View>

 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
 <Ionicons name="globe" size={20} color={colors.brandPrimary} />
 <AppText variant="h2" weight="bold">
 Change Workspace Scope
 </AppText>
 </View>
 <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
 Select your current viewing scope. Highlight regional cross-university feeds or
 filter strictly for your local campus.
 </AppText>

 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false}>
 <ScopeOption
 icon="school"
 title="My Campus Workspace"
 subtitle={`${homeInstitution} (${homeInstitutionCode})`}
 selected={scope === 'campus' && (!activeCampusCode || activeCampusCode === homeInstitutionCode)}
 onPress={() => {
 setActiveCampusCode(undefined);
 setCustomAccent(null);
 onSelectScope('campus');
 onClose();
 }}
 />
 <ScopeOption
 icon="globe-outline"title="All Lioris Global Feed"subtitle="See posts and announcements cross-country"selected={scope === 'global'}
 onPress={() => {
 setCustomAccent(null);
 onSelectScope('global');
 onClose();
 }}
 />

 {/* Admin-Only: Explore and Switch to Other Campus Workspaces */}
 {isAdmin ? (
 <>
 <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.lg }} />

 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
 <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1 }}>
 EXPLORE OTHER CAMPUS WORKSPACES
 </AppText>
 <View style={{ backgroundColor: '#DC2626', paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill }}>
 <AppText variant="caption"weight="bold"tone="inverse"style={{ fontSize: 9 }}>
 ADMIN ONLY
 </AppText>
 </View>
 </View>

 {guestWorkspaces.map((w) => {
 const isCurrentCampus = scope === 'campus' && activeCampusCode === w.code;
 return (
 <Pressable
 key={w.code}
 onPress={() => {
 setActiveCampusCode(w.code);
 setCustomAccent(null);
 onSelectScope('campus');
 onClose();
 Alert.alert('Workspace Switched', `Active campus workspace switched to ${w.name} (${w.code}). Theme palette updated.`);
 }}
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: spacing.md,
 backgroundColor: isCurrentCampus ? colors.pastelPrimaryBg : colors.divider,
 borderRadius: radius.md,
 padding: spacing.md,
 marginBottom: spacing.sm,
 borderWidth: isCurrentCampus ? 1.5 : 0,
 borderColor: colors.brandPrimary,
 }}
 >
 <Ionicons name="school-outline"size={20} color={isCurrentCampus ? colors.brandPrimary : colors.textSecondary} />
 <View style={{ flex: 1 }}>
 <AppText weight="bold"variant="bodySmall"tone={isCurrentCampus ? 'brand' : 'primary'}>
 {w.name} ({w.code})
 </AppText>
 <AppText tone="secondary"variant="caption">
 {w.description}
 </AppText>
 </View>
 <Pressable
 onPress={(e) => {
 e.stopPropagation?.();
 removeGuest(w.code);
 }}
 hitSlop={8}
 accessibilityRole="button"accessibilityLabel={`Remove ${w.name} guest workspace`}
 >
 <Ionicons name="trash-outline"size={18} color={colors.critical} />
 </Pressable>
 </Pressable>
 );
 })}

 <View style={{ marginTop: spacing.md, marginBottom: spacing.lg }}>
 <AppButton
 label="+ Add Campus Workspace"variant="secondary"onPress={() => setCreateModalOpen(true)}
 fullWidth
 />
 </View>
 </>
 ) : null}
 </ScrollView>
 </View>
 </View>

 {/* Create Custom Workspace Modal */}
 <Modal visible={createModalOpen} transparent animationType="fade"onRequestClose={() => setCreateModalOpen(false)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
 <SolidCard style={{ width: '100%', maxWidth: 420 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
 <AppText variant="h3"weight="bold">
 Add Campus Workspace 
 </AppText>
 <Pressable onPress={() => setCreateModalOpen(false)} hitSlop={8}>
 <Ionicons name="close"size={20} color={colors.textSecondary} />
 </Pressable>
 </View>
 <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
 Add a partner university or regional campus hub to explore student groups and events.
 </AppText>
 <AppTextField
 label="Campus Name"placeholder="e.g. Obafemi Awolowo University"value={newCampusName}
 onChangeText={setNewCampusName}
 />
 <AppTextField
 label="Campus Acronym / Code"placeholder="e.g. OAU"value={newCampusCode}
 onChangeText={setNewCampusCode}
 autoCapitalize="characters"
 />
 <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
 <AppButton label="Cancel"variant="ghost"onPress={() => setCreateModalOpen(false)} />
 <AppButton
 label="Provision Workspace"
 loading={isSubmitting}
 disabled={!newCampusName.trim() || !newCampusCode.trim() || isSubmitting}
 onPress={handleAddCustomWorkspace}
 />
 </View>
 </SolidCard>
 </View>
 </Modal>
 </Modal>
 );
}

function ScopeOption({
 icon,
 title,
 subtitle,
 selected,
 onPress,
}: {
 icon: keyof typeof Ionicons.glyphMap;
 title: string;
 subtitle: string;
 selected: boolean;
 onPress: () => void;
}) {
 const { colors, spacing, radius } = useTheme();
 return (
 <Pressable
 onPress={onPress}
 accessibilityRole="radio"accessibilityState={{ checked: selected }}
 accessibilityLabel={`${title}, ${subtitle}`}
 >
 <View
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: spacing.md,
 backgroundColor: selected ? colors.pastelPrimaryBg : colors.divider,
 borderRadius: radius.md,
 padding: spacing.md,
 marginBottom: spacing.sm,
 }}
 >
 <Ionicons name={icon} size={20} color={selected ? colors.brandPrimary : colors.textSecondary} />
 <View style={{ flex: 1 }}>
 <AppText weight="bold"tone={selected ? 'brand' : 'primary'}>
 {title}
 </AppText>
 <AppText tone="secondary"variant="caption">
 {subtitle}
 </AppText>
 </View>
 </View>
 </Pressable>
 );
}
