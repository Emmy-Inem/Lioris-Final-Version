import React, { useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../AppText';
import { AppTextField } from '../AppTextField';
import { AppButton } from '../AppButton';
import { FormSheet } from '../common/FormSheet';
import { TagInput } from '../common/TagInput';
import { useTheme } from '@/theme/ThemeProvider';
import { useToast } from '@/context/ToastContext';
import { MentorAvailability, MentorSessionMode, MyMentorProfile } from '@/api/types';
import { saveMyMentorProfile } from '@/api/mentorship';
import { AVAILABILITY_DAYS, AVAILABILITY_WINDOWS, EXPERTISE_SUGGESTIONS, SESSION_MODES } from '@/utils/mentorship';
import { haptics } from '@/utils/haptics';
import { parseRpcError } from '@/utils/rpcErrors';

function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: selected ? colors.brandPrimary : colors.border,
        backgroundColor: selected ? `${colors.brandPrimary}18` : 'transparent',
      }}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? colors.brandPrimary : colors.textSecondary} /> : null}
      <AppText variant="bodySmall" weight="semiBold" tone={selected ? 'brand' : 'secondary'}>
        {label}
      </AppText>
    </Pressable>
  );
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const { colors, radius } = useTheme();
  const btn = (delta: number, icon: 'remove' | 'add', disabled: boolean) => (
    <Pressable
      onPress={() => onChange(Math.min(max, Math.max(min, value + delta)))}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${delta > 0 ? 'Increase' : 'Decrease'} ${label}`}
      style={{ width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, opacity: disabled ? 0.4 : 1 }}
    >
      <Ionicons name={icon} size={18} color={colors.textPrimary} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {btn(-1, 'remove', value <= min)}
      <AppText variant="h3" weight="bold" style={{ minWidth: 28, textAlign: 'center' }}>
        {value}
      </AppText>
      {btn(1, 'add', value >= max)}
    </View>
  );
}

/** The alumnus's own mentor profile: what students see on the mentor card, plus availability and capacity. */
export function MentorProfileEditor({
  visible,
  initial,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initial: MyMentorProfile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors, spacing } = useTheme();
  const toast = useToast();
  const [form, setForm] = useState<MyMentorProfile>(initial);
  const [yearsText, setYearsText] = useState(initial.yearsExperience != null ? String(initial.yearsExperience) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setForm(initial);
      setYearsText(initial.yearsExperience != null ? String(initial.yearsExperience) : '');
      setError(null);
    }
  }, [visible, initial]);

  const set = <K extends keyof MyMentorProfile>(key: K, value: MyMentorProfile[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setAvail = (patch: Partial<MentorAvailability>) => setForm((f) => ({ ...f, availability: { ...f.availability, ...patch } }));

  function toggleMode(mode: MentorSessionMode) {
    set('sessionModes', form.sessionModes.includes(mode) ? form.sessionModes.filter((m) => m !== mode) : [...form.sessionModes, mode]);
  }

  function toggleDay(day: NonNullable<MentorAvailability['days']>[number]) {
    const days = form.availability.days ?? [];
    setAvail({ days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] });
  }

  async function save() {
    setError(null);
    if (form.headline.trim().length < 8) return setError('Add a one-line headline (at least 8 characters), e.g. "Backend engineer at a fintech".');
    if (form.expertise.length === 0) return setError('Add at least one area you can help with, so students can find you.');
    if (form.sessionModes.length === 0) return setError('Choose at least one way you are happy to meet.');
    const link = form.linkedinUrl.trim();
    if (link && !/^https:\/\//i.test(link)) return setError('The LinkedIn link must start with https://');
    const years = yearsText.trim() === '' ? null : Number(yearsText);
    if (years !== null && (!Number.isInteger(years) || years < 0 || years > 60)) return setError('Years of experience must be a whole number between 0 and 60.');

    setSaving(true);
    try {
      await saveMyMentorProfile({ ...form, yearsExperience: years });
      haptics.success();
      toast.success('Mentor profile saved.');
      onSaved();
      onClose();
    } catch (err) {
      haptics.error();
      setError(parseRpcError(err, 'Could not save your mentor profile. Please try again.').message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Your mentor profile"
      subtitle="This is what students see before they ask you to mentor them."
      maxWidth={620}
      footer={
        <View style={{ gap: spacing.xs }}>
          {error ? (
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
              <Ionicons name="alert-circle" size={16} color={colors.critical} style={{ marginTop: 1 }} />
              <AppText variant="caption" weight="semiBold" style={{ color: colors.critical, flex: 1 }}>
                {error}
              </AppText>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <AppButton label="Cancel" variant="ghost" onPress={onClose} disabled={saving} fullWidth />
            </View>
            <View style={{ flex: 2 }}>
              <AppButton label="Save profile" onPress={save} loading={saving} fullWidth />
            </View>
          </View>
        </View>
      }
    >
      <AppTextField label="Headline *" value={form.headline} onChangeText={(v) => set('headline', v.slice(0, 120))} placeholder="e.g. Backend engineer at a fintech, UI Computer Science '19" />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <AppTextField label="Job title" value={form.jobTitle} onChangeText={(v) => set('jobTitle', v.slice(0, 80))} placeholder="Software Engineer" />
        </View>
        <View style={{ flex: 1 }}>
          <AppTextField label="Company" value={form.company} onChangeText={(v) => set('company', v.slice(0, 80))} placeholder="Where you work" />
        </View>
      </View>
      <AppTextField
        label="About you"
        value={form.about}
        onChangeText={(v) => set('about', v.slice(0, 1200))}
        placeholder="How you got here and what you enjoy helping students with."
        multiline
        numberOfLines={4}
        helperText={`${form.about.length}/1200`}
      />
      <AppTextField label="Years of experience" value={yearsText} onChangeText={(v) => setYearsText(v.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="e.g. 5" keyboardType="number-pad" />

      <TagInput
        label="Can help with *"
        value={form.expertise}
        onChange={(v) => set('expertise', v)}
        placeholder="e.g. Software Engineering"
        suggestions={EXPERTISE_SUGGESTIONS}
        max={12}
      />
      <TagInput label="Industries" value={form.industries} onChange={(v) => set('industries', v)} placeholder="e.g. Fintech" max={6} />

      <View style={{ gap: 6 }}>
        <AppText weight="semiBold" variant="bodySmall">
          How can students meet you? *
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SESSION_MODES.map((m) => (
            <Chip key={m.key} label={m.label} icon={m.icon} selected={form.sessionModes.includes(m.key)} onPress={() => toggleMode(m.key)} />
          ))}
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <AppText weight="semiBold" variant="bodySmall">
          Usually free on
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {AVAILABILITY_DAYS.map((d) => (
            <Chip key={d.key} label={d.label} selected={(form.availability.days ?? []).includes(d.key)} onPress={() => toggleDay(d.key)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {AVAILABILITY_WINDOWS.map((w) => (
            <Chip key={w.key} label={w.label} selected={form.availability.window === w.key} onPress={() => setAvail({ window: w.key })} />
          ))}
        </View>
        <AppTextField
          label="Scheduling note"
          value={form.availability.notes ?? ''}
          onChangeText={(v) => setAvail({ notes: v.slice(0, 200) })}
          placeholder="e.g. Times are in WAT; I reply within 2 days."
        />
      </View>

      <View style={{ gap: 6 }}>
        <AppText weight="semiBold" variant="bodySmall">
          How many mentees can you take at once?
        </AppText>
        <Stepper value={form.maxMentees} min={1} max={20} onChange={(v) => set('maxMentees', v)} label="mentee capacity" />
        <AppText tone="secondary" variant="caption">
          When you reach this number, your card shows "no free slots" and new requests are refused automatically.
        </AppText>
      </View>

      <AppTextField label="LinkedIn (optional)" value={form.linkedinUrl} onChangeText={(v) => set('linkedinUrl', v)} placeholder="https://www.linkedin.com/in/your-name" autoCapitalize="none" keyboardType="url" />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.xs }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText weight="bold" variant="bodySmall">
            Accepting new requests
          </AppText>
          <AppText tone="secondary" variant="caption">
            Switch off to pause. Your current mentees are not affected.
          </AppText>
        </View>
        <Switch value={form.isAccepting} onValueChange={(v) => set('isAccepting', v)} trackColor={{ false: colors.divider, true: colors.brandPrimary }} />
      </View>
    </FormSheet>
  );
}
