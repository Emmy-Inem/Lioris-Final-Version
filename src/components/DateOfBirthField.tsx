import React, { useMemo, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { useTheme } from '@/theme/ThemeProvider';
import { dobHint, parseDobInput, type ParsedDob } from '@/utils/age';

export interface DobFields {
  day: string;
  month: string;
  year: string;
}

/** Day / month / year as three plain text boxes (no native date picker module), plus the checked result. */
export function useDobFields(): { fields: DobFields; setFields: (next: DobFields) => void; parsed: ParsedDob } {
  const [fields, setFields] = useState<DobFields>({ day: '', month: '', year: '' });
  const parsed = useMemo(() => parseDobInput(fields.day, fields.month, fields.year), [fields.day, fields.month, fields.year]);
  return { fields, setFields, parsed };
}

interface DateOfBirthFieldProps {
  fields: DobFields;
  onChange: (next: DobFields) => void;
  parsed: ParsedDob;
  /** Show the under-13 / under-18 explanation under the boxes. */
  showHint?: boolean;
  label?: string;
}

const digitsOnly = (text: string, max: number) => text.replace(/\D/g, '').slice(0, max);

export function DateOfBirthField({ fields, onChange, parsed, showHint = true, label = 'Date of birth' }: DateOfBirthFieldProps) {
  const { colors, spacing } = useTheme();
  const hint = showHint ? dobHint(parsed.status) : null;
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  return (
    <View accessibilityRole="none" style={{ marginBottom: spacing.sm }}>
      <AppText variant="bodySmall" weight="medium" tone="secondary" style={{ marginBottom: spacing.xs }}>
        {label}
      </AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppTextField
            accessibilityLabel="Day of birth"
            placeholder="DD"
            keyboardType="number-pad"
            maxLength={2}
            autoComplete="off"
            value={fields.day}
            onChangeText={(t) => {
              const nextDay = digitsOnly(t, 2);
              onChange({ ...fields, day: nextDay });
              if (fields.day.length < 2 && nextDay.length === 2) {
                monthRef.current?.focus();
              }
            }}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppTextField
            inputRef={monthRef}
            accessibilityLabel="Month of birth"
            placeholder="MM"
            keyboardType="number-pad"
            maxLength={2}
            autoComplete="off"
            value={fields.month}
            onChangeText={(t) => {
              const nextMonth = digitsOnly(t, 2);
              onChange({ ...fields, month: nextMonth });
              if (fields.month.length < 2 && nextMonth.length === 2) {
                yearRef.current?.focus();
              }
            }}
          />
        </View>
        <View style={{ flex: 1.5, minWidth: 0 }}>
          <AppTextField
            inputRef={yearRef}
            accessibilityLabel="Year of birth"
            placeholder="YYYY"
            keyboardType="number-pad"
            maxLength={4}
            autoComplete="off"
            value={fields.year}
            onChangeText={(t) => onChange({ ...fields, year: digitsOnly(t, 4) })}
          />
        </View>
      </View>
      {hint ? (
        <View
          accessibilityRole="alert"
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: -spacing.sm }}
        >
          <Ionicons
            name={hint.tone === 'critical' ? 'alert-circle' : 'information-circle-outline'}
            size={16}
            color={hint.tone === 'critical' ? colors.critical : colors.brandPrimary}
            style={{ marginTop: 1 }}
          />
          <AppText variant="bodySmall" style={{ flex: 1, color: hint.tone === 'critical' ? colors.critical : colors.textSecondary }}>
            {hint.message}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
