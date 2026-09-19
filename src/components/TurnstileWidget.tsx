import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Platform, View, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/components/AppText';
import { Ionicons } from '@expo/vector-icons';

export interface TurnstileWidgetRef {
  reset: () => void;
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  style?: any;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          callback?: (token: string) => void;
          'error-callback'?: (errorCode?: string) => void;
          'expired-callback'?: () => void;
          size?: 'normal' | 'compact' | 'flexible';
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAE8rvj6r5JOLLpDJ';

export const TurnstileWidget = forwardRef<TurnstileWidgetRef, TurnstileWidgetProps>(function TurnstileWidget(
  { onVerify, onExpire, onError, style },
  ref
) {
  const { colors, isDark } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  // Keep references to callbacks to prevent re-renders in parent forms from tearing down the widget
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const resetWidget = () => {
    setIsVerified(false);
    if (window.turnstile && widgetIdRef.current) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        // ignore
      }
    }
  };

  useImperativeHandle(ref, () => ({
    reset: resetWidget,
  }));

  const renderWidget = () => {
    if (!containerRef.current || !window.turnstile) return;
    setLoadError(null);

    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // ignore
      }
      widgetIdRef.current = null;
    }

    try {
      const id = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: isDark ? 'dark' : 'light',
        size: 'normal',
        callback: (token: string) => {
          setLoadError(null);
          setIsVerified(true);
          onVerifyRef.current(token);
        },
        'expired-callback': () => {
          setIsVerified(false);
          onExpireRef.current?.();
        },
        'error-callback': (errorCode?: string) => {
          console.warn('Turnstile security check error:', errorCode);
          setIsVerified(false);
          setLoadError('Security check failed to verify. Tap to retry.');
          onErrorRef.current?.();
        },
      });
      widgetIdRef.current = id;
    } catch (e: any) {
      console.warn('Failed to render Turnstile widget:', e);
      setIsVerified(false);
      setLoadError('Could not initialize security check. Tap to retry.');
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    let isMounted = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const SCRIPT_ID = 'cf-turnstile-script';
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

    if (window.turnstile) {
      renderWidget();
    } else {
      if (!script) {
        script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }

      // Poll until window.turnstile is available
      let attempts = 0;
      pollInterval = setInterval(() => {
        if (!isMounted) {
          if (pollInterval) clearInterval(pollInterval);
          return;
        }
        if (window.turnstile) {
          if (pollInterval) clearInterval(pollInterval);
          renderWidget();
        } else {
          attempts++;
          if (attempts > 30) {
            // After 6 seconds, stop polling and show retry prompt
            if (pollInterval) clearInterval(pollInterval);
            setLoadError('Security check is taking longer than expected. Tap to reload.');
          }
        }
      }, 200);
    }

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [isDark]);

  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      {/* HTML Div rendered in React Native Web */}
      <div
        ref={containerRef}
        style={{
          minHeight: 65,
          width: 300,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      />
      {isVerified && (
        <View style={styles.verifiedRow}>
          <Ionicons name="checkmark-circle" size={15} color="#10B981" />
          <AppText variant="caption" style={{ color: '#10B981', marginLeft: 4, fontWeight: '600' }}>
            Security verification complete
          </AppText>
        </View>
      )}
      {loadError && (
        <Pressable
          onPress={() => {
            setLoadError(null);
            resetWidget();
            renderWidget();
          }}
          style={styles.errorContainer}
        >
          <Ionicons name="refresh-circle-outline" size={16} color={colors.critical} />
          <AppText variant="caption" style={{ color: colors.critical, marginLeft: 4 }}>
            {loadError}
          </AppText>
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    width: '100%',
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
});
