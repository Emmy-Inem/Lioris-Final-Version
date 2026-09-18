import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { SolidCard } from './SolidCard';
import { AppButton } from './AppButton';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { ChangeWorkspaceScopeModal } from './ChangeWorkspaceScopeModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { useCampusScope } from '@/hooks/useCampusScope';
import { getMyProfile } from '@/api/profile';
import { LAUNCH_INSTITUTIONS, getInstitutionByCode } from '@/api/institutions';
import { supabase } from '@/api/supabase';
import { submitReport } from '@/api/moderation';
import { createSupportTicket, SupportTicketCategory } from '@/api/supportTickets';
import * as authApi from '@/api/auth';
import { haptics } from '@/utils/haptics';

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
  { key: 'legal', label: 'Policies', fullLabel: 'Terms & Policies', icon: 'document-text-outline' as const },
] as const;

interface LegalPolicy {
  title: string;
  desc: string;
  paragraphs: string[];
}

const LEGAL_DOCUMENTS: LegalPolicy[] = [
  {
    title: 'Software Terms of Service',
    desc: 'University platform operational rules and code of conduct.',
    paragraphs: [
      '1. Acceptance of Terms: By logging in with your institutional credentials (@ui.edu.ng, @unilag.edu.ng, etc.), you agree to adhere to all university software policies and the terms set forth herein.',
      '2. Academic Identity: Accounts on the Lioris platform are strictly tied to verified matriculation numbers and academic email domains. Impersonation of students, faculty, or alumni fellows is strictly prohibited.',
      '3. Campus Escrow & Trade: When using the Campus Marketplace or Escrow service, buyers and sellers agree that transactions conducted under university escrow are held securely until physical verification and handover.',
      '4. Resource Sharing: All lecture notes, syllabi, and past questions uploaded to the Academic Repository must be owned by the user or distributed under open academic educational licenses.',
    ],
  },
  {
    title: 'Privacy & Data Protection Policy',
    desc: 'Zero third-party ads, NDPR compliance and verified encryption.',
    paragraphs: [
      '1. Zero Ad Tracking: Lioris is a secure academic network. We do not sell your personal data, academic records, or browsing patterns to advertisers or third-party data brokers.',
      '2. Encryption & Storage: All personal authentication tokens, biometric secrets, and submitted identity verification documents are encrypted at rest using industry-standard AES-256 and SSL/TLS in transit.',
      '3. Regulatory Compliance: Our data governance practices strictly conform to the Nigeria Data Protection Regulation (NDPR) and international institutional academic data protection standards.',
      '4. Retention & Deletion: You may request the permanent export or deletion of your academic activity records at any time through university administration.',
    ],
  },
  {
    title: 'Campus Academic Honor Code',
    desc: 'Academic integrity rules and anti-harassment guidelines.',
    paragraphs: [
      '1. Academic Integrity: The platform supports collaboration, peer study sprints, and revision pods. Distributing live examination question leaks or engaging in academic dishonesty is grounds for immediate suspension.',
      '2. Respectful Community Discourse: Forums, course circles, and direct messaging channels must remain free from harassment, hate speech, bullying, and defamation.',
      '3. Faculty & Mentorship Decorum: When interacting with faculty lecturers or alumni mentors, professional academic etiquette and respect are required at all times.',
      '4. Sanctions: Breaches of this Honor Code are reported to the university Disciplinary Board and student affairs council.',
    ],
  },
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
  const [biometricShield, setBiometricShield] = useState(true);

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

  // Legal Modal State
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalPolicy | null>(null);

  // Contact Support / Report a Problem
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [supportCategory, setSupportCategory] = useState<SupportTicketCategory>('general');
  const [supportTitle, setSupportTitle] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [submittingSupport, setSubmittingSupport] = useState(false);

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
        }
        const bio = await getStoredPref('lioris_setting_biometrics');
        if (bio) {
          setBiometricShield(JSON.parse(bio) === true);
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

  function saveNotifPreference(updated: { push: boolean; announcements: boolean; events: boolean }) {
    setStoredPref('lioris_setting_notifications', JSON.stringify(updated));
  }

  function handleTogglePush(next: boolean) {
    haptics.light();
    setPushEnabled(next);
    saveNotifPreference({ push: next, announcements: announcementAlerts, events: eventAlerts });
    toast.info(next ? 'Push notifications enabled' : 'Push notifications muted');
  }

  function handleToggleAnnouncements(next: boolean) {
    haptics.light();
    setAnnouncementAlerts(next);
    saveNotifPreference({ push: pushEnabled, announcements: next, events: eventAlerts });
    toast.info(next ? 'Campus announcements enabled' : 'Campus announcements muted');
  }

  function handleToggleEvents(next: boolean) {
    haptics.light();
    setEventAlerts(next);
    saveNotifPreference({ push: pushEnabled, announcements: announcementAlerts, events: next });
    toast.info(next ? 'Event reminder alerts enabled' : 'Event reminders muted');
  }

  function handleToggleBiometrics(next: boolean) {
    haptics.light();
    setBiometricShield(next);
    setStoredPref('lioris_setting_biometrics', JSON.stringify(next));
    toast.info(next ? 'Biometric security lock activated' : 'Biometric security lock disabled');
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
    if (!newPassword || newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setIsUpdatingPassword(true);
    setPasswordError(null);
    try {
      await supabase.auth.updateUser({ password: newPassword });
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
        'University of Ibadan';

  const departmentDisplay = profile?.department || 'Computer Science & AI';

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
            <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold" numberOfLines={1}>
              Settings & Preferences
            </AppText>
            <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>
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
                  <Avatar name={profile?.fullName ?? user?.fullName ?? 'Diana Prince'} size={isDesktop ? 60 : 48} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant={isDesktop ? 'h2' : 'h3'} weight="bold" numberOfLines={1}>
                      {profile?.fullName ?? user?.fullName ?? 'Diana Prince'}
                    </AppText>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>
                      {profile?.email ?? user?.email ?? 'diana.prince@ui.edu.ng'}
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
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
                      {institutionDisplay}
                    </AppText>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, gap: spacing.sm }}>
                    <AppText tone="secondary" variant="bodySmall" style={{ flexShrink: 0 }}>
                      Department
                    </AppText>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
                      {departmentDisplay}
                    </AppText>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, gap: spacing.sm }}>
                    <AppText tone="secondary" variant="bodySmall" style={{ flexShrink: 0 }}>
                      Academic Standing
                    </AppText>
                    <AppText weight="bold" variant="bodySmall" numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
                      {academicStandingDisplay}
                    </AppText>
                  </View>
                </View>

                <View style={{ paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm }}>
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
                      <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                        {scope === 'campus'
                          ? (activeCampusCode && activeCampusCode !== homeInstitutionCode
                              ? `Exploring ${getInstitutionByCode(activeCampusCode)?.name ?? activeCampusCode}`
                              : institutionDisplay)
                          : 'All Lioris Global Feed'}
                      </AppText>
                      <AppText tone="secondary" variant="caption" numberOfLines={1}>
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
                          <AppText variant="caption" weight="bold" tone={active ? 'brand' : 'primary'} numberOfLines={1}>
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
                        <AppText variant="caption" tone="secondary" numberOfLines={1}>
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
                        <AppText variant="caption" tone="secondary" numberOfLines={1}>
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
                  <View>
                    <AppText weight="bold" variant="bodySmall">Two-Factor Authentication</AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                      Require a 6-digit code from an authenticator app when signing in
                    </AppText>
                  </View>

                  {mfaChecking ? (
                    <AppText tone="secondary" variant="caption">Checking status…</AppText>
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
                          Two-Factor Authentication is active
                        </AppText>
                      </View>
                      <AppButton
                        label={mfaDisabling ? 'Turning off…' : 'Turn Off'}
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
                        <TextInput
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
                            label={mfaConfirming ? 'Confirming…' : 'Confirm'}
                            onPress={handleConfirmMfaEnrollment}
                            loading={mfaConfirming}
                            disabled={mfaConfirmCode.length < 6}
                          />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <AppButton
                      label={mfaEnrolling ? 'Starting setup…' : 'Set Up Two-Factor Authentication'}
                      variant="secondary"
                      onPress={handleStartMfaEnrollment}
                      loading={mfaEnrolling}
                    />
                  )}
                </View>

                <View style={{ paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <AppButton
                    label="Change Password"
                    variant="secondary"
                    onPress={() => {
                      setPasswordError(null);
                      setPasswordModalOpen(true);
                    }}
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

            {/* 6. Terms & Policies */}
            {activeSection === 'legal' && (
              <SolidCard radius={20} style={{ padding: isDesktop ? spacing.lg : spacing.md, gap: spacing.md }}>
                <View>
                  <AppText variant="h3" weight="bold">
                    Institutional Governance & Policies
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    Official terms of service, NDPR privacy rules, and student honor code
                  </AppText>
                </View>

                {LEGAL_DOCUMENTS.map((doc) => (
                  <Pressable
                    key={doc.title}
                    onPress={() => {
                      haptics.light();
                      setActiveLegalDoc(doc);
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
                      <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
                        {doc.title}
                      </AppText>
                      <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>
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

      {/* Password Update Modal */}
      <Modal
        visible={passwordModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalOpen(false)}
      >
        <KeyboardAvoidingView
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
              <Pressable onPress={() => setPasswordModalOpen(false)} hitSlop={8} style={{ padding: 4 }}>
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

      {/* Legal & Policy Viewer Modal */}
      <Modal
        visible={!!activeLegalDoc}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveLegalDoc(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActiveLegalDoc(null)} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: isDesktop ? spacing.xl : spacing.lg,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              width: '100%',
              maxWidth: 640,
              alignSelf: 'center',
              maxHeight: '85%',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {/* Mobile grab handle */}
            {!isDesktop && (
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.border,
                  alignSelf: 'center',
                  marginBottom: spacing.sm,
                }}
              />
            )}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: spacing.md,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 }}>
                <Ionicons name="shield-checkmark-outline" size={22} color={colors.textSecondary} />
                <AppText variant="h3" weight="bold" numberOfLines={1}>
                  {activeLegalDoc?.title}
                </AppText>
              </View>
              <Pressable
                onPress={() => setActiveLegalDoc(null)}
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

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.lg, gap: spacing.md }}>
              <AppText tone="secondary" variant="bodySmall" style={{ fontStyle: 'italic', marginBottom: 4 }}>
                {activeLegalDoc?.desc}
              </AppText>
              {activeLegalDoc?.paragraphs.map((p, idx) => (
                <View key={idx} style={{ backgroundColor: colors.background, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                  <AppText style={{ color: colors.textPrimary, fontSize: 13, lineHeight: 20 }}>
                    {p}
                  </AppText>
                </View>
              ))}
            </ScrollView>

            <View style={{ paddingTop: spacing.sm }}>
              <AppButton label="Close Document" variant="secondary" onPress={() => setActiveLegalDoc(null)} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Contact Support / Report a Problem Modal */}
      <Modal
        visible={supportModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSupportModalOpen(false)}
      >
        <KeyboardAvoidingView
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
              <Pressable
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
                <TextInput
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
                <TextInput
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
    </ScreenContainer>
  );
}
