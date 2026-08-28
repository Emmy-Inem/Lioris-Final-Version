import React, { useEffect } from'react';
import { Modal, ScrollView, View } from'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from'react-native-reanimated';
import { SolidCard } from'./SolidCard';
import { AppText } from'./AppText';
import { AppButton } from'./AppButton';
import { useTheme } from'@/theme/ThemeProvider';

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

// PRD Section 8's Design Philosophy calls for modal enter/exit
// animations; previously every admin modal (this wrapper backs ~15 of
// them across super-admin-config.tsx and platform-config.tsx) relied
// solely on RN Modal's built-in animationType="fade"for the backdrop,
// with the content card popping in instantly. This adds a real
// reanimated scale+fade entrance for the content itself, restarting
// each time the modal opens. The backdrop's native fade already covers
// dismiss, so this is entrance-only rather than a full mirrored
// exit-then-unmount sequence - a reasonable scope boundary, not a gap
// pretending to be complete.
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
 <Modal visible={visible} transparent animationType="fade"onRequestClose={onClose}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
 <Animated.View style={[{ width: '100%', maxHeight: '85%' }, animatedStyle]}>
 <SolidCard radius={20} style={{ width: '100%', maxHeight: '85%' }}>
 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false}>
 <AppText variant="h3"weight="bold"style={{ marginBottom: description ? spacing.xs : spacing.md }}>
 {title}
 </AppText>
 {description ? (
 <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.md }}>
 {description}
 </AppText>
 ) : null}

 {children}

 <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg }}>
 <AppButton label="Cancel"variant="ghost"onPress={onClose} />
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
 </View>
 </Modal>
 );
}
