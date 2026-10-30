import React, { useState } from 'react';
import { FlatList, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { AppTextField } from '@/components/AppTextField';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { QueueItemSkeletonList } from '@/components/Skeleton';
import { DateOfBirthField, useDobFields } from '@/components/DateOfBirthField';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/auth/AuthContext';
import { haptics } from '@/utils/haptics';
import { GUARDIAN_RELATIONSHIPS, relationshipLabel, type GuardianRelationship } from '@/api/minors';
import {
  ADMIN_MINORS_QUERY_KEY,
  correctDateOfBirth,
  getAgeDiagnostics,
  getMinorGuardian,
  listMinors,
  recordGuardianConsent,
  type MinorListFilter,
  type MinorListItem,
  type RecordableConsent,
} from '@/api/adminMinors';

const FILTERS: Array<{ key: MinorListFilter; label: string }> = [
  { key: 'pending', label: 'Needs action' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'declined', label: 'Declined' },
  { key: 'revoked', label: 'Withdrawn' },
  { key: 'under_13', label: 'Under 13 (blocked)' },
  { key: 'all', label: 'All' },
];

const STATUS_BADGE: Record<string, { label: string; tone: 'neutral' | 'success' | 'warning' | 'critical' }> = {
  missing: { label: 'No guardian yet', tone: 'warning' },
  pending: { label: 'Pending', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  declined: { label: 'Declined', tone: 'critical' },
  revoked: { label: 'Withdrawn', tone: 'critical' },
  under_13: { label: 'Under 13', tone: 'critical' },
};

const DECISIONS: Record<RecordableConsent, { title: string; verb: string; icon: keyof typeof Ionicons.glyphMap; help: string }> = {
  confirmed: { title: 'Confirm consent', verb: 'Confirm', icon: 'checkmark-circle-outline', help: 'The guardian agreed. The member keeps the under-18 limits on marketplace listings and giving, but jobs, messages and search unlock.' },
  declined: { title: 'Decline', verb: 'Decline', icon: 'close-circle-outline', help: 'The guardian refused, or could not be reached. The account stays limited.' },
  revoked: { title: 'Record withdrawal', verb: 'Withdraw consent', icon: 'remove-circle-outline', help: 'The guardian withdrew a consent given earlier. The account is limited again.' },
  pending: { title: 'Reset to pending', verb: 'Reset', icon: 'refresh-outline', help: 'Re-open the check (for example the guardian changed their mind). The account stays limited.' },
};

/** Which decisions make sense from each current status (the database enforces the same table). */
const ALLOWED: Record<string, RecordableConsent[]> = {
  missing: ['confirmed', 'declined'],
  pending: ['confirmed', 'declined'],
  confirmed: ['revoked'],
  declined: ['confirmed', 'pending'],
  revoked: ['confirmed', 'pending'],
};

const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

export default function MinorsConsentScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const campus = user?.isCampusAdmin && user?.campusCode ? user.campusCode : undefined;
  const scopeLabel = user?.isSuperAdmin ? 'all campuses' : campus ? `${campus} only` : 'your campus only';

  const [filter, setFilter] = useState<MinorListFilter>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  const list = useQuery({
    queryKey: [...ADMIN_MINORS_QUERY_KEY, 'list', filter, campus ?? 'all'],
    queryFn: () => listMinors(filter, campus),
  });
  const diagnostics = useQuery({
    queryKey: [...ADMIN_MINORS_QUERY_KEY, 'diagnostics', campus ?? 'all'],
    queryFn: () => getAgeDiagnostics(campus),
    retry: false,
  });

  async function refreshAll() {
    await queryClient.invalidateQueries({ queryKey: ADMIN_MINORS_QUERY_KEY });
  }

  const d = diagnostics.data;

  return (
    <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: isDesktop ? 4 : 8 }}>
        <AdminSectionTabs group="people" badges={{ minors: list.data && filter === 'pending' ? list.data.length : undefined }} />
      </View>

      <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, marginBottom: spacing.sm }}>
        <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold">
          Members under 18
        </AppText>
        <AppText tone="secondary" variant="caption">
          Parent / guardian consent for members aged 13-17. Contact the guardian using the details on the record, then record
          the outcome here. Lioris does not e-mail guardians itself. Opening a record and every decision is logged.
        </AppText>
        <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
          Showing members of: {scopeLabel}
        </AppText>
      </View>

      {d ? (
        <SolidCard radius={16} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            <View>
              <AppText variant="h3" weight="bold">{d.minorsTotal}</AppText>
              <AppText variant="caption" tone="secondary">aged 13-17</AppText>
            </View>
            {Object.entries(d.minorsByConsent).map(([status, n]) => (
              <View key={status}>
                <AppText variant="h3" weight="bold">{n}</AppText>
                <AppText variant="caption" tone="secondary">{STATUS_BADGE[status]?.label ?? status}</AppText>
              </View>
            ))}
            <View>
              <AppText variant="h3" weight="bold">{d.under13Blocked}</AppText>
              <AppText variant="caption" tone="secondary">under 13 (blocked)</AppText>
            </View>
          </View>
          <Pressable
            onPress={() => setShowMissing((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="Members without a date of birth"
            style={{ marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Ionicons name={showMissing ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.brandPrimary} />
            <AppText variant="caption" tone="brand" weight="bold">
              {d.missingDateOfBirth} of {d.membersTotal} members have not added a date of birth (treated as adults)
            </AppText>
          </Pressable>
          {showMissing ? (
            <View style={{ marginTop: spacing.xs, gap: 2 }}>
              {d.missingDateOfBirthSample.map((m) => (
                <AppText key={m.id} variant="caption" tone="secondary">
                  {m.fullName} · {m.role}{m.campusCode ? ` · ${m.campusCode}` : ''} · joined {formatDate(m.createdAt)}
                </AppText>
              ))}
              {d.missingDateOfBirth > d.missingDateOfBirthSample.length ? (
                <AppText variant="caption" tone="secondary">
                  ...and {d.missingDateOfBirth - d.missingDateOfBirthSample.length} more. They are asked once per app launch.
                </AppText>
              ) : null}
            </View>
          ) : null}
        </SolidCard>
      ) : null}

      <ScrollView horizontal accessibilityRole="tablist" showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: spacing.md }} contentContainerStyle={{ gap: spacing.xs }}>
        {FILTERS.map((f) => {
          const selected = filter === f.key;
          return (
            <Pressable
              key={f.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              aria-selected={selected}
              onPress={() => setFilter(f.key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.brandPrimary : colors.surface,
                borderWidth: 1,
                borderColor: selected ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText variant="bodySmall" weight={selected ? 'bold' : 'medium'} tone={selected ? 'onBrand' : 'secondary'}>
                {f.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {list.isLoading ? (
        <QueueItemSkeletonList count={4} />
      ) : list.error ? (
        <SolidCard radius={16} style={{ borderWidth: 1, borderColor: `${colors.critical}55` }}>
          <AppText weight="bold" variant="bodySmall">Could not load members under 18</AppText>
          <AppText tone="secondary" variant="caption" style={{ marginVertical: spacing.xs }}>
            {(list.error as Error).message}
          </AppText>
          <AppButton label="Retry" size="sm" variant="secondary" onPress={() => list.refetch()} />
        </SolidCard>
      ) : (
        <FlatList
          key={isDesktop ? 'desktop-2-col' : 'mobile-1-col'}
          style={{ flex: 1, minHeight: 0 }}
          data={list.data ?? []}
          keyExtractor={(item) => item.minorId}
          numColumns={isDesktop ? 2 : 1}
          columnWrapperStyle={isDesktop ? { gap: spacing.md } : undefined}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 150, gap: spacing.sm }}
          ListEmptyComponent={
            <EmptyState
              icon="shield-checkmark-outline"
              title={filter === 'pending' ? 'Nobody is waiting' : 'Nobody here'}
              description={filter === 'pending' ? 'Members aged 13-17 without confirmed guardian consent appear here.' : 'No members match this filter.'}
            />
          }
          renderItem={({ item }) => <MinorCard item={item} onOpen={() => setOpenId(item.minorId)} />}
        />
      )}

      <MinorRecordModal
        minorId={openId}
        onClose={() => setOpenId(null)}
        onChanged={async (message) => {
          toast.success(message);
          await refreshAll();
        }}
      />
    </ScreenContainer>
  );
}

function MinorCard({ item, onOpen }: { item: MinorListItem; onOpen: () => void }) {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const badge = STATUS_BADGE[item.consentStatus] ?? { label: item.consentStatus, tone: 'neutral' as const };
  return (
    <SolidCard radius={18} style={{ flex: isDesktop ? 1 : undefined, minWidth: 0, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 160 }}>
          <AppText weight="bold">{item.fullName}</AppText>
          <AppText tone="secondary" variant="caption">
            {item.ageYears !== null ? `${item.ageYears} years old · ` : ''}
            {item.role}
            {item.campusCode ? ` · ${item.campusCode}` : ''} · joined {formatDate(item.joinedAt)}
          </AppText>
        </View>
        <Badge label={badge.label} tone={badge.tone} />
      </View>
      <AppText variant="bodySmall" style={{ marginTop: spacing.sm }}>
        {item.guardianName
          ? `${relationshipLabel(item.guardianRelationship)}: ${item.guardianName}`
          : 'No guardian details submitted yet.'}
      </AppText>
      {item.decidedAt ? (
        <AppText variant="caption" tone="secondary">
          Decided {formatDate(item.decidedAt)}{item.decidedByName ? ` by ${item.decidedByName}` : ''}
        </AppText>
      ) : item.submittedAt ? (
        <AppText variant="caption" tone="secondary">Details submitted {formatDate(item.submittedAt)}</AppText>
      ) : null}
      <View style={{ marginTop: spacing.md }}>
        <AppButton label="Open record" icon="document-text-outline" variant="secondary" onPress={onOpen} fullWidth />
      </View>
    </SolidCard>
  );
}

function MinorRecordModal({ minorId, onClose, onChanged }: { minorId: string | null; onClose: () => void; onChanged: (message: string) => Promise<void> }) {
  const { colors, spacing, radius } = useTheme();
  const record = useQuery({
    queryKey: [...ADMIN_MINORS_QUERY_KEY, 'record', minorId],
    queryFn: () => getMinorGuardian(minorId as string),
    enabled: !!minorId,
    // Opening a record is audited: never re-open it silently in the background.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const [decision, setDecision] = useState<RecordableConsent | null>(null);
  const [note, setNote] = useState('');
  const [gName, setGName] = useState('');
  const [gRelationship, setGRelationship] = useState<GuardianRelationship>('parent');
  const [gEmail, setGEmail] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixingDob, setFixingDob] = useState(false);
  const [dobReason, setDobReason] = useState('');
  const { fields, setFields, parsed } = useDobFields();

  function reset() {
    setDecision(null);
    setNote('');
    setGName('');
    setGEmail('');
    setGPhone('');
    setError(null);
    setFixingDob(false);
    setDobReason('');
    setFields({ day: '', month: '', year: '' });
  }

  function close() {
    reset();
    onClose();
  }

  const data = record.data;
  const status = data?.consentStatus ?? 'missing';
  const hasGuardian = !!data?.guardian;

  async function submitDecision() {
    if (!minorId || !decision) return;
    setError(null);
    if (note.trim().length < 3) {
      setError('Say how consent was verified (for example "phoned the parent on the number given, 12 Nov").');
      return;
    }
    setSaving(true);
    try {
      await recordGuardianConsent({
        minorId,
        status: decision,
        note,
        guardian: hasGuardian ? undefined : { name: gName, relationship: gRelationship, email: gEmail, phone: gPhone },
      });
      haptics.success();
      await onChanged(`${DECISIONS[decision].title}: recorded.`);
      close();
    } catch (err: any) {
      haptics.error();
      setError(err?.message || 'Could not record the decision.');
    } finally {
      setSaving(false);
    }
  }

  async function submitDobCorrection() {
    if (!minorId || !parsed.iso) return;
    setError(null);
    if (dobReason.trim().length < 10) {
      setError('Give a reason of at least 10 characters (what evidence you saw).');
      return;
    }
    setSaving(true);
    try {
      await correctDateOfBirth(minorId, parsed.iso, dobReason);
      haptics.success();
      await onChanged('Date of birth corrected and logged.');
      close();
    } catch (err: any) {
      haptics.error();
      setError(err?.message || 'Could not correct the date of birth.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={!!minorId} transparent animationType="fade" onRequestClose={() => !saving && close()}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 20, maxWidth: 520, width: '100%', maxHeight: '92%', alignSelf: 'center', overflow: 'hidden' }}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, paddingRight: spacing.sm }}>
                <AppText variant="h3" weight="bold">{data?.minor.fullName ?? 'Guardian record'}</AppText>
                {data ? (
                  <AppText variant="caption" tone="secondary">
                    {data.minor.ageYears !== null ? `${data.minor.ageYears} years old` : 'Age unknown'}
                    {data.minor.dateOfBirth ? ` · born ${formatDate(data.minor.dateOfBirth)}` : ''}
                    {data.minor.campusCode ? ` · ${data.minor.campusCode}` : ''}
                  </AppText>
                ) : null}
              </View>
              <Pressable onPress={() => !saving && close()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            {record.isLoading ? (
              <AppText tone="secondary">Opening record...</AppText>
            ) : record.error ? (
              <View style={{ gap: spacing.sm }}>
                <AppText tone="critical" variant="bodySmall">{(record.error as Error).message}</AppText>
                <AppButton label="Retry" size="sm" variant="secondary" onPress={() => record.refetch()} />
              </View>
            ) : data ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Badge label={(STATUS_BADGE[status] ?? STATUS_BADGE.missing).label} tone={(STATUS_BADGE[status] ?? STATUS_BADGE.missing).tone} />
                  {data.guardian?.decidedAt ? (
                    <AppText variant="caption" tone="secondary">
                      {formatDate(data.guardian.decidedAt)}{data.guardian.decidedByName ? ` · ${data.guardian.decidedByName}` : ''}
                    </AppText>
                  ) : null}
                </View>

                {data.guardian ? (
                  <View style={{ padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.divider, gap: 4 }}>
                    <AppText weight="bold">{relationshipLabel(data.guardian.relationship)}: {data.guardian.name}</AppText>
                    {data.guardian.email ? (
                      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`mailto:${data.guardian!.email}`).catch(() => {})}>
                        <AppText variant="bodySmall" tone="brand">{data.guardian.email}</AppText>
                      </Pressable>
                    ) : null}
                    {data.guardian.phone ? (
                      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`tel:${data.guardian!.phone!.replace(/[^+\d]/g, '')}`).catch(() => {})}>
                        <AppText variant="bodySmall" tone="brand">{data.guardian.phone}</AppText>
                      </Pressable>
                    ) : null}
                    <AppText variant="caption" tone="secondary">Submitted {formatDate(data.guardian.submittedAt)}</AppText>
                    {data.guardian.note ? (
                      <AppText variant="caption" tone="secondary">Note on file: {data.guardian.note}</AppText>
                    ) : null}
                  </View>
                ) : (
                  <AppText variant="bodySmall" tone="secondary">
                    This member has not submitted guardian details. If you reached the guardian another way, enter their details
                    together with your decision.
                  </AppText>
                )}

                {!decision && !fixingDob ? (
                  <View style={{ gap: spacing.sm }}>
                    {(ALLOWED[status] ?? []).map((d) => (
                      <AppButton
                        key={d}
                        label={DECISIONS[d].title}
                        icon={DECISIONS[d].icon}
                        variant={d === 'confirmed' ? 'primary' : 'secondary'}
                        onPress={() => {
                          setError(null);
                          setDecision(d);
                        }}
                        fullWidth
                      />
                    ))}
                    <AppButton
                      label="Correct date of birth"
                      icon="calendar-outline"
                      variant="ghost"
                      onPress={() => {
                        setError(null);
                        setFixingDob(true);
                      }}
                      fullWidth
                    />
                  </View>
                ) : null}

                {decision ? (
                  <View style={{ gap: spacing.xs }}>
                    <AppText weight="bold">{DECISIONS[decision].title}</AppText>
                    <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.xs }}>{DECISIONS[decision].help}</AppText>
                    {!hasGuardian ? (
                      <>
                        <AppTextField label="Guardian's full name" value={gName} onChangeText={setGName} />
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
                          {GUARDIAN_RELATIONSHIPS.map((r) => {
                            const selected = gRelationship === r.value;
                            return (
                              <Pressable
                                key={r.value}
                                onPress={() => setGRelationship(r.value)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected }}
                                aria-checked={selected}
                                style={{
                                  paddingHorizontal: 12,
                                  paddingVertical: 6,
                                  borderRadius: radius.pill,
                                  backgroundColor: selected ? colors.brandPrimary : colors.surface,
                                  borderWidth: 1,
                                  borderColor: selected ? colors.brandPrimary : colors.border,
                                }}
                              >
                                <AppText variant="caption" weight="bold" tone={selected ? 'onBrand' : 'primary'}>{r.label}</AppText>
                              </Pressable>
                            );
                          })}
                        </View>
                        <AppTextField label="E-mail (optional if phone given)" value={gEmail} onChangeText={setGEmail} autoCapitalize="none" keyboardType="email-address" />
                        <AppTextField label="Phone (optional if e-mail given)" value={gPhone} onChangeText={setGPhone} keyboardType="phone-pad" />
                      </>
                    ) : null}
                    <AppTextField
                      label="How was this verified? (kept on the record)"
                      value={note}
                      onChangeText={setNote}
                      multiline
                      numberOfLines={3}
                      placeholder="e.g. Phoned the parent on the number given and confirmed it is them"
                    />
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <View style={{ flex: 1 }}>
                        <AppButton label="Back" variant="secondary" onPress={() => setDecision(null)} disabled={saving} fullWidth />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppButton label={DECISIONS[decision].verb} onPress={submitDecision} loading={saving} fullWidth />
                      </View>
                    </View>
                  </View>
                ) : null}

                {fixingDob ? (
                  <View style={{ gap: spacing.xs }}>
                    <AppText weight="bold">Correct date of birth</AppText>
                    <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.xs }}>
                      Only for a mistake you have seen evidence of (for example a student ID or passport). The reason is logged.
                      Moving the member to 18 or older removes the guardian record; correcting an under-13 mistake lifts the
                      age block.
                    </AppText>
                    <DateOfBirthField fields={fields} onChange={setFields} parsed={parsed} label="Correct date of birth" />
                    <AppTextField label="Reason (kept in the audit log)" value={dobReason} onChangeText={setDobReason} multiline numberOfLines={3} />
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <View style={{ flex: 1 }}>
                        <AppButton label="Back" variant="secondary" onPress={() => setFixingDob(false)} disabled={saving} fullWidth />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppButton label="Correct" onPress={submitDobCorrection} loading={saving} disabled={!parsed.iso} fullWidth />
                      </View>
                    </View>
                  </View>
                ) : null}

                {error ? (
                  <AppText variant="bodySmall" tone="critical" accessibilityRole="alert">{error}</AppText>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
