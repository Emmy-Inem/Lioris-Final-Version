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
      <AppText variant="bodySmall" weight="bold" numberOfLines={2} style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
        {announcement.title}
      </AppText>
      <AppText variant="bodySmall" tone="secondary" numberOfLines={3} style={{ lineHeight: 18 }}>
        {announcement.content}
      </AppText>
      <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: spacing.sm, fontSize: 11 }}>
        {announcement.authorName} {'\u00b7'} {announcement.audienceScope} audience
      </AppText>
 </SolidCard>
 );
}
