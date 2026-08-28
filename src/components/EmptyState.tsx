import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = 'search-outline',
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { colors, spacing, radius } = useTheme();

  return (
    <View style={[styles.container, { padding: spacing.xl }]}>
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: colors.pastelPrimaryBg,
            borderRadius: 36,
          },
        ]}
      >
        <Ionicons name={icon} size={36} color={colors.brandPrimary} />
      </View>
      <AppText variant="h3" weight="bold" style={{ textAlign: 'center', marginBottom: spacing.xs }}>
        {title}
      </AppText>
      <AppText
        tone="secondary"
        variant="bodySmall"
        style={{ textAlign: 'center', maxWidth: 360, marginBottom: actionLabel ? spacing.lg : 0 }}
      >
        {description}
      </AppText>
      {actionLabel && onAction && (
        <AppButton label={actionLabel} variant="secondary" onPress={onAction} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  iconCircle: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
});
