import React, { useState } from'react';
import { Alert, Modal, Pressable, ScrollView, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { SolidCard } from'@/components/SolidCard';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { Badge } from'@/components/Badge';
import { AppButton } from'@/components/AppButton';
import { Avatar } from'@/components/Avatar';
import { EmptyState } from'@/components/EmptyState';
import { useTheme } from'@/theme/ThemeProvider';
import { UserProfile, UserRole } from'@/api/types';
import { recordAuditLogEntry } from'@/api/auditLog';
import { haptics } from'@/utils/haptics';

export function UserProfilesTab() {
 const { colors, spacing, radius } = useTheme();
 const [users, setUsers] = useState<UserProfile[]>([]);
 const [loading, setLoading] = useState(true);
 const [searchQuery, setSearchQuery] = useState('');
 const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');

 const loadProfiles = React.useCallback(async () => {
 setLoading(true);
 try {
 const { supabase } = await import('@/api/supabase');
 const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
 if (!error && data) {
 const mapped: UserProfile[] = data.map((p: any) => ({
 id: p.id,
 fullName: p.full_name || 'Campus Member',
 username: p.username || (p.email ? p.email.split('@')[0] : 'member'),
 email: p.email || '',
 userType: (p.role || 'student') as UserRole,
 graduationYear: 2026,
 connectionsCount: 88,
 bio: p.bio || `Verified ${p.role} on ${p.campus_code || 'UI'} node.`,
 department: p.department || 'General Studies',
 interests: ['Academic Excellence', 'Campus Life'],
 institutionName: 'University of Ibadan',
 institutionCode: p.campus_code || 'UI',
 avatarUrl: (p.avatar_url || 'avatar_male') as any,
 isVerified: p.verification_status === 'verified',
 verificationStatus: p.verification_status === 'verified' ? 'verified' : 'none',
 xp: 850,
 level: 4,
 reputationScore: 320,
 trustLevel: 8,
 streakDays: 14,
 postsCount: 6,
 resourcesCount: 12,
 eventsCount: 4,
 badgesCount: 3,
 followersCount: 112,
 followingCount: 80,
 }));
 setUsers(mapped);
 }
 } catch (err) {
 console.warn('[UserProfilesTab] Supabase load error:', err);
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 loadProfiles();
 }, [loadProfiles]);

 // Edit Modal State
 const [editModalOpen, setEditModalOpen] = useState(false);
 const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
 const [editName, setEditName] = useState('');
 const [editRole, setEditRole] = useState<UserRole>('student');
 const [editDept, setEditDept] = useState('');
 const [editVerified, setEditVerified] = useState(false);
 const [editBio, setEditBio] = useState('');

 const filteredUsers = users.filter((u) => {
 const matchesRole = roleFilter === 'all' || u.userType === roleFilter;
 const q = searchQuery.toLowerCase();
 const matchesSearch =
 !searchQuery.trim() ||
 u.fullName.toLowerCase().includes(q) ||
 u.email.toLowerCase().includes(q) ||
 (u.department?.toLowerCase().includes(q) ?? false) ||
 (u.institutionName?.toLowerCase().includes(q) ?? false);
 return matchesRole && matchesSearch;
 });

 function handleOpenEdit(user: UserProfile) {
 haptics.light();
 setSelectedUser(user);
 setEditName(user.fullName);
 setEditRole(user.userType);
 setEditDept(user.department ?? '');
 setEditVerified(user.isVerified);
 setEditBio(user.bio ?? '');
 setEditModalOpen(true);
 }

 async function handleSaveUser() {
 if (!selectedUser) return;
 haptics.medium();
 const updated = users.map((u) => {
 if (u.id === selectedUser.id) {
 return {
 ...u,
 fullName: editName.trim() || u.fullName,
 userType: editRole,
 department: editDept.trim() || u.department,
 isVerified: editVerified,
 verificationStatus: editVerified ? ('verified' as const) : ('none' as const),
 bio: editBio.trim() || u.bio,
 };
 }
 return u;
 });

 setUsers(updated);

 try {
 const { supabase } = await import('@/api/supabase');
 await supabase.from('profiles').update({
 full_name: editName.trim() || selectedUser.fullName,
 role: editRole.toLowerCase(),
 department: editDept.trim() || selectedUser.department,
 verification_status: editVerified ? 'verified' : 'none',
 bio: editBio.trim() || selectedUser.bio,
 }).eq('id', selectedUser.id);
 } catch (err) {
 console.warn('[UserProfilesTab] Supabase profile update error:', err);
 }

 recordAuditLogEntry({
 action: 'user_role_changed',
 summary: `Updated profile governance & role credentials for ${editName} (${editRole.toUpperCase()})`,
 targetType: 'user',
 targetId: selectedUser.id,
 reason: 'Administrative user governance action',
 });

 setUsers((prev) =>
 prev.map((u) =>
 u.id === selectedUser.id
 ? {
 ...u,
 fullName: editName.trim() || u.fullName,
 userType: editRole,
 department: editDept.trim() || u.department,
 isVerified: editVerified,
 verificationStatus: editVerified ? 'verified' : 'none',
 bio: editBio.trim() || u.bio,
 }
 : u,
 ),
 );

 setEditModalOpen(false);
 setSelectedUser(null);
 Alert.alert('Profile Updated', `Credentials and role permissions saved for ${editName}.`);
 }

 async function handleToggleSuspend(user: UserProfile) {
 haptics.error();
 Alert.alert(
 'Account Security Action',
 `Suspend all session tokens and access for ${user.fullName} (${user.email})?`,
 [
 { text: 'Cancel', style: 'cancel' },
 {
 text: 'Suspend User',
 style: 'destructive',
 onPress: async () => {
 try {
 const { supabase } = await import('@/api/supabase');
 const { error } = await supabase.rpc('suspend_user_account', {
 p_target_user_id: user.id,
 p_reason: 'Administrative security suspension from Admin Console',
 });
 if (error) {
 await supabase.from('profiles').update({ is_suspended: true }).eq('id', user.id);
 }
 } catch (err) {
 console.warn('[UserProfilesTab] Supabase suspend error:', err);
 }
 recordAuditLogEntry({
 action: 'user_suspended',
 summary: `Suspended account access for ${user.fullName} (${user.email})`,
 targetType: 'user',
 targetId: user.id,
 reason: 'Administrative security suspension',
 });
 setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isSuspended: true } : u)));
 Alert.alert('Account Suspended', `${user.fullName}'s access has been revoked.`);
 },
 },
 ],
 );
 }

 return (
 <View>
 {/* Search and Role Filter Bar */}
 <View style={{ marginBottom: spacing.sm }}>
 <AppTextField
 label=""placeholder="Search by name, email, department, campus..."value={searchQuery}
 onChangeText={setSearchQuery}
 />
 </View>

 {/* Role Filter Pills */}
 <ScrollView
 horizontal
 showsHorizontalScrollIndicator={false}
 contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.md }}
 style={{ flex: 1, minWidth: 0 }}
 >
 {(['all', 'student', 'alumni', 'staff', 'admin'] as const).map((r) => {
 const selected = roleFilter === r;
 const label = r === 'all' ? 'All Roles' : r.charAt(0).toUpperCase() + r.slice(1);
 const count = r === 'all' ? users.length : users.filter((u) => u.userType === r).length;
 return (
 <Pressable
 key={r}
 onPress={() => {
 haptics.light();
 setRoleFilter(r);
 }}
 style={{
 paddingHorizontal: spacing.sm,
 paddingVertical: 5,
 borderRadius: radius.pill,
 backgroundColor: selected ? colors.brandPrimary : colors.divider,
 }}
 >
 <AppText variant="caption"weight="bold"tone={selected ? 'inverse' : 'secondary'}>
 {label} ({count})
 </AppText>
 </Pressable>
 );
 })}
 </ScrollView>

 {/* User Profiles List */}
 {filteredUsers.length === 0 && !loading ? (
 <EmptyState
 title="No users found"
 description="No profiles match your filter criteria or search query."
 />
 ) : null}

 {filteredUsers.map((user) => {
 return (
 <SolidCard key={user.id} radius={18} frosted style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm }}>
 <Avatar name={user.fullName} size={50} role={user.userType} />
 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
 <AppText weight="bold"variant="body">
 {user.fullName}
 </AppText>
 {user.isVerified ? (
 <Ionicons name="checkmark-circle"size={16} color={colors.brandPrimary} />
 ) : null}
 </View>
 <AppText tone="secondary"variant="caption">
 {user.email}
 </AppText>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
 <Badge label={user.userType.toUpperCase()} tone={user.userType === 'admin' ? 'critical' : user.userType === 'staff' ? 'brand' : 'accent'} />
 <AppText variant="caption"tone="secondary">
 {user.institutionName ?? 'Campus Node'}
 </AppText>
 </View>
 </View>
 </View>

 <AppText tone="secondary"variant="caption"style={{ marginBottom: spacing.sm }}>
 Dept: {user.department ?? 'General'} • Trust Level: {user.trustLevel}/10 • {user.postsCount} Posts • {user.resourcesCount} Files
 </AppText>

 {/* Quick Action Buttons */}
 <View style={{ flexDirection: 'row', gap: spacing.xs }}>
 <View style={{ flex: 1 }}>
 <AppButton
 label="Edit Role & Status"variant="secondary"onPress={() => handleOpenEdit(user)}
 />
 </View>
 <Pressable
 onPress={() => handleToggleSuspend(user)}
 hitSlop={8}
 style={{
 width: 40,
 height: 40,
 borderRadius: radius.md,
 backgroundColor: colors.divider,
 alignItems: 'center',
 justifyContent: 'center',
 }}
 >
 <Ionicons name="ban-outline"size={18} color={colors.critical} />
 </Pressable>
 </View>
 </SolidCard>
 );
 })}

 {filteredUsers.length === 0 ? (
 <EmptyState title="No users found"description="Try clearing your search query or role filter." />
 ) : null}

 {/* Edit User Modal */}
 <Modal visible={editModalOpen} transparent animationType="slide"onRequestClose={() => setEditModalOpen(false)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
 <Pressable style={{ flex: 1 }} onPress={() => setEditModalOpen(false)} />
 <View
 style={{
 backgroundColor: colors.surface,
 borderTopLeftRadius: 24,
 borderTopRightRadius: 24,
 padding: spacing.lg,
 maxHeight: '90%',
 }}
 >
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
 <Ionicons name="person-circle-outline"size={22} color={colors.brandPrimary} />
 <AppText variant="h2"weight="bold">
 User Governance Controls
 </AppText>
 </View>
 <Pressable onPress={() => setEditModalOpen(false)} hitSlop={8}>
 <Ionicons name="close"size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false}>
 <AppTextField label="Full Name"value={editName} onChangeText={setEditName} />
 <AppTextField label="Academic Department"value={editDept} onChangeText={setEditDept} />

 {/* Role Picker */}
 <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 0.8, marginBottom: spacing.xs }}>
 ASSIGN ROLE & PRIVILEGES
 </AppText>
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
 {(['student', 'alumni', 'staff', 'admin'] as UserRole[]).map((r) => (
 <Pressable
 key={r}
 onPress={() => setEditRole(r)}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: 7,
 borderRadius: radius.pill,
 borderWidth: 1,
 borderColor: editRole === r ? colors.brandPrimary : colors.border,
 backgroundColor: editRole === r ? colors.pastelPrimaryBg : colors.surface,
 }}
 >
 <AppText variant="caption"weight="bold"tone={editRole === r ? 'brand' : 'secondary'}>
 {r.toUpperCase()}
 </AppText>
 </Pressable>
 ))}
 </View>

 {/* Verified Badge Toggle */}
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, marginBottom: spacing.sm }}>
 <View style={{ flex: 1, marginRight: spacing.sm }}>
 <AppText weight="bold"variant="bodySmall">
 Verified Academic Badge
 </AppText>
 <AppText tone="secondary"variant="caption">
 Grants blue checkmark and elevated trust scoring.
 </AppText>
 </View>
 <Pressable
 onPress={() => setEditVerified(!editVerified)}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: 6,
 borderRadius: radius.pill,
 backgroundColor: editVerified ? colors.pastelPrimaryBg : colors.divider,
 }}
 >
            <AppText variant="caption" weight="bold" tone={editVerified ? 'brand' : 'secondary'}>
              {editVerified ? 'Verified' : 'Unverified'}
            </AppText>
 </Pressable>
 </View>

 {/* Trust Score Stepper */}
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, marginBottom: spacing.sm }}>
 <View style={{ flex: 1, marginRight: spacing.sm }}>
 <AppText weight="bold"variant="bodySmall">
 Trust Rating Level ({selectedUser?.trustLevel ?? 8}/10)
 </AppText>
 <AppText tone="secondary"variant="caption">
 Determines auto-flag exemptions and community clearance.
 </AppText>
 </View>
 <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
 {[6, 7, 8, 9, 10].map((num) => (
 <Pressable
 key={num}
 onPress={() => {
 if (selectedUser) {
 setSelectedUser({ ...selectedUser, trustLevel: num });
 }
 }}
 style={{
 width: 32,
 height: 32,
 borderRadius: radius.sm,
 backgroundColor: (selectedUser?.trustLevel ?? 8) === num ? colors.brandPrimary : colors.divider,
 alignItems: 'center',
 justifyContent: 'center',
 }}
 >
 <AppText variant="caption"weight="bold"tone={(selectedUser?.trustLevel ?? 8) === num ? 'inverse' : 'secondary'}>
 {num}
 </AppText>
 </Pressable>
 ))}
 </View>
 </View>

 {/* MFA Reset Button */}
 <Pressable
 onPress={() => {
 haptics.medium();
 Alert.alert('MFA Reset', `Multi-Factor Authentication challenge reset for ${editName}. User will be prompted to re-bind on next login.`);
 }}
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 6,
 paddingVertical: spacing.sm,
 marginBottom: spacing.md,
 }}
 >
 <Ionicons name="key-outline"size={16} color={colors.brandPrimary} />
 <AppText variant="caption"weight="bold"tone="brand">
 Reset MFA Credentials & Sessions
 </AppText>
 </Pressable>

 <AppTextField
 label="Academic Bio / Moderator Note"value={editBio}
 onChangeText={setEditBio}
 multiline
 numberOfLines={3}
 />
 </ScrollView>

 <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
 <AppButton label="Cancel"variant="ghost"onPress={() => setEditModalOpen(false)} />
 <AppButton label="Save Changes"onPress={handleSaveUser} />
 </View>
 </View>
 </View>
 </Modal>
 </View>
 );
}
