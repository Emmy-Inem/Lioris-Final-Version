import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { Resource } from '@/api/types';

export function ResourceCard({ resource }: { resource: Resource }) {
  const { colors, spacing } = useTheme();

  return (
    <SolidCard style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            backgroundColor: `${colors.brandPrimary}18`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="document-text-outline" size={20} color={colors.brandPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText weight="bold" variant="bodySmall">
            {resource.title}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {resource.courseCode} {'\u00b7'} {resource.department}
          </AppText>
        </View>
        <Badge label={resource.category} tone="brand" />
      </View>

      <AppText tone="secondary" style={{ marginTop: spacing.sm }}>
        {resource.description}
      </AppText>

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
        <AppText tone="secondary" variant="caption">
          {resource.fileSize}
        </AppText>
        <AppText tone="secondary" variant="caption">
          {resource.downloadsCount} downloads
        </AppText>
        <AppText tone="secondary" variant="caption">
          {resource.likesCount} likes
        </AppText>
      </View>
    </SolidCard>
  );
}
