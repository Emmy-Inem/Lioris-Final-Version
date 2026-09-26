import React, { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { queryClient } from '@/api/queryClient';
import { haptics } from '@/utils/haptics';

// Wires NetInfo into React Query's own online/offline tracking, so
// queries automatically pause retries while offline and refetch the
// moment connectivity returns. Supports both native NetInfo and web online/offline events.
export function setupNetworkAwareQueries() {
  onlineManager.setEventListener((setOnline) => {
    // 1. NetInfo subscription (Native & Web)
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    });

    // 2. Direct browser window listeners when on web
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleOnline = () => setOnline(true);
      const handleOffline = () => setOnline(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        unsubscribeNetInfo();
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return unsubscribeNetInfo;
  });
}

/**
 * A slim, non-blocking banner - appears at the top of the screen only
 * while offline, disappears the instant connectivity returns.
 * Tap banner to test connectivity and resume pending queries.
 */
export function OfflineBanner() {
  const { colors, spacing } = useTheme();
  const [isOffline, setIsOffline] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!(state.isConnected && state.isInternetReachable !== false));
    });

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        unsubscribe();
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return unsubscribe;
  }, []);

  const handleCheckConnection = async () => {
    haptics.light();
    setChecking(true);
    try {
      const state = await NetInfo.refresh();
      const online = !!state.isConnected && state.isInternetReachable !== false;
      setIsOffline(!online);
      if (online) {
        await queryClient.refetchQueries({ type: 'active' });
      }
    } finally {
      setChecking(false);
    }
  };

  if (!isOffline) return null;

  return (
    <Pressable
      onPress={handleCheckConnection}
      accessibilityRole="button"
      accessibilityLabel="Offline banner: tap to check connection"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: colors.critical,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
      }}
    >
      <Ionicons name="cloud-offline-outline" size={14} color="#FFFFFF" />
      <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 11.5 }}>
        {checking
          ? 'Checking network connection...'
          : "You're offline — tap to reconnect"}
      </AppText>
      <Ionicons name="refresh-outline" size={12} color="#FFFFFF" style={{ opacity: 0.9 }} />
    </Pressable>
  );
}
