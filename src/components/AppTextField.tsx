import React, { useState } from 'react';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from './AppText';
import { fontFamily, weightForPlatform } from '@/theme/typography';

interface AppTextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function AppTextField({ label, error, style, ...rest }: AppTextFieldProps) {
  const { colors, radius, spacing, minTouchTarget } = useTheme();
  const [focused, setFocused] = useState(false);
  // Several screens (e.g. login/register) pass label="" and rely on the
  // placeholder alone for a visual cue — but a screen reader can't
  // reliably announce a TextInput's placeholder as its name. Fall back
  // to the placeholder so the field always has *some* accessible name;
  // an explicit accessibilityLabel in rest still overrides this since
  // rest is spread after it below.
  const accessibleLabel = label || (typeof rest.placeholder === 'string' ? rest.placeholder : undefined);

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <AppText variant="bodySmall" weight="medium" tone="secondary" style={{ marginBottom: spacing.xs }}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={accessibleLabel}
        accessibilityState={{ disabled: rest.editable === false }}
        placeholderTextColor={colors.textSecondary}
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
            minHeight: minTouchTarget,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            borderColor: error ? colors.critical : focused ? colors.brandPrimary : colors.border,
            color: colors.textPrimary,
            backgroundColor: colors.surface,
            fontFamily,
            fontWeight: weightForPlatform.regular,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <AppText
          variant="caption"
          tone="critical"
          accessibilityLiveRegion="polite"
          style={{ marginTop: spacing.xs }}
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1.5,
    fontSize: 15,
  },
});
