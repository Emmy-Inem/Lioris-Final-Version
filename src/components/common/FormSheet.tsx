import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';

interface FormSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Pinned under the scrolling content (buttons). */
  footer?: React.ReactNode;
  /** Wider card on desktop (default 560). */
  maxWidth?: number;
}

/**
 * The one modal every new form in the mentorship / study pod / campus screens uses: a bottom sheet on a phone,
 * a centred card on desktop, content scrolls and the buttons stay put.
 */
export function FormSheet({ visible, onClose, title, subtitle, children, footer, maxWidth = 560 }: FormSheetProps) {
  const { colors, spacing, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView
        accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: isDesktop ? 'center' : 'flex-end',
          alignItems: isDesktop ? 'center' : 'stretch',
          padding: isDesktop ? spacing.lg : 0,
        }}
      >
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} accessible={false} />
        <View
          style={{
            backgroundColor: colors.background,
            width: '100%',
            maxWidth: isDesktop ? maxWidth : undefined,
            maxHeight: isDesktop ? '90%' : '92%',
            borderRadius: isDesktop ? 24 : 0,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: isDesktop ? 1 : 0,
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
            paddingTop: spacing.md,
            paddingHorizontal: spacing.md,
            paddingBottom: Math.max(insets.bottom, spacing.md),
            overflow: 'hidden',
          }}
        >
          {!isDesktop ? (
            <View style={{ alignItems: 'center', marginBottom: spacing.xs }}>
              <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="h3" weight="bold">
                {title}
              </AppText>
              {subtitle ? (
                <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                  {subtitle}
                </AppText>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView
            style={{ flexGrow: 0, flexShrink: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: spacing.sm, gap: spacing.sm }}
          >
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingTop: spacing.sm }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
