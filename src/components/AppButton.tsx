import React from'react';
import {
 ActivityIndicator,
 Pressable,
 PressableProps,
 StyleSheet,
 View,
} from'react-native';
import Animated, {
 useAnimatedStyle,
 useSharedValue,
 withTiming,
} from'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from'@/theme/ThemeProvider';
import { AppText } from'./AppText';

interface AppButtonProps extends Omit<PressableProps, 'style'> {
 label: string;
 variant?: 'primary' | 'secondary' | 'accent' | 'ghost';
 loading?: boolean;
 fullWidth?: boolean;
 icon?: keyof typeof Ionicons.glyphMap;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AppButton({
 label,
 variant = 'primary',
 loading,
 fullWidth,
 disabled,
 icon,
 ...rest
}: AppButtonProps) {
 const { colors, radius, spacing, minTouchTarget, isDark } = useTheme();
 const scale = useSharedValue(1);

 const animatedStyle = useAnimatedStyle(() => ({
 transform: [{ scale: scale.value }],
 }));

 const palette = {
 primary: { bg: colors.brandPrimary, fg: isDark ? '#0B1120' : '#FFFFFF', border: 'transparent' },
 accent: { bg: colors.brandAccent, fg: isDark ? '#0B1120' : '#FFFFFF', border: 'transparent' },
 secondary: { bg: 'transparent', fg: colors.brandPrimary, border: colors.brandPrimary },
 ghost: { bg: 'transparent', fg: colors.textPrimary, border: 'transparent' },
 }[variant];

 return (
 <AnimatedPressable
 accessibilityRole="button"accessibilityLabel={label}
 accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
 disabled={disabled || loading}
 onPressIn={() => (scale.value = withTiming(0.97, { duration: 100 }))}
 onPressOut={() => (scale.value = withTiming(1, { duration: 150 }))}
 style={[
 animatedStyle,
 styles.base,
 {
 backgroundColor: palette.bg,
 borderColor: palette.border,
 borderWidth: palette.border === 'transparent' ? 0 : 1.5,
 borderRadius: radius.md,
 minHeight: minTouchTarget,
 paddingHorizontal: spacing.lg,
 opacity: disabled ? 0.5 : 1,
 width: fullWidth ? '100%' : undefined,
 },
 ]}
 {...rest}
 >
      <View style={[styles.content, { gap: 8 }]}>
        {loading ? (
          <ActivityIndicator color={palette.fg} />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={18} color={palette.fg} />}
            <AppText weight="semiBold" style={{ color: palette.fg }}>
              {label}
            </AppText>
          </>
        )}
      </View>
 </AnimatedPressable>
 );
}

const styles = StyleSheet.create({
 base: {
 alignItems: 'center',
 justifyContent: 'center',
 },
 content: {
 flexDirection: 'row',
 alignItems: 'center',
 justifyContent: 'center',
 },
});
