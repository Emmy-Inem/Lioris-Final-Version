import React, { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSegments } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/theme/ThemeProvider';
import { useMinorStatus } from '@/hooks/useMinorStatus';
import { setMyDateOfBirth } from '@/api/minors';
import { MIN_SIGNUP_AGE } from '@/utils/age';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { DateOfBirthField, useDobFields } from './DateOfBirthField';
import { GuardianDetailsForm } from './GuardianDetailsForm';

/** Routes where the prompt never shows: sign-in flow (onboarding collects it itself) and the legal pages. */
const EXEMPT_ROOT_SEGMENTS = new Set(['(auth)', 'terms', 'privacy', 'community-rules', 'copyright']);

/**
 * Members who dismissed the prompt in this app session. Deliberately in memory only: the prompt comes back the next
 * time the app is opened (a date of birth is requested, not forced - until it is given the account counts as an
 * adult's), and it reappears for a different account signing in on the same device.
 */
const dismissedThisSession = new Set<string>();

/**
 * "Add your date of birth" for members who joined before the age rules (date of birth is NULL on the server). Shown
 * once the member has finished onboarding, never while an administrator is viewing as them, and always dismissible.
 * A 13-17 answer continues into the guardian details; an under-13 answer blocks the account and signs the member out.
 * Mounted once in app/_layout.tsx, next to the re-consent prompt.
 */
export function DateOfBirthPromptGate() {
  const { user, logout, impersonation } = useAuth();
  const segments = useSegments();
  const { colors, spacing, radius } = useTheme();
  const { status, refresh } = useMinorStatus();
  const { fields, setFields, parsed } = useDobFields();

  const [after, setAfter] = useState<'guardian' | 'blocked' | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, bump] = useState(0);

  const userId = user?.id ?? null;
  const eligible = Boolean(userId) && user?.onboardingComplete === true && !impersonation.active;
  const needsDob = Boolean(status) && status!.dateOfBirthSet === false && !(userId && dismissedThisSession.has(userId));

  const handleSave = useCallback(async () => {
    if (!parsed.iso || !understood || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await setMyDateOfBirth(parsed.iso);
      await refresh(result);
      if (result.blocked) setAfter('blocked');
      else if (result.isMinor && result.consentStatus === 'missing') setAfter('guardian');
    } catch (err: any) {
      setError(err?.message || 'We could not save your date of birth. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [parsed.iso, understood, saving, refresh]);

  const handleLater = useCallback(() => {
    if (userId) dismissedThisSession.add(userId);
    setAfter(null);
    bump((n) => n + 1);
  }, [userId]);

  const handleSignOut = useCallback(async () => {
    try {
      await logout();
    } catch {
      // logout is designed not to throw
    }
  }, [logout]);

  const rootSegment = segments[0] as string | undefined;
  if (!eligible) return null;
  if (rootSegment && EXEMPT_ROOT_SEGMENTS.has(rootSegment)) return null;
  const phase: 'dob' | 'guardian' | 'blocked' | null = after ?? (needsDob ? 'dob' : null);
  if (!phase) return null;

  const canSave = (parsed.status === 'minor' || parsed.status === 'adult' || parsed.status === 'under_13') && understood;

  return (
    <Modal visible transparent animationType="none" onRequestClose={phase === 'blocked' ? () => {} : handleLater} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <View
          role="dialog"
          accessibilityViewIsModal
          accessibilityLabel="Add your date of birth"
          style={{
            width: '100%',
            maxWidth: 480,
            maxHeight: '92%',
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
            {phase === 'dob' ? (
              <>
                <View style={{ gap: spacing.sm }}>
                  <Ionicons name="calendar-outline" size={28} color={colors.brandPrimary} />
                  <AppText variant="h3" weight="bold" accessibilityRole="header">
                    Add your date of birth
                  </AppText>
                  <AppText variant="bodySmall" tone="secondary" style={{ lineHeight: 20 }}>
                    Lioris asks every member for a date of birth so we can keep younger members safe. Other members never
                    see it. It is only used to apply our age rules, and you cannot change it yourself afterwards (an
                    administrator can correct a mistake).
                  </AppText>
                </View>

                <DateOfBirthField fields={fields} onChange={setFields} parsed={parsed} />

                <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
                  <Pressable
                    onPress={() => setUnderstood((v) => !v)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: understood }}
                    accessibilityLabel="This is my real date of birth and I understand I cannot change it myself later"
                    aria-checked={understood}
                    hitSlop={8}
                  >
                    <Ionicons name={understood ? 'checkbox' : 'square-outline'} size={22} color={understood ? colors.brandPrimary : colors.textSecondary} />
                  </Pressable>
                  <AppText variant="bodySmall" style={{ flex: 1 }}>
                    This is my real date of birth, and I understand I cannot change it myself later.
                  </AppText>
                </View>

                {error ? (
                  <AppText variant="bodySmall" tone="critical" accessibilityRole="alert">
                    {error}
                  </AppText>
                ) : null}

                <View style={{ gap: spacing.sm }}>
                  <AppButton label="Save date of birth" fullWidth loading={saving} disabled={!canSave} onPress={handleSave} />
                  <AppButton label="Not now" variant="ghost" fullWidth disabled={saving} onPress={handleLater} />
                </View>
              </>
            ) : null}

            {phase === 'guardian' ? (
              <>
                <View style={{ gap: spacing.sm }}>
                  <Ionicons name="people-outline" size={28} color={colors.brandPrimary} />
                  <AppText variant="h3" weight="bold" accessibilityRole="header">
                    Add a parent or guardian
                  </AppText>
                  <AppText variant="bodySmall" tone="secondary" style={{ lineHeight: 20 }}>
                    Thanks. Because you are under 18, we need a parent or guardian's details. You can add them now or later
                    from the banner at the top of the app. Your account has some limits until their consent is confirmed.
                  </AppText>
                </View>
                <GuardianDetailsForm
                  onSaved={async (next) => {
                    await refresh(next);
                    setAfter(null);
                  }}
                  secondaryLabel="Later"
                  onSecondary={handleLater}
                />
              </>
            ) : null}

            {phase === 'blocked' ? (
              <>
                <View style={{ gap: spacing.sm }}>
                  <Ionicons name="alert-circle-outline" size={28} color={colors.critical} />
                  <AppText variant="h3" weight="bold" accessibilityRole="header">
                    You must be {MIN_SIGNUP_AGE} or older
                  </AppText>
                  <AppText variant="bodySmall" tone="secondary" style={{ lineHeight: 20 }}>
                    Lioris is for people aged {MIN_SIGNUP_AGE} and over, so this account is now blocked. If you entered the
                    wrong date by mistake, contact support from the e-mail address on your account and an administrator can
                    correct it.
                  </AppText>
                </View>
                <AppButton label="Sign out" fullWidth onPress={handleSignOut} />
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
