import React, { useState } from'react';
import { StyleSheet, TextInput, TextInputProps, View } from'react-native';
import { useTheme } from'@/theme/ThemeProvider';
import { AppText } from'./AppText';
import { fontFamily, weightForPlatform } from'@/theme/typography';

import { Ionicons } from'@expo/vector-icons';
import { Pressable } from'react-native';

interface AppTextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  showPasswordToggle?: boolean;
}

export function AppTextField({
  label,
  error,
  leftIcon,
  showPasswordToggle,
  secureTextEntry,
  style,
  ...rest
}: AppTextFieldProps) {
  const { colors, radius, spacing, minTouchTarget } = useTheme();
  const [focused, setFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(!!secureTextEntry);

  const accessibleLabel = label || (typeof rest.placeholder === 'string' ? rest.placeholder : undefined);

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? (
        <AppText variant="bodySmall"weight="medium"tone="secondary"style={{ marginBottom: spacing.xs }}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.inputContainer,
          {
            minHeight: minTouchTarget,
            borderRadius: radius.md,
            borderColor: error ? colors.critical : focused ? colors.brandPrimary : colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        {leftIcon ? (
          <Ionicons
            name={leftIcon}
            size={18}
            color={focused ? colors.brandPrimary : colors.textSecondary}
            style={{ marginLeft: spacing.md, marginRight: spacing.xs }}
          />
        ) : null}
        <TextInput
          accessibilityLabel={accessibleLabel}
          accessibilityState={{ disabled: rest.editable === false }}
          placeholderTextColor={colors.textSecondary}
          secureTextEntry={showPasswordToggle ? isSecure : secureTextEntry}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              paddingHorizontal: spacing.md,
              color: colors.textPrimary,
              fontFamily,
              fontWeight: weightForPlatform.regular,
            },
            style,
          ]}
          {...rest}
        />
        {showPasswordToggle ? (
          <Pressable
            onPress={() => setIsSecure(!isSecure)}
            hitSlop={8}
            style={{ paddingHorizontal: spacing.md, justifyContent: 'center', alignItems: 'center' }}
            accessibilityLabel={isSecure ? 'Show password' : 'Hide password'}
          >
            <Ionicons
              name={isSecure ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText
          variant="caption"tone="critical"accessibilityLiveRegion="polite"style={{ marginTop: spacing.xs }}
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    fontSize: 15,
    minHeight: 44,
  },
});
