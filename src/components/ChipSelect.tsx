import React from'react';
import { Pressable, ScrollView, View } from'react-native';
import { AppText } from'./AppText';
import { useTheme } from'@/theme/ThemeProvider';

interface ChipSelectProps<T extends string> {
 options: T[];
 selected: T[];
 onToggle: (value: T) => void;
 /** One swipeable row instead of wrapping onto several lines - for long lists on a phone. */
 scroll?: boolean;
}

export function ChipSelect<T extends string>({ options, selected, onToggle, scroll }: ChipSelectProps<T>) {
 const { colors, radius, spacing } = useTheme();
 const Wrapper: React.ComponentType<any> = scroll ? ScrollView : View;
 const wrapperProps = scroll
 ? {
 horizontal: true,
 showsHorizontalScrollIndicator: false,
 contentContainerStyle: { gap: spacing.sm, paddingRight: spacing.md },
 style: { flexGrow: 0 },
 'data-horizontal-scroll': 'true',
 }
 : { style: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm } };
 return (
 <Wrapper {...wrapperProps}>
 {options.map((option) => {
 const isSelected = selected.includes(option);
 return (
 <Pressable
 key={option}
 onPress={() => onToggle(option)}
 accessibilityRole="checkbox"accessibilityState={{ checked: isSelected }}
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
 <AppText variant="bodySmall"weight="semiBold"tone={isSelected ? 'brand' : 'secondary'}>
 {option}
 </AppText>
 </Pressable>
 );
 })}
 </Wrapper>
 );
}
