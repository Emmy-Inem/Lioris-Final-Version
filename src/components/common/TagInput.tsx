import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../AppText';
import { useTheme } from '@/theme/ThemeProvider';

interface TagInputProps {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  max?: number;
  maxLength?: number;
  helperText?: string;
}

/** Type a tag, press add / return; tap a chip's x to remove it. Case-insensitive duplicates are ignored. */
export function TagInput({ label, value, onChange, placeholder, suggestions = [], max = 12, maxLength = 40, helperText }: TagInputProps) {
  const { colors, radius, spacing } = useTheme();
  const [draft, setDraft] = useState('');

  function add(raw: string) {
    const tag = raw.trim().slice(0, maxLength);
    if (!tag) return;
    if (value.length >= max) return;
    if (value.some((v) => v.toLowerCase() === tag.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...value, tag]);
    setDraft('');
  }

  const remaining = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 10);

  return (
    <View style={{ gap: 6 }}>
      <AppText weight="semiBold" variant="bodySmall">
        {label}
      </AppText>
      {value.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {value.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => onChange(value.filter((v) => v !== tag))}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${tag}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingLeft: 10,
                paddingRight: 6,
                paddingVertical: 5,
                borderRadius: radius.pill,
                backgroundColor: colors.pastelPrimaryBg,
                borderWidth: 1,
                borderColor: `${colors.brandPrimary}40`,
              }}
            >
              <AppText variant="caption" weight="semiBold" tone="brand">
                {tag}
              </AppText>
              <Ionicons name="close-circle" size={14} color={colors.brandPrimary} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.pill,
          paddingLeft: spacing.md,
          paddingRight: 6,
          height: 42,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => add(draft)}
          placeholder={value.length >= max ? `Up to ${max} added` : placeholder}
          placeholderTextColor={colors.textSecondary}
          editable={value.length < max}
          maxLength={maxLength}
          returnKeyType="done"
          accessibilityLabel={label}
          style={{ flex: 1, color: colors.textPrimary, fontSize: 13, outlineStyle: 'none' as any }}
        />
        <Pressable
          onPress={() => add(draft)}
          disabled={!draft.trim() || value.length >= max}
          accessibilityRole="button"
          accessibilityLabel={`Add ${label}`}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: radius.pill,
            backgroundColor: draft.trim() ? colors.brandPrimary : colors.divider,
          }}
        >
          <AppText weight="bold" variant="caption" style={{ color: draft.trim() ? '#FFFFFF' : colors.textSecondary }}>
            Add
          </AppText>
        </Pressable>
      </View>
      {remaining.length > 0 && value.length < max ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {remaining.map((s) => (
            <Pressable
              key={s}
              onPress={() => add(s)}
              style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border }}
            >
              <AppText variant="caption" tone="secondary">
                + {s}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {helperText ? (
        <AppText tone="secondary" variant="caption">
          {helperText}
        </AppText>
      ) : null}
    </View>
  );
}
