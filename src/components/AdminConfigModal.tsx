import React, { useEffect } from 'react';
import { Modal, ScrollView, View, Platform, KeyboardAvoidingView, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';

interface AdminConfigModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  confirmLabel?: string;
  onConfirm?: () => void;
  confirmDestructive?: boolean;
}

export function AdminConfigModal({
  visible,
  onClose,
  title,
  description,
  children,
  confirmLabel = 'Save',
  onConfirm,
  confirmDestructive,
}: AdminConfigModalProps) {
  const { spacing } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
      scale.value = withSpring(1, { damping: 16, stiffness: 220 });
    } else {
      opacity.value = 0;
      scale.value = 0.92;
    }
  }, [visible, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isDesktop ? spacing.xl : spacing.md,
        }}
      >
        <Animated.View style={[{ width: '100%', maxWidth: 540, maxHeight: '90%' }, animatedStyle]}>
          <SolidCard radius={20} style={{ width: '100%', maxHeight: '100%' }}>
            <ScrollView
              style={{ width: '100%' }}
              contentContainerStyle={{ paddingBottom: spacing.sm }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <AppText variant="h3" weight="bold" style={{ marginBottom: description ? spacing.xs : spacing.md }}>
                {title}
              </AppText>
              {description ? (
                <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
                  {description}
                </AppText>
              ) : null}

              {children}

              <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg }}>
                <AppButton label="Cancel" variant="ghost" onPress={onClose} />
                {onConfirm ? (
                  <AppButton
                    label={confirmLabel}
                    variant={confirmDestructive ? 'accent' : 'primary'}
                    onPress={() => {
                      onConfirm();
                      onClose();
                    }}
                  />
                ) : null}
              </View>
            </ScrollView>
          </SolidCard>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
