import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../AppText';
import { AppTextField } from '../AppTextField';
import { AppButton } from '../AppButton';
import { FormSheet } from '../common/FormSheet';
import { useTheme } from '@/theme/ThemeProvider';
import { verifyMfaCode } from '@/api/auth';
import { haptics } from '@/utils/haptics';

/**
 * Shown when an admin action answers `mfa_required`: the admin enters the 6-digit authenticator code, and
 * `onVerified` retries whatever was refused. Same behaviour as the User Directory's step-up prompt.
 */
export function MfaStepUpModal({
  visible,
  title = 'Two-factor verification',
  onCancel,
  onVerified,
}: {
  visible: boolean;
  title?: string;
  onCancel: () => void;
  onVerified: () => void | Promise<void>;
}) {
  const { colors, spacing } = useTheme();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (visible) {
      setCode('');
      setError(null);
    }
  }, [visible]);

  async function submit() {
    if (checking || code.length !== 6) return;
    setChecking(true);
    setError(null);
    try {
      await verifyMfaCode(code);
    } catch (err: any) {
      haptics.error();
      const message: string = err?.message || 'That code was not accepted. Please try again.';
      setError(
        /not set up/i.test(message)
          ? 'This action needs two-factor authentication, but it is not turned on for your account. Turn it on in Settings > Security, then try again.'
          : message,
      );
      setChecking(false);
      return;
    }
    setChecking(false);
    await onVerified();
  }

  return (
    <FormSheet
      visible={visible}
      onClose={onCancel}
      title={title}
      maxWidth={440}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <AppButton label="Cancel" variant="secondary" onPress={onCancel} fullWidth />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton label="Verify" onPress={submit} loading={checking} disabled={code.length !== 6} fullWidth />
          </View>
        </View>
      }
    >
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.brandPrimary} />
        <AppText tone="secondary" variant="bodySmall" style={{ flex: 1, lineHeight: 19 }}>
          Enter the 6-digit code from your authenticator app to confirm it is really you. The action continues as soon as the code is accepted.
        </AppText>
      </View>
      <AppTextField
        label="6-digit code"
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        onSubmitEditing={submit}
        error={error ?? undefined}
      />
    </FormSheet>
  );
}
