import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Platform,
  Easing,
} from 'react-native';
import { Image } from 'expo-image';
import { useReducedMotion } from '@/theme/useReducedMotion';
import { useSafeTheme } from '@/theme/ThemeProvider';

const EMBLEM_ASSET = require('../../assets/images/lioris_emblem.png');

interface AppLoadingScreenProps {
  message?: string;
  onRetry?: () => void;
  showTimeoutAction?: boolean;
}

const LOADING_HINTS = [
  'Establishing secure campus connection...',
  'Syncing academic networks & feeds...',
  'Verifying session security tokens...',
  'Preparing your campus workspace...',
];

export function AppLoadingScreen({
  message = 'Loading your campus workspace...',
  onRetry,
  showTimeoutAction = true,
}: AppLoadingScreenProps) {
  const { colors, isDark } = useSafeTheme();
  const reduceMotion = useReducedMotion();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  const [showFailsafe, setShowFailsafe] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;

    // Gentle pulsating breath animation for emblem
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // Synchronized ambient glow breath
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.85,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.35,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // Continuous shimmer loop for progress bar
    const shimmerLoop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1600,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );

    pulseLoop.start();
    glowLoop.start();
    shimmerLoop.start();

    return () => {
      pulseLoop.stop();
      glowLoop.stop();
      shimmerLoop.stop();
    };
  }, [pulseAnim, glowAnim, shimmerAnim, reduceMotion]);

  // Rotate subtle status hints if loading takes longer
  useEffect(() => {
    const interval = setInterval(() => {
      setHintIndex((prev) => (prev + 1) % LOADING_HINTS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  // 6-second failsafe: if still loading, provide recovery options
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowFailsafe(true);
    }, 6000);

    return () => clearTimeout(timer);
  }, []);

  const handleReload = () => {
    if (onRetry) {
      onRetry();
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const currentMessage = message !== 'Loading your campus workspace...' ? message : LOADING_HINTS[hintIndex];

  // Calculate shimmer translateX (-100 -> 240)
  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 240],
  });

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? '#0A1326' : '#F8FAF9' },
      ]}
    >
      {/* Subtle atmospheric ambient glow */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ambientGlow,
          {
            opacity: glowAnim,
            backgroundColor: isDark ? 'rgba(26, 61, 255, 0.22)' : 'rgba(26, 61, 255, 0.12)',
          },
        ]}
      />

      <View style={styles.content}>
        {/* Emblem with liquid glass styling */}
        <Animated.View
          style={[
            styles.emblemContainer,
            {
              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.92)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(26, 61, 255, 0.15)',
              transform: [{ scale: pulseAnim }],
              shadowColor: colors.brandPrimary,
            },
          ]}
        >
          <Image
            source={EMBLEM_ASSET}
            style={styles.emblem}
            contentFit="contain"
            transition={200}
            priority="high"
            alt="Lioris emblem"
          />
        </Animated.View>

        {/* Brand Titles */}
        <Text style={[styles.brandTitle, { color: isDark ? '#FFFFFF' : '#0A1326' }]}>
          Lioris
        </Text>
        <Text style={[styles.brandSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
          Campus Operating System
        </Text>

        {/* Sleek Modern Indeterminate Shimmer Progress Bar */}
        <View
          style={[
            styles.progressTrack,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
            },
          ]}
        >
          <Animated.View
            style={[
              styles.progressBar,
              {
                backgroundColor: colors.brandPrimary,
                transform: [{ translateX: shimmerTranslateX }],
              },
            ]}
          />
        </View>

        {/* Modern Glass Pill for Status Message */}
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.70)' : 'rgba(255, 255, 255, 0.85)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.06)',
            },
          ]}
          accessibilityRole="progressbar"
          accessibilityLabel={currentMessage}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator size="small" color={colors.brandPrimary} />
          <Text
            style={[
              styles.messageText,
              { color: isDark ? '#E2E8F0' : '#1E293B' },
            ]}
            numberOfLines={1}
          >
            {currentMessage}
          </Text>
        </View>

        {/* Helpful non-destructive recovery if loading takes longer */}
        {showTimeoutAction && showFailsafe && (
          <View style={styles.failsafeContainer}>
            <Text style={[styles.failsafeNotice, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Taking longer than usual?
            </Text>
            <View style={styles.buttonRow}>
              <Pressable
                onPress={handleReload}
                style={({ pressed }) => [
                  styles.reloadButton,
                  {
                    backgroundColor: isDark ? 'rgba(26, 61, 255, 0.18)' : '#EDF2FF',
                    borderColor: isDark ? 'rgba(106, 137, 255, 0.4)' : '#1A3DFF',
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Reload page"
              >
                <Text
                  style={[
                    styles.reloadButtonText,
                    { color: isDark ? '#6A89FF' : '#1A3DFF' },
                  ]}
                >
                  Reload Page
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    position: 'relative',
  },
  ambientGlow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    ...Platform.select({
      web: {
        filter: 'blur(70px)',
      } as any,
      default: {},
    }),
  },
  content: {
    alignItems: 'center',
    maxWidth: 380,
    width: '100%',
    zIndex: 1,
  },
  emblemContainer: {
    width: 88,
    height: 88,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      } as any,
      default: {},
    }),
  },
  emblem: {
    width: 68,
    height: 68,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: 4,
  },
  brandSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 26,
  },
  progressTrack: {
    width: 180,
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 0.5,
    marginBottom: 20,
  },
  progressBar: {
    width: 70,
    height: '100%',
    borderRadius: 999,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 340,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      } as any,
      default: {},
    }),
  },
  messageText: {
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  failsafeContainer: {
    marginTop: 28,
    alignItems: 'center',
    gap: 10,
  },
  failsafeNotice: {
    fontSize: 12,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  reloadButton: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1.2,
  },
  reloadButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
