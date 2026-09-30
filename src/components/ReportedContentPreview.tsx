import React from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AppText } from './AppText';
import { supabase } from '@/api/supabase';
import { Report } from '@/api/types';

/**
 * What a moderator sees under a report. Study-pod posts, marketplace listings and job postings show the
 * real content (moderators can read them); other kinds keep the generic line until their preview is added.
 */
export function ReportedContentPreview({ report }: { report: Report }) {
  const isPodPost = report.targetType === 'pod_post';
  const isListing = report.targetType === 'marketplace_listing';
  const isJob = report.targetType === 'job';
  const hasPreview = isPodPost || isListing || isJob;

  const { data, isLoading } = useQuery({
    queryKey: ['reported-content', report.targetType, report.targetId],
    enabled: hasPreview,
    queryFn: async () => {
      if (isPodPost) {
        const { data: row } = await supabase
          .from('study_group_posts')
          .select('title, body, kind, link_url, study_groups(name)')
          .eq('id', report.targetId)
          .maybeSingle();
        return row as any;
      }
      if (isListing) {
        const { data: row } = await supabase
          .from('marketplace_listings')
          .select('title, description, price_display, category, condition, seller:profiles(full_name)')
          .eq('id', report.targetId)
          .maybeSingle();
        return row as any;
      }
      const { data: row } = await supabase
        .from('jobs')
        .select('title, company, location, description, poster:profiles(full_name)')
        .eq('id', report.targetId)
        .maybeSingle();
      return row as any;
    },
  });

  if (!hasPreview) {
    return (
      <AppText variant="bodySmall" tone="secondary" style={{ fontStyle: 'italic' }}>
        Content: "Reported item flagged by community members for policy violation."
      </AppText>
    );
  }
  if (isLoading) {
    return (
      <AppText variant="bodySmall" tone="secondary">
        Loading the reported content…
      </AppText>
    );
  }
  if (!data) {
    return (
      <AppText variant="bodySmall" tone="secondary" style={{ fontStyle: 'italic' }}>
        This item was already removed.
      </AppText>
    );
  }

  if (isListing) {
    return (
      <View style={{ gap: 2 }}>
        <AppText variant="caption" tone="secondary" weight="bold">
          Marketplace · {data.category} · listed by {data.seller?.full_name ?? 'unknown'}
        </AppText>
        <AppText variant="bodySmall" weight="bold">
          {data.title} · {data.price_display}
        </AppText>
        <AppText variant="bodySmall" numberOfLines={8}>
          {data.description}
        </AppText>
      </View>
    );
  }

  if (isJob) {
    return (
      <View style={{ gap: 2 }}>
        <AppText variant="caption" tone="secondary" weight="bold">
          Job posting · posted by {data.poster?.full_name ?? 'unknown'}
        </AppText>
        <AppText variant="bodySmall" weight="bold">
          {data.title} · {data.company} · {data.location}
        </AppText>
        <AppText variant="bodySmall" numberOfLines={8}>
          {data.description}
        </AppText>
      </View>
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
