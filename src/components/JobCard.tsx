import React from 'react';
import { Linking, View } from 'react-native';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { JobListing } from '@/api/types';

export function JobCard({ job }: { job: JobListing }) {
  const { spacing } = useTheme();

  return (
    <SolidCard style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <AppText variant="h3" weight="bold">
            {job.title}
          </AppText>
          <AppText tone="secondary" variant="bodySmall">
            {job.company} {'\u00b7'} {job.location}
          </AppText>
        </View>
        <Badge label={job.type} tone={job.type === 'Internship' ? 'accent' : 'brand'} />
      </View>

      {job.remote ? (
        <View style={{ marginTop: spacing.sm }}>
          <Badge label="Remote" tone="success" />
        </View>
      ) : null}

      <AppText tone="secondary" variant="caption" style={{ marginTop: spacing.sm }}>
        Posted by {job.postedByName}
      </AppText>

      <View style={{ marginTop: spacing.md }}>
        <AppButton label="Apply" onPress={() => Linking.openURL(job.applyUrl)} />
      </View>
    </SolidCard>
  );
}
