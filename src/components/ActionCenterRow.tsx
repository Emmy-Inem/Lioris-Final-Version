import React from'react';
import { Pressable, ScrollView, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { useTheme } from'@/theme/ThemeProvider';

export interface QuickAction {
 icon: keyof typeof Ionicons.glyphMap;
 label: string;
 onPress: () => void;
}

/** Ported structurally from the"ACTION CENTER"section of DashboardScreen. */
export function ActionCenterRow({ actions }: { actions: QuickAction[] }) {
 const { colors, spacing, radius } = useTheme();

 return (
 <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
 {actions.map((action) => (
 <Pressable
 key={action.label}
 onPress={action.onPress}
 accessibilityRole="button"accessibilityLabel={action.label}
 style={{
 alignItems: 'center',
 width: 78,
 paddingVertical: spacing.sm,
 }}
 >
 <View
 style={{
 width: 52,
 height: 52,
 borderRadius: radius.lg,
 backgroundColor: `${colors.brandPrimary}18`,
 alignItems: 'center',
 justifyContent: 'center',
 marginBottom: spacing.xs,
 }}
 >
 <Ionicons name={action.icon} size={22} color={colors.brandPrimary} />
 </View>
 <AppText variant="caption"weight="semiBold"style={{ textAlign: 'center' }} numberOfLines={2}>
 {action.label}
 </AppText>
 </Pressable>
 ))}
 </ScrollView>
 );
}
