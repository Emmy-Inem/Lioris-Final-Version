import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useSegments } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { AlumniDirectoryEntry } from '@/api/types';
import { sendConnectionRequest } from '@/api/connections';
import { getOrCreateConversationWithUser } from '@/api/messaging';

const STATUS_LABEL = {
  none: null,
  pending: 'Pending',
  accepted: 'Connected',
  declined: null,
  blocked: 'Blocked',
} as const;

const ROLE_GROUPS = ['(student)', '(alumni)', '(staff)', '(admin)'];

export function DirectoryCard({ entry }: { entry: AlumniDirectoryEntry }) {
  const { spacing } = useTheme();
  const segments = useSegments();
  const roleGroup = segments[0];
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(entry.connectionStatus);
  const [submitting, setSubmitting] = useState(false);

  async function handleConnect() {
    setSubmitting(true);
    try {
      await sendConnectionRequest(entry.id);
      setStatus('pending');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMessage() {
    // DirectoryCard is also shown during (auth)/onboarding previews,
    // where there's no real messages route yet for any role.
    if (!ROLE_GROUPS.includes(roleGroup)) {
      Alert.alert('Messaging', "You'll be able to message people once you finish onboarding.");
      return;
    }
    // Previously navigated straight to `/messages/${entry.id}`,
    // assuming a conversation with that exact ID already existed —
    // if it didn't, the chat would open but never actually appear in
    // the Messages inbox list afterward. Same fix as Marketplace's
    // "Message Seller".
    try {
      const conversation = await getOrCreateConversationWithUser(entry.id, entry.fullName, entry.avatarUrl);
      router.push(`/${roleGroup}/messages/${conversation.id}` as any);
    } catch {
      Alert.alert('Couldn\u2019t start conversation', 'Please try again.');
    }
  }

  const statusLabel = STATUS_LABEL[status];

  return (
    <SolidCard style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Avatar name={entry.fullName} uri={entry.avatarUrl} size={52} />
        <View style={{ flex: 1 }}>
          <AppText variant="h3" weight="bold">
            {entry.fullName}
          </AppText>
          <AppText tone="secondary" variant="bodySmall">
            {[entry.company, entry.industry].filter(Boolean).join(' \u00b7 ')}
            {entry.graduationYear ? ` \u00b7 Class of ${entry.graduationYear}` : ''}
          </AppText>
        </View>
        {statusLabel ? <Badge label={statusLabel} tone={status === 'accepted' ? 'success' : 'warning'} /> : null}
      </View>

      {entry.bio ? (
        <AppText tone="secondary" style={{ marginTop: spacing.sm }}>
          {entry.bio}
        </AppText>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        {status === 'none' && (
          <AppButton label="Connect" onPress={handleConnect} loading={submitting} />
        )}
        <AppButton label="Message" variant="secondary" onPress={handleMessage} />
      </View>
    </SolidCard>
  );
}
