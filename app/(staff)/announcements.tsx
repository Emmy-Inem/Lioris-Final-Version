import React, { useState } from'react';
import { Alert, Pressable, ScrollView, View } from'react-native';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { AppButton } from'@/components/AppButton';
import { AnnouncementCard } from'@/components/AnnouncementCard';
import { SolidCard } from'@/components/SolidCard';
import { ShimmerCardList } from'@/components/ShimmerSkeleton';
import { EmptyState } from'@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import {
  listAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  PublishAnnouncementPayload,
} from '@/api/announcements';
import { Announcement } from '@/api/types';
import { haptics } from '@/utils/haptics';
import { getFriendlyErrorMessage } from '@/utils/errors';
import { parseLocalDateTime, toDateInput } from '@/utils/dateTime';

const AUDIENCES: PublishAnnouncementPayload['audienceScope'][] = ['student', 'alumni', 'staff', 'global'];
const PRIORITIES: PublishAnnouncementPayload['priority'][] = ['normal', 'high', 'critical'];

export default function StaffAnnouncementsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);
  // Set while editing an existing announcement instead of composing a new one -
  // the form above is reused for both.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [audience, setAudience] = useState<PublishAnnouncementPayload['audienceScope']>('student');
  const [priority, setPriority] = useState<PublishAnnouncementPayload['priority']>('normal');
  // Optional expiry date (YYYY-MM-DD). Blank means "never expires". Was collected nowhere before,
  // even though Announcement.expiresAt is what AnnouncementsWidget and the dashboards filter on.
  const [expiresDate, setExpiresDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: announcements, isLoading } = useQuery({ queryKey: ['announcements'], queryFn: listAnnouncements });

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setContent('');
    setAudience('student');
    setPriority('normal');
    setExpiresDate('');
  }

  function startEdit(a: Announcement) {
    haptics.light();
    setEditingId(a.id);
    setTitle(a.title);
    setContent(a.content);
    setAudience(a.audienceScope);
    setPriority(a.priority);
    setExpiresDate(a.expiresAt ? toDateInput(new Date(a.expiresAt)) : '');
    setComposing(true);
  }

  /** "YYYY-MM-DD" -> end-of-day ISO timestamp, or undefined/null when left blank. */
  function resolveExpiresAt(): string | null | undefined {
    const trimmed = expiresDate.trim();
    if (!trimmed) return editingId ? null : undefined;
    const parsed = parseLocalDateTime(trimmed, '23:59');
    return parsed ? parsed.toISOString() : undefined;
  }

  async function handlePublish() {
    haptics.medium();
    setSubmitting(true);
    try {
      if (editingId) {
        await updateAnnouncement(editingId, {
          title,
          content,
          audienceScope: audience,
          priority,
          expiresAt: resolveExpiresAt(),
        });
      } else {
        await publishAnnouncement({ title, content, audienceScope: audience, priority, expiresAt: resolveExpiresAt() ?? undefined });
      }
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      resetForm();
      setComposing(false);
    } catch (err: any) {
      Alert.alert(
        editingId ? 'Could not save changes' : 'Could not publish',
        getFriendlyErrorMessage(err, editingId ? 'Could not save this announcement. Please try again.' : 'Could not publish announcement. Please try again.'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleDelete(a: Announcement) {
    Alert.alert('Delete this announcement?', 'It will be removed for everyone immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          haptics.medium();
          setDeletingId(a.id);
          try {
            await deleteAnnouncement(a.id);
            queryClient.invalidateQueries({ queryKey: ['announcements'] });
          } catch (err: any) {
            haptics.error();
            Alert.alert('Could not delete', getFriendlyErrorMessage(err, 'Could not delete this announcement. Please try again.'));
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  }

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: isDesktop ? spacing.xs : spacing.sm, paddingBottom: spacing.sm }}>
          <AppText variant={isDesktop ? 'h2' : 'h3'} weight="bold">
            Announcements
          </AppText>
          <AppButton
            label={composing ? 'Cancel' : 'New'}
            variant={composing ? 'ghost' : 'primary'}
            size="sm"
            onPress={() => {
              if (composing) resetForm();
              setComposing((v) => !v);
            }}
          />
        </View>

        {composing ? (
          <SolidCard style={{ marginBottom: spacing.lg }}>
            {editingId ? (
              <AppText variant="caption" weight="bold" tone="brand" style={{ marginBottom: spacing.xs }}>
                EDITING ANNOUNCEMENT
              </AppText>
            ) : null}
            <AppTextField label="Title" value={title} onChangeText={setTitle} placeholder="Midterm Advising Week" />
            <AppTextField
              label="Content" value={content}
              onChangeText={setContent}
              placeholder="Details for your audience..." multiline
              numberOfLines={4}
            />

            <AppText variant="bodySmall" weight="medium" tone="secondary" style={{ marginBottom: spacing.sm }}>
              Audience
            </AppText>
            <ChipRow options={AUDIENCES} selected={audience} onSelect={setAudience} />

            <AppText variant="bodySmall" weight="medium" tone="secondary" style={{ marginVertical: spacing.sm }}>
              Priority
            </AppText>
            <ChipRow options={PRIORITIES} selected={priority} onSelect={setPriority} />

            <AppTextField
              label="Expires on (optional)"
              value={expiresDate}
              onChangeText={setExpiresDate}
              placeholder="2026-12-31"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <AppText variant="caption" tone="secondary" style={{ marginTop: -spacing.xs, marginBottom: spacing.sm }}>
              Leave blank for an announcement that never expires. Format: YYYY-MM-DD.
            </AppText>

            <View style={{ marginTop: spacing.sm }}>
              <AppButton
                label={editingId ? 'Save changes' : 'Publish'} onPress={handlePublish}
                loading={submitting}
                disabled={!title || !content}
                fullWidth
              />
            </View>
          </SolidCard>
        ) : null}

        {isLoading ? (
          <ShimmerCardList count={3} />
        ) : announcements && announcements.length > 0 ? (
          <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
            {announcements.map((a) => (
              <View key={a.id} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 320, maxWidth: 580 } : undefined}>
                <AnnouncementCard announcement={a} />
                {a.expiresAt ? (
                  <AppText variant="caption" tone="secondary" style={{ marginTop: -spacing.sm, marginBottom: spacing.sm, marginLeft: 4 }}>
                    Expires {new Date(a.expiresAt).toLocaleDateString()}
                  </AppText>
                ) : null}
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: -spacing.xs, marginBottom: spacing.md }}>
                  <Pressable
                    onPress={() => startEdit(a)}
                    accessibilityRole="button"
                    accessibilityLabel="Edit announcement"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 4 }}
                  >
                    <Ionicons name="create-outline" size={15} color={colors.textSecondary} />
                    <AppText variant="caption" weight="semiBold" tone="secondary">Edit</AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(a)}
                    disabled={deletingId === a.id}
                    accessibilityRole="button"
                    accessibilityLabel="Delete announcement"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 4, opacity: deletingId === a.id ? 0.5 : 1 }}
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.critical} />
                    <AppText variant="caption" weight="semiBold" style={{ color: colors.critical }}>Delete</AppText>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <EmptyState title="No announcements yet" description="Publish one above to notify your audience." />
        )}
      </ScrollView>
    </ScreenContainer>
 );
}

function ChipRow<T extends string>({
 options,
 selected,
 onSelect,
}: {
 options: T[];
 selected: T;
 onSelect: (value: T) => void;
}) {
 const { colors, radius, spacing } = useTheme();
 return (
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
 {options.map((option) => {
 const isSelected = option === selected;
 return (
 <Pressable
 key={option}
 onPress={() => onSelect(option)}
 accessibilityRole="radio"accessibilityState={{ checked: isSelected }}
 accessibilityLabel={option}
 style={{
 paddingHorizontal: 11,
 paddingVertical: 6,
 borderRadius: radius.pill,
 borderWidth: 1.5,
 borderColor: isSelected ? colors.brandPrimary : colors.border,
 backgroundColor: isSelected ? `${colors.brandPrimary}18` : 'transparent',
 }}
 >
 <AppText variant="caption" weight="semiBold" tone={isSelected ? 'brand' : 'secondary'} style={{ fontSize: 11.5 }}>
 {option}
 </AppText>
 </Pressable>
 );
 })}
 </View>
 );
}
