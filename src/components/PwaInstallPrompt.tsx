import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { useReducedMotion } from '@/theme/useReducedMotion';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';

const DISMISSED_AT_KEY = 'lioris.pwaInstallDismissedAt';
const INSTALLED_KEY = 'lioris.pwaInstalled';
const REPROMPT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 2500;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type InstallEnv = 'android' | 'ios' | 'other-mobile';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the prompt just comes back next visit.
  }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: fullscreen)').matches === true ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches === true
  );
}

function detectEnv(): InstallEnv | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  if (isIOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Mobile|Tablet/i.test(ua)) return 'other-mobile';
  return null; // Desktop browsers: this prompt is for phones.
}

/**
 * "Install Lioris" prompt for the web app on phones.
 *
 * - Chromium browsers (Android): uses the real browser install dialog through the
 *   `beforeinstallprompt` event that public/pwa-boot.js captured before React loaded.
 * - iOS / browsers without that event: shows the exact "Add to Home Screen" steps,
 *   because those platforms don't allow a programmatic install.
 * It stays away once the app is installed/running standalone, and after "Not now"
 * it waits a week before asking again.
 */
export function PwaInstallPrompt() {
  if (Platform.OS !== 'web') return null;
  return <PwaInstallPromptInner />;
}

function PwaInstallPromptInner() {
  const { colors, radius, spacing, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [env, setEnv] = useState<InstallEnv | null>(null);
  const [visible, setVisible] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  const readDeferred = useCallback(() => {
    const evt = (window as any).__liorisInstallPrompt as BeforeInstallPromptEvent | null | undefined;
    deferredRef.current = evt ?? null;
    setCanPrompt(!!evt);
  }, []);

  useEffect(() => {
    const detected = detectEnv();
    setEnv(detected);
    if (!detected || isStandalone() || readStorage(INSTALLED_KEY) === 'true') return;

    const dismissedAt = Number(readStorage(DISMISSED_AT_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < REPROMPT_AFTER_MS) return;

    readDeferred();
    const onInstallable = () => readDeferred();
    const onInstalled = () => {
      writeStorage(INSTALLED_KEY, 'true');
      setVisible(false);
    };
    window.addEventListener('lioris:installable', onInstallable);
    window.addEventListener('lioris:installed', onInstalled);
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('lioris:installable', onInstallable);
      window.removeEventListener('lioris:installed', onInstalled);
    };
  }, [readDeferred]);

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web' ? true : false,
    }).start();
  }, [visible, reduceMotion, progress]);

  const close = useCallback(
    (remember: boolean) => {
      if (remember) writeStorage(DISMISSED_AT_KEY, String(Date.now()));
      if (reduceMotion) {
        setVisible(false);
        return;
      }
      Animated.timing(progress, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web' ? true : false,
      }).start(() => setVisible(false));
    },
    [progress, reduceMotion],
  );

  const install = useCallback(async () => {
    const evt = deferredRef.current;
    if (!evt) {
      setShowSteps(true);
      return;
    }
    setInstalling(true);
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      deferredRef.current = null;
      (window as any).__liorisInstallPrompt = null;
      if (choice.outcome === 'accepted') {
        writeStorage(INSTALLED_KEY, 'true');
        close(false);
      } else {
        close(true);
      }
    } catch {
      setShowSteps(true);
    } finally {
      setInstalling(false);
    }
  }, [close]);

  if (!visible || !env) return null;

  const stepsForEnv =
    env === 'ios'
      ? [
          { icon: 'share-outline' as const, text: 'Tap the Share button in Safari’s toolbar' },
          { icon: 'add-circle-outline' as const, text: 'Choose “Add to Home Screen”' },
          { icon: 'checkmark-circle-outline' as const, text: 'Tap “Add” - Lioris opens like a normal app' },
        ]
      : [
          { icon: 'ellipsis-vertical' as const, text: 'Open your browser menu (⋮)' },
          { icon: 'download-outline' as const, text: 'Choose “Install app” or “Add to Home screen”' },
          { icon: 'checkmark-circle-outline' as const, text: 'Confirm - Lioris opens like a normal app' },
        ];

  // iOS can never prompt natively. Android Chrome can (when the browser event was captured; a
  // tap without it falls back to the steps). Other mobile browsers just get the steps.
  const showStepsPanel = showSteps || env === 'ios' || (!canPrompt && env === 'other-mobile');

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingBottom: Math.max(insets.bottom, spacing.md),
        zIndex: 9999,
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }),
          },
        ],
      }}
    >
      <View
        accessibilityRole="alert"
        style={{
          width: '100%',
          maxWidth: 440,
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.md,
          gap: spacing.sm,
          ...(Platform.OS === 'web'
            ? ({
                boxShadow: isDark ? '0 12px 40px rgba(0,0,0,0.55)' : '0 12px 40px rgba(15,23,42,0.18)',
              } as any)
            : {}),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: colors.brandPrimary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="school" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="body" weight="bold">
              Install Lioris on your phone
            </AppText>
            <AppText variant="caption" tone="secondary">
              Opens instantly from your home screen, full screen, like a real app.
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss install prompt"
            onPress={() => close(true)}
            hitSlop={12}
            style={{ alignSelf: 'flex-start', padding: 4 }}
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {showStepsPanel ? (
          <View style={{ gap: spacing.xs, paddingVertical: spacing.xs }}>
            {stepsForEnv.map((step, index) => (
              <View key={step.text} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: colors.brandPrimary + '22',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name={step.icon} size={16} color={colors.brandPrimary} />
                </View>
                <AppText variant="caption" style={{ flex: 1 }}>
                  {index + 1}. {step.text}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <AppButton label="Not now" variant="ghost" size="sm" fullWidth onPress={() => close(true)} />
          </View>
          <View style={{ flex: 1.4 }}>
            {showStepsPanel ? (
              <AppButton label="Got it" size="sm" fullWidth onPress={() => close(true)} />
            ) : (
              <AppButton label="Install app" icon="download-outline" size="sm" fullWidth loading={installing} onPress={install} />
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
