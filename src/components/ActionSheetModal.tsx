import React, { useEffect } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from'react-native-reanimated';
import { useTheme } from'@/theme/ThemeProvider';
import { useReducedMotion } from'@/theme/useReducedMotion';

interface ActionSheetModalProps {
 visible: boolean;
 onClose: () => void;
 children: React.ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Shared bottom-sheet action menu - backs the post/event"..."options
 * menus (PostCard, EventCard), both very high-traffic since they render
 * on every post/event across every role. PRD Section 8's Design
 * Philosophy calls for modal enter/exit animations; previously these
 * were two near-duplicate raw <Modal> blocks that just popped in under
 * RN's native fade. This gives the sheet a real slide-up + spring
 * entrance and a fading backdrop, and consolidates the duplicated
 * markup into one place.
 */
export function ActionSheetModal({ visible, onClose, children }: ActionSheetModalProps) {
 const { colors, spacing } = useTheme();
 const reduceMotion = useReducedMotion();
 const translateY = useSharedValue(80);
 const backdropOpacity = useSharedValue(0);

 useEffect(() => {
 if (visible) {
 translateY.value = reduceMotion ? 0 : withSpring(0, { damping: 18, stiffness: 260 });
 backdropOpacity.value = withTiming(1, { duration: reduceMotion ? 0 : 150, easing: Easing.out(Easing.quad) });
 } else {
 translateY.value = 80;
 backdropOpacity.value = 0;
 }
 }, [visible, reduceMotion, translateY, backdropOpacity]);

 const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
 const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View accessibilityViewIsModal accessibilityLabel="Options" style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
        <AnimatedPressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }, backdropStyle]}
          onPress={onClose}
          accessible={false}
        />
        <Animated.View
          style={[
            {
              width: '100%',
              maxWidth: 500,
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderColor: colors.border,
              padding: spacing.lg,
              paddingBottom: Platform.OS === 'ios' ? 36 : spacing.xl,
            },
            sheetStyle,
          ]}
        >
          {/* Mobile Sheet Grab Handle */}
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}
