import React from'react';
import { View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { useTheme } from'@/theme/ThemeProvider';
import { roleBadgeColors } from'@/theme/colors';
import { UserRole } from'@/api/types';

const ICON_BY_ROLE: Record<UserRole, keyof typeof Ionicons.glyphMap> = {
  student: 'happy-outline',
  alumni: 'school-outline',
  staff: 'briefcase-outline',
  admin: 'shield-checkmark-outline',
};

const LABEL_BY_ROLE: Record<UserRole, string> = {
  student: 'Student',
  alumni: 'Alumni',
  staff: 'Staff',
  admin: 'Admin',
};

/**
 * Ported from `UserTypeBadge` (Common.kt): unlike the generic brand-blue
 * Badge, each role gets a distinct color — green/student, purple/alumni,
 * blue/staff, red/admin — in both light and dark mode.
 */
export function UserTypeBadge({ role }: { role: UserRole }) {
  const { isDark } = useTheme();
  const { bg, text } = roleBadgeColors[role][isDark ? 'dark' : 'light'];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: bg,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: `${text}59`, // ~35% alpha
        paddingHorizontal: 12,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Ionicons name={ICON_BY_ROLE[role]} size={11} color={text} />
      <AppText variant="caption"weight="bold"style={{ color: text, fontSize: 9 }}>
        {LABEL_BY_ROLE[role]}
      </AppText>
    </View>
  );
}
