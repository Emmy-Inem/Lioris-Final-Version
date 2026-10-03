import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './AuthContext';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { SolidCard } from '@/components/SolidCard';

export function SuperAdminGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { colors, spacing } = useTheme();

  if (isLoading) return null;

  if (user && !user.isSuperAdmin) {
    return (
      <ScreenContainer glow={false}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <SolidCard radius={24} style={{ padding: spacing.xl, alignItems: 'center', maxWidth: 440, width: '100%', gap: spacing.md }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(239, 68, 68, 0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="shield-outline" size={32} color={colors.critical} />
            </View>
            <AppText variant="h2" weight="bold" style={{ textAlign: 'center' }}>
              Super Admin Privilege Required
            </AppText>
            <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', lineHeight: 20 }}>
              Access to platform-wide configuration, runtime feature toggles, security infrastructure, and multi-campus system health is strictly restricted to Super Administrators.
            </AppText>
            <View style={{ width: '100%', marginTop: spacing.sm }}>
              <AppButton
                label="Return to Overview"
                onPress={() => router.replace('/(admin)/dashboard')}
                fullWidth
              />
            </View>
          </SolidCard>
        </View>
      </ScreenContainer>
    );
  }

  return <>{children}</>;
}
