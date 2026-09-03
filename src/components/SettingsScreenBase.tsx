import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { SolidCard } from './SolidCard';
import { AppButton } from './AppButton';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { useCampusScope } from '@/hooks/useCampusScope';
import { getMyProfile } from '@/api/profile';
import { LAUNCH_INSTITUTIONS } from '@/api/institutions';
import { supabase } from '@/api/supabase';
import { haptics } from '@/utils/haptics';

const ALL_SETTINGS_SECTIONS = [
  { key: 'account', label: 'Account', fullLabel: 'Account & Profile', icon: 'person-outline' as const },
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
  const { colors, spacing, radius, isDark, themeMode, setThemeMode, customAccent, setCustomAccent, accentPresets } = useTheme();
  const { user, logout, switchRole } = useAuth();
  const { isDesktop } = useResponsive();
  const toast = useToast();
  const { homeInstitutionCode } = useCampusScope();

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

  // Legal Modal State
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalPolicy | null>(null);

  // Hydrate preferences on mount
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const notifs = localStorage.getItem('lioris_setting_notifications');
        if (notifs) {
          const parsed = JSON.parse(notifs);
          if (typeof parsed.push === 'boolean') setPushEnabled(parsed.push);
          if (typeof parsed.announcements === 'boolean') setAnnouncementAlerts(parsed.announcements);
          if (typeof parsed.events === 'boolean') setEventAlerts(parsed.events);
        }
        const bio = localStorage.getItem('lioris_setting_biometrics');
        if (bio) {
          setBiometricShield(JSON.parse(bio) === true);
        }
      } catch {}
    }
  }, []);

  function saveNotifPreference(updated: { push: boolean; announcements: boolean; events: boolean }) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('lioris_setting_notifications', JSON.stringify(updated));
      } catch {}
    }
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
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('lioris_setting_biometrics', JSON.stringify(next));
      } catch {}
    }
    toast.info(next ? 'Biometric security lock activated' : 'Biometric security lock disabled');
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
    profile?.institutionName ||
    LAUNCH_INSTITUTIONS.find((i) => i.code === homeInstitutionCode)?.name ||
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
              tone="brand"
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

                <View style={{ paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
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

            {/* 2. Appearance & Theme */}
            {activeSection === 'appearance' && (
              <SolidCard radius={20} style={{ padding: isDesktop ? spacing.lg : spacing.md, gap: spacing.md }}>
                <View>
                  <AppText variant="h3" weight="bold">
                    Interface Theme
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    Select your preferred appearance mode
                  </AppText>
                </View>

                {/* Theme Mode Selector */}
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

                <View style={{ marginTop: spacing.xs }}>
                  <AppText variant="h3" weight="bold">
                    Brand Accent Color
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2, marginBottom: spacing.sm }}>
                    Personalize your primary focus and badge hues
                  </AppText>
                </View>

                {/* Accent Swatches */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                  {accentPresets.map((preset) => {
                    const isSelected = customAccent === preset.id;
                    const displayColor = isDark ? preset.primaryDark : preset.primaryLight;
                    return (
                      <Pressable
                        key={preset.id}
                        onPress={() => {
                          haptics.light();
                          setCustomAccent(preset.id);
                          toast.success(`Accent color applied: ${preset.label}`);
                        }}
                        style={{
                          width: isDesktop ? 44 : 40,
                          height: isDesktop ? 44 : 40,
                          borderRadius: isDesktop ? 22 : 20,
                          backgroundColor: displayColor,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: isSelected ? 3 : 1,
                          borderColor: isSelected ? (isDark ? '#FFFFFF' : '#000000') : colors.border,
                        }}
                      >
                        {isSelected && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                      </Pressable>
                    );
                  })}
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

      {/* Password Update Modal */}
      <Modal
        visible={passwordModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.md }}>
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 20,
              padding: spacing.lg,
              width: '100%',
              maxWidth: 420,
              gap: spacing.md,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <AppText variant="h3" weight="bold">
              Update Password
            </AppText>
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
        </View>
      </Modal>

      {/* Legal & Policy Viewer Modal */}
      <Modal
        visible={!!activeLegalDoc}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveLegalDoc(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setActiveLegalDoc(null)} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: isDesktop ? spacing.xl : spacing.lg,
              maxHeight: '85%',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
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
                <Ionicons name="shield-checkmark-outline" size={22} color={colors.brandPrimary} />
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
    </ScreenContainer>
  );
}
