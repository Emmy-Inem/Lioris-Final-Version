import React, { useEffect } from'react';
import { View } from'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from'react-native-reanimated';
import { AppText } from'./AppText';
import { useTheme } from'@/theme/ThemeProvider';

function Dot({ delay, color }: { delay: number; color: string }) {
 const translateY = useSharedValue(0);

 useEffect(() => {
 translateY.value = withDelay(
 delay,
 withRepeat(withSequence(withTiming(-6, { duration: 350 }), withTiming(0, { duration: 350 })), -1, false),
 );
 }, [delay, translateY]);

 const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

 return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, animatedStyle]} />;
}

/** Ported from TypingIndicator (CommunicationAndStudy.kt): three bouncing dots with staggered timing. */
export function TypingIndicator() {
 const { colors, spacing, radius } = useTheme();

 return (
 <View
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 3,
 alignSelf: 'flex-start',
 backgroundColor: colors.divider,
 borderRadius: radius.md,
 paddingHorizontal: spacing.md,
 paddingVertical: spacing.sm,
 marginLeft: spacing.lg,
 marginBottom: spacing.sm,
 }}
 >
 <Dot delay={0} color={colors.brandPrimary} />
 <Dot delay={100} color={colors.brandPrimary} />
 <Dot delay={200} color={colors.brandPrimary} />
 <AppText variant="caption"weight="semiBold"tone="secondary"style={{ marginLeft: 6 }}>
 typing...
 </AppText>
 </View>
 );
}
