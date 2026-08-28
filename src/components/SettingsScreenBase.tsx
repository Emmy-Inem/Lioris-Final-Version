import React, { useState } from 'react';
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
import { getMyProfile } from '@/api/profile';
import { supabase } from '@/api/supabase';
import { haptics } from '@/utils/haptics';

const ALL_SETTINGS_SECTIONS = [
  { key: 'account', label: 'Account & Profile', icon: 'person-outline' as const },
  { key: 'appearance', label: 'Theme & Display', icon: 'color-palette-outline' as const },
  { key: 'notifications', label: 'Notifications', icon: 'notifications-outline' as const },
  { key: 'security', label: 'Security & Logins', icon: 'shield-checkmark-outline' as const },
  // Only ever shown to a real Root Admin (user.actualRole === 'admin') -
  // see the filter below and SessionUser.actualRole in AuthContext.tsx.
  { key: 'preview', label: 'Role Switcher', icon: 'swap-horizontal-outline' as const },
  { key: 'legal', label: 'Terms & Policies', icon: 'document-text-outline' as const },
] as const;

export function SettingsScreen() {
  const { colors, spacing, radius, isDark, themeMode, setThemeMode, customAccent, setCustomAccent, accentPresets } = useTheme();
  const { user, logout, switchRole } = useAuth();
  const { isDesktop } = useResponsive();
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

  // Toggles
  const [pushEnabled, setPushEnabled] = useState(true);
  const [announcementAlerts, setAnnouncementAlerts] = useState(true);
  const [eventAlerts, setEventAlerts] = useState(true);
  const [biometricShield, setBiometricShield] = useState(true);

  // Password Modal
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Legal Modal
  const [legalDoc, setLegalDoc] = useState<{ title: string; body: string } | null>(null);

  async function handleUpdatePassword() {
    if (!newPassword || newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    try {
      await supabase.auth.updateUser({ password: newPassword });
      setPasswordModalOpen(false);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError(null);
      Alert.alert('Success', 'Password updated successfully.');
    } catch {
      setPasswordError('Could not update password.');
    }
  }

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: isDesktop ? 0 : 14,
          paddingTop: isDesktop ? spacing.lg : spacing.sm,
          paddingBottom: isDesktop ? 80 : 120,
          gap: spacing.lg,
        }}
      >
        {/* Header Title */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', rowGap: spacing.sm }}>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <AppText variant="h1" weight="bold">
              Settings & Preferences
            </AppText>
            <AppText tone="secondary" variant="bodySmall">
              Manage your academic credentials, security, notifications, and portal display
            </AppText>
          </View>
          <View style={{ flexShrink: 0 }}>
            <Badge label={user?.role?.toUpperCase() ?? 'STUDENT'} tone="brand" />
          </View>
        </View>

        {/* 2-Column Responsive Layout on Desktop */}
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: spacing.lg, alignItems: 'flex-start' }}>
          {/* Sub Navigation Tabs */}
          <View style={{ width: isDesktop ? 260 : '100%' }}>
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
                      paddingVertical: 12,
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
                      {sec.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </SolidCard>
          </View>

          {/* Main Active Settings Content */}
          <View style={{ flex: 1, width: '100%', gap: spacing.md }}>
            {/* Account & Profile */}
            {activeSection === 'account' && (
              <SolidCard radius={20} style={{ padding: spacing.lg, gap: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Avatar name={profile?.fullName ?? user?.fullName ?? 'Diana Prince'} size={64} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="h2" weight="bold">
                      {profile?.fullName ?? user?.fullName ?? 'Diana Prince'}
                    </AppText>
                    <AppText tone="secondary" variant="bodySmall">
                      {profile?.email ?? user?.email ?? 'diana.prince@ui.edu.ng'}
                    </AppText>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      <Badge label="Verified Academic Identity" tone="success" />
                    </View>
                  </View>
                </View>

                <View style={{ gap: spacing.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                    <AppText tone="secondary" variant="bodySmall">Institution</AppText>
                    <AppText weight="bold" variant="bodySmall">{profile?.institutionName ?? 'University of Ibadan'}</AppText>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                    <AppText tone="secondary" variant="bodySmall">Department</AppText>
                    <AppText weight="bold" variant="bodySmall">{profile?.department ?? 'Computer Science & AI'}</AppText>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                    <AppText tone="secondary" variant="bodySmall">Academic Level</AppText>
                    <AppText weight="bold" variant="bodySmall">Level {profile?.level ?? 400}</AppText>
                  </View>
                </View>

                <View style={{ paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
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

            {/* Appearance & Theme */}
            {activeSection === 'appearance' && (
              <SolidCard radius={20} style={{ padding: spacing.lg, gap: spacing.md }}>
                <AppText variant="h3" weight="bold">
                  Interface Theme
                </AppText>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {[
                    { id: 'light', label: 'Light Mode', icon: 'sunny-outline' as const },
                    { id: 'dark', label: 'Dark Mode', icon: 'moon-outline' as const },
                    { id: 'system', label: 'Auto System', icon: 'phone-portrait-outline' as const },
                  ].map((t) => {
                    const active = themeMode === t.id;
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => {
                          haptics.light();
                          setThemeMode(t.id as any);
                        }}
                        style={{
                          flex: 1,
                          padding: spacing.md,
                          borderRadius: radius.md,
                          borderWidth: 2,
                          borderColor: active ? colors.brandPrimary : colors.border,
                          backgroundColor: active ? colors.pastelPrimaryBg : colors.background,
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Ionicons name={t.icon} size={20} color={active ? colors.brandPrimary : colors.textSecondary} />
                        <AppText variant="caption" weight="bold" tone={active ? 'brand' : 'primary'}>
                          {t.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>

                <AppText variant="h3" weight="bold" style={{ marginTop: spacing.md }}>
                  Brand Accent Color
                </AppText>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  {accentPresets.map((preset) => {
                    const isSelected = customAccent === preset.id;
                    const displayColor = isDark ? preset.primaryDark : preset.primaryLight;
                    return (
                      <Pressable
                        key={preset.id}
                        onPress={() => {
                          haptics.light();
                          setCustomAccent(preset.id);
                        }}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 22,
                          backgroundColor: displayColor,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: isSelected ? 3 : 0,
                          borderColor: '#FFFFFF',
                        }}
                      >
                        {isSelected && <Ionicons name="checkmark" size={20} color="#FFFFFF" />}
                      </Pressable>
                    );
                  })}
                </View>
              </SolidCard>
            )}

            {/* Notifications */}
            {activeSection === 'notifications' && (
              <SolidCard radius={20} style={{ padding: spacing.lg, gap: spacing.md }}>
                <AppText variant="h3" weight="bold">
                  Notification Preferences
                </AppText>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold" variant="bodySmall">Push Notifications</AppText>
                    <AppText tone="secondary" variant="caption">Instant alerts for course updates and official broadcasts</AppText>
                  </View>
                  <Switch value={pushEnabled} onValueChange={setPushEnabled} />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold" variant="bodySmall">Campus Announcements</AppText>
                    <AppText tone="secondary" variant="caption">Dean notices, lecture hall changes & academic calendar</AppText>
                  </View>
                  <Switch value={announcementAlerts} onValueChange={setAnnouncementAlerts} />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold" variant="bodySmall">Events & Workshops</AppText>
                    <AppText tone="secondary" variant="caption">Reminders 1 hour before RSVP'd events start</AppText>
                  </View>
                  <Switch value={eventAlerts} onValueChange={setEventAlerts} />
                </View>
              </SolidCard>
            )}

            {/* Security & Logins */}
            {activeSection === 'security' && (
              <SolidCard radius={20} style={{ padding: spacing.lg, gap: spacing.md }}>
                <AppText variant="h3" weight="bold">
                  Security & Credentials
                </AppText>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold" variant="bodySmall">Biometric & Screen Lock</AppText>
                    <AppText tone="secondary" variant="caption">Require FaceID/TouchID or PIN when reopening app</AppText>
                  </View>
                  <Switch value={biometricShield} onValueChange={setBiometricShield} />
                </View>

                <View style={{ paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <AppButton
                    label="Change Password"
                    variant="secondary"
                    onPress={() => setPasswordModalOpen(true)}
                  />
                </View>
              </SolidCard>
            )}

            {/* Role Switcher Preview - Root Admins only, see isSuperAdmin above */}
            {isSuperAdmin && activeSection === 'preview' && (
              <SolidCard radius={20} style={{ padding: spacing.lg, gap: spacing.md }}>
                <View>
                  <AppText variant="h3" weight="bold">
                    Workspace Role Switcher
                  </AppText>
                  <AppText tone="secondary" variant="bodySmall">
                    Switch portal perspectives to preview student, faculty staff, alumni fellow, or root administrator views
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
                          router.replace(r.role === 'admin' ? '/(admin)/platform-config' : `/(${r.role})/dashboard` as any);
                        }}
                        style={{
                          flex: 1,
                          minWidth: '47%',
                          padding: spacing.md,
                          borderRadius: radius.md,
                          backgroundColor: active ? colors.brandPrimary : colors.background,
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

            {/* Terms & Policies */}
            {activeSection === 'legal' && (
              <SolidCard radius={20} style={{ padding: spacing.lg, gap: spacing.md }}>
                <AppText variant="h3" weight="bold">
                  Institutional Governance & Policies
                </AppText>

                {[
                  { title: 'Software Terms of Service', desc: 'University platform operational rules and code of conduct.' },
                  { title: 'Privacy & Data Protection Policy', desc: 'Zero third-party ads, NDPR compliance and verified encryption.' },
                  { title: 'Campus Academic Honor Code', desc: 'Academic integrity rules and anti-harassment guidelines.' },
                ].map((doc) => (
                  <Pressable
                    key={doc.title}
                    onPress={() => setLegalDoc({ title: doc.title, body: doc.desc })}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: spacing.md }}>
                      <AppText weight="bold" variant="bodySmall">{doc.title}</AppText>
                      <AppText tone="secondary" variant="caption">{doc.desc}</AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </SolidCard>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Password Modal */}
      <Modal visible={passwordModalOpen} transparent animationType="fade" onRequestClose={() => setPasswordModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: spacing.lg, width: '100%', maxWidth: 440, gap: spacing.md }}>
            <AppText variant="h3" weight="bold">Update Password</AppText>
            {passwordError && <AppText style={{ color: '#EF4444', fontSize: 12 }}>{passwordError}</AppText>}
            <AppTextField label="New Password" value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="••••••••" />
            <AppTextField label="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="••••••••" />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <AppButton label="Cancel" variant="secondary" onPress={() => setPasswordModalOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton label="Save" onPress={handleUpdatePassword} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
