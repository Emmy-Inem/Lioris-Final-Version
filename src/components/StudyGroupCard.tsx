import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { FormSheet } from './common/FormSheet';
import { useTheme } from '@/theme/ThemeProvider';
import { useToast } from '@/context/ToastContext';
import { StudyGroup } from '@/api/types';
import { joinStudyGroup, leaveStudyGroup } from '@/api/studyGroups';
import { formatWhen } from '@/utils/dateTime';
import { parseRpcError } from '@/utils/rpcErrors';
import { haptics } from '@/utils/haptics';

export function openPod(id: string) {
  router.push(`/(student)/pod/${id}` as any);
}

function Pill({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'brand' | 'warning' | 'success'; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors, radius } = useTheme();
  const fg = tone === 'brand' ? colors.brandPrimary : tone === 'warning' ? colors.warning : tone === 'success' ? colors.success : colors.textSecondary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: tone === 'brand' ? colors.pastelPrimaryBg : colors.divider }}>
      {icon ? <Ionicons name={icon} size={11} color={fg} /> : null}
      <AppText variant="caption" weight="bold" style={{ color: fg, fontSize: 10.5 }}>
        {label}
      </AppText>
    </View>
  );
}

/** One pod in the list. Members open it; everyone else can join, ask to join (private) or see it is full. */
export function StudyGroupCard({ group, onJoined }: { group: StudyGroup; onJoined?: () => void }) {
  const { colors, spacing } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [message, setMessage] = useState('');

  const member = group.myStatus === 'active';
  const pending = group.myStatus === 'pending';
  const full = !!group.maxMembers && group.memberCount >= group.maxMembers && !member;

  async function join(note?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const { status } = await joinStudyGroup(group.id, note);
      haptics.success();
      onJoined?.();
      if (status === 'active') {
        toast.success(`You joined ${group.name}.`);
        openPod(group.id);
      } else {
        toast.success('Request sent. The pod owner will let you know.');
      }
    } catch (err) {
      haptics.error();
      toast.error(parseRpcError(err).message);
      onJoined?.();
    } finally {
      setBusy(false);
      setAskOpen(false);
      setMessage('');
    }
  }

  async function cancelRequest() {
    setBusy(true);
    try {
      await leaveStudyGroup(group.id);
      onJoined?.();
    } catch (err) {
      toast.error(parseRpcError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SolidCard radius={20} style={{ gap: spacing.sm }}>
      <Pressable onPress={() => (member ? openPod(group.id) : undefined)} accessibilityRole={member ? 'button' : undefined} style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {group.courseCode ? <Pill label={group.courseCode} tone="brand" /> : null}
          <Pill label={group.isPublic ? 'Public' : 'Private'} icon={group.isPublic ? 'earth-outline' : 'lock-closed-outline'} />
          {group.myRole === 'owner' || group.myRole === 'moderator' ? <Pill label={group.myRole === 'owner' ? 'You run this' : 'Moderator'} tone="success" /> : null}
          <View style={{ flex: 1 }} />
          {member && group.unreadCount > 0 ? (
            <View style={{ backgroundColor: colors.brandPrimary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <AppText weight="bold" style={{ color: '#FFFFFF', fontSize: 10.5 }}>
                {group.unreadCount > 99 ? '99+' : group.unreadCount} new
              </AppText>
            </View>
          ) : null}
        </View>

        <View style={{ gap: 2 }}>
          <AppText variant="h3" weight="bold">
            {group.name}
          </AppText>
          {group.description ? (
            <AppText tone="secondary" variant="bodySmall" numberOfLines={2} style={{ lineHeight: 18 }}>
              {group.description}
            </AppText>
          ) : null}
        </View>

        {group.topics.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {group.topics.slice(0, 4).map((t) => (
              <AppText key={t} variant="caption" tone="secondary">
                #{t}
              </AppText>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="people-outline" size={14} color={colors.textSecondary} />
            <AppText variant="caption" tone="secondary">
              {group.memberCount}
              {group.maxMembers ? `/${group.maxMembers}` : ''} member{group.memberCount === 1 ? '' : 's'}
            </AppText>
          </View>
          {group.level ? (
            <AppText variant="caption" tone="secondary">
              {group.level}
            </AppText>
          ) : null}
          {group.scheduleNote ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="repeat-outline" size={14} color={colors.textSecondary} />
              <AppText variant="caption" tone="secondary">
                {group.scheduleNote}
              </AppText>
            </View>
          ) : null}
          {member && group.nextSessionAt ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="calendar-outline" size={14} color={colors.brandPrimary} />
              <AppText variant="caption" tone="brand" weight="semiBold">
                Next: {formatWhen(group.nextSessionAt)}
              </AppText>
            </View>
          ) : null}
        </View>
      </Pressable>

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm }}>
        {member ? (
          <>
            {group.pendingCount > 0 ? (
              <AppText variant="caption" tone="accent" weight="semiBold" style={{ marginRight: 'auto' }}>
                {group.pendingCount} join request{group.pendingCount === 1 ? '' : 's'} waiting
              </AppText>
            ) : null}
            <AppButton label="Open pod" size="sm" onPress={() => openPod(group.id)} />
          </>
        ) : pending ? (
          <>
            <AppText variant="caption" tone="secondary" style={{ marginRight: 'auto' }}>
              Waiting for the owner to approve you
            </AppText>
            <AppButton label="Cancel request" size="sm" variant="ghost" onPress={cancelRequest} loading={busy} />
          </>
        ) : full ? (
          <AppButton label="Pod is full" size="sm" variant="secondary" disabled />
        ) : group.isPublic ? (
          <AppButton label="Join pod" size="sm" onPress={() => join()} loading={busy} />
        ) : (
          <AppButton label="Ask to join" size="sm" variant="secondary" onPress={() => setAskOpen(true)} />
        )}
      </View>

      <FormSheet
        visible={askOpen}
        onClose={() => setAskOpen(false)}
        title={`Ask to join ${group.name}`}
        subtitle="This pod is private. The owner reviews every request."
        footer={<AppButton label="Send request" onPress={() => join(message)} loading={busy} fullWidth />}
      >
        <AppTextField label="Message (optional)" value={message} onChangeText={(v) => setMessage(v.slice(0, 300))} placeholder="Say who you are and why you want to join." multiline numberOfLines={3} />
      </FormSheet>
    </SolidCard>
  );
}
