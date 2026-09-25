import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText } from '../AppText';
import { AppTextField } from '../AppTextField';
import { AppButton } from '../AppButton';
import { Avatar } from '../Avatar';
import { Badge } from '../Badge';
import { FormSheet } from '../common/FormSheet';
import { SegmentedTabs } from '../common/SegmentedTabs';
import { useTheme } from '@/theme/ThemeProvider';
import { useToast } from '@/context/ToastContext';
import { listEventAttendees } from '@/api/events';
import { checkInAttendee, confirmPurchase, getReferralReport } from '@/api/paidEvents';
import { EventAttendeeInfo } from '@/api/types';
import { haptics } from '@/utils/haptics';
import {
  formatNaira,
  formatTicketCode,
  funnelSentence,
  parseTicketScan,
  ratio,
  toCsv,
} from '@/utils/paidEvents';

export interface DoorEvent {
  id: string;
  title: string;
  ticketType?: 'free' | 'paid';
  ticketPrice?: number;
}

type Tab = 'checkin' | 'roster' | 'report';

interface ScanBanner {
  tone: 'success' | 'info' | 'error';
  text: string;
  userId?: string;
  ticketType?: 'free' | 'paid';
  purchaseConfirmed?: boolean;
}

/** Camera QR reading in the browser, where the platform supports it (Chrome / Edge / Android). Manual entry works everywhere. */
function useWebQrScanner(active: boolean, onCode: (text: string) => void) {
  const videoRef = useRef<any>(null);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRef = useRef<{ text: string; at: number } | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => {
    if (!active || !supported) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    setError(null);
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current as HTMLVideoElement | null;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});
        const Detector = (window as any).BarcodeDetector;
        const detector = new Detector({ formats: ['qr_code'] });
        timer = setInterval(async () => {
          if (!video || video.readyState < 2) return;
          try {
            const found = await detector.detect(video);
            const text: string | undefined = found?.[0]?.rawValue;
            if (!text) return;
            const now = Date.now();
            // the same pass held in front of the camera must not fire again and again
            if (lastRef.current && lastRef.current.text === text && now - lastRef.current.at < 4000) return;
            lastRef.current = { text, at: now };
            onCode(text);
          } catch {
            /* a frame that cannot be read is just skipped */
          }
        }, 350);
      } catch (e: any) {
        setError(e?.name === 'NotAllowedError' ? 'Camera permission was refused. Allow it in the browser, or type the code.' : 'Could not start the camera. Type the code instead.');
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active, supported, onCode]);

  return { videoRef, supported, error };
}

function StatBox({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: '30%', minWidth: 96, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface }}>
      <AppText variant="caption" tone="secondary">{label}</AppText>
      <AppText weight="bold" style={{ fontSize: 20 }}>{value}</AppText>
      {hint ? <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>{hint}</AppText> : null}
    </View>
  );
}

/**
 * The organiser's door desk: check people in (by typing or scanning the code on their pass, or from the list), confirm
 * who actually bought entry (paid events), and see how many people Lioris sent. Also used by administrators.
 * Check-ins measure Lioris's reach; only "confirmed as bought entry" counts as a purchase.
 */
export function EventDoorDesk({
  visible,
  onClose,
  event,
  initialTab = 'checkin',
  isAdmin = false,
}: {
  visible: boolean;
  onClose: () => void;
  event: DoorEvent | null;
  initialTab?: Tab;
  isAdmin?: boolean;
}) {
  const { colors, spacing, radius } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [code, setCode] = useState('');
  const [search, setSearch] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<ScanBanner | null>(null);
  const [scanning, setScanning] = useState(false);
  const paid = event?.ticketType === 'paid';
  const eventId = event?.id ?? '';

  useEffect(() => {
    if (visible) {
      setTab(initialTab);
      setBanner(null);
      setCode('');
      setSearch('');
      setScanning(false);
    }
  }, [visible, initialTab]);

  const roster = useQuery({
    queryKey: ['event-roster', eventId],
    queryFn: () => listEventAttendees(eventId),
    enabled: visible && !!eventId,
  });
  const report = useQuery({
    queryKey: ['event-report', eventId],
    queryFn: () => getReferralReport(eventId),
    enabled: visible && !!eventId,
  });

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['event-roster', eventId] }),
      queryClient.invalidateQueries({ queryKey: ['event-report', eventId] }),
    ]);
  }, [queryClient, eventId]);

  const doCheckIn = useCallback(
    async (who: { code: string } | { userId: string }, opts: { undo?: boolean } = {}) => {
      if (!eventId) return;
      const key = 'code' in who ? 'code' : who.userId;
      setBusyKey(key);
      try {
        const res = await checkInAttendee(eventId, who, opts);
        if (res.status === 'checked_in') {
          haptics.success();
          setBanner({ tone: 'success', text: `${res.fullName} is checked in.`, userId: res.userId, ticketType: res.ticketType, purchaseConfirmed: !!res.purchaseConfirmedAt });
        } else if (res.status === 'already') {
          haptics.light();
          setBanner({ tone: 'info', text: `${res.fullName} was already checked in.`, userId: res.userId, ticketType: res.ticketType, purchaseConfirmed: !!res.purchaseConfirmedAt });
        } else {
          setBanner({ tone: 'info', text: `${res.fullName}'s check-in was undone.` });
        }
        if ('code' in who) setCode('');
        await refresh();
      } catch (err: any) {
        haptics.error();
        setBanner({ tone: 'error', text: err?.message || 'Could not check this person in.' });
      } finally {
        setBusyKey(null);
      }
    },
    [eventId, refresh],
  );

  const onScanned = useCallback(
    (text: string) => {
      const parsed = parseTicketScan(text);
      if (!parsed) {
        setBanner({ tone: 'error', text: 'That QR code is not a Lioris pass.' });
        return;
      }
      void doCheckIn({ code: parsed });
    },
    [doCheckIn],
  );
  const scanner = useWebQrScanner(visible && tab === 'checkin' && scanning, onScanned);

  async function toggleBought(a: EventAttendeeInfo) {
    setBusyKey(`buy:${a.userId}`);
    try {
      await confirmPurchase(eventId, a.userId, !a.purchaseConfirmedAt);
      haptics.success();
      if (banner?.userId === a.userId) setBanner({ ...banner, purchaseConfirmed: !a.purchaseConfirmedAt });
      await refresh();
    } catch (err: any) {
      haptics.error();
      toast.error(err?.message || 'Could not record that.');
    } finally {
      setBusyKey(null);
    }
  }

  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = roster.data ?? [];
    if (!q) return all;
    return all.filter(
      (a) =>
        a.fullName.toLowerCase().includes(q) ||
        (a.matricNumber ?? '').toLowerCase().includes(q) ||
        (a.department ?? '').toLowerCase().includes(q) ||
        (a.ticketCode ?? '').toLowerCase().includes(q.replace(/[^a-z0-9]/g, '')),
    );
  }, [roster.data, search]);

  function exportCsv() {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !roster.data) return;
    const rows: (string | number | null)[][] = [
      ['Name', 'Reference', 'Registered', 'Checked in', paid ? 'Confirmed bought entry' : '', 'Matric number', 'Department'],
      ...roster.data.map((a) => [
        a.fullName,
        formatTicketCode(a.ticketCode),
        a.registeredAt,
        a.checkedInAt ?? '',
        paid ? a.purchaseConfirmedAt ?? '' : '',
        a.matricNumber ?? '',
        a.department ?? '',
      ]),
    ];
    const blob = new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(event?.title ?? 'event').replace(/[^a-z0-9]+/gi, '_')}_attendance.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const r = report.data;
  const bannerColor = banner?.tone === 'success' ? colors.success : banner?.tone === 'error' ? colors.critical : colors.textSecondary;

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Door desk"
      subtitle={event?.title}
      maxWidth={680}
      footer={<AppButton label="Done" onPress={onClose} fullWidth />}
    >
      <View style={{ marginBottom: spacing.sm }}>
        <SegmentedTabs
          tabs={[
            { key: 'checkin', label: 'Check in' },
            { key: 'roster', label: 'People', badge: roster.data?.length },
            { key: 'report', label: 'Report' },
          ]}
          active={tab}
          onChange={(k) => setTab(k as Tab)}
        />
      </View>

      {tab === 'checkin' ? (
        <View>
          <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm, lineHeight: 16 }}>
            Ask for the pass in the student's Lioris app: scan its QR code, or type the reference under it. Check-in opens 6 hours
            before the start.
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <AppTextField
                label="Reference code"
                placeholder="A1B2-C3D4-E5F6"
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                onSubmitEditing={() => {
                  const parsed = parseTicketScan(code);
                  if (parsed) void doCheckIn({ code: parsed });
                  else setBanner({ tone: 'error', text: 'A reference has 12 letters and numbers, like A1B2-C3D4-E5F6.' });
                }}
              />
            </View>
            <View style={{ marginTop: 26 }}>
              <AppButton
                label="Check in"
                loading={busyKey === 'code'}
                onPress={() => {
                  const parsed = parseTicketScan(code);
                  if (parsed) void doCheckIn({ code: parsed });
                  else setBanner({ tone: 'error', text: 'A reference has 12 letters and numbers, like A1B2-C3D4-E5F6.' });
                }}
              />
            </View>
          </View>

          {scanner.supported ? (
            <View style={{ marginBottom: spacing.sm }}>
              <AppButton
                label={scanning ? 'Stop camera' : 'Scan a QR code with the camera'}
                icon={scanning ? 'stop-circle-outline' : 'qr-code-outline'}
                variant="secondary"
                onPress={() => setScanning((s) => !s)}
              />
              {scanning ? (
                <View style={{ marginTop: spacing.sm, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000', height: 260 }}>
                  {React.createElement('video', {
                    ref: scanner.videoRef,
                    playsInline: true,
                    muted: true,
                    autoPlay: true,
                    style: { width: '100%', height: '100%', objectFit: 'cover' },
                    'aria-label': 'Camera preview for scanning QR passes',
                  })}
                </View>
              ) : null}
              {scanner.error ? (
                <AppText variant="caption" style={{ color: colors.critical, marginTop: 6 }}>{scanner.error}</AppText>
              ) : null}
            </View>
          ) : (
            <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
              This device cannot scan QR codes in the browser, so type the reference code or use the People tab.
            </AppText>
          )}

          {banner ? (
            <View style={{ borderWidth: 1, borderColor: bannerColor, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.xs }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Ionicons
                  name={banner.tone === 'success' ? 'checkmark-circle' : banner.tone === 'error' ? 'alert-circle' : 'information-circle'}
                  size={20}
                  color={bannerColor}
                />
                <AppText weight="bold" variant="bodySmall" style={{ flex: 1 }}>{banner.text}</AppText>
              </View>
              {banner.userId && banner.ticketType === 'paid' ? (
                <View style={{ marginTop: spacing.sm }}>
                  <AppButton
                    label={banner.purchaseConfirmed ? 'Bought entry: confirmed (tap to undo)' : 'Confirm they bought entry'}
                    variant={banner.purchaseConfirmed ? 'secondary' : 'primary'}
                    size="sm"
                    loading={busyKey === `buy:${banner.userId}`}
                    onPress={() => {
                      const a = roster.data?.find((x) => x.userId === banner.userId);
                      if (a) void toggleBought(a);
                    }}
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          {r ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
              <StatBox label="Registered" value={r.rsvps} />
              <StatBox label="Checked in" value={r.checkedIn} />
              {paid ? <StatBox label="Bought entry" value={r.purchasesConfirmed} hint="confirmed by you" /> : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {tab === 'roster' ? (
        <View>
          <AppTextField label="" placeholder="Search by name, code, matric or department" value={search} onChangeText={setSearch} />
          {roster.isLoading ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: spacing.lg }} />
          ) : people.length === 0 ? (
            <AppText tone="secondary" variant="bodySmall" style={{ textAlign: 'center', marginVertical: spacing.lg }}>
              {search ? 'Nobody matches that search.' : 'Nobody has registered yet.'}
            </AppText>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} nestedScrollEnabled>
              {people.map((a) => {
                const isIn = !!a.checkedInAt;
                return (
                  <View key={a.userId} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Avatar name={a.fullName} size={36} role={(a.role as any) || 'student'} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText weight="bold" numberOfLines={1} style={{ fontSize: 13.5 }}>{a.fullName}</AppText>
                        <AppText variant="caption" tone="secondary" numberOfLines={1}>
                          {formatTicketCode(a.ticketCode)}
                          {a.matricNumber ? ` · ${a.matricNumber}` : ''}
                          {a.department ? ` · ${a.department}` : ''}
                        </AppText>
                      </View>
                      {isIn ? <Badge label={a.purchaseConfirmedAt ? 'In · bought' : 'Checked in'} tone="success" /> : <Badge label="Registered" tone="neutral" />}
                    </View>
                    <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: 8, flexWrap: 'wrap' }}>
                      {isIn ? (
                        <AppButton label="Undo check-in" size="sm" variant="ghost" loading={busyKey === a.userId} onPress={() => doCheckIn({ userId: a.userId }, { undo: true })} />
                      ) : (
                        <AppButton label="Check in" size="sm" loading={busyKey === a.userId} onPress={() => doCheckIn({ userId: a.userId })} />
                      )}
                      {paid && isIn ? (
                        <AppButton
                          label={a.purchaseConfirmedAt ? 'Bought entry ✓' : 'Confirm bought entry'}
                          size="sm"
                          variant={a.purchaseConfirmedAt ? 'secondary' : 'primary'}
                          loading={busyKey === `buy:${a.userId}`}
                          onPress={() => toggleBought(a)}
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : null}

      {tab === 'report' ? (
        <View>
          {report.isLoading ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: spacing.lg }} />
          ) : r ? (
            <View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
                {paid ? <StatBox label="Opened payment page" value={r.linkClicks} hint="people, from Lioris" /> : null}
                <StatBox label="Registered" value={r.rsvps} />
                <StatBox label="Checked in" value={r.checkedIn} hint={r.rsvps ? ratio(r.checkedIn, r.rsvps) : undefined} />
                {paid ? <StatBox label="Bought entry" value={r.purchasesConfirmed} hint="confirmed at the door" /> : null}
                {paid ? <StatBox label="Awaiting confirmation" value={r.awaitingConfirmation} hint="checked in, not confirmed" /> : null}
                {r.noShows !== null ? <StatBox label="No-shows" value={r.noShows} /> : null}
              </View>
              {paid ? (
                <AppText variant="caption" tone="secondary" style={{ lineHeight: 16, marginBottom: spacing.sm }}>
                  {funnelSentence({ linkClicks: r.linkClicks, rsvps: r.rsvps, checkedIn: r.checkedIn, purchasesConfirmed: r.purchasesConfirmed })}.
                  Check-ins show how many people Lioris brought to the event. Only people you confirmed as having bought entry count
                  as purchases; confirm them from the People tab while they are at the door.
                </AppText>
              ) : (
                <AppText variant="caption" tone="secondary" style={{ lineHeight: 16, marginBottom: spacing.sm }}>
                  {r.checkedIn} of {r.rsvps} registered people checked in.
                </AppText>
              )}
              {isAdmin && r.partnershipStatus ? (
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm }}>
                  <AppText weight="bold" variant="bodySmall">Partnership: {r.partnershipStatus}</AppText>
                  {r.partnershipStatus === 'agreed' ? (
                    <AppText variant="caption" style={{ lineHeight: 16 }}>
                      {formatNaira(r.feePerPayingAttendee)} per confirmed paying attendee × {r.purchasesConfirmed} = {formatNaira(r.estimatedAmount)} (estimate).
                      Dispute window {r.disputeWindowOpen ? 'open until' : 'closed on'} {r.disputeWindowEndsAt ? new Date(r.disputeWindowEndsAt).toLocaleDateString() : ''}.
                    </AppText>
                  ) : (
                    <AppText variant="caption" tone="secondary" style={{ lineHeight: 16 }}>
                      No agreement recorded, so these numbers show reach only; they do not establish any money owed.
                    </AppText>
                  )}
                </View>
              ) : null}
              {Platform.OS === 'web' ? <AppButton label="Download attendance (CSV)" icon="download-outline" variant="secondary" onPress={exportCsv} /> : null}
            </View>
          ) : (
            <AppText tone="secondary" variant="bodySmall">The report could not be loaded.</AppText>
          )}
        </View>
      ) : null}
    </FormSheet>
  );
}
