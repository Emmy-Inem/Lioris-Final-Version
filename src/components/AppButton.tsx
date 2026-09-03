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
 size?: 'sm' | 'md';
 loading?: boolean;
 fullWidth?: boolean;
 icon?: keyof typeof Ionicons.glyphMap;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function AppButton({
 label,
 variant = 'primary',
 size = 'md',
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

 const isSmall = size === 'sm';

 return (
 <AnimatedPressable
 accessibilityRole="button"
 accessibilityLabel={label}
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
 borderRadius: isSmall ? radius.pill : radius.md,
 minHeight: isSmall ? 34 : minTouchTarget,
 paddingHorizontal: isSmall ? spacing.md : spacing.lg,
 paddingVertical: isSmall ? 4 : undefined,
 opacity: disabled ? 0.5 : 1,
 width: fullWidth ? '100%' : undefined,
 },
 ]}
 {...rest}
 >
      <View style={[styles.content, { gap: isSmall ? 6 : 8 }]}>
        {loading ? (
          <ActivityIndicator color={palette.fg} size={isSmall ? 'small' : undefined} />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={isSmall ? 15 : 18} color={palette.fg} />}
            <AppText weight="semiBold" variant={isSmall ? 'caption' : 'body'} style={{ color: palette.fg, fontSize: isSmall ? 12 : undefined }}>
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
