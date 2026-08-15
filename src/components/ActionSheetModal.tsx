import React, { useEffect } from 'react';
import { Modal, Pressable } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

interface ActionSheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Shared bottom-sheet action menu — backs the post/event "..." options
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
  const translateY = useSharedValue(80);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 18, stiffness: 260 });
      backdropOpacity.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) });
    } else {
      translateY.value = 80;
      backdropOpacity.value = 0;
    }
  }, [visible, translateY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <AnimatedPressable
        style={[{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }, backdropStyle]}
        onPress={onClose}
        accessible={false}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderColor: colors.border,
            padding: spacing.lg,
            paddingBottom: spacing.xxl,
          },
          sheetStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Modal>
  );
}
