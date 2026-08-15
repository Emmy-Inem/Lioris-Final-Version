import React from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeProvider';

interface ChipSelectProps<T extends string> {
  options: T[];
  selected: T[];
  onToggle: (value: T) => void;
}

export function ChipSelect<T extends string>({ options, selected, onToggle }: ChipSelectProps<T>) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {options.map((option) => {
        const isSelected = selected.includes(option);
        return (
          <Pressable
            key={option}
            onPress={() => onToggle(option)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={option}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: radius.pill,
              borderWidth: 1.5,
              borderColor: isSelected ? colors.brandPrimary : colors.border,
              backgroundColor: isSelected ? `${colors.brandPrimary}18` : 'transparent',
            }}
          >
            <AppText variant="bodySmall" weight="semiBold" tone={isSelected ? 'brand' : 'secondary'}>
              {option}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
