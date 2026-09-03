import React from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';

export function GamificationWidget() {
  const { colors, spacing, radius, isDark } = useTheme();
  const toast = useToast();

  function handleOpenLeaderboard() {
    haptics.light();
    toast.info('Leaderboard: You are ranked #3 in your faculty this week! Keep learning.');
  }

  return (
    <Pressable onPress={handleOpenLeaderboard} style={{ marginBottom: spacing.md }}>
      <SolidCard
        radius={20}
        style={{
          padding: 14,
          borderWidth: 1,
          borderColor: '#F59E0B40',
          backgroundColor: isDark ? 'rgba(36, 28, 14, 0.65)' : 'rgba(254, 243, 199, 0.65)',
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: '#F59E0B',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="flame" size={24} color="#FFF" />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppText variant="bodySmall" weight="bold">
                  12-Day Study Streak
                </AppText>
                <Badge label="Level 4" tone="brand" />
              </View>
              <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
                ⭐ 850 Scholar XP • #3 in Computer Science
              </AppText>
            </View>
          </View>

          <View style={{ alignItems: 'flex-end', flexShrink: 0, paddingLeft: 8 }}>
            <AppText variant="caption" tone="brand" weight="bold">
              Leaderboard →
            </AppText>
            <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>
              +50 XP today
            </AppText>
          </View>
        </View>
      </SolidCard>
    </Pressable>
  );
}
