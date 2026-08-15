import React, { useState } from'react';
import { Pressable, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { useTheme } from'@/theme/ThemeProvider';

interface AnnouncementBannerProps {
  title: string;
  message: string;
  onPressDetails?: () => void;
}

/** Ported from AnnouncementBanner (DashboardAndProfile.kt) — a dismissible, high-priority campus broadcast banner. */
export function AnnouncementBanner({ title, message, onPressDetails }: AnnouncementBannerProps) {
  const { colors, spacing, radius } = useTheme();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <Pressable
      onPress={onPressDetails}
      accessibilityRole="button"accessibilityLabel={`${title}. ${message}`}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        backgroundColor: `${colors.critical}14`,
        borderWidth: 1,
        borderColor: `${colors.critical}40`,
        borderRadius: radius.lg,
        padding: spacing.md,
        marginBottom: spacing.lg,
      }}
    >
      <Ionicons name="megaphone"size={20} color={colors.critical} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <AppText variant="caption"weight="bold"style={{ color: colors.critical, letterSpacing: 0.5 }}>
          {title.toUpperCase()}
        </AppText>
        <AppText variant="bodySmall"weight="semiBold"style={{ marginTop: 2 }} numberOfLines={2}>
          {message}
        </AppText>
      </View>
      <Pressable
        onPress={() => setDismissed(true)}
        hitSlop={8}
        accessibilityRole="button"accessibilityLabel="Dismiss announcement"
      >
        <Ionicons name="close"size={16} color={colors.textSecondary} />
      </Pressable>
    </Pressable>
  );
}
