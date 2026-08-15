import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';
import { EmptyTrayIllustration } from './illustrations/EmptyTrayIllustration';

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Set false to omit the illustration (e.g. very compact inline empty states). */
  illustration?: boolean;
}

export function EmptyState({ title, description, illustration = true }: EmptyStateProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg }}>
      {illustration ? <EmptyTrayIllustration size={104} /> : null}
      <AppText variant="h3" weight="semiBold" style={{ marginTop: illustration ? spacing.md : 0, marginBottom: spacing.xs }}>
        {title}
      </AppText>
      {description ? (
        <AppText tone="secondary" style={{ textAlign: 'center' }}>
          {description}
        </AppText>
      ) : null}
    </View>
  );
}
