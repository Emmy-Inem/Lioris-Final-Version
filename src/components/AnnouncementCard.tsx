import React from'react';
import { SolidCard } from'./SolidCard';
import { AppText } from'./AppText';
import { Badge } from'./Badge';
import { useTheme } from'@/theme/ThemeProvider';
import { Announcement } from'@/api/types';

const PRIORITY_TONE = {
  normal: 'neutral',
  high: 'warning',
  critical: 'critical',
} as const;

export function AnnouncementCard({ announcement }: { announcement: Announcement }) {
  const { spacing } = useTheme();
  return (
    <SolidCard style={{ marginBottom: spacing.md }}>
      <Badge label={announcement.priority.toUpperCase()} tone={PRIORITY_TONE[announcement.priority]} />
      <AppText variant="h3"weight="bold"style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
        {announcement.title}
      </AppText>
      <AppText tone="secondary">{announcement.content}</AppText>
      <AppText tone="secondary"variant="caption"style={{ marginTop: spacing.sm }}>
        {announcement.authorName} {'\u00b7'} {announcement.audienceScope} audience
      </AppText>
    </SolidCard>
  );
}
