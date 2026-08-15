import React, { useState } from'react';
import { Pressable, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { useQueryClient } from'@tanstack/react-query';
import { AppText } from'./AppText';
import { Avatar } from'./Avatar';
import { AppButton } from'./AppButton';
import { UserProfileModal } from'./UserProfileModal';
import { useTheme } from'@/theme/ThemeProvider';
import { sendConnectionRequest } from'@/api/connections';
import { haptics } from'@/utils/haptics';

export interface SuggestedPerson {
  id: string;
  name: string;
  avatarUrl?: string | null;
  roleLabel: string;
  department: string;
  level: number;
}

export function SuggestedConnectionCard({ person, index }: { person: SuggestedPerson; index: number }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'none' | 'pending'>('none');
  const [submitting, setSubmitting] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);

  async function handleConnect() {
    haptics.medium();
    setSubmitting(true);
    try {
      await sendConnectionRequest(person.id);
      setStatus('pending');
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <View
        style={{
          width: '48%',
          borderRadius: radius.lg,
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          overflow: 'hidden',
          marginBottom: spacing.md,
          paddingTop: spacing.md,
          paddingHorizontal: spacing.sm,
          paddingBottom: spacing.md,
        }}
      >
        <Pressable
          onPress={() => {
            haptics.light();
            setInspectOpen(true);
          }}
          style={{ alignItems: 'center' }}
        >
          <View style={{ marginBottom: spacing.sm }}>
            <Avatar name={person.name} uri={person.avatarUrl} size={60} />
          </View>

          <AppText weight="bold"variant="bodySmall"numberOfLines={1}>
            {person.name}
          </AppText>
          <AppText tone="secondary"variant="caption"style={{ fontSize: 11, marginTop: 1 }}>
            {person.roleLabel}
          </AppText>
          <AppText tone="secondary"variant="caption"style={{ fontSize: 10, marginBottom: spacing.xs }}>
            {person.department}
          </AppText>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm }}>
            <Ionicons name="shield-checkmark"size={13} color={colors.brandPrimary} />
            <AppText variant="caption"weight="bold"tone="brand"style={{ fontSize: 11 }}>
              Level {person.level} • Verified
            </AppText>
          </View>
        </Pressable>

        <AppButton
          label={status === 'pending' ? 'Requested' : 'Connect'}
          onPress={handleConnect}
          disabled={status === 'pending'}
          loading={submitting}
          fullWidth
        />
      </View>

      <UserProfileModal
        visible={inspectOpen}
        onClose={() => setInspectOpen(false)}
        userId={person.id}
        userName={person.name}
        department={person.department}
      />
    </>
  );
}
