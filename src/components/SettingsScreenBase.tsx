import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { DepartmentPicker } from './DepartmentPicker';
import { SolidCard } from './SolidCard';
import { AppButton } from './AppButton';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { ChangeWorkspaceScopeModal } from './ChangeWorkspaceScopeModal';
import { AppTutorialModal } from './AppTutorialModal';
import { ChangeEmailModal } from './ChangeEmailModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { useCampusScope } from '@/hooks/useCampusScope';
import { deleteMyAccount, exportMyData, getMyProfile, updateMyProfile } from '@/api/profile';
import { roleRequiresMfa } from '@/auth/mfaPolicy';
import { DPO_EMAIL, DSR_RESPONSE_DAYS, PRIVACY_VERSION, TERMS_VERSION } from '@/constants/legal';
import { LAUNCH_INSTITUTIONS, getInstitutionByCode } from '@/api/institutions';
import { supabase } from '@/api/supabase';
import { submitReport } from '@/api/moderation';
import { createSupportTicket, SupportTicketCategory } from '@/api/supportTickets';
import * as authApi from '@/api/auth';
import { haptics } from '@/utils/haptics';
import { isBiometricsAvailable, authenticateWithBiometrics } from '@/utils/biometrics';

// Cross-platform local persistence for lightweight UI preference toggles.
// Mirrors the pattern already used in ThemeProvider.tsx: web uses
// localStorage, native uses expo-secure-store (raw `localStorage` is a
// no-op on native and was silently losing these settings there).
// NOTE: this is still device-local only - there is no backend column/table
// wired up for notification or biometric preferences yet, so these settings
// do not sync across devices or actually gate server-side push delivery.
// Server-side sync is a known follow-up once a preferences table/column
// exists to persist to.
const isWeb = Platform.OS === 'web';

async function getStoredPref(key: string): Promise<string | null> {
  try {
    if (isWeb) {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setStoredPref(key: string, value: string): Promise<void> {
  try {
    if (isWeb) {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {}
}

const ALL_SETTINGS_SECTIONS = [
  { key: 'account', label: 'Account', fullLabel: 'Account & Profile', icon: 'person-outline' as const },
  { key: 'workspace', label: 'Scope', fullLabel: 'Workspace Scope', icon: 'globe-outline' as const },
  { key: 'appearance', label: 'Theme', fullLabel: 'Theme & Display', icon: 'color-palette-outline' as const },
  { key: 'notifications', label: 'Alerts', fullLabel: 'Notifications', icon: 'notifications-outline' as const },
  { key: 'security', label: 'Security', fullLabel: 'Security & Logins', icon: 'shield-checkmark-outline' as const },
  { key: 'preview', label: 'Switcher', fullLabel: 'Role Switcher', icon: 'swap-horizontal-outline' as const },
  { key: 'privacy', label: 'Privacy', fullLabel: 'Privacy & Data', icon: 'lock-closed-outline' as const },
  { key: 'legal', label: 'Policies', fullLabel: 'Terms & Policies', icon: 'document-text-outline' as const },
] as const;

const LEGAL_LINKS = [
  { title: 'Privacy Policy', desc: 'How we collect, use and protect your data (NDPA 2023).', href: '/privacy' as const },
  { title: 'Terms of Service', desc: 'Rules for using Lioris, including AI and marketplace terms.', href: '/terms' as const },
  { title: 'Community Rules', desc: 'Standards of conduct, reporting and moderation.', href: '/community-rules' as const },
];

export function SettingsScreen() {
  const {
    colors,
    spacing,
    radius,
    isDark,
    themeMode,
    setThemeMode,
    customAccent,
    setCustomAccent,
    resetToDefaultTheme,
    isDefaultTheme,
    accentPresets,
  } = useTheme();
  const { user, logout, switchRole } = useAuth();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { scope, setScope, activeCampusCode, homeInstitutionCode } = useCampusScope();
  const [workspaceScopeModalOpen, setWorkspaceScopeModalOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const isSuperAdmin = user?.actualRole === 'admin';
  const SETTINGS_SECTIONS = isSuperAdmin
    ? ALL_SETTINGS_SECTIONS
    : ALL_SETTINGS_SECTIONS.filter((sec) => sec.key !== 'preview');

  const [activeSection, setActiveSection] = useState<(typeof ALL_SETTINGS_SECTIONS)[number]['key']>('account');

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  // Toggles with local persistence
  const [pushEnabled, setPushEnabled] = useState(true);
  const [announcementAlerts, setAnnouncementAlerts] = useState(true);
  const [eventAlerts, setEventAlerts] = useState(true);
  const [biometricShield, setBiometricShield] = useState(false);

  // Change email modal
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  // Password Modal
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Two-Factor Authentication (TOTP) Enrollment
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaChecking, setMfaChecking] = useState(true);
  const [mfaEnrolling, setMfaEnrolling] = useState(false);
  const [mfaConfirming, setMfaConfirming] = useState(false);
  const [mfaDisabling, setMfaDisabling] = useState(false);
  const [mfaPendingFactorId, setMfaPendingFactorId] = useState<string | null>(null);
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [mfaConfirmCode, setMfaConfirmCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);

  // Privacy & Data (export / delete account)
  const [exportingData, setExportingData] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Contact Support / Report a Problem
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [supportCategory, setSupportCategory] = useState<SupportTicketCategory>('general');
  const [supportTitle, setSupportTitle] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [submittingSupport, setSubmittingSupport] = useState(false);

  const queryClient = useQueryClient();

  // Edit profile modal state in Settings
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editBio, setEditBio] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [editProfileError, setEditProfileError] = useState<string | null>(null);

  // Missing Settings states
  const [emailDigestAlerts, setEmailDigestAlerts] = useState(true);
  const [directoryDiscovery, setDirectoryDiscovery] = useState(true);
  const [isSigningOutOthers, setIsSigningOutOthers] = useState(false);

  // Hydrate preferences on mount
  useEffect(() => {
    (async () => {
      try {
        const notifs = await getStoredPref('lioris_setting_notifications');
        if (notifs) {
          const parsed = JSON.parse(notifs);
          if (typeof parsed.push === 'boolean') setPushEnabled(parsed.push);
          if (typeof parsed.announcements === 'boolean') setAnnouncementAlerts(parsed.announcements);
          if (typeof parsed.events === 'boolean') setEventAlerts(parsed.events);
          if (typeof parsed.emailDigest === 'boolean') setEmailDigestAlerts(parsed.emailDigest);
        }
        const bio = await getStoredPref('lioris_setting_biometrics');
        if (bio !== null) {
          setBiometricShield(JSON.parse(bio) === true);
        } else {
          setBiometricShield(false);
        }
        const privacy = await getStoredPref('lioris_setting_privacy');
        if (privacy) {
          const parsed = JSON.parse(privacy);
          if (typeof parsed.directoryDiscovery === 'boolean') setDirectoryDiscovery(parsed.directoryDiscovery);
        }
      } catch {}
    })();
  }, []);

  // Load current Two-Factor Authentication enrollment status
  const refreshMfaStatus = React.useCallback(async () => {
    setMfaChecking(true);
    try {
      const factors = await authApi.listMfaFactors();
      const activeFactor = factors?.totp?.find((f) => f.status === 'verified') || factors?.totp?.[0] || null;
      setMfaFactorId(activeFactor?.id ?? null);
    } catch {
      setMfaFactorId(null);
    } finally {
      setMfaChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshMfaStatus();
  }, [user?.id, refreshMfaStatus]);

  function resetMfaEnrollmentFlow() {
    setMfaPendingFactorId(null);
    setMfaSecret(null);
    setMfaConfirmCode('');
    setMfaError(null);
  }

  async function handleStartMfaEnrollment() {
    haptics.light();
    setMfaError(null);
    setMfaEnrolling(true);
    try {
      const result = await authApi.enrollMfaFactor();
      setMfaPendingFactorId(result.factorId);
      setMfaSecret(result.secret);
    } catch (err: any) {
      haptics.error();
      toast.error(err?.message || 'Could not start two-factor authentication setup.');
    } finally {
      setMfaEnrolling(false);
    }
  }

  async function handleConfirmMfaEnrollment() {
    if (!mfaPendingFactorId) return;
    if (mfaConfirmCode.trim().length !== 6) {
      setMfaError('Please enter the complete 6-digit code from your authenticator app.');
      return;
    }
    setMfaError(null);
    setMfaConfirming(true);
    haptics.medium();
    try {
      await authApi.confirmMfaEnrollment(mfaPendingFactorId, mfaConfirmCode.trim());
      haptics.success();
      toast.success('Two-Factor Authentication is now active on your account.');
      resetMfaEnrollmentFlow();
      await refreshMfaStatus();
    } catch (err: any) {
      haptics.error();
      setMfaError(err?.message || 'Invalid code. Please try again.');
    } finally {
      setMfaConfirming(false);
    }
  }

  function handleCancelMfaEnrollment() {
    haptics.light();
    resetMfaEnrollmentFlow();
  }

  function handleTurnOffMfa() {
    if (!mfaFactorId) return;
    Alert.alert(
      'Turn Off Two-Factor Authentication?',
      'This reduces the security of your account. You will only need your password to sign in afterward.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn Off',
          style: 'destructive',
          onPress: async () => {
            setMfaDisabling(true);
            try {
              await authApi.unenrollMfaFactor(mfaFactorId);
              haptics.success();
              toast.info('Two-Factor Authentication has been turned off.');
              await refreshMfaStatus();
            } catch (err: any) {
              haptics.error();
              toast.error(err?.message || 'Could not turn off two-factor authentication.');
            } finally {
              setMfaDisabling(false);
            }
          },
        },
      ],
    );
  }

  async function handleExportData() {
    if (exportingData) return;
    haptics.light();
    setExportingData(true);
    try {
      const data = await exportMyData();
      const json = JSON.stringify(data, null, 2);
      const filename = `lioris-data-export-${new Date().toISOString().slice(0, 10)}.json`;

      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        const { File, Paths } = await import('expo-file-system');
        const Sharing = await import('expo-sharing');
        const file = new File(Paths.cache, filename);
        file.create({ overwrite: true });
        file.write(json);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/json',
            dialogTitle: 'Export my Lioris data',
            UTI: 'public.json',
          });
        } else {
          const { Share } = await import('react-native');
          await Share.share({ title: 'My Lioris data', message: json });
        }
      }
      haptics.success();
      toast.success('Your data export is ready.');
    } catch (err: any) {
      haptics.error();
      toast.error(err?.message || 'Could not export your data. Please try again.');
    } finally {
      setExportingData(false);
    }
  }

  function openDeleteModal() {
    haptics.light();
    setDeleteConfirmText('');
    setDeleteError(null);
    setDeleteModalOpen(true);
  }

  async function handleDeleteAccount() {
    if (deletingAccount || deleteConfirmText.trim() !== 'DELETE') return;
    setDeletingAccount(true);
    setDeleteError(null);
    haptics.medium();
    try {
      await deleteMyAccount();
      setDeleteModalOpen(false);
      try {
        await logout();
      } catch {}
      toast.success('Your account has been deleted.');
      router.replace('/(auth)/login');
    } catch (err: any) {
      haptics.error();
      const message = err?.message || 'Could not delete your account. Please try again.';
      setDeleteError(message);
      toast.error(message);
    } finally {
      setDeletingAccount(false);
    }
  }

  function saveNotifPreference(updated: { push: boolean; announcements: boolean; events: boolean; emailDigest?: boolean }) {
    setStoredPref('lioris_setting_notifications', JSON.stringify(updated));
  }

  function handleTogglePush(next: boolean) {
    haptics.light();
    setPushEnabled(next);
    saveNotifPreference({ push: next, announcements: announcementAlerts, events: eventAlerts, emailDigest: emailDigestAlerts });
    toast.info(next ? 'Push notifications enabled' : 'Push notifications muted');
  }

  function handleToggleAnnouncements(next: boolean) {
    haptics.light();
    setAnnouncementAlerts(next);
    saveNotifPreference({ push: pushEnabled, announcements: next, events: eventAlerts, emailDigest: emailDigestAlerts });
    toast.info(next ? 'Campus announcements enabled' : 'Campus announcements muted');
  }

  function handleToggleEvents(next: boolean) {
    haptics.light();
    setEventAlerts(next);
    saveNotifPreference({ push: pushEnabled, announcements: announcementAlerts, events: next, emailDigest: emailDigestAlerts });
    toast.info(next ? 'Event reminder alerts enabled' : 'Event reminders muted');
  }

  function handleToggleEmailDigest(next: boolean) {
    haptics.light();
    setEmailDigestAlerts(next);
    saveNotifPreference({ push: pushEnabled, announcements: announcementAlerts, events: eventAlerts, emailDigest: next });
    toast.info(next ? 'Weekly email digest enabled' : 'Weekly email digest muted');
  }

  async function handleToggleBiometrics(next: boolean) {
    haptics.light();
    if (!next) {
      setBiometricShield(false);
      await setStoredPref('lioris_setting_biometrics', 'false');
      toast.info('Biometric security lock disabled');
      return;
    }

    const bioStatus = await isBiometricsAvailable();
    if (bioStatus.available) {
      toast.info('Please verify your biometrics to activate the shield...');
      const authResult = await authenticateWithBiometrics(
        user ? { id: user.id, email: user.email, fullName: user.fullName || '' } : null
      );
      if (authResult.success) {
        setBiometricShield(true);
        await setStoredPref('lioris_setting_biometrics', 'true');
        toast.success('Biometric & Passkey Shield activated');
        haptics.success();
      } else {
        toast.error(authResult.error || 'Biometric verification failed or was cancelled');
        haptics.error();
      }
    } else {
      setBiometricShield(true);
      await setStoredPref('lioris_setting_biometrics', 'true');
      toast.info('Password Shield activated (device biometrics not supported on this browser)');
      haptics.success();
    }
  }

  function handleToggleDirectoryDiscovery(next: boolean) {
    haptics.light();
    setDirectoryDiscovery(next);
    setStoredPref('lioris_setting_privacy', JSON.stringify({ directoryDiscovery: next }));
    toast.info(next ? 'Profile discovery in campus directory enabled' : 'Profile hidden from public campus directory');
  }

  async function handleSignOutOtherDevices() {
    haptics.medium();
    Alert.alert(
      'Sign Out Other Devices?',
      'This will immediately end all other active web and mobile sessions associated with your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out Others',
          style: 'destructive',
          onPress: async () => {
            setIsSigningOutOthers(true);
            try {
              await supabase.auth.signOut({ scope: 'others' });
              toast.success('Successfully signed out of all other sessions.');
            } catch (err: any) {
              toast.error(err?.message || 'Could not sign out other sessions.');
            } finally {
              setIsSigningOutOthers(false);
            }
          },
        },
      ],
    );
  }

  function handleOpenEditSettingsProfile() {
    if (!profile) return;
    setEditFullName(profile.fullName || user?.fullName || '');
    setEditUsername(profile.username || user?.fullName?.toLowerCase().replace(/[^a-z0-9]+/g, '.') || '');
    setEditDepartment(profile.department || '');
    setEditBio(profile.bio || '');
    setEditProfileError(null);
    setEditProfileModalOpen(true);
  }

  async function handleSaveSettingsProfile() {
    const cleanUsername = editUsername.trim().toLowerCase().replace(/[^a-z0-9._]/g, '');
    if (!editFullName.trim()) {
      setEditProfileError('Full Name cannot be blank.');
      return;
    }
    if (cleanUsername.length < 3) {
      setEditProfileError('Username must be at least 3 characters (letters, numbers, dots, underscores).');
      return;
    }
    setSavingProfile(true);
    setEditProfileError(null);
    try {
      await updateMyProfile(user!.id, {
        fullName: editFullName.trim(),
        username: cleanUsername,
        department: editDepartment.trim(),
        bio: editBio.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setEditProfileModalOpen(false);
      toast.success('Profile details updated successfully.');
    } catch (err: any) {
      setEditProfileError(err?.message || 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSubmitSupportRequest() {
    if (!supportMessage.trim()) {
      toast.error('Please describe your issue before submitting.');
      return;
    }
    setSubmittingSupport(true);
    try {
      await createSupportTicket({
        category: supportCategory,
        title: supportTitle.trim() || 'General Issue Request',
        description: supportMessage.trim(),
        priority: 'medium',
      });
      setSupportMessage('');
      setSupportTitle('');
      setSupportCategory('general');
      setSupportModalOpen(false);
      toast.success('Your support ticket has been submitted to the university admin desk.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not send your message. Please try again.');
    } finally {
      setSubmittingSupport(false);
    }
  }

  async function handleUpdatePassword() {
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setIsUpdatingPassword(true);
    setPasswordError(null);
    try {
      // Goes through the shared helper: it enforces the same password policy as sign-up and
      // throws on failure. The raw supabase.auth.updateUser call returns `{ error }` instead of
      // throwing, so this screen used to report success even when the update was rejected.
      await authApi.updateUserPassword(newPassword);
      setPasswordModalOpen(false);
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated successfully.');
    } catch (err: any) {
      setPasswordError(err?.message || 'Could not update password.');
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  // Derived role & institution presentation
  const institutionDisplay =
    profile?.institutionName && profile.institutionCode !== 'GLOBAL'
      ? profile.institutionName
      : LAUNCH_INSTITUTIONS.find((i) => i.code === homeInstitutionCode && i.code !== 'GLOBAL')?.name ||
        'Campus';

  const departmentDisplay = profile?.department || 'Department not specified';

  const academicStandingDisplay =
    user?.role === 'student'
      ? `Level ${profile?.level || 400} Undergraduate`
      : user?.role === 'staff'
      ? 'Senior Faculty Lecturer'
      : user?.role === 'alumni'
      ? 'Alumni Fellow'
      : 'Root Administrator';

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: isDesktop ? spacing.sm : spacing.xs,
          paddingBottom: isDesktop ? 80 : 130,
          gap: spacing.md,
        }}
      >
        {/* Responsive Header Title */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: isDesktop ? spacing.xs : spacing.sm,
            marginBottom: spacing.xs,
            gap: spacing.sm,
          }}
        >
          <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.xs }}>
            <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold">
              Settings & Preferences
            </AppText>
            <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
              Credentials, interface themes, notifications & security
            </AppText>
          </View>
          <View style={{ flexShrink: 0 }}>
            <Badge
              label={user?.role?.toUpperCase() ?? 'STUDENT'}
              tone="neutral"
            />
          </View>
        </View>

        {/* 2-Column Responsive Layout on Desktop, Vertical Stack on Mobile */}
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: spacing.md, alignItems: 'flex-start' }}>
          {/* Sub Navigation Tabs */}
          {isDesktop ? (
            <View style={{ width: 240, flexShrink: 0 }}>
              <SolidCard radius={20} style={{ padding: spacing.xs }}>
                {SETTINGS_SECTIONS.map((sec) => {
                  const active = activeSection === sec.key;
                  return (
                    <Pressable
                      key={sec.key}
                      onPress={() => {
                        haptics.light();
                        setActiveSection(sec.key);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.sm,
                        paddingHorizontal: spacing.md,
                        paddingVertical: 11,
                        borderRadius: radius.md,
                        backgroundColor: active ? colors.pastelPrimaryBg : 'transparent',
                      }}
                    >
                      <Ionicons
                        name={sec.icon}
                        size={18}
                        color={active ? colors.brandPrimary : colors.textSecondary}
                      />
                      <AppText
                        variant="bodySmall"
                        weight={active ? 'bold' : 'medium'}
                        tone={active ? 'brand' : 'primary'}
                      >
                        {sec.fullLabel}
                      </AppText>
                    </Pressable>
                  );
                })}
              </SolidCard>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ width: '100%', flexGrow: 0, marginBottom: spacing.xs }}
              contentContainerStyle={{ gap: 8, paddingRight: 16 }}
              {...({ 'data-horizontal-scroll': 'true' } as any)}
            >
              {SETTINGS_SECTIONS.map((sec) => {
                const active = activeSection === sec.key;
                return (
                  <Pressable
                    key={sec.key}
                    onPress={() => {
                      haptics.light();
                      setActiveSection(sec.key);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 13,
                      paddingVertical: 8,
                      borderRadius: radius.pill,
                      backgroundColor: active ? colors.brandPrimary : colors.surface,
                      borderWidth: 1,
                      borderColor: active ? colors.brandPrimary : colors.border,
                    }}
                  >
                    <Ionicons
                      name={sec.icon}
                      size={15}
                      color={active ? '#FFFFFF' : colors.textSecondary}
                    />
                    <AppText
                      variant="caption"
                      weight={active ? 'bold' : 'medium'}
                      tone={active ? 'inverse' : 'secondary'}
                    >
                      {sec.fullLabel}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Main Active Settings Content */}
          <View style={{ flex: 1, width: '100%', minWidth: 0, gap: spacing.md }}>
            {/* 1. Account & Profile */}
            {activeSection === 'account' && (
              <SolidCard radius={20} style={{ padding: isDesktop ? spacing.lg : spacing.md, gap: spacing.md }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    paddingBottom: spacing.md,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Avatar name={profile?.fullName ?? user?.fullName ?? 'User'} size={isDesktop ? 60 : 48} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant={isDesktop ? 'h2' : 'h3'} weight="bold">
                      {profile?.fullName ?? user?.fullName ?? 'User'}
                    </AppText>
                    <AppText tone="brand" variant="bodySmall" weight="bold" style={{ marginTop: 1 }}>
                      @{profile?.username || user?.fullName?.toLowerCase().replace(/[^a-z0-9]+/g, '.') || 'user'}
                    </AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 1 }}>
                      {profile?.email ?? user?.email ?? ''}
                    </AppText>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      <Badge label="Verified Academic" tone="success" />
                    </View>
                  </View>
                </View>

                {/* Academic Metadata Key-Values */}
                <View style={{ gap: spacing.xs }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, gap: spacing.sm }}>
                    <AppText tone="secondary" variant="bodySmall" style={{ flexShrink: 0 }}>
                      Institution
                    </AppText>
                    <AppText weight="bold" variant="bodySmall" style={{ flex: 1, textAlign: 'right' }}>
                      {institutionDisplay}
                    </AppText>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, gap: spacing.sm }}>
                    <AppText tone="secondary" variant="bodySmall" style={{ flexShrink: 0 }}>
                      Department
                    </AppText>
                    <AppText weight="bold" variant="bodySmall" style={{ flex: 1, textAlign: 'right' }}>
                      {departmentDisplay}
                    </AppText>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, gap: spacing.sm }}>
                    <AppText tone="secondary" variant="bodySmall" style={{ flexShrink: 0 }}>
                      Academic Standing
                    </AppText>
                    <AppText weight="bold" variant="bodySmall" style={{ flex: 1, textAlign: 'right' }}>
                      {academicStandingDisplay}
                    </AppText>
                  </View>
                </View>

                <View style={{ paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm }}>
                  <AppButton
                    label="Edit Profile Details"
                    variant="primary"
                    onPress={handleOpenEditSettingsProfile}
                  />
                  <AppButton
                    label="Explore App Tour & Features"
                    variant="secondary"
                    onPress={() => {
                      haptics.light();
                      setTutorialOpen(true);
                    }}
                  />
                  <AppButton
                    label="Contact Support / Report a Problem"
                    variant="secondary"
                    onPress={() => {
                      haptics.light();
                      setSupportModalOpen(true);
                    }}
                  />
                  <AppButton
                    label="Log Out of Workspace"
                    variant="secondary"
                    onPress={async () => {
                      await logout();
                      router.replace('/(auth)/login');
                    }}
                  />
                </View>
              </SolidCard>
            )}

            {/* Workspace Scope - moved here from the small pill that used to sit in
                the app header on every screen, since it's a persistent account
                preference rather than a per-screen control. */}
            {activeSection === 'workspace' && (
              <SolidCard radius={20} style={{ padding: isDesktop ? spacing.lg : spacing.md, gap: spacing.md }}>
                <View>
                  <AppText variant="h3" weight="bold">
                    Workspace Scope
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    Controls which university's Forum threads, marketplace listings, events, and resources you see
                  </AppText>
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: spacing.sm,
                    backgroundColor: colors.divider,
                    borderRadius: radius.md,
                    padding: spacing.md,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 }}>
                    <Ionicons name={scope === 'campus' ? 'school' : 'globe'} size={20} color={colors.textSecondary} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText weight="bold" variant="bodySmall">
                        {scope === 'campus'
                          ? (activeCampusCode && activeCampusCode !== homeInstitutionCode
                              ? `Exploring ${getInstitutionByCode(activeCampusCode)?.name ?? activeCampusCode}`
                              : institutionDisplay)
                          : 'All Lioris Global Feed'}
                      </AppText>
                      <AppText tone="secondary" variant="caption">
                        {scope === 'campus' ? 'My Campus Workspace' : 'Cross-university content'}
                      </AppText>
                    </View>
                  </View>
                  <Badge label={scope === 'campus' ? 'CAMPUS' : 'GLOBAL'} tone="neutral" />
                </View>

                <AppButton
                  label="Change Workspace Scope"
                  variant="secondary"
                  icon="swap-horizontal-outline"
                  onPress={() => {
                    haptics.light();
                    setWorkspaceScopeModalOpen(true);
                  }}
                />
              </SolidCard>
            )}

            {/* 2. Appearance & Theme */}
            {activeSection === 'appearance' && (
              <SolidCard radius={20} style={{ padding: isDesktop ? spacing.lg : spacing.md, gap: spacing.lg }}>
                {/* Section Header */}
                <View>
                  <AppText variant="h3" weight="bold">
                    Appearance & Campus Theme
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    Manage interface appearance mode, brand colors, and institution palettes
                  </AppText>
                </View>

                {/* Theme Mode Selector */}
                <View style={{ gap: spacing.xs }}>
                  <AppText variant="bodySmall" weight="bold">
                    Display Mode
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    {[
                      { id: 'light', label: 'Light', fullLabel: 'Light Mode', icon: 'sunny-outline' as const },
                      { id: 'dark', label: 'Dark', fullLabel: 'Dark Mode', icon: 'moon-outline' as const },
                      { id: 'system', label: 'Auto', fullLabel: 'Auto System', icon: 'phone-portrait-outline' as const },
                    ].map((t) => {
                      const active = themeMode === t.id;
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => {
                            haptics.light();
                            setThemeMode(t.id as any);
                            toast.success(`Theme set to ${t.fullLabel}`);
                          }}
                          style={{
                            flex: 1,
                            paddingVertical: 12,
                            paddingHorizontal: 8,
                            borderRadius: radius.md,
                            borderWidth: 2,
                            borderColor: active ? colors.brandPrimary : colors.border,
                            backgroundColor: active ? colors.pastelPrimaryBg : colors.surface,
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <Ionicons name={t.icon} size={20} color={active ? colors.brandPrimary : colors.textSecondary} />
                          <AppText variant="caption" weight="bold" tone={active ? 'brand' : 'primary'}>
                            {isDesktop ? t.fullLabel : t.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Primary & Secondary Color Utilization Showcase */}
                <View
                  style={{
                    padding: spacing.md,
                    borderRadius: radius.lg,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    borderWidth: 1,
                    borderColor: colors.border,
                    gap: spacing.sm,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ gap: 2 }}>
                      <AppText variant="bodySmall" weight="bold">
                        Active Color Hierarchy
                      </AppText>
                      <AppText variant="caption" tone="secondary">
                        Coordinated primary brand and secondary accent pairing
                      </AppText>
                    </View>
                    <Badge label={isDefaultTheme ? 'LOGO DEFAULT' : 'CUSTOM ACCENT'} tone={isDefaultTheme ? 'brand' : 'accent'} />
                  </View>

                  {/* Primary & Secondary Swatches */}
                  <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: spacing.sm }}>
                    {/* Primary Color Card */}
                    <View
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        padding: 12,
                        borderRadius: radius.md,
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: colors.brandPrimary,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 2,
                          borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                        }}
                      >
                        <Ionicons name="color-palette" size={18} color="#FFFFFF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <AppText variant="bodySmall" weight="bold">
                            Primary Color
                          </AppText>
                          <AppText variant="caption" tone="brand" weight="bold" style={{ fontSize: 11 }}>
                            {colors.brandPrimary}
                          </AppText>
                        </View>
                        <AppText variant="caption" tone="secondary">
                          Buttons, active tabs, brand headers
                        </AppText>
                      </View>
                    </View>

                    {/* Secondary Accent Card */}
                    <View
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        padding: 12,
                        borderRadius: radius.md,
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: colors.brandAccent,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 2,
                          borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                        }}
                      >
                        <Ionicons name="sparkles" size={18} color={isDark ? '#0A1326' : '#FFFFFF'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <AppText variant="bodySmall" weight="bold">
                            Secondary Accent
                          </AppText>
                          <AppText variant="caption" tone="accent" weight="bold" style={{ fontSize: 11 }}>
                            {colors.brandAccent}
                          </AppText>
                        </View>
                        <AppText variant="caption" tone="secondary">
                          Action tags, badges, notifications, highlights
                        </AppText>
                      </View>
                    </View>
                  </View>

                  {/* Component Preview Bar */}
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 8,
                      paddingTop: 4,
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: colors.brandPrimary,
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderRadius: radius.pill,
                      }}
                    >
                      <AppText variant="caption" weight="bold" tone="inverse">
                        Primary CTA
                      </AppText>
                    </View>
                    <View
                      style={{
                        backgroundColor: colors.brandAccent,
                        paddingHorizontal: 12,
                        paddingVertical: 5,
                        borderRadius: radius.pill,
                      }}
                    >
                      <AppText variant="caption" weight="bold" style={{ color: isDark ? '#0A1326' : '#FFFFFF' }}>
                        Secondary Highlight
                      </AppText>
                    </View>
                    <View
                      style={{
                        backgroundColor: colors.pastelPrimaryBg,
                        borderWidth: 1,
                        borderColor: colors.brandPrimary,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: radius.pill,
                      }}
                    >
                      <AppText variant="caption" weight="bold" tone="brand">
                        Verified Badge
                      </AppText>
                    </View>
                  </View>
                </View>

                {/* Return to Default Theme Option Card */}
                <View
                  style={{
                    padding: spacing.md,
                    borderRadius: radius.lg,
                    borderWidth: 1.5,
                    borderColor: isDefaultTheme ? colors.brandPrimary : colors.border,
                    backgroundColor: isDefaultTheme ? colors.pastelPrimaryBg : colors.surface,
                    flexDirection: isDesktop ? 'row' : 'column',
                    alignItems: isDesktop ? 'center' : 'stretch',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    {/* Dual-color badge preview */}
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        overflow: 'hidden',
                        flexDirection: 'row',
                        borderWidth: 1.5,
                        borderColor: isDark ? '#FFFFFF' : '#0F172A',
                      }}
                    >
                      <View style={{ flex: 1, backgroundColor: '#1A3DFF' }} />
                      <View style={{ flex: 1, backgroundColor: '#F08A2E' }} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <AppText variant="bodySmall" weight="bold">
                          Lioris Logo Theme (Default)
                        </AppText>
                        {isDefaultTheme && (
                          <Badge label="ACTIVE" tone="brand" />
                        )}
                      </View>
                      <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                        Primary Blue (#1A3DFF) & Warm Gold (#F08A2E) sampled from the Lioris emblem
                      </AppText>
                    </View>
                  </View>

                  <Pressable
                    onPress={async () => {
                      haptics.medium();
                      await resetToDefaultTheme();
                      toast.success('Restored default Lioris Blue & Gold theme');
                    }}
                    disabled={isDefaultTheme}
                    style={({ pressed }) => ({
                      paddingHorizontal: 16,
                      paddingVertical: 9,
                      borderRadius: radius.pill,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: isDefaultTheme
                        ? isDark
                          ? 'rgba(255,255,255,0.1)'
                          : 'rgba(0,0,0,0.06)'
                        : colors.brandPrimary,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Ionicons
                      name={isDefaultTheme ? 'checkmark-circle' : 'arrow-undo'}
                      size={16}
                      color={isDefaultTheme ? (isDark ? '#FFFFFF' : colors.brandPrimary) : '#FFFFFF'}
                    />
                    <AppText
                      variant="caption"
                      weight="bold"
                      style={{
                        color: isDefaultTheme
                          ? isDark
                            ? '#FFFFFF'
                            : colors.brandPrimary
                          : '#FFFFFF',
                      }}
                    >
                      {isDefaultTheme ? 'Default Active' : 'Return to Default'}
                    </AppText>
                  </Pressable>
                </View>

                {/* Campus Palette Presets */}
                <View style={{ gap: spacing.sm }}>
                  <View>
                    <AppText variant="h3" weight="bold">
                      Campus & Custom Palettes
                    </AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                      Select an institution to adopt its distinct primary and secondary accents
                    </AppText>
                  </View>

                  <View style={{ gap: 8 }}>
                    {accentPresets.map((preset) => {
                      const isSelected = (!customAccent && preset.isDefault) || customAccent === preset.id;
                      const displayPrimary = isDark ? preset.primaryDark : preset.primaryLight;
                      const displayAccent = isDark ? preset.accentDark : preset.accentLight;

                      return (
                        <Pressable
                          key={preset.id}
                          onPress={async () => {
                            haptics.light();
                            await setCustomAccent(preset.id);
                            toast.success(`Applied ${preset.label} palette`);
                          }}
                          style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: 12,
                            borderRadius: radius.md,
                            borderWidth: isSelected ? 2 : 1,
                            borderColor: isSelected ? colors.brandPrimary : colors.border,
                            backgroundColor: isSelected
                              ? colors.pastelPrimaryBg
                              : pressed
                              ? isDark
                                ? 'rgba(255,255,255,0.04)'
                                : 'rgba(0,0,0,0.02)'
                              : colors.surface,
                            gap: 12,
                          })}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                            {/* Dual-color swatch circle */}
                            <View
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 18,
                                overflow: 'hidden',
                                flexDirection: 'row',
                                borderWidth: 1.5,
                                borderColor: isSelected ? (isDark ? '#FFFFFF' : '#000000') : colors.border,
                              }}
                            >
                              <View style={{ flex: 1, backgroundColor: displayPrimary }} />
                              <View style={{ flex: 1, backgroundColor: displayAccent }} />
                            </View>

                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <AppText variant="bodySmall" weight={isSelected ? 'bold' : 'medium'}>
                                  {preset.label}
                                </AppText>
                                {preset.isDefault && (
                                  <Badge label="DEFAULT" tone="brand" />
                                )}
                              </View>
                              <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                                {preset.campusName || 'Institutional Palette'}
                              </AppText>
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {/* Visual mini swatches */}
                            <View style={{ flexDirection: 'row', gap: 4 }}>
                              <View
                                style={{
                                  width: 14,
                                  height: 14,
                                  borderRadius: 7,
                                  backgroundColor: displayPrimary,
                                }}
                              />
                              <View
                                style={{
                                  width: 14,
                                  height: 14,
                                  borderRadius: 7,
                                  backgroundColor: displayAccent,
                                }}
                              />
                            </View>

                            {isSelected && (
                              <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} />
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </SolidCard>
            )}

            {/* 3. Notifications */}
            {activeSection === 'notifications' && (
              <SolidCard radius={20} style={{ padding: isDesktop ? spacing.lg : spacing.md, gap: spacing.md }}>
                <View>
                  <AppText variant="h3" weight="bold">
                    Notification Preferences
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    Manage in-app, flash push, and email alert channels
                  </AppText>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.xs }}>
                    <AppText weight="bold" variant="bodySmall">Push Notifications</AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>Instant alerts for course updates and official broadcasts</AppText>
                  </View>
                  <Switch
                    value={pushEnabled}
                    onValueChange={handleTogglePush}
                    trackColor={{ false: colors.divider, true: colors.brandPrimary }}
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.xs }}>
                    <AppText weight="bold" variant="bodySmall">Campus Announcements</AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>Dean bulletins, lecture hall shifts & academic calendar</AppText>
                  </View>
                  <Switch
                    value={announcementAlerts}
                    onValueChange={handleToggleAnnouncements}
                    trackColor={{ false: colors.divider, true: colors.brandPrimary }}
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.xs }}>
                    <AppText weight="bold" variant="bodySmall">Events & Workshops</AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>Reminders 1 hour before RSVP'd events commence</AppText>
                  </View>
                  <Switch
                    value={eventAlerts}
                    onValueChange={handleToggleEvents}
                    trackColor={{ false: colors.divider, true: colors.brandPrimary }}
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.xs }}>
                    <AppText weight="bold" variant="bodySmall">Weekly Academic Digest</AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>Summary of departmental discussions, scholarships & trending campus topics</AppText>
                  </View>
                  <Switch
                    value={emailDigestAlerts}
                    onValueChange={handleToggleEmailDigest}
                    trackColor={{ false: colors.divider, true: colors.brandPrimary }}
                  />
                </View>
              </SolidCard>
            )}

            {/* 4. Security & Credentials */}
            {activeSection === 'security' && (
              <SolidCard radius={20} style={{ padding: isDesktop ? spacing.lg : spacing.md, gap: spacing.md }}>
                <View>
                  <AppText variant="h3" weight="bold">
                    Security & Credentials
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    Manage biometric passkeys and account authentication
                  </AppText>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.xs }}>
                    <AppText weight="bold" variant="bodySmall">Biometric & Passkey Shield</AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>Require FaceID/TouchID or device PIN upon launch</AppText>
                  </View>
                  <Switch
                    value={biometricShield}
                    onValueChange={handleToggleBiometrics}
                    trackColor={{ false: colors.divider, true: colors.brandPrimary }}
                  />
                </View>

                {/* Two-Factor Authentication (TOTP) */}
                <View style={{ paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.xs }}>
                      <AppText weight="bold" variant="bodySmall">Two-Step Authentication</AppText>
                      <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                        Require a 6-digit confirmation code from an authenticator app when signing in
                      </AppText>
                    </View>
                    <Switch
                      value={Boolean(mfaFactorId && !mfaPendingFactorId)}
                      onValueChange={(val) => {
                        if (val) {
                          handleStartMfaEnrollment();
                        } else {
                          handleTurnOffMfa();
                        }
                      }}
                      disabled={mfaChecking || mfaEnrolling || mfaDisabling}
                      trackColor={{ false: colors.divider, true: colors.brandPrimary }}
                    />
                  </View>

                  {mfaChecking ? (
                    <AppText tone="secondary" variant="caption">Checking security status…</AppText>
                  ) : mfaFactorId && !mfaPendingFactorId ? (
                    <View style={{ gap: spacing.sm }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          backgroundColor: colors.divider,
                          borderRadius: radius.md,
                          padding: spacing.sm,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Ionicons name="shield-checkmark" size={18} color={colors.success} />
                        <AppText weight="bold" variant="bodySmall" style={{ color: colors.success }}>
                          Two-Step Authentication is active
                        </AppText>
                      </View>
                      <AppButton
                        label={mfaDisabling ? 'Turning off…' : 'Turn Off Two-Step Authentication'}
                        variant="secondary"
                        onPress={handleTurnOffMfa}
                        loading={mfaDisabling}
                      />
                    </View>
                  ) : mfaPendingFactorId && mfaSecret ? (
                    <View style={{ gap: spacing.sm }}>
                      <AppText tone="secondary" variant="caption">
                        Enter this code into Google Authenticator, Authy, or a similar app:
                      </AppText>
                      <View
                        style={{
                          backgroundColor: colors.surface,
                          borderRadius: radius.sm,
                          borderWidth: 1,
                          borderColor: colors.border,
                          padding: spacing.sm,
                        }}
                      >
                        <TextInput accessibilityLabel="Authenticator secret key"
                          value={mfaSecret}
                          editable={false}
                          selectTextOnFocus
                          style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14, color: colors.textPrimary }}
                        />
                      </View>
                      <AppText tone="secondary" variant="caption">
                        Then enter the 6-digit code it generates to confirm setup:
                      </AppText>
                      <AppTextField
                        label="6-Digit Code"
                        value={mfaConfirmCode}
                        onChangeText={(t) => setMfaConfirmCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                        keyboardType="number-pad"
                        maxLength={6}
                        placeholder="000000"
                      />
                      {mfaError && (
                        <AppText style={{ color: '#EF4444', fontSize: 12, lineHeight: 16 }}>
                          {mfaError}
                        </AppText>
                      )}
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <View style={{ flex: 1 }}>
                          <AppButton label="Cancel" variant="secondary" onPress={handleCancelMfaEnrollment} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppButton
                            label={mfaConfirming ? 'Confirming…' : 'Confirm & Enable'}
                            onPress={handleConfirmMfaEnrollment}
                            loading={mfaConfirming}
                            disabled={mfaConfirmCode.length < 6}
                          />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <AppButton
                      label={mfaEnrolling ? 'Starting setup…' : 'Set Up Two-Step Authentication'}
                      variant="secondary"
                      onPress={handleStartMfaEnrollment}
                      loading={mfaEnrolling}
                    />
                  )}
                </View>

                {/* Sign-in email. School addresses get deactivated, so it must stay changeable. */}
                <View style={{ paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm }}>
                  <View>
                    <AppText weight="bold" variant="bodySmall">Sign-in email</AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                      {user?.email || 'No email on file'}
                    </AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                      School emails can stop working after graduation. Switch to one you will always have.
                    </AppText>
                  </View>
                  <AppButton
                    label="Change Email"
                    variant="secondary"
                    icon="mail-outline"
                    onPress={() => setEmailModalOpen(true)}
                  />
                </View>

                <View style={{ paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm }}>
                  <AppButton
                    label="Change Password"
                    variant="secondary"
                    icon="key-outline"
                    onPress={() => {
                      setPasswordError(null);
                      setPasswordModalOpen(true);
                    }}
                  />
                  <AppButton
                    label={isSigningOutOthers ? 'Signing out other sessions…' : 'Sign Out All Other Active Sessions'}
                    variant="ghost"
                    icon="log-out-outline"
                    onPress={handleSignOutOtherDevices}
                    loading={isSigningOutOthers}
                  />
                </View>
              </SolidCard>
            )}

            {/* 5. Role Switcher Preview (Root Admins only) */}
            {isSuperAdmin && activeSection === 'preview' && (
              <SolidCard radius={20} style={{ padding: isDesktop ? spacing.lg : spacing.md, gap: spacing.md }}>
                <View>
                  <AppText variant="h3" weight="bold">
                    Workspace Role Switcher
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    Switch portal perspectives to preview student, faculty, alumni, or root administrator views
                  </AppText>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {[
                    { role: 'student', label: 'Student Portal' },
                    { role: 'staff', label: 'Faculty Staff' },
                    { role: 'alumni', label: 'Alumni Fellow' },
                    { role: 'admin', label: 'Root Admin' },
                  ].map((r) => {
                    const active = user?.role === r.role;
                    return (
                      <Pressable
                        key={r.role}
                        onPress={async () => {
                          haptics.success();
                          await switchRole(r.role as any);
                          toast.success(`Switched perspective to ${r.label}`);
                          router.replace(r.role === 'admin' ? '/(admin)/platform-config' : `/(${r.role})/dashboard` as any);
                        }}
                        style={{
                          width: isDesktop ? 220 : '48%',
                          flexGrow: 1,
                          padding: spacing.md,
                          borderRadius: radius.md,
                          backgroundColor: active ? colors.brandPrimary : colors.surface,
                          borderWidth: 1,
                          borderColor: active ? colors.brandPrimary : colors.border,
                          alignItems: 'center',
                        }}
                      >
                        <AppText variant="bodySmall" weight="bold" tone={active ? 'inverse' : 'primary'}>
                          {r.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </SolidCard>
            )}

            {/* 6. Privacy & Data */}
            {activeSection === 'privacy' && (
              <SolidCard radius={20} style={{ padding: isDesktop ? spacing.lg : spacing.md, gap: spacing.md }}>
                <View>
                  <AppText variant="h3" weight="bold">
                    Privacy & Data
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    Your data protection rights: access, portability and erasure
                  </AppText>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.xs }}>
                    <AppText weight="bold" variant="bodySmall">Campus Directory Discovery</AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>Allow verified classmates to discover your academic profile in search and study pods</AppText>
                  </View>
                  <Switch
                    value={directoryDiscovery}
                    onValueChange={handleToggleDirectoryDiscovery}
                    trackColor={{ false: colors.divider, true: colors.brandPrimary }}
                  />
                </View>

                <View style={{ gap: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <View>
                    <AppText weight="bold" variant="bodySmall">Export my data</AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                      Download a copy of the personal data we hold about you as a JSON file.
                    </AppText>
                  </View>
                  <AppButton
                    label={exportingData ? 'Preparing export…' : 'Export my data'}
                    variant="secondary"
                    icon="download-outline"
                    onPress={handleExportData}
                    loading={exportingData}
                    disabled={exportingData || deletingAccount}
                  />
                </View>

                <View style={{ paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm }}>
                  <View>
                    <AppText weight="bold" variant="bodySmall" style={{ color: colors.critical }}>
                      Delete my account
                    </AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                      Permanently erase your account, content, messages, uploads and verification documents. This cannot be undone.
                    </AppText>
                  </View>
                  <AppButton
                    label="Delete my account"
                    variant="secondary"
                    icon="trash-outline"
                    onPress={openDeleteModal}
                    disabled={exportingData || deletingAccount}
                  />
                </View>

                <View style={{ paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <AppText tone="secondary" variant="caption" style={{ marginBottom: spacing.xs }}>
                    We respond to other data requests within {DSR_RESPONSE_DAYS} days. Contact {DPO_EMAIL}.
                  </AppText>
                  {LEGAL_LINKS.map((doc) => (
                    <Pressable
                      key={doc.title}
                      accessibilityRole="link"
                      onPress={() => {
                        haptics.light();
                        router.push(doc.href);
                      }}
                      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}
                    >
                      <AppText weight="semiBold" variant="bodySmall" tone="brand">
                        {doc.title}
                      </AppText>
                      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                    </Pressable>
                  ))}
                </View>
              </SolidCard>
            )}

            {/* 7. Terms & Policies */}
            {activeSection === 'legal' && (
              <SolidCard radius={20} style={{ padding: isDesktop ? spacing.lg : spacing.md, gap: spacing.md }}>
                <View>
                  <AppText variant="h3" weight="bold">
                    Institutional Governance & Policies
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    Terms of service, privacy policy and community rules (Terms v{TERMS_VERSION}, Privacy v{PRIVACY_VERSION})
                  </AppText>
                </View>

                {LEGAL_LINKS.map((doc) => (
                  <Pressable
                    key={doc.title}
                    accessibilityRole="link"
                    onPress={() => {
                      haptics.light();
                      router.push(doc.href);
                    }}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      gap: 8,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.xs }}>
                      <AppText weight="bold" variant="bodySmall">
                        {doc.title}
                      </AppText>
                      <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                        {doc.desc}
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </SolidCard>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Workspace Scope Modal */}
      <ChangeWorkspaceScopeModal
        visible={workspaceScopeModalOpen}
        onClose={() => setWorkspaceScopeModalOpen(false)}
        homeInstitution={institutionDisplay}
        homeInstitutionCode={homeInstitutionCode}
        scope={scope}
        onSelectScope={setScope}
      />

      <ChangeEmailModal visible={emailModalOpen} onClose={() => setEmailModalOpen(false)} currentEmail={user?.email} />

      {/* Password Update Modal */}
      <Modal
        visible={passwordModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalOpen(false)}
      >
        <KeyboardAvoidingView accessibilityViewIsModal
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.md, paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPasswordModalOpen(false)} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 20,
              padding: spacing.lg,
              width: '100%',
              maxWidth: 440,
              gap: spacing.md,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="h3" weight="bold">
                Update Password
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setPasswordModalOpen(false)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            {passwordError && (
              <AppText style={{ color: '#EF4444', fontSize: 12, lineHeight: 16 }}>
                {passwordError}
              </AppText>
            )}
            <AppTextField
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="••••••••"
            />
            <AppTextField
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="••••••••"
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <AppButton label="Cancel" variant="secondary" onPress={() => setPasswordModalOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton label={isUpdatingPassword ? 'Saving...' : 'Save Password'} onPress={handleUpdatePassword} loading={isUpdatingPassword} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={deleteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deletingAccount) setDeleteModalOpen(false);
        }}
      >
        <KeyboardAvoidingView accessibilityViewIsModal
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.md, paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!deletingAccount) setDeleteModalOpen(false);
            }}
          />
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 20,
              padding: spacing.lg,
              width: '100%',
              maxWidth: 460,
              gap: spacing.md,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="warning" size={22} color={colors.critical} />
              <AppText variant="h3" weight="bold" style={{ flex: 1 }}>
                Delete your account?
              </AppText>
            </View>
            <AppText tone="secondary" variant="bodySmall" style={{ lineHeight: 20 }}>
              This is permanent and cannot be undone. Your profile, posts, comments, messages, uploaded files and
              verification documents will be erased, and you will be signed out everywhere. Backups roll off within 30
              days.
            </AppText>
            <AppTextField
              label="Type DELETE to confirm"
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="DELETE"
              editable={!deletingAccount}
            />
            {deleteError ? (
              <AppText style={{ color: colors.critical, fontSize: 12, lineHeight: 16 }}>{deleteError}</AppText>
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppButton
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setDeleteModalOpen(false)}
                  disabled={deletingAccount}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton
                  label={deletingAccount ? 'Deleting…' : 'Delete forever'}
                  onPress={handleDeleteAccount}
                  loading={deletingAccount}
                  disabled={deletingAccount || deleteConfirmText.trim() !== 'DELETE'}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Contact Support / Report a Problem Modal */}
      <Modal
        visible={supportModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSupportModalOpen(false)}
      >
        <KeyboardAvoidingView accessibilityViewIsModal
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.md, paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSupportModalOpen(false)} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 20,
              padding: spacing.lg,
              width: '100%',
              maxWidth: 480,
              maxHeight: '90%',
              gap: spacing.md,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="h3" weight="bold">
                Student & Staff Support Desk
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close"
                onPress={() => {
                  setSupportModalOpen(false);
                  setSupportMessage('');
                  setSupportTitle('');
                }}
                hitSlop={8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: colors.background,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            <AppText tone="secondary" variant="bodySmall">
              Need assistance with your matric number, department transfer, verification badge, or account issues? Submit a ticket directly to the Root Admin support desk.
            </AppText>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
              <View>
                <AppText variant="caption" weight="medium" tone="secondary" style={{ marginBottom: 6 }}>
                  Issue Category
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {(
                    [
                      { key: 'account_issue', label: 'Account Issue' },
                      { key: 'matric_id_correction', label: 'Matric / ID Fix' },
                      { key: 'campus_transfer', label: 'Campus Transfer' },
                      { key: 'verification_appeal', label: 'Verification Appeal' },
                      { key: 'bug_report', label: 'Bug Report' },
                      { key: 'general', label: 'General Inquiry' },
                    ] as const
                  ).map((cat) => {
                    const isSelected = supportCategory === cat.key;
                    return (
                      <Pressable
                        key={cat.key}
                        onPress={() => setSupportCategory(cat.key)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: isSelected ? colors.brandPrimary : colors.background,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.brandPrimary : colors.border,
                        }}
                      >
                        <AppText
                          variant="caption"
                          weight={isSelected ? 'bold' : undefined}
                          style={{ color: isSelected ? '#FFFFFF' : colors.textPrimary, fontSize: 11 }}
                        >
                          {cat.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View>
                <AppText variant="caption" weight="medium" tone="secondary" style={{ marginBottom: 6 }}>
                  Subject / Summary
                </AppText>
                <TextInput accessibilityLabel="e.g., Request to update matriculation number"
                  value={supportTitle}
                  onChangeText={setSupportTitle}
                  placeholder="e.g., Request to update matriculation number"
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: colors.textPrimary,
                    fontSize: 13,
                  }}
                />
              </View>

              <View>
                <AppText variant="caption" weight="medium" tone="secondary" style={{ marginBottom: 6 }}>
                  Details & Description
                </AppText>
                <TextInput accessibilityLabel="Provide complete details (current details vs correct details, evidence, error codes)"
                  value={supportMessage}
                  onChangeText={setSupportMessage}
                  placeholder="Provide complete details (current details vs correct details, evidence, error codes)..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={4}
                  style={{
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 10,
                    padding: 12,
                    color: colors.textPrimary,
                    fontSize: 13,
                    minHeight: 100,
                    textAlignVertical: 'top',
                  }}
                />
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <AppButton
                  label="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setSupportModalOpen(false);
                    setSupportMessage('');
                    setSupportTitle('');
                  }}
                />
              </View>
              <View style={{ flex: 1.5 }}>
                <AppButton
                  label={submittingSupport ? 'Submitting...' : 'Submit to Admin Desk'}
                  onPress={handleSubmitSupportRequest}
                  loading={submittingSupport}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Profile Details Modal in Settings */}
      <Modal
        visible={editProfileModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditProfileModalOpen(false)}
      >
        <KeyboardAvoidingView accessibilityViewIsModal
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.md,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditProfileModalOpen(false)} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 20,
              padding: spacing.lg,
              width: '100%',
              maxWidth: 480,
              gap: spacing.md,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="person-outline" size={20} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">
                  Edit Profile Details
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setEditProfileModalOpen(false)}
                hitSlop={8}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {editProfileError && (
              <AppText style={{ color: '#EF4444', fontSize: 12, lineHeight: 16 }}>
                {editProfileError}
              </AppText>
            )}

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 380 }}>
              <View style={{ gap: spacing.sm }}>
                <AppTextField
                  label="Full Name"
                  value={editFullName}
                  onChangeText={setEditFullName}
                  placeholder="e.g. Adeyemi John"
                />
                <AppTextField
                  label="Username"
                  value={editUsername}
                  onChangeText={(t) => setEditUsername(t.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="e.g. adeyemi.dev"
                  helperText="Only lowercase letters, numbers, dots, and underscores."
                />
                <DepartmentPicker value={editDepartment || null} onChange={setEditDepartment} />
                <AppTextField
                  label="Academic Bio"
                  value={editBio}
                  onChangeText={setEditBio}
                  multiline
                  numberOfLines={3}
                  placeholder="Tell classmates about your academic focus or projects..."
                />
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', paddingTop: spacing.xs }}>
              <AppButton
                label="Cancel"
                variant="ghost"
                onPress={() => setEditProfileModalOpen(false)}
              />
              <AppButton
                label="Save Changes"
                loading={savingProfile}
                disabled={!editFullName.trim() || editUsername.trim().length < 3}
                onPress={handleSaveSettingsProfile}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <AppTutorialModal userId={user?.id} forceOpen={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    </ScreenContainer>
  );
}
