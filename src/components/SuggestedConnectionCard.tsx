import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { UserProfileModal } from './UserProfileModal';
import { useTheme } from '@/theme/ThemeProvider';
import { sendConnectionRequest } from '@/api/connections';
import { haptics } from '@/utils/haptics';

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
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <View
        style={{
          width: '100%',
          borderRadius: radius.md,
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.75)' : colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 12,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 10,
        }}
      >
        {/* Left: Avatar + Details */}
        <Pressable
          onPress={() => {
            haptics.light();
            setInspectOpen(true);
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}
        >
          <Avatar name={person.name} uri={person.avatarUrl} size={44} />

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText weight="bold" variant="bodySmall" numberOfLines={1} style={{ flexShrink: 1 }}>
                {person.name}
              </AppText>
              <Ionicons name="shield-checkmark" size={13} color={colors.brandPrimary} />
            </View>

            <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ fontSize: 11.5, marginTop: 1 }}>
              {person.roleLabel} • {person.department}
            </AppText>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <AppText variant="caption" tone="brand" weight="bold" style={{ fontSize: 11 }}>
                Level {person.level}
              </AppText>
              <View
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: 1.5,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
                }}
              />
              <AppText tone="secondary" variant="caption" style={{ fontSize: 11 }}>
                Verified Student
              </AppText>
            </View>
          </View>
        </Pressable>

        {/* Right: Connect CTA Button */}
        <Pressable
          onPress={handleConnect}
          disabled={status === 'pending' || submitting}
          style={({ pressed }) => ({
            paddingHorizontal: 15,
            paddingVertical: 8,
            borderRadius: radius.pill,
            backgroundColor: status === 'pending' ? colors.pastelPrimaryBg : colors.brandPrimary,
            borderWidth: status === 'pending' ? 1 : 0,
            borderColor: colors.brandPrimary,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            opacity: pressed ? 0.85 : 1,
            flexShrink: 0,
          })}
        >
          <Ionicons
            name={status === 'pending' ? 'checkmark-circle' : 'person-add'}
            size={14}
            color={status === 'pending' ? colors.brandPrimary : '#FFFFFF'}
          />
          <AppText
            variant="caption"
            weight="bold"
            style={{
              color: status === 'pending' ? colors.brandPrimary : '#FFFFFF',
              fontSize: 12,
            }}
          >
            {submitting ? '...' : status === 'pending' ? 'Requested' : 'Connect'}
          </AppText>
        </Pressable>
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
