import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { ScreenContainer } from './ScreenContainer';
import { AppHeader } from './AppHeader';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { SolidCard } from './SolidCard';
import { AppButton } from './AppButton';
import { Avatar } from './Avatar';
import { AuthHeroBackground } from './AuthHeroBackground';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { getMyProfile } from '@/api/profile';

/** Ported from SettingsScreen (AdminAndOther.kt): profile card, preferences, security/privacy, legal, cache, and account actions. */
export function SettingsScreen() {
  const { colors, spacing, isDark } = useTheme();
  const { user, logout } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [forumAlerts, setForumAlerts] = useState(true);
  const [eventAlerts, setEventAlerts] = useState(true);
  const [marketAlerts, setMarketAlerts] = useState(false);
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [editingBio, setEditingBio] = useState(false);

  const [privateVisibility, setPrivateVisibility] = useState(true);
  const [biometricShield, setBiometricShield] = useState(true);
  const [dataSaver, setDataSaver] = useState(true);
  const [cacheSizeMb, setCacheSizeMb] = useState(14.8);
  const [purging, setPurging] = useState(false);

  const [eraseModalOpen, setEraseModalOpen] = useState(false);
  const eraseOpacity = useSharedValue(0);
  const eraseScale = useSharedValue(0.92);

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
  const [eraseConfirmText, setEraseConfirmText] = useState('');

  async function handleLogout() {
    await logout();
    router.replace('/(auth)/login');
  }

  async function handlePurgeCache() {
    setPurging(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setCacheSizeMb(0);
    setPurging(false);
  }

  function handleEraseProfile() {
    if (eraseConfirmText.trim().toUpperCase() !== 'ERASE') return;
    setEraseModalOpen(false);
    setEraseConfirmText('');
    Alert.alert('Not available in this build', 'Would permanently erase your academic workspace index via the backend.');
  }

  return (
    <ScreenContainer noPadding glow={false}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <AppHeader />
      </View>
      <AuthHeroBackground height={88}>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg }}>
          <AppText variant="h1" weight="bold" tone="inverse">
            Account Settings 🛠️
          </AppText>
        </View>
      </AuthHeroBackground>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg }}>
        <AppText tone="secondary" style={{ marginTop: spacing.lg, marginBottom: spacing.lg }}>
          Manage your profile preferences, visual themes, and notification scopes.
        </AppText>

        <SolidCard style={{ marginBottom: spacing.md }}>
          <AppText tone="brand" weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
            My Profile Card
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar name={profile?.fullName ?? user?.fullName ?? 'You'} size={48} />
            <View>
              <AppText weight="bold">{profile?.fullName ?? user?.fullName}</AppText>
              <AppText tone="secondary" variant="bodySmall">
                {profile?.email}
              </AppText>
            </View>
          </View>

          <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.md }} />

          <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.xs }}>
            Academic Bio
          </AppText>
          {editingBio ? (
            <AppTextField label="" value={bio} onChangeText={setBio} multiline numberOfLines={2} />
          ) : (
            <AppText tone="secondary" variant="bodySmall" onPress={() => setEditingBio(true)}>
              {bio || 'Tap to add a bio'}
            </AppText>
          )}
          {editingBio ? <AppButton label="Save" onPress={() => setEditingBio(false)} /> : null}
        </SolidCard>

        <SolidCard style={{ marginBottom: spacing.md }}>
          <AppText tone="brand" weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
            Display Preferences
          </AppText>
          <SettingRow title="Theme" description={`Currently following system setting (${isDark ? 'Dark' : 'Light'}).`} />
        </SolidCard>

        <SolidCard style={{ marginBottom: spacing.md }}>
          <AppText tone="brand" weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
            Notification Preferences
          </AppText>
          <SettingSwitchRow title="Push notifications" value={pushEnabled} onValueChange={setPushEnabled} />
          <SettingSwitchRow title="Email notifications" value={emailEnabled} onValueChange={setEmailEnabled} />
          <SettingSwitchRow title="Forum reply alerts" value={forumAlerts} onValueChange={setForumAlerts} />
          <SettingSwitchRow title="Event reminders" value={eventAlerts} onValueChange={setEventAlerts} />
          <SettingSwitchRow title="Marketplace alerts" value={marketAlerts} onValueChange={setMarketAlerts} last />
        </SolidCard>

        <SolidCard style={{ marginBottom: spacing.md }}>
          <AppText tone="brand" weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
            Security & Privacy 🔐
          </AppText>
          <SettingSwitchRow
            title={
              user?.role === 'student'
                ? 'Private Student Profile Visibility'
                : user?.role === 'alumni'
                  ? 'Private Alumni Profile Visibility'
                  : 'Private Profile Visibility'
            }
            description={
              user?.role === 'student'
                ? 'Only fellow department students see details.'
                : user?.role === 'alumni'
                  ? 'Only connected alumni and students see details.'
                  : 'Only authorized staff see your full profile details.'
            }
            value={privateVisibility}
            onValueChange={setPrivateVisibility}
          />
          <SettingSwitchRow
            title="Hardware Biometric Shield"
            description="Secure local database & profiles with fingerprint gate."
            value={biometricShield}
            onValueChange={setBiometricShield}
          />
          <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <AppText weight="bold" variant="bodySmall" style={{ color: colors.critical }}>
                SCRUB & ERASE PROFILE permanently
              </AppText>
              <AppText tone="secondary" variant="caption">
                Permanently wipe your academic workspace index.
              </AppText>
            </View>
            <AppButton label="Erase Profile" variant="accent" onPress={() => setEraseModalOpen(true)} />
          </View>
        </SolidCard>

        <SolidCard style={{ marginBottom: spacing.md }}>
          <AppText tone="brand" weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
            Legal & Compliance ⚖️
          </AppText>
          <LinkRow title="Software Terms of Service" description="Read the user operational agreement guidelines." />
          <LinkRow title="Platform Privacy Policy" description="See how your encrypted academic data is handled." last />
        </SolidCard>

        <SolidCard style={{ marginBottom: spacing.lg }}>
          <AppText tone="brand" weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
            Storage & Local Cache 💾
          </AppText>
          <SettingSwitchRow title="Data Saver Mode" description="Compress attached document images." value={dataSaver} onValueChange={setDataSaver} />
          <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: spacing.sm }}>
              <AppText weight="bold" variant="bodySmall">
                Cached Attachments & Logs
              </AppText>
              <AppText tone="secondary" variant="caption">
                Current cache weight: {cacheSizeMb.toFixed(1)} MB
              </AppText>
            </View>
            <AppButton label="Purge" variant="secondary" onPress={handlePurgeCache} loading={purging} />
          </View>
        </SolidCard>

        <SolidCard style={{ marginBottom: spacing.lg }}>
          <AppText tone="brand" weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
            Account
          </AppText>
          <AppButton
            label="Change password"
            variant="secondary"
            onPress={() => Alert.alert('Change password', 'Would open a change-password flow with a real backend.')}
            fullWidth
          />
          <View style={{ height: spacing.sm }} />
          <AppButton
            label="Export my data"
            variant="secondary"
            onPress={() => Alert.alert('Export requested', 'Your data export will be emailed to you once ready.')}
            fullWidth
          />
        </SolidCard>

        <AppButton label="Sign out" variant="secondary" onPress={handleLogout} fullWidth />
        <View style={{ height: spacing.xxl }} />
      </ScrollView>

      <Modal visible={eraseModalOpen} transparent animationType="fade" onRequestClose={() => setEraseModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Animated.View style={[{ width: '100%' }, eraseAnimatedStyle]}>
          <SolidCard style={{ width: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
              <Ionicons name="warning" size={20} color={colors.critical} />
              <AppText variant="h3" weight="bold" style={{ color: colors.critical }}>
                Erase Profile Permanently
              </AppText>
            </View>
            <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
              This permanently wipes your academic workspace index — posts, resources, event
              history, and connections. This cannot be undone. Type ERASE to confirm.
            </AppText>
            <AppTextField label="" placeholder="ERASE" value={eraseConfirmText} onChangeText={setEraseConfirmText} autoCapitalize="characters" />
            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
              <AppButton label="Cancel" variant="ghost" onPress={() => setEraseModalOpen(false)} />
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

function SettingRow({ title, description }: { title: string; description: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing.xs }}>
      <AppText weight="semiBold" variant="bodySmall">
        {title}
      </AppText>
      <AppText tone="secondary" variant="caption">
        {description}
      </AppText>
    </View>
  );
}

function LinkRow({ title, description, last }: { title: string; description: string; last?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      onPress={() =>
        Alert.alert(title, 'The full text isn\u2019t available in this preview build yet \u2014 this is a placeholder link.')
      }
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
        marginBottom: last ? 0 : spacing.xs,
      }}
    >
      <View style={{ flex: 1 }}>
        <AppText weight="semiBold" variant="bodySmall">
          {title}
        </AppText>
        <AppText tone="secondary" variant="caption">
          {description}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
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
        <AppText variant="bodySmall" weight="medium">
          {title}
        </AppText>
        {description ? (
          <AppText tone="secondary" variant="caption">
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
