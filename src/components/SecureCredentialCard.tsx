import React from 'react';
import { Linking, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';

interface SecureCredentialCardProps {
  label: string;
  description: string;
  configured: boolean;
  lastRotated?: string;
}

/**
 * Deliberate departure from the reference app's PaymentGatewayModal /
 * WebrtcKeysModal / AiKeysModal, which use plain `OutlinedTextField`s
 * (one masked with PasswordVisualTransformation) to enter and display
 * raw secret keys directly in the client. Real API/secret keys should
 * never be readable, enterable, or transmittable through a mobile app
 * UI at all — they belong in a server-side secrets manager, rotated via
 * a proper secure admin console with its own auth/audit trail. This
 * component only ever shows configuration *status*, never a value.
 */
export function SecureCredentialCard({ label, description, configured, lastRotated }: SecureCredentialCardProps) {
  const { colors, spacing } = useTheme();

  return (
    <SolidCard style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <AppText weight="bold">{label}</AppText>
          <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
            {description}
          </AppText>
        </View>
        <Badge label={configured ? 'Configured' : 'Not configured'} tone={configured ? 'success' : 'warning'} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md }}>
        <Ionicons name="lock-closed" size={13} color={colors.textSecondary} />
        <AppText variant="caption" tone="secondary">
          {configured ? `Key value hidden \u00b7 last rotated ${lastRotated ?? 'unknown'}` : 'No key on file'}
        </AppText>
      </View>

      <View style={{ marginTop: spacing.md }}>
        <AppButton
          label="Manage in secure web console"
          variant="secondary"
          onPress={() =>
            Linking.openURL('https://admin.lioris.app/settings/credentials').catch(() => {
              // No-op placeholder domain in this build.
            })
          }
          fullWidth
        />
      </View>
      <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.xs, textAlign: 'center' }}>
        Secrets are managed and rotated outside the mobile app for security.
      </AppText>
    </SolidCard>
  );
}
