import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../AppText';
import { AppTextField } from '../AppTextField';
import { AppButton } from '../AppButton';
import { SolidCard } from '../SolidCard';
import { Badge } from '../Badge';
import { EmptyState } from '../EmptyState';
import { FormSheet } from '../common/FormSheet';
import { TagInput } from '../common/TagInput';
import { MfaStepUpModal } from './MfaStepUpModal';
import { ManagePortalLinksModal } from './ManagePortalLinksModal';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';
import {
  CampusInput,
  CampusOverview,
  createInstitution,
  listCampusOverview,
  listCampuses,
  listWaitlist,
  respondToWaitlistEntry,
  setInstitutionActive,
  updateInstitution,
  WaitlistEntry,
} from '@/api/institutions';
import { MFA_REQUIRED_CODE } from '@/api/auth';
import { CAMPUS_COLORS, isPlausibleDomain, isValidCampusCode, isValidHexColor, normaliseDomainInput, suggestCampusCode } from '@/utils/campusForm';

interface FormState {
  code: string;
  name: string;
  shortName: string;
  location: string;
  domains: string[];
  color: string;
  website: string;
}
const EMPTY_FORM: FormState = { code: '', name: '', shortName: '', location: '', domains: [], color: CAMPUS_COLORS[0], website: '' };

/**
 * Admin > Platform > Campuses: every university on Lioris with its email domains, members and portal links, plus
 * add / edit / switch off. Creating and editing go through the admin-manage-institution edge function.
 */
export function CampusManager() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState<null | { mode: 'create' | 'edit'; request?: WaitlistEntry }>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [codeTouched, setCodeTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [linksFor, setLinksFor] = useState<string | null>(null);
  const [mfa, setMfa] = useState<null | { title: string; retry: () => Promise<void> }>(null);

  const overview = useQuery({ queryKey: ['campus-overview'], queryFn: listCampusOverview, retry: false });
  // Falls back to the plain list (no counts) if the admin overview function is not available yet.
  const plain = useQuery({ queryKey: ['campuses'], queryFn: listCampuses, enabled: overview.isError });
  const requests = useQuery({ queryKey: ['waitlist'], queryFn: listWaitlist });

  const rows: CampusOverview[] = useMemo(() => {
    if (overview.data) return overview.data;
    return (plain.data ?? []).map((c) => ({ ...c, memberCount: 0, verifiedCount: 0, portalLinkCount: 0, activePortalLinkCount: 0 }));
  }, [overview.data, plain.data]);
  const hasCounts = !!overview.data;

  const q = search.trim().toLowerCase();
  const shown = rows.filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || (c.emailDomains ?? []).some((d) => d.includes(q)));

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['campus-overview'] });
    queryClient.invalidateQueries({ queryKey: ['campuses'] });
    queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    queryClient.invalidateQueries({ queryKey: ['portal-links'] });
  }

  function openCreate(request?: WaitlistEntry) {
    const domain = request?.email?.includes('@') ? normaliseDomainInput(request.email) : '';
    const name = request?.universityName ?? '';
    setForm({ ...EMPTY_FORM, name, code: suggestCampusCode(name), domains: domain && isPlausibleDomain(domain) ? [domain] : [] });
    setCodeTouched(false);
    setFormError(null);
    setFormOpen({ mode: 'create', request });
  }

  function openEdit(c: CampusOverview) {
    setForm({
      code: c.code,
      name: c.name,
      shortName: c.shortName ?? '',
      location: c.location ?? '',
      domains: c.emailDomains ?? [],
      color: c.primaryColor ?? CAMPUS_COLORS[0],
      website: c.websiteUrl ?? '',
    });
    setFormError(null);
    setFormOpen({ mode: 'edit' });
  }

  function validate(mode: 'create' | 'edit'): string | null {
    if (form.name.trim().length < 3) return 'Enter the full university name (at least 3 characters).';
    if (mode === 'create' && !isValidCampusCode(form.code)) return 'The code needs 2 to 16 letters or digits, starting with a letter (example: LASU).';
    if (!isValidHexColor(form.color)) return 'The colour must look like #1D4ED8.';
    if (form.website.trim() && !/^https?:\/\//i.test(form.website.trim())) return 'The website must start with https://';
    return null;
  }

  async function submit(options: { allowUnresolvedDomains?: boolean } = {}) {
    if (!formOpen || saving) return;
    const problem = validate(formOpen.mode);
    if (problem) return setFormError(problem);
    setFormError(null);
    setSaving(true);
    const input: CampusInput = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      shortName: form.shortName.trim() || undefined,
      location: form.location.trim() || undefined,
      emailDomains: form.domains,
      primaryColor: form.color.trim(),
      websiteUrl: form.website.trim() || undefined,
      allowUnresolvedDomains: options.allowUnresolvedDomains,
      waitlistEntryId: formOpen.request?.id,
    };
    try {
      const { institution, warnings } =
        formOpen.mode === 'create' ? await createInstitution(input) : await updateInstitution(input);
      haptics.success();
      setFormOpen(null);
      refresh();
      Alert.alert(
        formOpen.mode === 'create' ? 'Campus added' : 'Campus updated',
        `${institution.name} (${institution.code}) ${formOpen.mode === 'create' ? 'is now on Lioris.' : 'was saved.'}${warnings.length > 0 ? `\n\n${warnings.join('\n')}` : ''}`,
      );
    } catch (err: any) {
      haptics.error();
      if (err?.code === MFA_REQUIRED_CODE) {
        setMfa({ title: formOpen.mode === 'create' ? 'Verify to add a campus' : 'Verify to update a campus', retry: () => submit(options) });
      } else if (err?.code === 'domain_unresolved') {
        Alert.alert('Domain not found', err.message, [
          { text: 'Fix it', style: 'cancel' },
          { text: 'Add anyway', style: 'destructive', onPress: () => void submit({ allowUnresolvedDomains: true }) },
        ]);
      } else {
        setFormError(err?.message || 'Could not save this campus. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: CampusOverview, confirm = false): Promise<void> {
    const next = c.isActive === false;
    setBusyCode(c.code);
    try {
      await setInstitutionActive(c.code, next, confirm);
      haptics.success();
      refresh();
    } catch (err: any) {
      if (err?.code === MFA_REQUIRED_CODE) {
        setMfa({ title: 'Verify to change a campus', retry: () => toggleActive(c, confirm) });
      } else if (err?.code === 'confirm_required') {
        Alert.alert(`Turn off ${c.name}?`, err.message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Turn off', style: 'destructive', onPress: () => void toggleActive(c, true) },
        ]);
      } else {
        Alert.alert('Could not change the campus', err?.message || 'Please try again.');
      }
    } finally {
      setBusyCode(null);
    }
  }

  async function declineRequest(request: WaitlistEntry) {
    haptics.medium();
    try {
      await respondToWaitlistEntry(request.id, 'rejected');
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    } catch (err: any) {
      Alert.alert('Could not decline', err?.message || 'Please try again.');
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const editing = formOpen?.mode === 'edit';

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="h3" weight="bold">
          Campuses
        </AppText>
        <AppButton label="+ Add campus" size="sm" onPress={() => openCreate()} />
      </View>

      {(requests.data ?? []).length > 0 ? (
        <SolidCard radius={18} style={{ borderWidth: 1, borderColor: colors.brandPrimary, gap: spacing.sm }}>
          <AppText weight="bold" variant="bodySmall">
            {requests.data!.length} university request{requests.data!.length === 1 ? '' : 's'} waiting
          </AppText>
          {requests.data!.map((request) => (
            <View key={request.id} style={{ gap: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider }}>
              <AppText weight="semiBold">{request.universityName}</AppText>
              <AppText tone="secondary" variant="caption">
                Contact: {request.email}
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <AppButton label="Set up campus" size="sm" onPress={() => openCreate(request)} fullWidth />
                </View>
                <View style={{ flex: 1 }}>
                  <AppButton label="Decline" size="sm" variant="secondary" onPress={() => declineRequest(request)} fullWidth />
                </View>
              </View>
            </View>
          ))}
        </SolidCard>
      ) : null}

      {rows.length > 4 ? <AppTextField label="" value={search} onChangeText={setSearch} placeholder="Search campuses by name, code or email domain…" leftIcon="search" /> : null}

      {overview.isError && !plain.data ? (
        <EmptyState icon="cloud-offline-outline" title="Could not load campuses" description={(overview.error as Error)?.message || 'Check your connection and try again.'} actionLabel="Try again" onAction={() => overview.refetch()} />
      ) : null}
      {overview.isError && plain.data ? (
        <AppText variant="caption" tone="secondary">
          Member and link counts are not available yet - the database update for this screen has not been applied.
        </AppText>
      ) : null}

      {shown.length === 0 && !overview.isLoading && !overview.isError ? (
        <EmptyState icon="school-outline" title={q ? 'No campus matches' : 'No campuses yet'} description={q ? 'Try a different search.' : 'Add the first university to get started.'} />
      ) : null}

      {shown.map((c) => {
        const off = c.isActive === false;
        const global = c.code === 'GLOBAL';
        return (
          <SolidCard key={c.code} radius={18} style={{ gap: spacing.sm, opacity: off ? 0.75 : 1, borderLeftWidth: 4, borderLeftColor: c.primaryColor || colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <AppText weight="bold" numberOfLines={2}>
                  {c.name}
                </AppText>
                <AppText tone="secondary" variant="caption" numberOfLines={1}>
                  {[c.code, c.location].filter(Boolean).join(' · ')}
                </AppText>
              </View>
              <Badge label={off ? 'Off' : 'Live'} tone={off ? 'neutral' : 'success'} />
            </View>

            {!global ? (
              (c.emailDomains ?? []).length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {c.emailDomains!.map((d) => (
                    <View key={d} style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.pastelPrimaryBg }}>
                      <AppText variant="caption" weight="semiBold" tone="brand">
                        @{d}
                      </AppText>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Ionicons name="warning-outline" size={15} color={colors.warning} />
                  <AppText variant="caption" style={{ color: colors.warning, flex: 1 }}>
                    No email domain - members here must be verified by document.
                  </AppText>
                </View>
              )
            ) : null}

            {hasCounts ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                <AppText variant="caption" tone="secondary">
                  <AppText variant="caption" weight="bold">{c.memberCount}</AppText> member{c.memberCount === 1 ? '' : 's'}
                  {!global ? ` (${c.verifiedCount} verified)` : ''}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  <AppText variant="caption" weight="bold">{c.activePortalLinkCount}</AppText>
                  {c.portalLinkCount !== c.activePortalLinkCount ? `/${c.portalLinkCount}` : ''} portal link{c.portalLinkCount === 1 ? '' : 's'}
                </AppText>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm }}>
              {!global ? <AppButton label="Edit" size="sm" variant="secondary" icon="create-outline" onPress={() => openEdit(c)} /> : null}
              <AppButton label="Portal links" size="sm" variant="secondary" icon="link-outline" onPress={() => setLinksFor(c.code)} />
              {!global ? (
                <AppButton label={off ? 'Turn on' : 'Turn off'} size="sm" variant="ghost" loading={busyCode === c.code} onPress={() => toggleActive(c)} />
              ) : null}
            </View>
          </SolidCard>
        );
      })}

      {/* add / edit form */}
      <FormSheet
        visible={!!formOpen}
        onClose={() => setFormOpen(null)}
        title={editing ? 'Edit campus' : formOpen?.request ? 'Set up requested campus' : 'Add a campus'}
        subtitle={editing ? `${form.code} · the code cannot be changed` : 'Registers the university so its members join it and its content stays separate.'}
        maxWidth={620}
        footer={
          <View style={{ gap: spacing.xs }}>
            {formError ? (
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                <Ionicons name="alert-circle" size={16} color={colors.critical} style={{ marginTop: 1 }} />
                <AppText variant="caption" weight="semiBold" style={{ color: colors.critical, flex: 1 }}>
                  {formError}
                </AppText>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppButton label="Cancel" variant="ghost" onPress={() => setFormOpen(null)} disabled={saving} fullWidth />
              </View>
              <View style={{ flex: 2 }}>
                <AppButton label={editing ? 'Save changes' : 'Add campus'} onPress={() => submit()} loading={saving} fullWidth />
              </View>
            </View>
          </View>
        }
      >
        <AppTextField
          label="University name *"
          value={form.name}
          onChangeText={(v) => {
            set('name', v.slice(0, 120));
            if (!editing && !codeTouched) set('code', suggestCampusCode(v));
          }}
          placeholder="e.g. Lagos State University"
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <AppTextField
              label="Campus code *"
              value={form.code}
              onChangeText={(v) => {
                setCodeTouched(true);
                set('code', v.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16));
              }}
              placeholder="LASU"
              autoCapitalize="characters"
              editable={!editing}
              helperText={editing ? undefined : 'Short and permanent - it labels everything on this campus.'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppTextField label="Short name" value={form.shortName} onChangeText={(v) => set('shortName', v.slice(0, 24))} placeholder={form.code || 'LASU'} />
          </View>
        </View>
        <AppTextField label="Location" value={form.location} onChangeText={(v) => set('location', v.slice(0, 120))} placeholder="e.g. Ojo, Lagos" />

        <TagInput
          label="Student email domains"
          value={form.domains}
          onChange={(v) => {
            const cleaned = v.map(normaliseDomainInput).filter(Boolean);
            const bad = cleaned.find((d) => !isPlausibleDomain(d));
            if (bad) {
              setFormError(`"${bad}" does not look like a domain (example: lasu.edu.ng).`);
              set('domains', cleaned.filter((d) => isPlausibleDomain(d)));
            } else {
              setFormError(null);
              set('domains', Array.from(new Set(cleaned)));
            }
          }}
          placeholder="e.g. lasu.edu.ng"
          max={10}
          maxLength={80}
          helperText="Anyone who signs up with one of these addresses (or a subdomain such as student.lasu.edu.ng) is verified automatically. Public providers like gmail.com are refused, and each domain is checked in DNS."
        />

        <View style={{ gap: 6 }}>
          <AppText weight="semiBold" variant="bodySmall">
            Brand colour
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {CAMPUS_COLORS.map((hex) => (
              <Pressable
                key={hex}
                onPress={() => set('color', hex)}
                accessibilityRole="button"
                accessibilityLabel={`Colour ${hex}`}
                accessibilityState={{ selected: form.color.toLowerCase() === hex.toLowerCase() }}
                style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: hex, alignItems: 'center', justifyContent: 'center', borderWidth: form.color.toLowerCase() === hex.toLowerCase() ? 3 : 0, borderColor: colors.textPrimary }}
              >
                {form.color.toLowerCase() === hex.toLowerCase() ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
              </Pressable>
            ))}
          </View>
          <AppTextField label="" value={form.color} onChangeText={(v) => set('color', v.slice(0, 7))} placeholder="#1D4ED8" autoCapitalize="none" />
        </View>

        <AppTextField label="Website (optional)" value={form.website} onChangeText={(v) => set('website', v)} placeholder="https://www.lasu.edu.ng" autoCapitalize="none" keyboardType="url" />
        {!editing ? (
          <AppText variant="caption" tone="secondary">
            After adding the campus, use "Portal links" on its card to publish its student portal, library and other shortcuts.
          </AppText>
        ) : null}
      </FormSheet>

      <ManagePortalLinksModal visible={!!linksFor} initialCampus={linksFor ?? undefined} onClose={() => { setLinksFor(null); refresh(); }} />
      <MfaStepUpModal
        visible={!!mfa}
        title={mfa?.title}
        onCancel={() => setMfa(null)}
        onVerified={async () => {
          const retry = mfa?.retry;
          setMfa(null);
          if (retry) await retry();
        }}
      />
    </View>
  );
}
