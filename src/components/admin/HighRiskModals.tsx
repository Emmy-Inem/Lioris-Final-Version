import React, { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { SolidCard } from '@/components/SolidCard';
import { useTheme } from '@/theme/ThemeProvider';

// --- Legacy Escrow Vault ---
// Departure from the reference: "Force Release to Cold Storage" fired
// immediately on tap with no confirmation. Moving real money in bulk
// warrants a deliberate second step — this requires typing CONFIRM.
export function LegacyVaultModalContent({ onReleased }: { onReleased: (amount: number) => void }) {
  const { spacing, colors } = useTheme();
  const [confirmText, setConfirmText] = useState('');
  const canConfirm = confirmText.trim().toUpperCase() === 'CONFIRM';
  const lockedAmount = 14250.0;

  return (
    <View>
      <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
        Monitor and force-clear holding wallets for past, non-disputed transactions across all
        campuses.
      </AppText>
      <SolidCard radius={12} style={{ marginBottom: spacing.md }}>
        <AppText tone="secondary" variant="caption">
          Locked funds (global)
        </AppText>
        <AppText variant="h2" weight="bold" style={{ color: colors.critical }}>
          ${lockedAmount.toFixed(2)}
        </AppText>
      </SolidCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
        <Ionicons name="warning-outline" size={14} color={colors.critical} />
        <AppText variant="caption" tone="critical">
          This releases real funds and is logged to the audit trail. Type CONFIRM to proceed.
        </AppText>
      </View>
      <AppTextField label="" placeholder="CONFIRM" value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" />
      <AppButton
        label="Force release to cold storage"
        variant="accent"
        disabled={!canConfirm}
        onPress={() => onReleased(lockedAmount)}
        fullWidth
      />
    </View>
  );
}

// --- Role Impersonator ---
// Departure from the reference: no reason field, no visible audit
// warning. Impersonation is a significant privilege — this requires a
// target UID AND a logged reason before the button even enables.
export function ImpersonatorModalContent({ onStart }: { onStart: (targetUid: string, reason: string) => void }) {
  const { spacing, colors } = useTheme();
  const [targetUid, setTargetUid] = useState('');
  const [reason, setReason] = useState('');
  const canStart = targetUid.trim().length > 0 && reason.trim().length > 0;

  return (
    <View>
      <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
        Support teams can temporarily shadow a user's session to reproduce UI issues or verify
        routing. Every session is time-boxed and written to the audit log with the reason below.
      </AppText>
      <AppTextField label="Target user ID" placeholder="e.g. usr_9845" value={targetUid} onChangeText={setTargetUid} />
      <AppTextField
        label="Reason (required, goes to audit log)"
        placeholder="e.g. Reproducing reported dashboard bug #482"
        value={reason}
        onChangeText={setReason}
        multiline
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.textSecondary} />
        <AppText variant="caption" tone="secondary">
          Session auto-expires after 15 minutes.
        </AppText>
      </View>
      <AppButton
        label="Start shadowing"
        variant="accent"
        disabled={!canStart}
        onPress={() => onStart(targetUid.trim(), reason.trim())}
        fullWidth
      />
    </View>
  );
}
