import React, { useEffect } from'react';
import { View } from'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from'react-native-reanimated';

/** Ported from PresenceHalo (CommunicationAndStudy.kt): a pulsing green online-status dot. */
export function PresenceHalo({ isOnline }: { isOnline: boolean }) {
 const opacity = useSharedValue(0.4);

 useEffect(() => {
 if (isOnline) {
 opacity.value = withRepeat(withTiming(1, { duration: 1000 }), -1, true);
 }
 }, [isOnline, opacity]);

 const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

 if (!isOnline) return null;

 return (
 <View
 style={{
 width: 11,
 height: 11,
 borderRadius: 5.5,
 borderWidth: 1.5,
 borderColor: '#FFFFFF',
 overflow: 'hidden',
 }}
 >
 <Animated.View style={[{ flex: 1, backgroundColor: '#10B981' }, animatedStyle]} />
 </View>
 );
}
