import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View, ActivityIndicator } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { SolidCard } from '@/components/SolidCard';
import { EmptyState } from '@/components/EmptyState';
import { ForumsModerationTab } from '@/components/admin/ForumsModerationTab';
import { EventsModerationTab } from '@/components/admin/EventsModerationTab';
import { ResourcesModerationTab } from '@/components/admin/ResourcesModerationTab';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { escapePostgrestLike } from '@/utils/postgrest';
import { supabase } from '@/api/supabase';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';
import { useToast } from '@/hooks/useToast';

/**
 * Everything members publish, in one place. Each tab is the full management surface for that kind of
 * content (create / edit / approve / pin / delete), replacing the copies that used to live on the
 * Command Desk, the Overview dashboard and a separate delete-only list.
 */
const TABS = [
  { key: 'threads', label: 'Threads & Communities', icon: 'chatbubbles-outline' as const },
  { key: 'events', label: 'Events', icon: 'calendar-outline' as const },
  { key: 'resources', label: 'Resources', icon: 'folder-open-outline' as const },
  { key: 'comments', label: 'Comments', icon: 'chatbox-ellipses-outline' as const },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function ContentDeskScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const [tab, setTab] = useState<TabKey>('threads');

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150 }}
      >
        <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, paddingBottom: spacing.sm }}>
          <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold">
            Content
          </AppText>
          <AppText tone="secondary" variant="caption">
            Manage what members publish: threads, events, resources and comments
          </AppText>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.md }}
          style={{ marginBottom: spacing.md, flexGrow: 0 }}
          {...({ 'data-horizontal-scroll': 'true' } as any)}
        >
          {TABS.map((t) => {
            const selected = tab === t.key;
            return (
              <Pressable
                key={t.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => {
                  haptics.light();
                  setTab(t.key);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 38,
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  backgroundColor: selected ? colors.brandPrimary : colors.surface,
                  borderWidth: 1,
                  borderColor: selected ? colors.brandPrimary : colors.border,
                }}
              >
                <Ionicons name={t.icon} size={15} color={selected ? '#FFFFFF' : colors.textSecondary} />
                <AppText variant="bodySmall" weight={selected ? 'bold' : 'semiBold'} tone={selected ? 'inverse' : 'secondary'}>
                  {t.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {tab === 'threads' ? <ForumsModerationTab /> : null}
        {tab === 'events' ? <EventsModerationTab /> : null}
        {tab === 'resources' ? <ResourcesModerationTab /> : null}
        {tab === 'comments' ? <CommentsPanel /> : null}
      </ScrollView>
    </ScreenContainer>
  );
}

/** Newest comments across the platform, searchable, with removal. */
function CommentsPanel() {
  const { colors, spacing, radius } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: comments, isLoading, error, refetch } = useQuery({
    queryKey: ['admin_content_desk', 'comments', searchQuery],
    queryFn: async () => {
      const q = searchQuery.trim();
      let builder = supabase
        .from('comments')
        .select('id, content, created_at, post_id, profiles:author_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (q) builder = builder.ilike('content', `%${escapePostgrestLike(q)}%`);
      const { data, error: queryError } = await builder;
      if (queryError) throw queryError;
      return (data || []).map((row: any) => ({
        id: row.id as string,
        text: String(row.content ?? ''),
        postId: row.post_id as string | null,
        author: (row.profiles?.full_name as string) || 'Member',
        createdAt: row.created_at as string,
      }));
    },
  });

  function confirmDelete(comment: { id: string; text: string }) {
    Alert.alert('Delete comment?', `"${comment.text.slice(0, 120)}"\n\nThis permanently removes the comment.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          haptics.medium();
          setDeletingId(comment.id);
          try {
            const { error: deleteError } = await supabase.from('comments').delete().eq('id', comment.id);
            if (deleteError) throw deleteError;
            await recordAuditLogEntry({
              action: 'item_moderated',
              summary: `Admin deleted a comment (ID: ${comment.id})`,
              targetType: 'post',
              targetId: comment.id,
              reason: 'Administrative content moderation',
            });
            toast.success('Comment deleted.');
            queryClient.invalidateQueries({ queryKey: ['admin_content_desk'] });
          } catch (err: any) {
            toast.error(err?.message || 'Could not delete the comment.');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.md,
          paddingVertical: 10,
          gap: spacing.sm,
        }}
      >
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search comments"
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel="Search comments"
          style={{ flex: 1, color: colors.textPrimary, fontSize: 14, padding: 0 }}
        />
        {searchQuery.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearchQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : error ? (
        <SolidCard radius={16} style={{ borderWidth: 1, borderColor: `${colors.critical}55` }}>
          <AppText weight="bold" variant="bodySmall">Could not load comments</AppText>
          <AppText tone="secondary" variant="caption" style={{ marginVertical: spacing.xs }}>
            {(error as Error).message}
          </AppText>
          <AppButton label="Retry" size="sm" variant="secondary" onPress={() => refetch()} />
        </SolidCard>
      ) : (comments ?? []).length === 0 ? (
        <EmptyState title="No comments found" description={searchQuery ? 'Try a different search.' : 'Nothing has been commented yet.'} />
      ) : (
        (comments ?? []).map((comment) => (
          <SolidCard key={comment.id} frosted style={{ padding: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText tone="secondary" variant="caption">
                  {comment.author} · {new Date(comment.createdAt).toLocaleDateString()}
                </AppText>
                <AppText variant="bodySmall" style={{ marginTop: 2 }} numberOfLines={4}>
                  {comment.text}
                </AppText>
              </View>
              <AppButton
                label="Delete"
                variant="secondary"
                size="sm"
                onPress={() => confirmDelete(comment)}
                loading={deletingId === comment.id}
              />
            </View>
          </SolidCard>
        ))
      )}
    </View>
  );
}
