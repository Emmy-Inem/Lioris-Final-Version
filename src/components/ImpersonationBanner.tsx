import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { haptics } from '@/utils/haptics';

function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return 'ending...';
  const totalSeconds = Math.floor(msRemaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Persistent, unmissable banner shown at the root of the app whenever a Root
 * Admin is impersonating another user ("View As / Support Mode" - see
 * AuthContext.beginImpersonation/endImpersonation). Rendered once in
 * app/_layout.tsx, above the main navigation stack, so it stays visible
 * regardless of which role-route the impersonated view is currently showing.
 */
export function ImpersonationBanner() {
  const { colors, spacing } = useTheme();
  const { impersonation, endImpersonation } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  const [isEnding, setIsEnding] = useState(false);

  useEffect(() => {
    if (!impersonation.active) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [impersonation.active]);

  if (!impersonation.active) return null;

  const msRemaining = impersonation.expiresAt ? new Date(impersonation.expiresAt).getTime() - now : 0;

  const handleReturnToAdmin = async () => {
    if (isEnding) return;
    haptics.medium();
    setIsEnding(true);
    try {
      await endImpersonation();
    } finally {
      setIsEnding(false);
    }
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        backgroundColor: colors.critical,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 }}>
        <Ionicons name="eye-outline" size={16} color="#FFFFFF" />
        <AppText variant="caption" weight="bold" tone="inverse" style={{ flexShrink: 1 }}>
          Viewing as {impersonation.targetName || 'user'} - Admin Support Mode ({formatCountdown(msRemaining)})
        </AppText>
      </View>
      <Pressable
        onPress={handleReturnToAdmin}
        disabled={isEnding}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: 'rgba(255,255,255,0.22)',
          paddingVertical: 6,
          paddingHorizontal: 12,
          borderRadius: 999,
          opacity: isEnding ? 0.6 : 1,
        }}
      >
        <Ionicons name="log-out-outline" size={14} color="#FFFFFF" />
        <AppText variant="caption" weight="bold" tone="inverse">
          {isEnding ? 'Returning...' : 'Return to Admin'}
        </AppText>
      </Pressable>
    </View>
  );
}
