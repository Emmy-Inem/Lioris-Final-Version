import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useReducedMotion } from '@/theme/useReducedMotion';

const FAVICON_ASSET = require('../../assets/images/favicon.png');

interface AppLoadingScreenProps {
  message?: string;
  onRetry?: () => void;
  showTimeoutAction?: boolean;
}

export function AppLoadingScreen({
  message = 'Loading your campus workspace...',
  onRetry,
  showTimeoutAction = true,
}: AppLoadingScreenProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [showFailsafe, setShowFailsafe] = useState(false);

  useEffect(() => {
    // Gentle pulsating breath animation
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    if (!reduceMotion) pulseLoop.start();

    // 5-second failsafe: if still loading, provide recovery options
    const timer = setTimeout(() => {
      setShowFailsafe(true);
    }, 5000);

    return () => {
      pulseLoop.stop();
      clearTimeout(timer);
    };
  }, [pulseAnim, reduceMotion]);

  const handleForceContinue = () => {
    if (onRetry) {
      onRetry();
    } else {
      router.replace('/(auth)/login' as any);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Animated.View style={[styles.emblemWrapper, { transform: [{ scale: pulseAnim }] }]}>
          <Image source={FAVICON_ASSET} style={styles.emblem} resizeMode="contain" />
        </Animated.View>

        <Text style={styles.brandTitle}>Lioris</Text>
        <Text style={styles.brandSubtitle}>Campus Operating System</Text>

        <View style={styles.loaderRow} accessibilityRole="progressbar" accessibilityLabel={message} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color="#2DD4BF" />
          <Text style={styles.messageText}>{message}</Text>
        </View>

        {showTimeoutAction && showFailsafe && (
          <View style={styles.failsafeContainer}>
            <Text style={styles.failsafeNotice}>Taking longer than usual?</Text>
            <View style={styles.buttonRow}>
              <Pressable
                onPress={handleForceContinue}
                style={({ pressed }) => [styles.failsafeButton, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.failsafeButtonText}>
                  {onRetry ? 'Try Again' : 'Continue to Login'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 360,
    width: '100%',
  },
  emblemWrapper: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderWidth: 1.5,
    borderColor: 'rgba(45, 212, 191, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
      } as any,
      default: {},
    }),
  },
  emblem: {
    width: 58,
    height: 58,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  brandSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94A3B8',
    letterSpacing: 0.2,
    marginBottom: 28,
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  messageText: {
    fontSize: 13,
    color: '#E2E8F0',
    fontWeight: '500',
  },
  failsafeContainer: {
    marginTop: 32,
    alignItems: 'center',
    gap: 10,
  },
  failsafeNotice: {
    fontSize: 12,
    color: '#64748B',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  failsafeButton: {
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderWidth: 1,
    borderColor: '#2DD4BF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  failsafeButtonText: {
    color: '#2DD4BF',
    fontSize: 12,
    fontWeight: '600',
  },
});
