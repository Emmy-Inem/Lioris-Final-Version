import React from'react';
import { View } from'react-native';
import { useTheme } from'@/theme/ThemeProvider';
import { AppText } from'./AppText';

type BadgeTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'critical';

interface BadgeProps {
 label: string;
 tone?: BadgeTone;
}

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
 const { colors, isDark } = useTheme();

 const fg: Record<BadgeTone, string> = {
 neutral: colors.textSecondary,
 brand: colors.brandPrimary,
 accent: colors.brandAccent,
 success: colors.success,
 warning: colors.warning,
 critical: colors.critical,
 };

 return (
 <View
 style={{
 alignSelf: 'flex-start',
 backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.035)',
 borderWidth: 1,
 borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
 borderRadius: 6,
 paddingHorizontal: 7,
 paddingVertical: 2,
 }}
 >
 <AppText variant="caption" weight="medium" style={{ color: fg[tone], fontSize: 10.5 }}>
 {label}
 </AppText>
 </View>
 );
}
