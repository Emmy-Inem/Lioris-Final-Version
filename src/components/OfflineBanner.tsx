import React, { useEffect, useState } from'react';
import { View } from'react-native';
import NetInfo from'@react-native-community/netinfo';
import { onlineManager } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { useTheme } from'@/theme/ThemeProvider';

// Wires NetInfo into React Query's own online/offline tracking, so
// queries automatically pause retries while offline and refetch the
// moment connectivity returns — this app had zero offline awareness
// before (no NetInfo usage anywhere), meaning a lost connection just
// looked like every request silently hanging or failing with no
// explanation. Call this once, near the app root.
export function setupNetworkAwareQueries() {
  onlineManager.setEventListener((setOnline) => {
    return NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    });
  });
}

/**
 * A slim, non-blocking banner — appears at the top of the screen only
 * while offline, disappears the instant connectivity returns. Mounted
 * once at the root so it applies everywhere rather than needing to be
 * added to every screen individually.
 */
export function OfflineBanner() {
  const { colors, spacing } = useTheme();
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!(state.isConnected && state.isInternetReachable !== false));
    });
    return unsubscribe;
  }, []);

  if (!isOffline) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: colors.critical,
        paddingVertical: spacing.xs,
      }}
    >
      <Ionicons name="cloud-offline-outline"size={14} color="#FFFFFF" />
      <AppText variant="caption"weight="bold"tone="inverse">
        You&apos;re offline — some things may not load
      </AppText>
    </View>
  );
}
