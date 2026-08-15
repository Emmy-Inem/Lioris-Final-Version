import React from 'react';
import { FlatList, View } from 'react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { useTheme } from '@/theme/ThemeProvider';

const LOG_ENTRIES = Array.from({ length: 10 }).map((_, i) => ({
  id: `log-${i}`,
  timestamp: new Date(Date.now() - 1000 * 60 * 60 * (i + 1) * 6).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }),
  event: i % 3 === 0 ? 'AES-GCM key rotation handshake failure' : 'AES-GCM key generation success',
  status: i % 3 === 0 ? 'FAILED' : 'OK',
}));

export default function AuditLogsScreen() {
  const { colors, spacing } = useTheme();

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <AppText variant="h1" weight="bold" style={{ paddingTop: spacing.lg, marginBottom: spacing.xs }}>
        Cryptography Audit Logs
      </AppText>
      <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
        End-to-end encryption key events across the platform.
      </AppText>
      <FlatList
        data={LOG_ENTRIES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SolidCard radius={12} style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodySmall" weight="semiBold">
                  {item.event}
                </AppText>
                <AppText tone="secondary" variant="caption">
                  {item.timestamp}
                </AppText>
              </View>
              <AppText
                variant="caption"
                weight="bold"
                style={{ color: item.status === 'FAILED' ? colors.critical : colors.success }}
              >
                {item.status}
              </AppText>
            </View>
          </SolidCard>
        )}
      />
    </ScreenContainer>
  );
}
