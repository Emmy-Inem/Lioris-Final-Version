import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View, ViewStyle, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';
import { queryErrorCopy } from '@/utils/queryError';

export interface ErrorStateViewProps {
  title?: string;
  message?: string;
  error?: Error | unknown;
  /** What failed to load, for the default copy ("Couldn't load <subject>"). */
  subject?: string;
  onRetry?: () => void | Promise<unknown>;
  retryLabel?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
  style?: ViewStyle;
}

export function ErrorStateView({
  title,
  message,
  error,
  subject,
  onRetry,
  retryLabel = 'Try Again',
  secondaryActionLabel,
  onSecondaryAction,
  icon,
  compact = false,
  style,
}: ErrorStateViewProps) {
  const { colors, spacing, radius } = useTheme();
  const [retrying, setRetrying] = useState(false);

  // Friendly copy by failure kind (offline / permission / other); the raw error text is never shown.
  const copy = queryErrorCopy(error, subject);
  const isNetworkFailure =
    copy.kind === 'offline' || /network|connection/i.test(title || '') || /network|connection/i.test(message || '');

  const resolvedTitle = title || (isNetworkFailure ? 'Connection Interrupted' : copy.title);

  const resolvedMessage =
    message ||
    (isNetworkFailure
      ? 'Please check your internet connection or mobile data and tap below to retry.'
      : error
        ? copy.message
        : 'Something went wrong while loading this page. Tap below to reload.');

  const resolvedIcon: keyof typeof Ionicons.glyphMap = icon || (isNetworkFailure ? 'cloud-offline-outline' : copy.icon);

  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    haptics.medium();
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  if (compact) {
    return (
      <View
        style={[
          styles.compactContainer,
          {
            backgroundColor: colors.roseBg,
            borderColor: colors.critical,
            borderRadius: radius.md,
            padding: spacing.sm,
          },
          style,
        ]}
        accessibilityRole="alert"
        accessibilityLabel={`${resolvedTitle}. ${resolvedMessage}`}
      >
        <Ionicons name={resolvedIcon} size={18} color={colors.critical} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="caption" weight="bold" style={{ color: colors.critical }}>
            {resolvedTitle}
          </AppText>
          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
            {resolvedMessage}
          </AppText>
        </View>
        {onRetry && (
          <Pressable
            onPress={handleRetry}
            disabled={retrying}
            accessibilityRole="button"
            accessibilityLabel={retryLabel}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: radius.pill,
              backgroundColor: colors.critical,
            }}
          >
            {retrying ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <AppText variant="caption" weight="bold" tone="inverse">
                {retryLabel}
              </AppText>
            )}
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.fullContainer,
        {
          paddingVertical: spacing.xl,
          paddingHorizontal: spacing.lg,
        },
        style,
      ]}
      accessibilityRole="alert"
      accessibilityLabel={`${resolvedTitle}. ${resolvedMessage}`}
    >
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: colors.roseBg,
          },
        ]}
      >
        <Ionicons name={resolvedIcon} size={36} color={colors.critical} />
      </View>

      <AppText variant="h3" weight="bold" style={{ textAlign: 'center', marginBottom: spacing.xs }}>
        {resolvedTitle}
      </AppText>

      <AppText
        tone="secondary"
        variant="bodySmall"
        style={{ textAlign: 'center', maxWidth: 360, marginBottom: spacing.lg, lineHeight: 18 }}
      >
        {resolvedMessage}
      </AppText>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
        {onRetry && (
          <AppButton
            label={retryLabel}
            variant="primary"
            loading={retrying}
            onPress={handleRetry}
          />
        )}
        {secondaryActionLabel && onSecondaryAction && (
          <AppButton
            label={secondaryActionLabel}
            variant="secondary"
            onPress={onSecondaryAction}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 220,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    width: '100%',
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
});
