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
import { uploadResume } from '@/api/jobApplications';
import { pickResume } from '@/utils/pickResume';
import { roleRequiresMfa } from '@/auth/mfaPolicy';
import { DATA_CONTROLLER, DSR_RESPONSE_DAYS, PRIVACY_VERSION, TERMS_VERSION } from '@/constants/legal';
import { LAUNCH_INSTITUTIONS, getInstitutionByCode } from '@/api/institutions';
import { supabase } from '@/api/supabase';
import { submitReport } from '@/api/moderation';
import { HelpSupportModal } from './HelpSupportModal';
import * as authApi from '@/api/auth';
import { haptics } from '@/utils/haptics';
import {
  isBiometricsAvailable,
  authenticateWithBiometrics,
  getBiometricMethodLabel,
  setShieldEnabled,
} from '@/utils/biometrics';

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
  { key: 'workspace', label: 'Scope', fullLabel: 'Campus Scope', icon: 'globe-outline' as const },
  { key: 'appearance', label: 'Theme', fullLabel: 'Theme & Display', icon: 'color-palette-outline' as const },
  { key: 'notifications', label: 'Alerts', fullLabel: 'Notifications', icon: 'notifications-outline' as const },
  { key: 'security', label: 'Security', fullLabel: 'Security & Logins', icon: 'shield-checkmark-outline' as const },
  { key: 'preview', label: 'Switcher', fullLabel: 'Role Switcher', icon: 'swap-horizontal-outline' as const },
  { key: 'privacy', label: 'Privacy', fullLabel: 'Privacy & Data', icon: 'lock-closed-outline' as const },
  { key: 'legal', label: 'Policies', fullLabel: 'Terms & Policies', icon: 'document-text-outline' as const },
] as const;

/** Category accordion heading shown above each group of settings. */
function SettingsAccordionHeader({
  sectionKey,
  isCollapsed,
  onToggle,
  summary,
}: {
  sectionKey: (typeof ALL_SETTINGS_SECTIONS)[number]['key'];
  isCollapsed: boolean;
  onToggle: () => void;
  summary?: string;
}) {
  const { colors, spacing, radius, isDark } = useTheme();
  const section = ALL_SETTINGS_SECTIONS.find((sec) => sec.key === sectionKey);
  if (!section) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${section.fullLabel}, ${isCollapsed ? 'collapsed' : 'expanded'}`}
      accessibilityState={{ expanded: !isCollapsed }}
      onPress={onToggle}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: spacing.sm,
        marginTop: spacing.xs,
        borderRadius: radius.md,
        backgroundColor: pressed
          ? isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'
          : 'transparent',
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: !isCollapsed ? colors.pastelPrimaryBg : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={section.icon}
            size={17}
            color={!isCollapsed ? colors.brandPrimary : colors.textSecondary}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText
            variant="bodySmall"
            weight="bold"
            tone={!isCollapsed ? 'brand' : 'primary'}
            numberOfLines={1}
          >
            {section.fullLabel}
          </AppText>
          {summary ? (
            <AppText
              variant="caption"
              tone="secondary"
              numberOfLines={1}
              style={{ fontSize: 11, marginTop: 1 }}
            >
              {summary}
            </AppText>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: spacing.xs }}>
        <Ionicons
          name={isCollapsed ? 'chevron-down' : 'chevron-up'}
          size={18}
          color={colors.textSecondary}
        />
      </View>
    </Pressable>
  );
}

const LEGAL_LINKS = [
  { title: 'Privacy Policy', desc: 'How we collect, use and protect your data (NDPA 2023).', href: '/privacy' as const },
  { title: 'Terms of Service', desc: 'Rules for using Lioris, including AI and marketplace terms.', href: '/terms' as const },
  { title: 'Community Rules', desc: 'Standards of conduct, reporting and moderation.', href: '/community-rules' as const },
  { title: 'Copyright & Takedown', desc: 'What you may share, and how lecturers can ask for material to be removed.', href: '/copyright' as const },
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

  // Collapsible category state: all categories expanded by default.
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const isSectionCollapsed = (key: string) => !!collapsedSections[key];

  const toggleSection = (key: string) => {
    haptics.light();
    setCollapsedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleLogoutPrompt = () => {
    haptics.light();
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm('Are you sure you want to log out of your Lioris account?') : true;
      if (confirmed) {
        logout().then(() => router.replace('/(auth)/login'));
      }
      return;
    }
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of your Lioris account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const isSuperAdmin = user?.actualRole === 'admin';
  // Everything is one vertical scroll, split into labelled categories. The workspace scope and the
  // role switcher are admin tools, so members never see those two categories.
  const SETTINGS_SECTIONS = isSuperAdmin
    ? ALL_SETTINGS_SECTIONS
    : ALL_SETTINGS_SECTIONS.filter((sec) => sec.key !== 'preview' && sec.key !== 'workspace');
  const showSection = (key: (typeof ALL_SETTINGS_SECTIONS)[number]['key']) =>
    SETTINGS_SECTIONS.some((sec) => sec.key === key);

  const allVisibleSections = SETTINGS_SECTIONS.map((s) => s.key);
  const allAreCollapsed = allVisibleSections.every((k) => isSectionCollapsed(k));

  const handleToggleAllSections = () => {
    haptics.medium();
    if (allAreCollapsed) {
      setCollapsedSections({});
    } else {
      const next: Record<string, boolean> = {};
      for (const s of allVisibleSections) {
        next[s] = true;
      }
      setCollapsedSections(next);
    }
  };

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

  const queryClient = useQueryClient();

  // Edit profile modal state in Settings
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editGraduationYear, setEditGraduationYear] = useState('');
  const [editIndustry, setEditIndustry] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [editProfileError, setEditProfileError] = useState<string | null>(null);

  // Missing Settings states
  const [emailDigestAlerts, setEmailDigestAlerts] = useState(true);
  const [directoryDiscovery, setDirectoryDiscovery] = useState(true);
  const [isSigningOutOthers, setIsSigningOutOthers] = useState(false);

  // Résumé / CV on file - reused across every job application (JobCard.tsx offers it as the default choice)
  const [uploadingResume, setUploadingResume] = useState(false);

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
        } else {
          const supaUser = (await supabase.auth.getUser()).data?.user;
          const remote = supaUser?.user_metadata?.lioris_notifications;
          if (remote) {
            if (typeof remote.push === 'boolean') setPushEnabled(remote.push);
            if (typeof remote.announcements === 'boolean') setAnnouncementAlerts(remote.announcements);
            if (typeof remote.events === 'boolean') setEventAlerts(remote.events);
            if (typeof remote.emailDigest === 'boolean') setEmailDigestAlerts(remote.emailDigest);
          }
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
    if (user?.id) {
      supabase.auth.updateUser({ data: { lioris_notifications: updated } }).catch(() => {});
    }
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
      await setShieldEnabled(false);
      toast.info('Biometric security lock disabled');
      return;
    }

    // The lock can only be unlocked with a biometric or with the account password, and the password
    // check needs the web security check (Turnstile). Outside the browser neither is available, so
    // turning the lock on there would shut the user out of their own app.
    if (Platform.OS !== 'web') {
      toast.info('The app lock is only available in the web app for now.');
      return;
    }

    const bioStatus = await isBiometricsAvailable();
    if (bioStatus.available) {
      toast.info(`Verify with your ${getBiometricMethodLabel()} to turn the lock on...`);
      const authResult = await authenticateWithBiometrics(
        user ? { id: user.id, email: user.email, fullName: user.fullName || '' } : null
      );
      if (authResult.success) {
        setBiometricShield(true);
        await setShieldEnabled(true);
        toast.success(
          authResult.enrolled
            ? `Biometric lock is on. Your ${getBiometricMethodLabel()} is now set up.`
            : 'Biometric lock is on',
        );
        haptics.success();
      } else {
        toast.error(authResult.error || 'Biometric verification failed or was cancelled');
        haptics.error();
      }
    } else {
      setBiometricShield(true);
      await setShieldEnabled(true);
      toast.info('Password lock is on (this browser has no biometric option)');
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
    setEditGraduationYear(profile.graduationYear ? String(profile.graduationYear) : '');
    setEditIndustry(profile.industry || '');
    setEditCompany(profile.company || '');
    setEditJobTitle(profile.jobTitle || '');
    setEditLocation(profile.location || '');
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
    const parsedYear = editGraduationYear.trim() ? Number(editGraduationYear.trim()) : null;
    if (editGraduationYear.trim() && (!Number.isInteger(parsedYear) || parsedYear! < 1950 || parsedYear! > 2100)) {
      setEditProfileError('Graduation year must be a valid year between 1950 and 2100.');
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
        ...(isSuperAdmin || user?.role === 'alumni'
          ? {
              graduationYear: parsedYear,
              industry: editIndustry.trim() || null,
              company: editCompany.trim() || null,
              jobTitle: editJobTitle.trim() || null,
              location: editLocation.trim() || null,
            }
          : {}),
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

  async function handleUploadResume() {
    haptics.light();
    setUploadingResume(true);
    try {
      const picked = await pickResume();
      if (!picked) {
        setUploadingResume(false);
        return;
      }
      const resumeUrl = await uploadResume(picked.source);
      await updateMyProfile(user!.id, { resumeUrl });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      haptics.success();
      toast.success('Your CV has been saved. It will be offered by default on every job application.');
    } catch (err: any) {
      haptics.error();
      toast.error(err?.message || 'Could not upload your résumé. Please try again.');
    } finally {
      setUploadingResume(false);
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

        {/* One vertical list, grouped by category (no tabs to switch between) */}
        <View style={{ width: '100%', maxWidth: isDesktop ? 820 : undefined, alignSelf: 'center', gap: spacing.md }}>
          {/* Category Controls Bar */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: spacing.xs,
              paddingTop: spacing.xs,
              marginBottom: -spacing.xs,
            }}
          >
            <AppText variant="caption" tone="secondary" weight="semiBold" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Settings Categories
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={allAreCollapsed ? 'Expand all categories' : 'Collapse all categories'}
              onPress={handleToggleAllSections}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8 }}
            >
              <Ionicons
                name={allAreCollapsed ? 'chevron-down-circle-outline' : 'chevron-up-circle-outline'}
                size={14}
                color={colors.brandPrimary}
              />
              <AppText variant="caption" tone="brand" weight="bold">
                {allAreCollapsed ? 'Expand All' : 'Collapse All'}
              </AppText>
            </Pressable>
          </View>
            {/* 1. Account & Profile */}
            {showSection('account') && (
              <View style={{ gap: spacing.xs }}>
                <SettingsAccordionHeader
                  sectionKey="account"
                  isCollapsed={isSectionCollapsed('account')}
                  onToggle={() => toggleSection('account')}
                  summary={`${profile?.fullName ?? user?.fullName ?? 'User'} • ${departmentDisplay}`}
                />
                {!isSectionCollapsed('account') && (
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

                {/* Résumé / CV on file - reused as the default across every job application */}
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
                    <Ionicons
                      name={profile?.resumeUrl ? 'document-text' : 'document-attach-outline'}
                      size={20}
                      color={profile?.resumeUrl ? colors.brandPrimary : colors.textSecondary}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText weight="bold" variant="bodySmall">
                        My Résumé / CV
                      </AppText>
                      <AppText tone="secondary" variant="caption">
                        {profile?.resumeUrl ? 'On file - used by default on job applications' : 'Not uploaded yet'}
                      </AppText>
                    </View>
                  </View>
                  <AppButton
                    label={uploadingResume ? 'Uploading…' : profile?.resumeUrl ? 'Update' : 'Upload'}
                    variant="secondary"
                    size="sm"
                    loading={uploadingResume}
                    onPress={handleUploadResume}
                  />
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
                    label="Help & Support / Give Feedback"
                    variant="secondary"
                    onPress={() => {
                      haptics.light();
                      setSupportModalOpen(true);
                    }}
                  />
                </View>
              </SolidCard>
                )}
              </View>
            )}

            {/* Campus Scope */}
            {showSection('workspace') && (
              <View style={{ gap: spacing.xs }}>
                <SettingsAccordionHeader
                  sectionKey="workspace"
                  isCollapsed={isSectionCollapsed('workspace')}
                  onToggle={() => toggleSection('workspace')}
                  summary={scope === 'campus' ? (activeCampusCode && activeCampusCode !== homeInstitutionCode ? (getInstitutionByCode(activeCampusCode)?.name ?? activeCampusCode) : institutionDisplay) : 'All Lioris Global Network'}
                />
                {!isSectionCollapsed('workspace') && (
                  <SolidCard radius={20} style={{ padding: isDesktop ? spacing.lg : spacing.md, gap: spacing.md }}>
                    <View>
                      <AppText variant="h3" weight="bold">
                        Campus Scope
                      </AppText>
                      <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                        Admin tool: choose which campus network (or the global network) you are viewing while administering the platform
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
                            {scope === 'campus' ? 'My Campus Network' : 'Cross-university network'}
                          </AppText>
                        </View>
                      </View>
                      <Badge label={scope === 'campus' ? 'CAMPUS' : 'GLOBAL'} tone="neutral" />
                    </View>

                    <AppButton
                      label="Change Campus Scope"
                      variant="secondary"
                      icon="swap-horizontal-outline"
                      onPress={() => {
                        haptics.light();
                        setWorkspaceScopeModalOpen(true);
                      }}
                    />
                  </SolidCard>
                )}
              </View>
            )}

            {/* 2. Appearance & Theme */}
            {showSection('appearance') && (
              <View style={{ gap: spacing.xs }}>
                <SettingsAccordionHeader
                  sectionKey="appearance"
                  isCollapsed={isSectionCollapsed('appearance')}
                  onToggle={() => toggleSection('appearance')}
                  summary={`${themeMode === 'system' ? 'Auto System' : themeMode === 'dark' ? 'Dark Mode' : 'Light Mode'} • ${accentPresets.find((p) => (!customAccent && p.isDefault) || customAccent === p.id)?.label || 'Lioris Blue'}`}
                />
                {!isSectionCollapsed('appearance') && (
                  <SolidCard radius={20} style={{ padding: isDesktop ? spacing.lg : spacing.md, gap: spacing.md }}>
                    {/* Section Header */}
                    <View>
                      <AppText variant="h3" weight="bold">
                        Theme & Display
                      </AppText>
                      <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                        Customize interface appearance and campus colors
                      </AppText>
                    </View>

                    {/* Display Mode Selector */}
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
                              accessibilityRole="button"
                              accessibilityLabel={t.fullLabel}
                              accessibilityState={{ selected: active }}
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

                    {/* Active Campus Palette Card */}
                    <View
                      style={{
                        padding: spacing.md,
                        borderRadius: radius.md,
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                        flexDirection: isDesktop ? 'row' : 'column',
                        alignItems: isDesktop ? 'center' : 'stretch',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 18,
                            overflow: 'hidden',
                            flexDirection: 'row',
                            borderWidth: 1.5,
                            borderColor: colors.border,
                          }}
                        >
                          <View style={{ flex: 1, backgroundColor: colors.brandPrimary }} />
                          <View style={{ flex: 1, backgroundColor: colors.brandAccent }} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <AppText variant="bodySmall" weight="bold">
                              {accentPresets.find((p) => (!customAccent && p.isDefault) || customAccent === p.id)?.label || 'Lioris Blue & Gold'}
                            </AppText>
                            <Badge
                              label={isDefaultTheme ? 'DEFAULT' : 'CUSTOM'}
                              tone={isDefaultTheme ? 'brand' : 'accent'}
                            />
                          </View>
                          <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                            Primary: {colors.brandPrimary} • Accent: {colors.brandAccent}
                          </AppText>
                        </View>
                      </View>

                      {!isDefaultTheme && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Restore Default Theme"
                          onPress={async () => {
                            haptics.medium();
                            await resetToDefaultTheme();
                            toast.success('Restored default Lioris theme');
                          }}
                          style={({ pressed }) => ({
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            borderRadius: radius.pill,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            backgroundColor: colors.pastelPrimaryBg,
                            borderWidth: 1,
                            borderColor: colors.brandPrimary,
                            opacity: pressed ? 0.8 : 1,
                            alignSelf: isDesktop ? 'center' : 'flex-start',
                          })}
                        >
                          <Ionicons name="arrow-undo" size={14} color={colors.brandPrimary} />
                          <AppText variant="caption" weight="bold" tone="brand">
                            Restore Default
                          </AppText>
                        </Pressable>
                      )}
                    </View>

                    {/* Campus Palette Presets */}
                    <View style={{ gap: spacing.sm }}>
                      <View>
                        <AppText variant="bodySmall" weight="bold">
                          Campus Palettes
                        </AppText>
                        <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                          Select an institution palette to style buttons, badges, and accents
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
                              accessibilityRole="button"
                              accessibilityLabel={`${preset.label} palette`}
                              accessibilityState={{ selected: isSelected }}
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
                                borderWidth: isSelected ? 1.5 : 1,
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
                                <View
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 16,
                                    overflow: 'hidden',
                                    flexDirection: 'row',
                                    borderWidth: 1.5,
                                    borderColor: isSelected ? colors.brandPrimary : colors.border,
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

                              {isSelected && (
                                <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} />
                              )}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </SolidCard>
                )}
              </View>
            )}

            {/* 3. Notifications */}
            {showSection('notifications') && (
              <View style={{ gap: spacing.xs }}>
                <SettingsAccordionHeader
                  sectionKey="notifications"
                  isCollapsed={isSectionCollapsed('notifications')}
                  onToggle={() => toggleSection('notifications')}
                  summary={`${pushEnabled ? 'Push On' : 'Push Off'} • ${eventAlerts ? 'Events On' : 'Events Off'}`}
                />
                {!isSectionCollapsed('notifications') && (
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
              </View>
            )}

            {/* 4. Security & Credentials */}
            {showSection('security') && (
              <View style={{ gap: spacing.xs }}>
                <SettingsAccordionHeader
                  sectionKey="security"
                  isCollapsed={isSectionCollapsed('security')}
                  onToggle={() => toggleSection('security')}
                  summary={`${mfaFactorId ? '2FA Active' : '2FA Off'} • ${biometricShield ? 'Biometrics On' : 'Biometrics Off'}`}
                />
                {!isSectionCollapsed('security') && (
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
              </View>
            )}

            {/* 5. Role Switcher Preview (Root Admins only) */}
            {showSection('preview') && (
              <View style={{ gap: spacing.xs }}>
                <SettingsAccordionHeader
                  sectionKey="preview"
                  isCollapsed={isSectionCollapsed('preview')}
                  onToggle={() => toggleSection('preview')}
                  summary={`Perspective: ${user?.role?.toUpperCase() ?? 'STUDENT'}`}
                />
                {!isSectionCollapsed('preview') && (
                  <SolidCard radius={20} style={{ padding: isDesktop ? spacing.lg : spacing.md, gap: spacing.md }}>
                    <View>
                      <AppText variant="h3" weight="bold">
                        Campus Role Switcher
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
                          router.replace(r.role === 'admin' ? '/(admin)/dashboard' : `/(${r.role})/dashboard` as any);
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
              </View>
            )}

            {/* 6. Privacy & Data */}
            {showSection('privacy') && (
              <View style={{ gap: spacing.xs }}>
                <SettingsAccordionHeader
                  sectionKey="privacy"
                  isCollapsed={isSectionCollapsed('privacy')}
                  onToggle={() => toggleSection('privacy')}
                  summary={`${directoryDiscovery ? 'Directory Discoverable' : 'Private'} • Data Export`}
                />
                {!isSectionCollapsed('privacy') && (
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
                    We aim to respond to other data requests within {DSR_RESPONSE_DAYS} days. Use {DATA_CONTROLLER.privacyChannel}.
                  </AppText>
                  {LEGAL_LINKS.map((doc) => (
                    <Pressable
                      key={doc.title}
                      accessibilityRole="link"
                      onPress={() => {
                        haptics.light();
                        router.push(doc.href as any);
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
              </View>
            )}

            {/* 7. Terms & Policies */}
            {showSection('legal') && (
              <View style={{ gap: spacing.xs }}>
                <SettingsAccordionHeader
                  sectionKey="legal"
                  isCollapsed={isSectionCollapsed('legal')}
                  onToggle={() => toggleSection('legal')}
                  summary="Institutional Governance & Policies"
                />
                {!isSectionCollapsed('legal') && (
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
                      router.push(doc.href as any);
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
            )}

            {/* Dedicated Log Out Action */}
            <View style={{ marginTop: spacing.md, gap: spacing.sm, alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Log Out of Lioris"
                onPress={handleLogoutPrompt}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing.sm,
                  width: '100%',
                  paddingVertical: 14,
                  borderRadius: radius.md,
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.25)',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Ionicons name="log-out-outline" size={20} color={colors.critical} />
                <AppText variant="bodySmall" weight="bold" style={{ color: colors.critical }}>
                  Log Out of Lioris
                </AppText>
              </Pressable>
              <AppText variant="caption" tone="secondary" style={{ textAlign: 'center', marginTop: 4 }}>
                Lioris Campus Platform • Version 1.0.0
              </AppText>
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

      <HelpSupportModal visible={supportModalOpen} onClose={() => setSupportModalOpen(false)} />
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
                {(isSuperAdmin || user?.role === 'alumni') && (
                  <>
                    <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 0.8, marginTop: spacing.xs }}>
                      PROFESSIONAL DETAILS (shown in the Alumni Directory)
                    </AppText>
                    <AppTextField
                      label="Graduation Year"
                      value={editGraduationYear}
                      onChangeText={(t) => setEditGraduationYear(t.replace(/[^0-9]/g, '').slice(0, 4))}
                      placeholder="e.g. 2021"
                      keyboardType="numeric"
                    />
                    <AppTextField
                      label="Industry"
                      value={editIndustry}
                      onChangeText={setEditIndustry}
                      placeholder="e.g. Software & Technology"
                    />
                    <AppTextField
                      label="Company"
                      value={editCompany}
                      onChangeText={setEditCompany}
                      placeholder="e.g. Acme Inc."
                    />
                    <AppTextField
                      label="Job Title"
                      value={editJobTitle}
                      onChangeText={setEditJobTitle}
                      placeholder="e.g. Software Engineer"
                    />
                    <AppTextField
                      label="Location"
                      value={editLocation}
                      onChangeText={setEditLocation}
                      placeholder="e.g. Lagos, Nigeria"
                    />
                  </>
                )}
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
