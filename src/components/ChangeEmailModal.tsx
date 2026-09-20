import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useToast } from '@/context/ToastContext';
import { confirmEmailChange, requestEmailChange, resendEmailChangeCode } from '@/api/auth';
import { getFriendlyErrorMessage } from '@/utils/errors';
import { isValidEmailFormat } from '@/utils/validation';
import { haptics } from '@/utils/haptics';

const RESEND_COOLDOWN_SECONDS = 60;

interface ChangeEmailModalProps {
  visible: boolean;
  onClose: () => void;
  /** The address currently on the account, shown so the user knows what they are replacing. */
  currentEmail?: string;
}

/**
 * Two steps: enter the new address, then enter the 6-digit code sent to it. The account email only
 * changes once the code is confirmed, so a typo can never lock anyone out of their account.
 */
export function ChangeEmailModal({ visible, onClose, currentEmail }: ChangeEmailModalProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [step, setStep] = useState<'enter' | 'code'>('enter');
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!visible) {
      setStep('enter');
      setNewEmail('');
      setCode('');
      setError(null);
      setBusy(false);
      setCooldown(0);
    }
  }, [visible]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function handleSendCode() {
    setError(null);
    if (!isValidEmailFormat(newEmail)) {
      setError('Please enter a valid email address.');
      haptics.error();
      return;
    }
    setBusy(true);
    try {
      const { email } = await requestEmailChange(newEmail);
      setNewEmail(email);
      setStep('code');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'We could not send a code to that address. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    setError(null);
    setBusy(true);
    try {
      const { email } = await confirmEmailChange(newEmail, code);
      haptics.success();
      toast.success(`Your email is now ${email}.`);
      onClose();
    } catch (err) {
      haptics.error();
      setError(getFriendlyErrorMessage(err, 'That code did not work. Please check it and try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setError(null);
    try {
      await resendEmailChangeCode(newEmail);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success('A new code is on its way.');
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'We could not send the code right now.'));
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        accessibilityViewIsModal
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
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
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
              Change email
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {step === 'enter' ? (
            <>
              <AppText tone="secondary" variant="bodySmall">
                {currentEmail ? (
                  <>
                    You currently sign in with <AppText weight="bold" variant="bodySmall">{currentEmail}</AppText>. Use an email
                    you will always have access to, like a personal one. Your account, posts and verification stay exactly as they are.
                  </>
                ) : (
                  'Use an email you will always have access to. Your account, posts and verification stay exactly as they are.'
                )}
              </AppText>
              <AppTextField
                label="New email"
                value={newEmail}
                onChangeText={(t) => {
                  setNewEmail(t);
                  if (error) setError(null);
                }}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
              />
            </>
          ) : (
            <>
              <AppText tone="secondary" variant="bodySmall">
                We sent a 6-digit code to <AppText weight="bold" variant="bodySmall">{newEmail}</AppText>. Enter it below to finish.
                Until then, you keep signing in with your current email.
              </AppText>
              <AppTextField
                label="6-digit code"
                value={code}
                onChangeText={(t) => {
                  setCode(t.replace(/[^0-9]/g, '').slice(0, 6));
                  if (error) setError(null);
                }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="123456"
              />
              <Pressable onPress={handleResend} disabled={cooldown > 0} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
                <AppText variant="caption" tone={cooldown > 0 ? 'secondary' : 'brand'} weight="semiBold">
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => {
                  setStep('enter');
                  setCode('');
                  setError(null);
                }}
                accessibilityRole="button"
                style={{ alignSelf: 'flex-start' }}
              >
                <AppText variant="caption" tone="brand" weight="semiBold">
                  Wrong address? Go back
                </AppText>
              </Pressable>
            </>
          )}

          {error ? (
            <AppText style={{ color: colors.critical, fontSize: 12, lineHeight: 16 }} accessibilityRole="alert">
              {error}
            </AppText>
          ) : null}

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <AppButton label="Cancel" variant="secondary" onPress={onClose} disabled={busy} />
            </View>
            <View style={{ flex: 1 }}>
              {step === 'enter' ? (
                <AppButton label="Send code" onPress={handleSendCode} loading={busy} disabled={!newEmail.trim()} />
              ) : (
                <AppButton label="Confirm" onPress={handleConfirm} loading={busy} disabled={code.length < 6} />
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
