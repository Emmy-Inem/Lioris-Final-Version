import React from'react';
import { View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { useTheme } from'@/theme/ThemeProvider';
import { checkPassword } from'@/utils/validation';

export function PasswordChecklist({ password }: { password: string }) {
  const { colors, spacing } = useTheme();
  const checks = checkPassword(password);

  return (
    <View style={{ marginBottom: spacing.lg, marginTop: -spacing.sm }}>
      {checks.map((check) => (
        <View key={check.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Ionicons
            name={check.met ? 'checkmark-circle' : 'ellipse-outline'}
            size={14}
            color={check.met ? colors.success : colors.textSecondary}
          />
          <AppText variant="caption"tone={check.met ? 'secondary' : 'secondary'} style={{ opacity: check.met ? 1 : 0.7 }}>
            {check.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}
