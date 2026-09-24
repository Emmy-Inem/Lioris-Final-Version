import React, { useEffect, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { FormSheet } from './common/FormSheet';
import { TagInput } from './common/TagInput';
import { useTheme } from '@/theme/ThemeProvider';
import { CreateStudyGroupPayload } from '@/api/studyGroups';
import { parseRpcError } from '@/utils/rpcErrors';
import { haptics } from '@/utils/haptics';

const LEVELS = ['100L', '200L', '300L', '400L', '500L', 'Postgrad'];
const SIZE_PICKS = [5, 10, 20, 40, 100];

export type PodFormValues = Omit<CreateStudyGroupPayload, 'campusCode'>;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Throw to keep the form open with the error shown. */
  onSubmit: (payload: PodFormValues) => Promise<void>;
  /** Present when editing an existing pod. */
  initial?: PodFormValues;
  /** Suggested department for a new pod (from the member's profile). */
  defaultDepartment?: string;
}

const EMPTY: PodFormValues = {
  name: '',
  courseCode: '',
  description: '',
  isPublic: true,
  level: '',
  department: '',
  topics: [],
  meetingLink: '',
  scheduleNote: '',
  goal: '',
  maxMembers: 20,
};

/** Create a study pod, or edit one (pass `initial`). */
export function CreateStudyGroupModal({ visible, onClose, onSubmit, initial, defaultDepartment }: Props) {
  const { colors, spacing, radius } = useTheme();
  const editing = !!initial;
  const [form, setForm] = useState<PodFormValues>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(initial ?? { ...EMPTY, department: defaultDepartment ?? '' });
      setError(null);
    }
  }, [visible, initial, defaultDepartment]);

  const set = <K extends keyof PodFormValues>(key: K, value: PodFormValues[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    setError(null);
    if (form.name.trim().length < 3) return setError('Give the pod a name (at least 3 characters), e.g. "CSC 301 revision squad".');
    if (!form.courseCode.trim()) return setError('Add the course code (e.g. CSC 301) so classmates can find it.');
    const link = (form.meetingLink ?? '').trim();
    if (link && !/^https?:\/\//i.test(link)) return setError('The meeting link must start with https://');
    haptics.medium();
    setSaving(true);
    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        courseCode: form.courseCode.trim().toUpperCase(),
        description: form.description.trim(),
        meetingLink: link,
      });
      onClose();
    } catch (err) {
      haptics.error();
      setError(parseRpcError(err, 'Could not save this pod. Please try again.').message);
    } finally {
      setSaving(false);
    }
  }

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1.5, borderColor: selected ? colors.brandPrimary : colors.border, backgroundColor: selected ? `${colors.brandPrimary}18` : 'transparent' }}
    >
      <AppText variant="caption" weight="semiBold" tone={selected ? 'brand' : 'secondary'}>
        {label}
      </AppText>
    </Pressable>
  );

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit study pod' : 'Create a study pod'}
      subtitle="A small group with its own discussion, study sessions and members."
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
              <AppButton label={editing ? 'Save changes' : 'Create pod'} onPress={submit} loading={saving} fullWidth />
            </View>
          </View>
        </View>
      }
    >
      <AppTextField label="Pod name *" value={form.name} onChangeText={(v) => set('name', v.slice(0, 80))} placeholder="e.g. Algorithms revision squad" />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <AppTextField label="Course code *" value={form.courseCode} onChangeText={(v) => set('courseCode', v.slice(0, 24))} placeholder="CSC 301" autoCapitalize="characters" />
        </View>
        <View style={{ flex: 1 }}>
          <AppTextField label="Department" value={form.department ?? ''} onChangeText={(v) => set('department', v.slice(0, 80))} placeholder="Computer Science" />
        </View>
      </View>
      <AppTextField label="What is this pod for?" value={form.description} onChangeText={(v) => set('description', v.slice(0, 600))} placeholder="Weekly problem-solving, past-question drills, project help…" multiline numberOfLines={3} helperText={`${form.description.length}/600`} />
      <AppTextField label="Goal (optional)" value={form.goal ?? ''} onChangeText={(v) => set('goal', v.slice(0, 300))} placeholder="e.g. Finish CLRS chapters 22-25 before exams" />

      <View style={{ gap: 6 }}>
        <AppText weight="semiBold" variant="bodySmall">
          Level
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{LEVELS.map((l) => chip(l, form.level === l, () => set('level', form.level === l ? '' : l)))}</View>
      </View>

      <TagInput label="Topics" value={form.topics ?? []} onChange={(v) => set('topics', v)} placeholder="e.g. graphs" max={8} maxLength={30} />
      <AppTextField label="Meeting rhythm (optional)" value={form.scheduleNote ?? ''} onChangeText={(v) => set('scheduleNote', v.slice(0, 120))} placeholder="e.g. Tuesdays and Thursdays, 6 PM" />
      <AppTextField label="Meeting link (optional, members only)" value={form.meetingLink ?? ''} onChangeText={(v) => set('meetingLink', v)} placeholder="https://meet.google.com/..." autoCapitalize="none" keyboardType="url" />

      <View style={{ gap: 6 }}>
        <AppText weight="semiBold" variant="bodySmall">
          Maximum members
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{SIZE_PICKS.map((n) => chip(String(n), form.maxMembers === n, () => set('maxMembers', n)))}</View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText weight="bold" variant="bodySmall">
            {form.isPublic ? 'Public pod' : 'Private pod'}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {form.isPublic ? 'Anyone on your campus can join straight away.' : 'People ask to join and you approve each one. Only members see the discussion and members list.'}
          </AppText>
        </View>
        <Switch value={!form.isPublic} onValueChange={(v) => set('isPublic', !v)} trackColor={{ false: colors.divider, true: colors.brandPrimary }} accessibilityLabel="Private pod" />
      </View>
    </FormSheet>
  );
}
