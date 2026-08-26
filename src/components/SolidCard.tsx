import React from'react';
import { Platform, StyleSheet, View, ViewProps } from'react-native';
import { BlurView } from'expo-blur';
import { useTheme } from'@/theme/ThemeProvider';

interface SolidCardProps extends ViewProps {
 padded?: boolean;
 radius?: number;
 backgroundColor?: string;
 frosted?: boolean;
 intensity?: number;
}

/**
 * Modern Clean Card with crisp responsive borders, subtle depth,
 * and frosted glass backdrop blur globally enabled by default.
 */
export function SolidCard({
 padded = true,
 radius,
 backgroundColor,
 frosted = true,
 intensity = 30,
 style,
 children,
 ...rest
}: SolidCardProps) {
 const { colors, spacing, isDark } = useTheme();
 const cornerRadius = radius ?? 20;

 const defaultBg = backgroundColor
 ? backgroundColor
 : frosted
 ? isDark
 ? 'rgba(15, 23, 42, 0.72)'
 : 'rgba(255, 255, 255, 0.82)'
 : colors.surface;

 return (
 <View
 style={[
 styles.shadowWrapper,
 {
 borderRadius: cornerRadius,
 backgroundColor: defaultBg,
 borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.75)',
 borderWidth: 1,
 overflow: 'hidden',
 },
 frosted &&
 Platform.OS === 'web' &&
 ({
 backdropFilter: 'blur(20px)',
 WebkitBackdropFilter: 'blur(20px)',
 } as any),
 padded && { padding: spacing.lg },
 style,
 ]}
 {...rest}
 >
 {frosted && Platform.OS !== 'web' ? (
 <BlurView
 intensity={intensity}
 tint={isDark ? 'dark' : 'light'}
 style={StyleSheet.absoluteFill}
 />
 ) : null}
 {children}
 </View>
 );
}

const styles = StyleSheet.create({
 shadowWrapper: Platform.select({
 ios: {
 shadowColor: '#0A1326',
 shadowOffset: { width: 0, height: 6 },
 shadowOpacity: 0.08,
 shadowRadius: 16,
 },
 android: {
 elevation: 3,
 },
 web: {
 boxShadow: '0 8px 28px -4px rgba(0, 0, 0, 0.07), 0 2px 6px -1px rgba(0, 0, 0, 0.04)',
 } as any,
 default: {},
 }),
});
