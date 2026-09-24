import React from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '../AppText';
import { AppTextField } from '../AppTextField';
import { useTheme } from '@/theme/ThemeProvider';
import { addDays, nextSaturday, toDateInput } from '@/utils/dateTime';
import { haptics } from '@/utils/haptics';

const TIME_PICKS = [
  { label: '9 AM', value: '09:00' },
  { label: '12 PM', value: '12:00' },
  { label: '3 PM', value: '15:00' },
  { label: '6 PM', value: '18:00' },
  { label: '8 PM', value: '20:00' },
];

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      accessibilityRole="button"
      style={{
        paddingHorizontal: 11,
        paddingVertical: 5,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.brandPrimary : colors.border,
        backgroundColor: selected ? colors.pastelPrimaryBg : 'transparent',
      }}
    >
      <AppText variant="caption" weight="semiBold" tone={selected ? 'brand' : 'secondary'}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Quick date/time chips plus editable yyyy-mm-dd and HH:MM fields (same convention as the event form). */
export function DateTimeFields({
  date,
  time,
  onDateChange,
  onTimeChange,
}: {
  date: string;
  time: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
}) {
  const now = new Date();
  const picks = [
    { label: 'Today', date: now },
    { label: 'Tomorrow', date: addDays(now, 1) },
    { label: 'In 3 days', date: addDays(now, 3) },
    { label: 'Saturday', date: nextSaturday(now) },
  ];
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {picks.map((p) => (
          <Chip key={p.label} label={p.label} selected={date === toDateInput(p.date)} onPress={() => onDateChange(toDateInput(p.date))} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {TIME_PICKS.map((p) => (
          <Chip key={p.value} label={p.label} selected={time === p.value} onPress={() => onTimeChange(p.value)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1.4 }}>
          <AppTextField label="Date (YYYY-MM-DD)" value={date} onChangeText={onDateChange} placeholder="2026-10-03" autoCapitalize="none" autoCorrect={false} />
        </View>
        <View style={{ flex: 1 }}>
          <AppTextField label="Time (HH:MM)" value={time} onChangeText={onTimeChange} placeholder="15:00" autoCapitalize="none" autoCorrect={false} />
        </View>
      </View>
    </View>
  );
}
