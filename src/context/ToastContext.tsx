import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

interface ToastContextValue {
  show: (options: ToastOptions | string) => void;
  success: (message: string, actionLabel?: string, onAction?: () => void) => void;
  info: (message: string, actionLabel?: string, onAction?: () => void) => void;
  warning: (message: string, actionLabel?: string, onAction?: () => void) => void;
  error: (message: string, actionLabel?: string, onAction?: () => void) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const [currentToast, setCurrentToast] = useState<ToastOptions | null>(null);
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<any>(null);

  const hideToast = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentToast(null);
    });
  }, [translateY, opacity]);

  const show = useCallback((options: ToastOptions | string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const toastOpts: ToastOptions = typeof options === 'string' ? { message: options, tone: 'info' } : options;
    setCurrentToast(toastOpts);

    if (toastOpts.tone === 'success') haptics.success();
    else if (toastOpts.tone === 'error') haptics.error();
    else haptics.light();

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        damping: 15,
        stiffness: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();

    timeoutRef.current = setTimeout(() => {
      hideToast();
    }, toastOpts.duration ?? 3500);
  }, [translateY, opacity, hideToast]);

  const success = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    show({ message, tone: 'success', actionLabel, onAction });
  }, [show]);

  const info = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    show({ message, tone: 'info', actionLabel, onAction });
  }, [show]);

  const warning = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    show({ message, tone: 'warning', actionLabel, onAction });
  }, [show]);

  const error = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    show({ message, tone: 'error', actionLabel, onAction });
  }, [show]);

  const getToneIcon = (tone?: ToastTone): { name: keyof typeof Ionicons.glyphMap; color: string } => {
    switch (tone) {
      case 'success':
        return { name: 'checkmark-circle', color: '#10B981' };
      case 'warning':
        return { name: 'warning', color: '#F59E0B' };
      case 'error':
        return { name: 'alert-circle', color: '#EF4444' };
      case 'info':
      default:
        return { name: 'information-circle', color: colors.brandPrimary };
    }
  };

  return (
    <ToastContext.Provider value={{ show, success, info, warning, error }}>
      {children}
      {currentToast && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              transform: [{ translateY }],
              opacity,
              top: isDesktop ? 24 : 54,
              left: isDesktop ? undefined : 16,
              right: isDesktop ? 32 : 16,
              maxWidth: isDesktop ? 420 : undefined,
              backgroundColor: isDark ? '#1E293B' : '#0F172A',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.08)',
            },
          ]}
        >
          <View style={styles.toastInner}>
            <Ionicons
              name={getToneIcon(currentToast.tone).name}
              size={20}
              color={getToneIcon(currentToast.tone).color}
              style={{ marginRight: 10 }}
            />
            <AppText
              variant="bodySmall"
              weight="medium"
              style={{ flex: 1, color: '#F8FAFC', fontSize: 13 }}
              numberOfLines={2}
            >
              {currentToast.message}
            </AppText>
            {currentToast.actionLabel && currentToast.onAction && (
              <Pressable
                onPress={() => {
                  currentToast.onAction?.();
                  hideToast();
                }}
                style={styles.actionBtn}
              >
                <AppText weight="bold" style={{ color: colors.brandPrimary, fontSize: 12 }}>
                  {currentToast.actionLabel}
                </AppText>
              </Pressable>
            )}
            <Pressable onPress={hideToast} hitSlop={12} style={{ marginLeft: 8 }}>
              <Ionicons name="close" size={16} color="#94A3B8" />
            </Pressable>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    zIndex: 99999,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    marginLeft: 10,
  },
});
