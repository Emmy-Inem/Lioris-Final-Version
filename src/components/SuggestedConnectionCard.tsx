import React, { useState } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { sendConnectionRequest } from '@/api/connections';

const GRADIENTS: Array<[string, string]> = [
  ['#8B5CF6', '#6D28D9'], // purple
  ['#3B82F6', '#1D4ED8'], // blue
];

export interface SuggestedPerson {
  id: string;
  name: string;
  avatarUrl?: string | null;
  roleLabel: string;
  department: string;
  level: number;
}

export function SuggestedConnectionCard({ person, index }: { person: SuggestedPerson; index: number }) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'none' | 'pending'>('none');
  const [submitting, setSubmitting] = useState(false);
  const gradient = GRADIENTS[index % GRADIENTS.length];

  async function handleConnect() {
    setSubmitting(true);
    try {
      await sendConnectionRequest(person.id);
      setStatus('pending');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View
      style={{
        width: '48%',
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
        marginBottom: spacing.md,
      }}
    >
      <LinearGradient colors={gradient} style={{ height: 44 }} />
      <View style={{ alignItems: 'center', marginTop: -28, marginBottom: spacing.sm }}>
        <View style={{ borderWidth: 3, borderColor: colors.surface, borderRadius: 32 }}>
          <Avatar name={person.name} uri={person.avatarUrl} size={58} />
        </View>
      </View>
      <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md, alignItems: 'center' }}>
        <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
          {person.name}
        </AppText>
        <AppText tone="secondary" variant="caption">
          {person.roleLabel}
        </AppText>
        <AppText tone="secondary" variant="caption" style={{ marginBottom: spacing.xs }}>
          {person.department}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.sm }}>
          <Ionicons name="star" size={12} color="#F5A623" />
          <AppText variant="caption" weight="bold">
            Level {person.level}
          </AppText>
        </View>
        <AppButton
          label={status === 'pending' ? 'Requested' : '+ Connect'}
          onPress={handleConnect}
          disabled={status === 'pending'}
          loading={submitting}
          fullWidth
        />
      </View>
    </View>
  );
}
