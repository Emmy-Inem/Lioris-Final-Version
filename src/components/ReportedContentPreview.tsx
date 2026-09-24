import React from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AppText } from './AppText';
import { supabase } from '@/api/supabase';
import { Report } from '@/api/types';

/**
 * What a moderator sees under a report. Study-pod posts show the real post (moderators can read them);
 * other kinds keep the generic line until their preview is added.
 */
export function ReportedContentPreview({ report }: { report: Report }) {
  const isPodPost = report.targetType === 'pod_post';
  const { data, isLoading } = useQuery({
    queryKey: ['reported-pod-post', report.targetId],
    enabled: isPodPost,
    queryFn: async () => {
      const { data: row } = await supabase
        .from('study_group_posts')
        .select('title, body, kind, link_url, study_groups(name)')
        .eq('id', report.targetId)
        .maybeSingle();
      return row as any;
    },
  });

  if (!isPodPost) {
    return (
      <AppText variant="bodySmall" tone="secondary" style={{ fontStyle: 'italic' }}>
        Content: "Reported item flagged by community members for policy violation."
      </AppText>
    );
  }
  if (isLoading) {
    return (
      <AppText variant="bodySmall" tone="secondary">
        Loading the reported post…
      </AppText>
    );
  }
  if (!data) {
    return (
      <AppText variant="bodySmall" tone="secondary" style={{ fontStyle: 'italic' }}>
        This post was already removed.
      </AppText>
    );
  }
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="caption" tone="secondary" weight="bold">
        Study pod: {data.study_groups?.name ?? 'unknown'} · {data.kind}
      </AppText>
      {data.title ? (
        <AppText variant="bodySmall" weight="bold">
          {data.title}
        </AppText>
      ) : null}
      <AppText variant="bodySmall" numberOfLines={8}>
        {data.body}
      </AppText>
      {data.link_url ? (
        <AppText variant="caption" tone="brand" numberOfLines={1}>
          {data.link_url}
        </AppText>
      ) : null}
    </View>
  );
}
