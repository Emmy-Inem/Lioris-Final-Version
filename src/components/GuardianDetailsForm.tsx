import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import {
  GUARDIAN_RELATIONSHIPS,
  submitGuardianDetails,
  validateGuardianInput,
  type GuardianDetails,
  type GuardianRelationship,
  type MinorStatus,
} from '@/api/minors';

interface GuardianDetailsFormProps {
  /** Details already on file (re-submitting changed details restarts the consent check). */
  initial?: GuardianDetails | null;
  submitLabel?: string;
  onSaved: (status: MinorStatus) => void | Promise<void>;
  /** Shown as a second button, e.g. "Not now". */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/**
 * Parent / guardian details for a member aged 13-17. The member can record or correct them here but cannot confirm
 * consent: a campus administrator contacts the guardian and records the outcome, and until then the account is limited.
 */
export function GuardianDetailsForm({ initial, submitLabel = 'Save guardian details', onSaved, secondaryLabel, onSecondary }: GuardianDetailsFormProps) {
  const { colors, spacing, radius } = useTheme();
  const [relationship, setRelationship] = useState<GuardianRelationship>(initial?.relationship ?? 'parent');
  const [name, setName] = useState(initial?.name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    const problem = validateGuardianInput({ name, relationship, email, phone });
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      const status = await submitGuardianDetails({ name, relationship, email, phone });
      await onSaved(status);
    } catch (err: any) {
      setError(err?.message || 'We could not save your guardian details. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View>
      <AppText variant="bodySmall" weight="medium" tone="secondary" style={{ marginBottom: spacing.xs }}>
        How are they related to you?
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
        {GUARDIAN_RELATIONSHIPS.map((r) => {
          const selected = relationship === r.value;
          return (
            <Pressable
              key={r.value}
              onPress={() => setRelationship(r.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              aria-checked={selected}
              accessibilityLabel={r.label}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                minHeight: 36,
                justifyContent: 'center',
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.brandPrimary : colors.surface,
                borderWidth: 1,
                borderColor: selected ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'primary'}>
                {r.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <AppTextField
        label="Their full name"
        value={name}
        onChangeText={setName}
        autoComplete="off"
        textContentType="none"
        placeholder="e.g. Ngozi Okafor"
      />
      <AppTextField
        label="Their e-mail address (optional if you give a phone number)"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="off"
        placeholder="parent@example.com"
      />
      <AppTextField
        label="Their phone number (optional if you give an e-mail)"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="off"
        placeholder="+234 801 234 5678"
      />

      <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.md }}>
        A campus administrator contacts your parent or guardian using these details and records their consent. We do not
        e-mail them automatically. Until consent is confirmed some features are limited. Only you, your campus
        administrators and Super Admins can see these details.
      </AppText>

      {error ? (
        <AppText variant="bodySmall" tone="critical" accessibilityRole="alert" style={{ marginBottom: spacing.sm }}>
          {error}
        </AppText>
      ) : null}

      <AppButton label={submitLabel} onPress={handleSave} loading={saving} fullWidth />
      {secondaryLabel && onSecondary ? (
        <View style={{ marginTop: spacing.sm }}>
          <AppButton label={secondaryLabel} variant="ghost" onPress={onSecondary} disabled={saving} fullWidth />
        </View>
      ) : null}
    </View>
  );
}
