import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../AppText';
import { useTheme } from '@/theme/ThemeProvider';

/** Read-only when `onChange` is omitted. `value` may be fractional for averages (rounded to the nearest half star). */
export function StarRating({
  value,
  onChange,
  size = 16,
  showValue,
  count,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  showValue?: boolean;
  count?: number;
}) {
  const { colors } = useTheme();
  const star = '#F59E0B';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const name: keyof typeof Ionicons.glyphMap = value >= n - 0.25 ? 'star' : value >= n - 0.75 ? 'star-half' : 'star-outline';
        const icon = <Ionicons name={name} size={size} color={name === 'star-outline' ? colors.textSecondary : star} />;
        return onChange ? (
          <Pressable key={n} onPress={() => onChange(n)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}>
            {icon}
          </Pressable>
        ) : (
          <View key={n}>{icon}</View>
        );
      })}
      {showValue ? (
        <AppText weight="bold" variant="caption" style={{ marginLeft: 4 }}>
          {value.toFixed(1)}
          {typeof count === 'number' ? <AppText tone="secondary" variant="caption">{` (${count})`}</AppText> : null}
        </AppText>
      ) : null}
    </View>
  );
}
