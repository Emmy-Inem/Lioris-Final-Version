import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { escapePostgrestLike } from '@/utils/postgrest';
import { useResponsive } from '@/hooks/useResponsive';
import { supabase } from '@/api/supabase';
import { recordAuditLogEntry } from '@/api/auditLog';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/utils/haptics';
import { useToast } from '@/hooks/useToast';

type ContentTab = 'posts' | 'resources' | 'events' | 'comments';

export default function ContentDeskScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<ContentTab>('posts');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Queries for each entity
  const { data: items, isLoading, refetch } = useQuery({
    queryKey: ['admin_content_desk', activeTab, searchQuery],
    queryFn: async () => {
      const q = searchQuery.trim().toLowerCase();
      if (activeTab === 'posts') {
        let builder = supabase
          .from('posts')
          .select('id, title, content, category, campus_code, created_at, profiles:author_id(full_name, role)')
          .order('created_at', { ascending: false })
          .limit(50);
        if (q) builder = builder.ilike('title', `%${escapePostgrestLike(q)}%`);
        const { data, error } = await builder;
        if (error) throw error;
        return (data || []).map((row: any) => ({
          id: row.id,
          title: row.title,
          subtitle: row.content?.slice(0, 100) + '...',
          category: row.category,
          campus: row.campus_code,
          author: row.profiles?.full_name || 'Anonymous',
          authorRole: row.profiles?.role || 'student',
          createdAt: row.created_at,
          type: 'posts',
        }));
      } else if (activeTab === 'resources') {
        let builder = supabase
          .from('resources')
          .select('id, title, course_code, department, file_type, campus_code, created_at, profiles:uploader_id(full_name)')
          .order('created_at', { ascending: false })
          .limit(50);
        if (q) builder = builder.ilike('title', `%${escapePostgrestLike(q)}%`);
        const { data, error } = await builder;
        if (error) throw error;
        return (data || []).map((row: any) => ({
          id: row.id,
          title: row.title,
          subtitle: `Course: ${row.course_code || 'N/A'} • Dept: ${row.department || 'General'}`,
          category: row.file_type || 'Document',
          campus: row.campus_code,
          author: row.profiles?.full_name || 'Contributor',
          authorRole: 'student',
          createdAt: row.created_at,
          type: 'resources',
        }));
      } else if (activeTab === 'events') {
        let builder = supabase
          .from('events')
          .select('id, title, description, venue, campus_code, start_time, profiles:creator_id(full_name)')
          .order('start_time', { ascending: false })
          .limit(50);
        if (q) builder = builder.ilike('title', `%${escapePostgrestLike(q)}%`);
        const { data, error } = await builder;
        if (error) throw error;
        return (data || []).map((row: any) => ({
          id: row.id,
          title: row.title,
          subtitle: `Venue: ${row.venue} • Starts: ${new Date(row.start_time).toLocaleDateString()}`,
          category: 'Event',
          campus: row.campus_code,
          author: row.profiles?.full_name || 'Organizer',
          authorRole: 'staff',
          createdAt: row.start_time,
          type: 'events',
        }));
      } else {
        // Comments
        let builder = supabase
          .from('comments')
          .select('id, content, created_at, post_id, profiles:author_id(full_name)')
          .order('created_at', { ascending: false })
          .limit(50);
        if (q) builder = builder.ilike('content', `%${escapePostgrestLike(q)}%`);
        const { data, error } = await builder;
        if (error) throw error;
        return (data || []).map((row: any) => ({
          id: row.id,
          title: row.content?.slice(0, 80) + '...',
          subtitle: `Under discussion ID: ${row.post_id?.slice(0, 8)}...`,
          category: 'Comment',
          campus: 'GLOBAL',
          author: row.profiles?.full_name || 'Commenter',
          authorRole: 'student',
          createdAt: row.created_at,
          type: 'comments',
        }));
      }
    },
  });

  async function handleDeleteItem(item: any) {
    Alert.alert(
      'Administrative Delete',
      `Are you sure you want to delete this ${item.type.slice(0, -1)}: "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            haptics.medium();
            setActionLoading(true);
            try {
              const { error } = await supabase.from(item.type).delete().eq('id', item.id);
              if (error) throw error;

              await recordAuditLogEntry({
                action: 'item_moderated',
                summary: `Admin deleted ${item.type.slice(0, -1)} "${item.title}" (ID: ${item.id})`,
                targetType: 'resource',
                targetId: item.id,
                reason: 'Administrative content moderation via Content Desk',
              });

              toast.success(`Item successfully deleted from ${item.type}.`);
              queryClient.invalidateQueries({ queryKey: ['admin_content_desk'] });
            } catch (err: any) {
              toast.error(err.message || 'Failed to delete item.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}

      {/* Screen Header */}
      <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, paddingBottom: spacing.sm }}>
        <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold">
          Unified Content Desk
        </AppText>
        <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
          Full administrative command over discussions, academic resources, campus events, and comments.
        </AppText>
      </View>

      {/* Tab Navigation */}
      <View style={{ marginVertical: spacing.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
          {(['posts', 'resources', 'events', 'comments'] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => {
                haptics.light();
                setActiveTab(tab);
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: radius.pill,
                backgroundColor: activeTab === tab ? colors.brandPrimary : colors.surface,
                borderWidth: 1,
                borderColor: activeTab === tab ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText
                variant="caption"
                weight="bold"
                style={{ color: activeTab === tab ? '#FFFFFF' : colors.textSecondary }}
              >
                {tab.toUpperCase()}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Search Input Bar */}
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
          marginBottom: spacing.md,
          gap: spacing.sm,
        }}
      >
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={`Search ${activeTab}`}
          placeholderTextColor={colors.textSecondary}
          style={{ flex: 1, color: colors.textPrimary, fontSize: 14, padding: 0 }}
        />
        {searchQuery.length > 0 && (
          <Ionicons
            name="close-circle"
            size={18}
            color={colors.textSecondary}
            onPress={() => setSearchQuery('')}
          />
        )}
      </View>

      {/* Content List */}
      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150, gap: spacing.sm }}
          renderItem={({ item }) => (
            <SolidCard frosted style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Badge label={item.category} tone="neutral" />
                    {item.campus && <Badge label={item.campus} tone="neutral" />}
                    <AppText tone="secondary" variant="caption">
                      By {item.author} ({item.authorRole}) • {new Date(item.createdAt).toLocaleDateString()}
                    </AppText>
                  </View>
                  <AppText weight="bold" style={{ fontSize: 15, marginTop: 4 }}>
                    {item.title}
                  </AppText>
                  <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
                    {item.subtitle}
                  </AppText>
                </View>

                {/* Action Button */}
                <AppButton
                  label="Delete"
                  variant="secondary"
                  size="sm"
                  onPress={() => handleDeleteItem(item)}
                  loading={actionLoading}
                />
              </View>
            </SolidCard>
          )}
          ListEmptyComponent={
            <EmptyState
              title={`No ${activeTab} found`}
              description={searchQuery ? 'Try adjusting your search criteria.' : `No records found in ${activeTab}.`}
            />
          }
        />
      )}
    </ScreenContainer>
  );
}
