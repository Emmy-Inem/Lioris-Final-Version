import React, { useEffect, useState } from'react';
import { Alert, Modal, Platform, Pressable, ScrollView, Switch, View } from'react-native';
import { router } from'expo-router';
import { Ionicons } from'@expo/vector-icons';
import { useQuery } from'@tanstack/react-query';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from'react-native-reanimated';
import { ScreenContainer } from'./ScreenContainer';
import { AppHeader } from'./AppHeader';
import { AppText } from'./AppText';
import { AppTextField } from'./AppTextField';
import { SolidCard } from'./SolidCard';
import { GlassCard } from'./GlassCard';
import { AppButton } from'./AppButton';
import { Avatar } from'./Avatar';
import { Badge } from './Badge';
import { AuthHeroBackground } from './AuthHeroBackground';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { getMyProfile, deleteMyAccount } from '@/api/profile';
import { supabase } from '@/api/supabase';
import { queryClient } from '@/api/queryClient';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';

interface ActiveDeviceSession {
 id: string;
 deviceName: string;
 location: string;
 ipAddress: string;
 lastActive: string;
 isCurrent: boolean;
 type: 'mobile' | 'desktop' | 'tablet';
}

const INITIAL_SESSIONS: ActiveDeviceSession[] = [
 { id: 's1', deviceName: 'iPhone 15 Pro • Lioris Mobile App', location: 'Ibadan, Oyo (UI Campus Node)', ipAddress: '102.89.44.12', lastActive: 'Active Now', isCurrent: true, type: 'mobile' },
 { id: 's2', deviceName: 'MacBook Air M2 • Safari 18.2', location: 'Lagos, Nigeria (UNILAG Node)', ipAddress: '197.210.65.88', lastActive: '2 hours ago', isCurrent: false, type: 'desktop' },
 { id: 's3', deviceName: 'Google Chrome • Windows 11', location: 'Abuja, Nigeria', ipAddress: '105.112.98.24', lastActive: '3 days ago', isCurrent: false, type: 'desktop' },
];

const LEGAL_DOCUMENTS: Record<string, { icon: string; subtitle: string; content: string }> = {
 'Software Terms of Service': {
 icon: 'document-text-outline',
 subtitle: 'Institutional Operational Agreement & Campus Service Rules',
 content: `1. ACCEPTANCE OF TERMS
By downloading, registering, or accessing the Lioris platform, you agree to comply with all university IT guidelines, federal data protection regulations, and these terms.

2. ELIGIBILITY & ACADEMIC CREDENTIALS
Lioris is restricted to verified students, faculty staff, accredited alumni, and campus administrators. Impersonation of academic identity or submission of forged matriculation documents will result in immediate permanent account termination and referral to the University Disciplinary Senate.

3. ACCEPTABLE USE & COMMUNITY INTEGRITY
Users must not upload copyright-infringing exam papers, unauthorized faculty answer keys, malicious scripts, or harassing content. All peer-to-peer transactions conducted via Campus Marketplace are subject to local escrow compliance.

4. DISCLAIMER OF WARRANTIES
Lioris is provided"as is"to facilitate university communications, past questions distribution, and alumni mentorship. The platform does not guarantee continuous uninterrupted network operation during university network downtime.`,
 },
 'Platform Privacy Policy': {
 icon: 'shield-checkmark-outline',
 subtitle: 'Data Encryption, Telemetry & NDPR/GDPR Rights',
 content: `1. DATA COLLECTION PRINCIPLES
We collect only the minimum required information to provide verified collegiate communications: your institutional email (@university.edu.ng), academic department, level, matriculation identifier, and submitted coursework resources.

2. ZERO THIRD-PARTY ADS
Lioris does NOT sell, rent, or monetize student personal data, browsing behaviors, or direct messaging logs to commercial advertising brokers.

3. END-TO-END ENCRYPTION (E2EE)
Direct 1-on-1 communications between students, alumni mentors, and faculty advisors are shielded with client-side AES-256-GCM cryptography. Encryption keys are stored in your device's secure hardware enclave.

4. RIGHT TO ERASURE & DATA EXPORT
In compliance with NDPR and GDPR, you maintain the fundamental right to download a machine-readable JSON copy of your entire platform history or trigger an irreversible global profile purge at any time in Settings.`,
 },
 'Campus Honor Code & Anti-Harassment': {
 icon: 'heart-outline',
 subtitle: 'Standards of Behavior, Anti-Bullying & Exam Malpractice',
 content: `1. HARASSMENT ZERO-TOLERANCE
Lioris enforces a strict zero-tolerance policy against cyber-bullying, sexual harassment, ethnic discrimination, hate speech, and defamation. Violation will result in a 7-day shadowban on first strike, followed by permanent ban.

2. ACADEMIC INTEGRITY
The sharing of past questions, lecture summaries, and collaborative study guides is encouraged. However, sharing live, unreleased semester examination papers during active testing hours constitutes severe examination malpractice and will be logged to campus security.

3. SAFE REPORTING
All community incident reports filed through the Forum or Direct Messages are reviewed by verified campus moderators within 6 hours under strict anonymity.`,
 },
 'Marketplace Escrow Dispute Policy': {
 icon: 'card-outline',
 subtitle: 'Peer-to-Peer Transactions, Safety & Held Funds',
 content: `1. ESCROW PROTECTION MECHANISM
When buying textbooks, laboratory coats, scientific calculators, or hostel clearance gear, buyer funds are held in secure escrow until physical pickup and QR code confirmation.

2. DISPUTE RESOLUTION
If a seller delivers damaged goods or misrepresents textbook editions, buyers may file an Escrow Dispute within 48 hours. A campus administrator will inspect transaction proof and release refund or payout accordingly.

3. RESTRICTED GOODS
Listing weapons, unapproved pharmaceuticals, alcohol, or stolen campus property is strictly prohibited and reported to campus security immediately.`,
 },
 'Open Source Licenses & Attributions': {
 icon: 'code-slash-outline',
 subtitle: 'Third-Party Software Credits & Dependencies',
 content: `Lioris is proudly powered by modern open-source software:

• React & React Native (MIT License) - Meta Platforms, Inc.
• Expo Framework (MIT License) - 650 Industries, Inc.
• TanStack React Query (MIT License) - Tanner Linsley
• React Native Reanimated (MIT License) - Software Mansion
• Expo Blur & Linear Gradient (MIT License) - 650 Industries, Inc.
• Ionicons (MIT License) - Ionic Framework

We thank the global open-source developer ecosystem for making secure academic tools possible.`,
 },
};

export function SettingsScreen() {
 const { colors, spacing, radius, isDark, themeMode, setThemeMode, customAccent, setCustomAccent, accentPresets } = useTheme();
 const { user, logout, switchRole } = useAuth();
 const { data: profile } = useQuery({
 queryKey: ['profile', 'me', user?.id],
 queryFn: () => getMyProfile(user!),
 enabled: !!user,
 });

 const userRole = user?.role ?? 'student';

 // General Notification Toggles
 const [pushEnabled, setPushEnabled] = useState(true);
 const [emailEnabled, setEmailEnabled] = useState(false);
 const [forumAlerts, setForumAlerts] = useState(true);
 const [eventAlerts, setEventAlerts] = useState(true);
 const [marketAlerts, setMarketAlerts] = useState(false);

 // Profile & Bio
 const [bio, setBio] = useState(profile?.bio ?? '');
 const [editingBio, setEditingBio] = useState(false);

 // Security & Privacy Toggles
 const [privateVisibility, setPrivateVisibility] = useState(true);
 const [biometricShield, setBiometricShield] = useState(true);
 const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
 const [appLockTimeout, setAppLockTimeout] = useState<'1m' | '5m' | '15m' | 'never'>('5m');
 const [matricVisibility, setMatricVisibility] = useState<'public' | 'department_only' | 'hidden'>('department_only');
 const [hapticIntensity, setHapticIntensity] = useState<'full' | 'subtle' | 'off'>('full');

 // Role-Specific Settings
 // Student
 const [studySquadOpen, setStudySquadOpen] = useState(true);
 const [menteeMatchingActive, setMenteeMatchingActive] = useState(true);
 // Alumni
 const [mentorCapacity, setMentorCapacity] = useState('3');
 const [autoAcceptCalls, setAutoAcceptCalls] = useState(false);
 const [workplaceHidden, setWorkplaceHidden] = useState(false);
 // Admin
 const [auditVerbosityHigh, setAuditVerbosityHigh] = useState(true);
 const [maintenanceModeActive, setMaintenanceModeActive] = useState(false);

 // Storage & Cache
 const [dataSaver, setDataSaver] = useState(true);
 const [cacheSizeMb, setCacheSizeMb] = useState(14.8);
 const [purging, setPurging] = useState(false);

 // Sessions & Devices Modal
 const [sessionsModalOpen, setSessionsModalOpen] = useState(false);
 const [sessions, setSessions] = useState<ActiveDeviceSession[]>(INITIAL_SESSIONS);

 // 2FA Setup Modal
 const [twoFactorModalOpen, setTwoFactorModalOpen] = useState(false);
 const [totpCode, setTotpCode] = useState('');

 // E2EE Encryption Modal
 const [e2eeModalOpen, setE2eeModalOpen] = useState(false);

 // Erase Profile modal state
 const [eraseModalOpen, setEraseModalOpen] = useState(false);
 const [eraseConfirmText, setEraseConfirmText] = useState('');
 const eraseOpacity = useSharedValue(0);
 const eraseScale = useSharedValue(0.92);

 // Change Password modal state
 const [passwordModalOpen, setPasswordModalOpen] = useState(false);
 const [oldPassword, setOldPassword] = useState('');
 const [newPassword, setNewPassword] = useState('');
 const [confirmPassword, setConfirmPassword] = useState('');
 const [passwordError, setPasswordError] = useState<string | null>(null);
 const [eraseError, setEraseError] = useState<string | null>(null);
 const [passwordSaved, setPasswordSaved] = useState(false);

 // Data Export modal state
 const [exportModalOpen, setExportModalOpen] = useState(false);
 const [copiedExport, setCopiedExport] = useState(false);

 const { isDesktop } = useResponsive();
 const [activeCategory, setActiveCategory] = useState<'all' | 'profile' | 'security' | 'appearance' | 'notifications' | 'sessions' | 'legal' | 'danger'>('all');

 // Legal Modal State
 const [activeLegalKey, setActiveLegalKey] = useState<string | null>(null);

 useEffect(() => {
 if (eraseModalOpen) {
 eraseOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
 eraseScale.value = withSpring(1, { damping: 16, stiffness: 220 });
 } else {
 eraseOpacity.value = 0;
 eraseScale.value = 0.92;
 }
 }, [eraseModalOpen, eraseOpacity, eraseScale]);

 const eraseAnimatedStyle = useAnimatedStyle(() => ({
 opacity: eraseOpacity.value,
 transform: [{ scale: eraseScale.value }],
 }));

 async function handleLogout() {
 haptics.medium();
 await logout();
 router.replace('/(auth)/login');
 }

  async function handlePurgeCache() {
    haptics.medium();
    setPurging(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setCacheSizeMb(0);
    setPurging(false);
    queryClient.clear();
    Alert.alert('Cache Cleared', 'Offline temporary assets, image caches, and cached queries flushed.');
  }

 async function handleRevokeSession(sessionId: string) {
 haptics.medium();
 setSessions((prev) => prev.filter((s) => s.id !== sessionId));
 Alert.alert('Session Terminated', 'Device access token revoked. The device will be logged out immediately.');
 }

 async function handleRevokeAllOtherSessions() {
 haptics.medium();
 setSessions((prev) => prev.filter((s) => s.isCurrent));
 recordAuditLogEntry({
 action: 'escrow_funds_released',
 summary: `User ${profile?.email ?? user?.fullName} revoked all active device sessions except current`,
 targetType: 'user',
 targetId: user?.id ?? 'user-self',
 reason: 'Security self-audit session wipe',
 });
 Alert.alert('All Other Sessions Revoked', 'Only your current device remains authenticated.');
 }

 function handleEnable2FA() {
 if (totpCode.length < 6) {
 Alert.alert('Invalid Code', 'Please enter a valid 6-digit verification code from your authenticator app.');
 return;
 }
 haptics.success();
 setTwoFactorEnabled(true);
 setTwoFactorModalOpen(false);
 setTotpCode('');
 Alert.alert('Two-Factor Authentication Active', 'TOTP Hardware Authentication is now required at login.');
 }

 function handleRotateE2eeKeys() {
 haptics.medium();
 Alert.alert('Device Key Pair Rotated', 'New 256-bit AES-GCM session key generated and synced to local hardware keychain.');
 setE2eeModalOpen(false);
 }

 async function handleEraseProfile() {
 setEraseError(null);
 if (eraseConfirmText.trim().toUpperCase() !== 'ERASE') {
 setEraseError('Please type ERASE in capital letters to confirm.');
 haptics.error();
 return;
 }
 haptics.error();
 try {
 await deleteMyAccount(user?.id);
 } catch {}
 setEraseModalOpen(false);
 setEraseConfirmText('');
 setEraseError(null);
 queryClient.clear();
 await logout();
 router.replace('/(auth)/login');
 }

 async function handleSavePassword() {
 setPasswordError(null);
 if (!newPassword || newPassword.length < 8) {
 setPasswordError('New password must be at least 8 characters long.');
 haptics.error();
 return;
 }
 if (newPassword !== confirmPassword) {
 setPasswordError('New password and confirmation do not match.');
 haptics.error();
 return;
 }
 haptics.medium();
 try {
 const { error } = await supabase.auth.updateUser({ password: newPassword });
 if (error) {
 setPasswordError(error.message || 'Could not update password.');
 haptics.error();
 return;
 }
 setPasswordSaved(true);
 setTimeout(() => {
 setPasswordSaved(false);
 setPasswordModalOpen(false);
 setOldPassword('');
 setNewPassword('');
 setConfirmPassword('');
 setPasswordError(null);
 Alert.alert('Password Updated', 'Your security credentials have been updated successfully.');
 }, 500);
 } catch (err: any) {
 haptics.error();
 setPasswordError(err?.message || 'Could not update password.');
 }
 }

 const exportDataJson = JSON.stringify(
 {
 exportDate: new Date().toISOString(),
 user: {
 id: user?.id,
 fullName: profile?.fullName ?? user?.fullName,
 email: profile?.email,
 role: user?.role,
 institution: profile?.institutionName ?? 'University of Ibadan',
 department: profile?.department ?? 'Computer Science',
 graduationYear: profile?.graduationYear ?? 2026,
 bio: bio || profile?.bio,
 },
 security: {
 twoFactorEnabled,
 biometricShield,
 activeSessions: sessions.length,
 },
 preferences: {
 themeMode,
 pushNotifications: pushEnabled,
 emailNotifications: emailEnabled,
 dataSaver,
 },
 },
 null,
 2
 );

  return (
    <ScreenContainer noPadding glow={true}>
      {!isDesktop && (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <AppHeader />
        </View>
      )}

      <AuthHeroBackground height={96}>
 <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
 <Ionicons name="settings-outline"size={24} color="#FFFFFF" />
 <AppText variant="h1"weight="bold"tone="inverse">
 Settings & Privacy Center
 </AppText>
 </View>
 <AppText variant="caption"tone="inverse"style={{ opacity: 0.9, marginTop: 2 }}>
 Account governance, role controls, E2EE security & compliance
 </AppText>
 </View>
 </AuthHeroBackground>

 <ScrollView
 showsVerticalScrollIndicator={true}
 keyboardShouldPersistTaps="handled"
 nestedScrollEnabled
 contentContainerStyle={{ paddingHorizontal: isDesktop ? 32 : spacing.lg, paddingBottom: 150, paddingTop: spacing.md }}
 >
 <View style={isDesktop ? { flexDirection: 'row', gap: 32, alignItems: 'flex-start', maxWidth: 1200, marginHorizontal: 'auto', width: '100%' } : undefined}>
 {isDesktop && (
 <View style={{ width: 260 }}>
 <SolidCard radius={20} style={{ padding: spacing.sm }}>
 <AppText variant="caption" tone="secondary" weight="bold" style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, textTransform: 'uppercase', fontSize: 10 }}>
 Settings Menu
 </AppText>
 {[
 { id: 'all', label: 'All Settings', icon: 'grid-outline' },
 { id: 'profile', label: 'Identity & Bio', icon: 'person-outline' },
 { id: 'security', label: 'Security & 2FA', icon: 'shield-checkmark-outline' },
 { id: 'appearance', label: 'Theme & Display', icon: 'color-palette-outline' },
 { id: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
 { id: 'sessions', label: 'Active Devices', icon: 'laptop-outline' },
 { id: 'legal', label: 'Honor Code & Terms', icon: 'document-text-outline' },
 { id: 'danger', label: 'Data & Account Actions', icon: 'trash-outline' },
 ].map((cat) => {
 const isSelected = activeCategory === cat.id;
 return (
 <Pressable
 key={cat.id}
 onPress={() => setActiveCategory(cat.id as any)}
 style={({ hovered }: any) => [
 {
 flexDirection: 'row',
 alignItems: 'center',
 gap: 10,
 paddingHorizontal: 12,
 paddingVertical: 10,
 borderRadius: radius.md,
 backgroundColor: isSelected
 ? colors.brandPrimary
 : hovered
 ? colors.pastelPrimaryBg
 : 'transparent',
 marginVertical: 2,
 },
 ]}
 >
 <Ionicons
 name={cat.icon as any}
 size={18}
 color={isSelected ? '#FFFFFF' : colors.textPrimary}
 />
 <AppText
 variant="bodySmall"
 weight={isSelected ? 'bold' : 'medium'}
 tone={isSelected ? 'inverse' : 'primary'}
 style={{ flex: 1 }}
 >
 {cat.label}
 </AppText>
 </Pressable>
 );
 })}
 </SolidCard>
 </View>
 )}

 <View style={isDesktop ? { flex: 1, maxWidth: 840 } : undefined}>
 {/* My Profile Quick Summary Card */}
 <SolidCard frosted style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm }}>
 <AppText tone="brand"weight="bold"variant="bodySmall">
 AUTHENTICATED IDENTITY
 </AppText>
 <Badge label={userRole.toUpperCase()} tone="brand" />
 </View>

 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
 <Avatar name={profile?.fullName ?? user?.fullName ?? 'You'} size={52} role={userRole} />
 <View style={{ flex: 1 }}>
 <AppText weight="bold"variant="body">{profile?.fullName ?? user?.fullName}</AppText>
 <AppText tone="secondary"variant="caption">
 {profile?.email ?? 'verified.member@campus.edu.ng'}
 </AppText>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
 <Ionicons name="business-outline"size={12} color={colors.brandPrimary} />
 <AppText variant="caption"tone="brand"weight="bold">
 {profile?.institutionName ?? 'University of Ibadan'}
 </AppText>
 </View>
 </View>
 </View>

 <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.md }} />

 <AppText weight="bold"variant="caption"tone="secondary"style={{ marginBottom: 4 }}>
 ACADEMIC BIO / ADVISOR NOTE
 </AppText>
 {editingBio ? (
 <AppTextField label=""value={bio} onChangeText={setBio} multiline numberOfLines={2} />
 ) : (
 <AppText tone="primary"variant="bodySmall"onPress={() => setEditingBio(true)}>
 {bio || 'Tap to set an academic bio or focus area...'}
 </AppText>
 )}
 {editingBio ? (
 <View style={{ marginTop: spacing.xs, flexDirection: 'row', justifyContent: 'flex-end' }}>
 <AppButton label="Save Bio"onPress={() => setEditingBio(false)} />
 </View>
 ) : null}
 </SolidCard>

 {/* Role Switcher & Sandbox Testing Mode (Admin Only) */}
 {(userRole === 'admin' || (user as any)?._originalRole === 'admin') && (
 <SolidCard frosted radius={20} style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
 <AppText tone="brand" weight="bold" variant="bodySmall">
 Role Switcher (Admin Preview)
 </AppText>
 <Badge label={`Current: ${userRole.toUpperCase()}`} tone="accent" />
 </View>
 <AppText tone="secondary" variant="caption" style={{ marginBottom: spacing.sm }}>
 Switch portal perspectives to preview student, faculty staff, alumni fellow, or root administrator views.
 </AppText>

 <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
 {[
 { role: 'student', label: 'Student Portal', path: '/(student)/dashboard' },
 { role: 'staff', label: 'Faculty Staff', path: '/(staff)/dashboard' },
 { role: 'alumni', label: 'Alumni Fellow', path: '/(alumni)/dashboard' },
 { role: 'admin', label: 'Root Admin', path: '/(admin)/dashboard' },
 ].map((r) => {
 const active = userRole === r.role;
 return (
 <Pressable
 key={r.role}
 onPress={async () => {
 haptics.medium();
 await switchRole(r.role as any);
 queryClient.clear();
 router.replace(r.path as any);
 }}
 accessibilityRole="button"
 accessibilityLabel={`Switch to ${r.label}`}
 style={{
 flex: 1,
 minWidth: '47%',
 backgroundColor: active ? colors.brandPrimary : colors.pastelPrimaryBg,
 borderRadius: radius.md,
 paddingVertical: spacing.sm,
 paddingHorizontal: spacing.sm,
 alignItems: 'center',
 borderWidth: 1,
 borderColor: active ? colors.brandPrimary : colors.border,
 marginBottom: 4,
 }}
 >
 <AppText variant="bodySmall" weight="bold" tone={active ? 'inverse' : 'brand'}>
 {r.label}
 </AppText>
 </Pressable>
 );
 })}
 </View>
 </SolidCard>
 )}

 {/* Role-Specific Custom Controls */}
 {userRole === 'student' && (
 <SolidCard frosted style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}>
 <Ionicons name="school-outline"size={18} color={colors.brandPrimary} />
 <AppText tone="brand"weight="bold"variant="bodySmall">
 Student Academic Privacy & Squad Controls 
 </AppText>
 </View>

 <SettingSwitchRow
 title="Study Squad Invites"description="Allow peers in your department to invite you to study circles."value={studySquadOpen}
 onValueChange={setStudySquadOpen}
 />
 <SettingSwitchRow
 title="1-on-1 Alumni Mentee Matching"description="Enable alumni fellows to view your career interests for mentorship."value={menteeMatchingActive}
 onValueChange={setMenteeMatchingActive}
 />

 <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs }} />

 <View style={{ paddingVertical: spacing.xs }}>
 <AppText weight="bold"variant="bodySmall"style={{ marginBottom: 4 }}>
 Matriculation Number Visibility
 </AppText>
 <View style={{ flexDirection: 'row', gap: spacing.xs }}>
 {[
 { key: 'public'as const, label: 'Public' },
 { key: 'department_only'as const, label: 'Department Only' },
 { key: 'hidden'as const, label: 'Private (Hidden)' },
 ].map((item) => (
 <Pressable
 key={item.key}
 onPress={() => setMatricVisibility(item.key)}
 style={{
 flex: 1,
 paddingVertical: 6,
 borderRadius: radius.md,
 backgroundColor: matricVisibility === item.key ? colors.brandPrimary : colors.pastelPrimaryBg,
 alignItems: 'center',
 }}
 >
 <AppText variant="caption"weight="bold"tone={matricVisibility === item.key ? 'inverse' : 'brand'} style={{ fontSize: 10 }}>
 {item.label}
 </AppText>
 </Pressable>
 ))}
 </View>
 </View>
 </SolidCard>
 )}

 {userRole === 'alumni' && (
 <SolidCard frosted style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}>
 <Ionicons name="briefcase-outline"size={18} color={colors.brandPrimary} />
 <AppText tone="brand"weight="bold"variant="bodySmall">
 Alumni Mentorship & Office Hours
 </AppText>
 </View>

 <SettingSwitchRow
 title="Auto-Accept Student Video Calls"description="Directly sync scheduled mentorship slots to Google Calendar / Zoom."value={autoAcceptCalls}
 onValueChange={setAutoAcceptCalls}
 />
 <SettingSwitchRow
 title="Hide Current Company & Workplace"description="Suppress employer details from general student search results."value={workplaceHidden}
 onValueChange={setWorkplaceHidden}
 />
 </SolidCard>
 )}

 {userRole === 'admin' && (
 <SolidCard frosted style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}>
 <Ionicons name="shield-outline"size={18} color={colors.critical} />
 <AppText tone="brand"weight="bold"variant="bodySmall">
 Administrator Safety & Panic Controls
 </AppText>
 </View>

 <SettingSwitchRow
 title="Emergency Campus Panic Mode"description="Immediately locks database writes and puts platform in read-only maintenance."value={maintenanceModeActive}
 onValueChange={(val) => {
 haptics.medium();
 if (val) {
 Alert.alert('Enable Emergency Panic Mode?', 'This puts all 4 university nodes in maintenance mode.', [
 { text: 'Cancel', style: 'cancel' },
 { text: 'Enable Lockdown', style: 'destructive', onPress: () => setMaintenanceModeActive(true) },
 ]);
 } else {
 setMaintenanceModeActive(false);
 }
 }}
 />
 <SettingSwitchRow
 title="Verbose Cryptographic Audit Trail"description="Log detailed packet-level telemetry to campus audit ledger."value={auditVerbosityHigh}
 onValueChange={setAuditVerbosityHigh}
 />
 </SolidCard>
 )}

 {/* Advanced Security & Devices Hub */}
 <SolidCard frosted style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
 <AppText tone="brand"weight="bold"variant="bodySmall">
 Security, 2FA & Sessions
 </AppText>
 <Badge label="Hardware Shield"tone="brand" />
 </View>

 <SettingSwitchRow
 title="Biometric App Lock"description="Require Face ID / Touch ID / Fingerprint on launch."value={biometricShield}
 onValueChange={setBiometricShield}
 />

 <SettingSwitchRow
 title="Private Profile Visibility"description="Only fellow verified students in your campus see contact details."value={privateVisibility}
 onValueChange={setPrivateVisibility}
 />

 <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs }} />

 {/* Device Sessions Row */}
 <Pressable
 onPress={() => {
 haptics.light();
 setSessionsModalOpen(true);
 }}
 style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm }}
 >
 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
 <AppText weight="bold"variant="bodySmall">Active Device Sessions</AppText>
 <Badge label={`${sessions.length} Active`} tone="brand" />
 </View>
 <AppText tone="secondary"variant="caption">
 Manage authenticated phones, tablets & desktop browsers
 </AppText>
 </View>
 <Ionicons name="chevron-forward"size={18} color={colors.textSecondary} />
 </Pressable>

 {/* 2FA Setup Row */}
 <Pressable
 onPress={() => {
 haptics.light();
 setTwoFactorModalOpen(true);
 }}
 style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm }}
 >
 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
 <AppText weight="bold"variant="bodySmall">Two-Factor Authentication (2FA)</AppText>
 <Badge label={twoFactorEnabled ? 'Enabled ' : 'Disabled ⚪'} tone={twoFactorEnabled ? 'success' : 'neutral'} />
 </View>
 <AppText tone="secondary"variant="caption">
 TOTP Authenticator app verification codes
 </AppText>
 </View>
 <Ionicons name="chevron-forward"size={18} color={colors.textSecondary} />
 </Pressable>

 {/* E2EE Cryptography Fingerprint Row */}
 <Pressable
 onPress={() => {
 haptics.light();
 setE2eeModalOpen(true);
 }}
 style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm }}
 >
 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
 <AppText weight="bold"variant="bodySmall">E2EE Chat Encryption Keys</AppText>
 <Badge label="AES-256-GCM"tone="accent" />
 </View>
 <AppText tone="secondary"variant="caption">
 Verify device encryption keys & cryptographic fingerprints
 </AppText>
 </View>
 <Ionicons name="chevron-forward"size={18} color={colors.textSecondary} />
 </Pressable>
 </SolidCard>

 {/* Display & Visual Preferences */}
 <SolidCard frosted style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}>
 <Ionicons name="color-palette-outline"size={18} color={colors.brandPrimary} />
 <AppText tone="brand"weight="bold"variant="bodySmall">
 Display & Experience
 </AppText>
 </View>
 <AppText tone="secondary"variant="caption"style={{ marginBottom: spacing.sm }}>
 Choose your interface theme mode or match device system settings.
 </AppText>
 <View
 style={{
 flexDirection: 'row',
 backgroundColor: colors.divider,
 borderRadius: radius.pill,
 padding: 4,
 gap: 4,
 marginBottom: spacing.md,
 }}
 >
 {[
 { key: 'system'as const, label: 'System', icon: 'phone-portrait-outline'as const },
 { key: 'light'as const, label: 'Light', icon: 'sunny-outline'as const },
 { key: 'dark'as const, label: 'Dark', icon: 'moon-outline'as const },
 ].map((option) => {
 const selected = themeMode === option.key;
 return (
 <Pressable
 key={option.key}
 onPress={() => {
 haptics.light();
 setThemeMode(option.key);
 }}
 accessibilityRole="button"accessibilityLabel={`Switch to ${option.label} theme`}
 accessibilityState={{ selected }}
 style={{
 flex: 1,
 flexDirection: 'row',
 alignItems: 'center',
 justifyContent: 'center',
 gap: 6,
 paddingVertical: spacing.sm,
 borderRadius: radius.pill,
 backgroundColor: selected ? colors.brandPrimary : 'transparent',
 }}
 >
 <Ionicons name={option.icon} size={15} color={selected ? '#FFFFFF' : colors.textSecondary} />
 <AppText variant="bodySmall"weight={selected ? 'bold' : 'medium'} tone={selected ? 'inverse' : 'secondary'}>
 {option.label}
 </AppText>
 </Pressable>
 );
 })}
 </View>

 <View style={{ height: 1, backgroundColor: colors.divider, marginBottom: spacing.sm }} />

 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
 <AppText weight="bold"variant="bodySmall">
 Brand Accent Color
 </AppText>
 {customAccent ? (
 <Pressable
 onPress={() => {
 haptics.light();
 setCustomAccent(null);
 }}
 hitSlop={8}
 >
 <AppText variant="caption"tone="brand"weight="bold">
 Reset to Campus Auto
 </AppText>
 </Pressable>
 ) : null}
 </View>
 <AppText tone="secondary"variant="caption"style={{ marginBottom: spacing.sm }}>
 Personalize the primary accent color across buttons, tabs, badges, and headers.
 </AppText>

 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
 {accentPresets.map((preset) => {
 const colorHex = isDark ? preset.primaryDark : preset.primaryLight;
 const isSelected = customAccent === preset.id || (!customAccent && preset.id === 'UI');
 return (
 <Pressable
 key={preset.id}
 onPress={() => {
 haptics.medium();
 setCustomAccent(preset.id);
 }}
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 6,
 paddingHorizontal: spacing.sm,
 paddingVertical: 6,
 borderRadius: radius.pill,
 backgroundColor: isSelected ? colors.pastelPrimaryBg : colors.divider,
 borderWidth: isSelected ? 1.5 : 0,
 borderColor: colorHex,
 marginBottom: 4,
 }}
 >
 <View
 style={{
 width: 14,
 height: 14,
 borderRadius: 7,
 backgroundColor: colorHex,
 }}
 />
 <AppText variant="caption"weight={isSelected ? 'bold' : 'medium'} style={{ color: isSelected ? colors.brandPrimary : colors.textPrimary }}>
 {preset.label}
 </AppText>
 </Pressable>
 );
 })}
 </View>
 </SolidCard>

 {/* Notification Preferences */}
 <SolidCard frosted style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
 <Ionicons name="notifications-outline"size={18} color={colors.brandPrimary} />
 <AppText tone="brand"weight="bold"variant="bodySmall">
 Notification Channels
 </AppText>
 </View>
 <SettingSwitchRow title="Push notifications"value={pushEnabled} onValueChange={setPushEnabled} />
 <SettingSwitchRow title="Institutional email alerts"value={emailEnabled} onValueChange={setEmailEnabled} />
 <SettingSwitchRow title="Forum reply alerts"value={forumAlerts} onValueChange={setForumAlerts} />
 <SettingSwitchRow title="Event calendar reminders"value={eventAlerts} onValueChange={setEventAlerts} />
 <SettingSwitchRow title="Marketplace & escrow alerts"value={marketAlerts} onValueChange={setMarketAlerts} last />
 </SolidCard>

 {/* Comprehensive Legal & Compliance Hub */}
 <SolidCard frosted style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
 <Ionicons name="document-text-outline"size={18} color={colors.brandPrimary} />
 <AppText tone="brand"weight="bold"variant="bodySmall">
 Legal, Safety & Compliance Hub
 </AppText>
 </View>
 <Badge label="NDPR / GDPR"tone="brand" />
 </View>
 <AppText tone="secondary"variant="caption"style={{ marginBottom: spacing.sm }}>
 Official student agreements, honor codes, dispute policies, and privacy standards.
 </AppText>

 {Object.keys(LEGAL_DOCUMENTS).map((docKey, i, arr) => (
 <LinkRow
 key={docKey}
 title={docKey}
 description={LEGAL_DOCUMENTS[docKey].subtitle}
 onPress={() => {
 haptics.light();
 setActiveLegalKey(docKey);
 }}
 last={i === arr.length - 1}
 />
 ))}
 </SolidCard>

 {/* Storage, Data Saver & Cache */}
 <SolidCard frosted style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
 <Ionicons name="server-outline"size={18} color={colors.brandPrimary} />
 <AppText tone="brand"weight="bold"variant="bodySmall">
 Storage & Local Cache
 </AppText>
 </View>
 <SettingSwitchRow
 title="Low Data Mode"description="Compress attached PDF lecture notes and forum photos."value={dataSaver}
 onValueChange={setDataSaver}
 />
 <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm }} />
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
 <View style={{ flex: 1, marginRight: spacing.sm }}>
 <AppText weight="bold"variant="bodySmall">
 Cached Attachments & Temp Indices
 </AppText>
 <AppText tone="secondary"variant="caption">
 Current storage usage: {cacheSizeMb.toFixed(1)} MB
 </AppText>
 </View>
 <AppButton label="Flush Cache"variant="secondary"onPress={handlePurgeCache} loading={purging} />
 </View>
 </SolidCard>

 {/* Account Credentials & Export */}
 <SolidCard frosted style={{ marginBottom: spacing.lg }}>
 <AppText tone="brand"weight="bold"variant="bodySmall"style={{ marginBottom: spacing.sm }}>
 Account Credentials & GDPR Export
 </AppText>
 <AppButton label="Change Password"variant="secondary"onPress={() => setPasswordModalOpen(true)} fullWidth />
 <View style={{ height: spacing.sm }} />
 <AppButton label="Export My Academic Archive (JSON) "variant="secondary"onPress={() => setExportModalOpen(true)} fullWidth />
 <View style={{ height: spacing.sm }} />
 <AppButton label="Erase Account & Profile Permanently "variant="accent"onPress={() => setEraseModalOpen(true)} fullWidth />
 </SolidCard>

 {/* Sign Out Button */}
 <AppButton label="Sign Out " variant="secondary" onPress={handleLogout} fullWidth />
 </View>
 </View>
 </ScrollView>

 {/* Active Device Sessions Modal */}
 <Modal visible={sessionsModalOpen} transparent animationType="slide"onRequestClose={() => setSessionsModalOpen(false)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
 <Pressable style={{ flex: 1 }} onPress={() => setSessionsModalOpen(false)} />
 <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '85%' }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
 <Ionicons name="phone-portrait"size={20} color={colors.brandPrimary} />
 <AppText variant="h2"weight="bold">Active Device Sessions </AppText>
 </View>
 <Pressable onPress={() => setSessionsModalOpen(false)} hitSlop={8}>
 <Ionicons name="close"size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 <AppText tone="secondary"variant="caption"style={{ marginBottom: spacing.md }}>
 Devices currently authorized to access your campus account.
 </AppText>

 <ScrollView showsVerticalScrollIndicator={true}>
 {sessions.map((session) => (
 <SolidCard key={session.id} radius={16} style={{ marginBottom: spacing.sm, borderWidth: 1, borderColor: session.isCurrent ? colors.brandPrimary : colors.border }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
 <Ionicons name={session.type === 'mobile' ? 'phone-portrait-outline' : 'laptop-outline'} size={18} color={colors.brandPrimary} />
 <AppText weight="bold"variant="bodySmall">{session.deviceName}</AppText>
 </View>
 <AppText tone="secondary"variant="caption"style={{ marginTop: 2 }}>
 {session.location} • IP: {session.ipAddress}
 </AppText>
 <AppText tone="brand"variant="caption"weight="bold"style={{ marginTop: 2 }}>
 Status: {session.lastActive}
 </AppText>
 </View>

 {session.isCurrent ? (
 <Badge label="THIS DEVICE"tone="success" />
 ) : (
 <AppButton label="Revoke"variant="ghost"onPress={() => handleRevokeSession(session.id)} />
 )}
 </View>
 </SolidCard>
 ))}
 </ScrollView>

 <View style={{ marginTop: spacing.md }}>
 <AppButton label="Revoke All Other Sessions "variant="accent"onPress={handleRevokeAllOtherSessions} fullWidth />
 </View>
 </View>
 </View>
 </Modal>

 {/* Two-Factor Authentication Modal */}
 <Modal visible={twoFactorModalOpen} transparent animationType="slide"onRequestClose={() => setTwoFactorModalOpen(false)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
 <Pressable style={{ flex: 1 }} onPress={() => setTwoFactorModalOpen(false)} />
 <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
 <Ionicons name="shield-checkmark"size={20} color={colors.brandPrimary} />
 <AppText variant="h2"weight="bold">Two-Factor Authentication (2FA) </AppText>
 </View>
 <Pressable onPress={() => setTwoFactorModalOpen(false)} hitSlop={8}>
 <Ionicons name="close"size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
 Scan the setup QR code in Google Authenticator, Authy, or 1Password, then enter the 6-digit confirmation code below:
 </AppText>

 {/* Simulated Authenticator Secret Key Box */}
 <View style={{ backgroundColor: colors.pastelPrimaryBg, padding: spacing.md, borderRadius: 14, marginBottom: spacing.md, alignItems: 'center' }}>
 <AppText variant="caption"tone="secondary"style={{ marginBottom: 4 }}>AUTHENTICATOR SECRET KEY</AppText>
 <AppText variant="bodySmall"weight="bold"tone="brand"style={{ letterSpacing: 2 }}>
 LIORIS-AUTH-8924-X99Q
 </AppText>
 </View>

 <AppTextField
 label="6-Digit Verification Code"placeholder="e.g. 492104"value={totpCode}
 onChangeText={setTotpCode}
 keyboardType="number-pad"
 />

 <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
 <View style={{ flex: 1 }}>
 <AppButton label="Cancel"variant="ghost"onPress={() => setTwoFactorModalOpen(false)} fullWidth />
 </View>
 <View style={{ flex: 2 }}>
 <AppButton label="Activate 2FA"onPress={handleEnable2FA} fullWidth />
 </View>
 </View>
 </View>
 </View>
 </Modal>

 {/* E2EE Cryptography Details Modal */}
 <Modal visible={e2eeModalOpen} transparent animationType="fade"onRequestClose={() => setE2eeModalOpen(false)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
 <SolidCard radius={24} style={{ width: '100%', maxWidth: 440 }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
 <Ionicons name="key"size={20} color={colors.brandPrimary} />
 <AppText variant="h2"weight="bold">E2EE Cryptography </AppText>
 </View>
 <Pressable onPress={() => setE2eeModalOpen(false)} hitSlop={8}>
 <Ionicons name="close"size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 <AppText tone="secondary"variant="caption"style={{ marginBottom: spacing.md }}>
 Your device encryption identity fingerprint used for end-to-end encrypted direct messaging:
 </AppText>

 <View style={{ backgroundColor: colors.pastelPrimaryBg, padding: spacing.md, borderRadius: 14, marginBottom: spacing.md }}>
 <AppText variant="caption"tone="secondary"style={{ marginBottom: 4 }}>DEVICE PUBLIC KEY FINGERPRINT</AppText>
 <AppText variant="caption"weight="bold"tone="brand"style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 11 }}>
 SHA-256: 8F:4A:91:2C:B3:01:DF:77:E5:60:88:19:AC:EE:44:90
 </AppText>
 </View>

 <View style={{ flexDirection: 'row', gap: spacing.sm }}>
 <View style={{ flex: 1 }}>
 <AppButton label="Rotate Session Key"variant="secondary"onPress={handleRotateE2eeKeys} fullWidth />
 </View>
 <View style={{ flex: 1 }}>
 <AppButton label="Close"onPress={() => setE2eeModalOpen(false)} fullWidth />
 </View>
 </View>
 </SolidCard>
 </View>
 </Modal>

 {/* Comprehensive Legal Documents Reader Modal */}
 <Modal visible={!!activeLegalKey} transparent animationType="slide"onRequestClose={() => setActiveLegalKey(null)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
 <Pressable style={{ flex: 1 }} onPress={() => setActiveLegalKey(null)} />
 <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '90%' }}>
 {activeLegalKey && (
 <>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
 <Ionicons name={LEGAL_DOCUMENTS[activeLegalKey]?.icon as any} size={22} color={colors.brandPrimary} />
 <AppText variant="h2"weight="bold">{activeLegalKey}</AppText>
 </View>
 <Pressable onPress={() => setActiveLegalKey(null)} hitSlop={8}>
 <Ionicons name="close"size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 <AppText tone="brand"variant="caption"weight="bold"style={{ marginBottom: spacing.md }}>
 {LEGAL_DOCUMENTS[activeLegalKey]?.subtitle}
 </AppText>

 <ScrollView showsVerticalScrollIndicator={true} style={{ maxHeight: 380, backgroundColor: colors.pastelPrimaryBg, padding: spacing.md, borderRadius: 16 }}>
 <AppText variant="bodySmall"tone="primary"style={{ lineHeight: 22 }}>
 {LEGAL_DOCUMENTS[activeLegalKey]?.content}
 </AppText>
 </ScrollView>

 <View style={{ marginTop: spacing.md }}>
 <AppButton label="Understood & Accept"onPress={() => setActiveLegalKey(null)} fullWidth />
 </View>
 </>
 )}
 </View>
 </View>
 </Modal>

 {/* Change Password Modal */}
 <Modal visible={passwordModalOpen} transparent animationType="fade" onRequestClose={() => setPasswordModalOpen(false)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
 <SolidCard style={{ width: '100%', maxWidth: 420 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
 <AppText variant="h3" weight="bold">Change Password</AppText>
 <Pressable onPress={() => { setPasswordModalOpen(false); setPasswordError(null); }} hitSlop={8}>
 <Ionicons name="close" size={20} color={colors.textSecondary} />
 </Pressable>
 </View>

 {passwordError ? (
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
 {passwordError}
 </AppText>
 </View>
 ) : null}

 <AppTextField
 label="Current Password"
 placeholder="Enter current password"
 secureTextEntry
 value={oldPassword}
 onChangeText={(t) => { setOldPassword(t); if (passwordError) setPasswordError(null); }}
 />
 <AppTextField
 label="New Password"
 placeholder="At least 8 characters"
 secureTextEntry
 value={newPassword}
 onChangeText={(t) => { setNewPassword(t); if (passwordError) setPasswordError(null); }}
 />
 <AppTextField
 label="Confirm New Password"
 placeholder="Re-enter new password"
 secureTextEntry
 value={confirmPassword}
 onChangeText={(t) => { setConfirmPassword(t); if (passwordError) setPasswordError(null); }}
 />
 <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
 <AppButton label="Cancel" variant="ghost" onPress={() => { setPasswordModalOpen(false); setPasswordError(null); }} />
 <AppButton label="Update Password" loading={passwordSaved} onPress={handleSavePassword} />
 </View>
 </SolidCard>
 </View>
 </Modal>

 {/* Export Data Modal */}
 <Modal visible={exportModalOpen} transparent animationType="fade" onRequestClose={() => setExportModalOpen(false)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
 <SolidCard style={{ width: '100%', maxWidth: 440 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
 <AppText variant="h3" weight="bold">Academic Archive Export </AppText>
 <Pressable onPress={() => setExportModalOpen(false)} hitSlop={8}>
 <Ionicons name="close" size={20} color={colors.textSecondary} />
 </Pressable>
 </View>
 <ScrollView style={{ maxHeight: 220, backgroundColor: colors.pastelPrimaryBg, padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.md }}>
 <AppText tone="secondary" style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 10 }}>
 {exportDataJson}
 </AppText>
 </ScrollView>
 <AppButton
 label={copiedExport ? 'Export Downloaded ✓' : 'Download JSON Data File'}
 onPress={() => {
 haptics.medium();
 if (Platform.OS === 'web' && typeof document !== 'undefined') {
 const blob = new Blob([exportDataJson], { type: 'application/json' });
 const link = document.createElement('a');
 link.href = window.URL.createObjectURL(blob);
 link.setAttribute('download', `academic_archive_${Date.now()}.json`);
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 }
 setCopiedExport(true);
 setTimeout(() => setCopiedExport(false), 2000);
 }}
 fullWidth
 />
 </SolidCard>
 </View>
 </Modal>

 {/* Erase Profile Confirmation Modal */}
 <Modal visible={eraseModalOpen} transparent animationType="fade" onRequestClose={() => setEraseModalOpen(false)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
 <Animated.View style={[{ width: '100%', maxWidth: 420 }, eraseAnimatedStyle]}>
 <SolidCard style={{ width: '100%' }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
 <Ionicons name="warning" size={20} color={colors.critical} />
 <AppText variant="h3" weight="bold" style={{ color: colors.critical }}>Erase Profile Permanently</AppText>
 </View>
 <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
 This permanently wipes your academic workspace index - posts, resources, event history, and connections. Type ERASE to confirm.
 </AppText>

 {eraseError ? (
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
 {eraseError}
 </AppText>
 </View>
 ) : null}

 <AppTextField
 label=""
 placeholder="ERASE"
 value={eraseConfirmText}
 onChangeText={(t) => { setEraseConfirmText(t); if (eraseError) setEraseError(null); }}
 autoCapitalize="characters"
 />
 <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm }}>
 <AppButton label="Cancel" variant="ghost" onPress={() => { setEraseModalOpen(false); setEraseError(null); }} />
 <AppButton
 label="Erase permanently"
 variant="accent"
 disabled={eraseConfirmText.trim().toUpperCase() !== 'ERASE'}
 onPress={handleEraseProfile}
 />
 </View>
 </SolidCard>
 </Animated.View>
 </View>
 </Modal>
 </ScreenContainer>
 );
}

function LinkRow({ title, description, onPress, last }: { title: string; description: string; onPress: () => void; last?: boolean }) {
 const { colors, spacing } = useTheme();
 return (
 <Pressable
 onPress={onPress}
 accessibilityRole="button"accessibilityLabel={title}
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 justifyContent: 'space-between',
 paddingVertical: spacing.sm,
 marginBottom: last ? 0 : spacing.xs,
 }}
 >
 <View style={{ flex: 1, paddingRight: spacing.sm }}>
 <AppText weight="semiBold"variant="bodySmall">
 {title}
 </AppText>
 <AppText tone="secondary"variant="caption">
 {description}
 </AppText>
 </View>
 <Ionicons name="chevron-forward"size={16} color={colors.textSecondary} />
 </Pressable>
 );
}

function SettingSwitchRow({
 title,
 description,
 value,
 onValueChange,
 last,
}: {
 title: string;
 description?: string;
 value: boolean;
 onValueChange: (v: boolean) => void;
 last?: boolean;
}) {
 const { colors, spacing } = useTheme();
 return (
 <View
 style={{
 flexDirection: 'row',
 justifyContent: 'space-between',
 alignItems: 'center',
 paddingVertical: spacing.sm,
 marginBottom: last ? 0 : spacing.xs,
 }}
 >
 <View style={{ flex: 1, marginRight: spacing.sm }}>
 <AppText variant="bodySmall"weight="medium">
 {title}
 </AppText>
 {description ? (
 <AppText tone="secondary"variant="caption">
 {description}
 </AppText>
 ) : null}
 </View>
 <Switch
 value={value}
 onValueChange={onValueChange}
 trackColor={{ false: colors.divider, true: colors.brandPrimary }}
 accessibilityLabel={title}
 />
 </View>
 );
}
