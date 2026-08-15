import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { Resource } from '@/api/types';
import { haptics } from '@/utils/haptics';

export function ResourceCard({ resource }: { resource: Resource }) {
  const { colors, spacing, radius } = useTheme();
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  function handleDownload() {
    haptics.light();
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      setDownloaded(true);
      Alert.alert('Download Complete', `${resource.title} (${resource.fileSize}) has been saved to your device.`);
    }, 600);
  }

  return (
    <SolidCard radius={20} style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.md,
            backgroundColor: colors.pastelPrimaryBg,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.brandPrimary,
          }}
        >
          <Ionicons
            name={resource.category === 'Past Questions' ? 'help-circle-outline' : 'document-text-outline'}
            size={22}
            color={colors.brandPrimary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <Badge label={resource.category} tone="brand" />
            <AppText tone="secondary" variant="caption">
              {resource.fileSize}
            </AppText>
          </View>
          <AppText weight="bold" variant="bodySmall" style={{ marginTop: 2 }}>
            {resource.title}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {resource.courseCode} &bull; {resource.department}
          </AppText>
        </View>
      </View>

      <AppText tone="secondary" variant="bodySmall" style={{ marginTop: spacing.sm, lineHeight: 18 }}>
        {resource.description}
      </AppText>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: spacing.md,
          paddingTop: spacing.xs,
          borderTopWidth: 1,
          borderTopColor: colors.divider,
        }}
      >
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="download-outline" size={14} color={colors.textSecondary} />
            <AppText tone="secondary" variant="caption">
              {resource.downloadsCount + (downloaded ? 1 : 0)}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="thumbs-up-outline" size={14} color={colors.textSecondary} />
            <AppText tone="secondary" variant="caption">
              {resource.likesCount}
            </AppText>
          </View>
        </View>

        <AppButton
          label={downloaded ? 'Saved ✓' : 'Download'}
          variant={downloaded ? 'secondary' : 'primary'}
          onPress={handleDownload}
          loading={downloading}
        />
      </View>
    </SolidCard>
  );
}
