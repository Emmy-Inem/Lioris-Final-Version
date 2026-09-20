import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { Badge } from './Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useAuth } from '@/auth/AuthContext';
import { useCampusScope } from '@/hooks/useCampusScope';
import { createEvent } from '@/api/events';
import { EventCategory } from '@/api/types';
import { getInstitutionByCode } from '@/api/institutions';
import { VerifiedCampusLocationPicker } from './VerifiedCampusLocationPicker';
import { haptics } from '@/utils/haptics';
import { getFriendlyErrorMessage } from '@/utils/errors';

const EVENT_TYPES = ['Lioris Live Event (In-App)', 'Physical Event', 'External Event'] as const;

const CATEGORY_LABELS: Record<string, EventCategory> = {
  Academic: 'academic',
  Career: 'career',
  Workshop: 'workshop',
  Seminar: 'seminar',
  Social: 'student',
  Alumni: 'alumni',
};
const CATEGORIES = Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>;

const CAMPUSES = [
  { code: 'UI', label: 'UI (Ibadan)' },
  { code: 'UNILAG', label: 'UNILAG (Lagos)' },
  { code: 'OAU', label: 'OAU (Ife)' },
  { code: 'FUNAAB', label: 'FUNAAB (Abeokuta)' },
  { code: 'CU', label: 'Covenant (Ota)' },
  { code: 'GLOBAL', label: 'Global / All Campuses' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const START_TIME_PICKS: Array<{ label: string; value: string }> = [
  { label: '9:00 AM', value: '09:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '3:00 PM', value: '15:00' },
  { label: '6:00 PM', value: '18:00' },
];

interface PublishEventModalProps {
  visible: boolean;
  onClose: () => void;
  onPublished?: () => void;
  onPublish?: () => void;
  defaultScope?: 'campus' | 'global' | 'alumni' | 'student';
  defaultCategory?: string;
}

const DURATION_PICKS: Array<{ label: string; minutes: number }> = [
  { label: '1 hr', minutes: 60 },
  { label: '1.5 hr', minutes: 90 },
  { label: '2 hr', minutes: 120 },
  { label: '3 hr', minutes: 180 },
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function nextWeekendDate(): Date {
  const d = new Date();
  const day = d.getDay(); // 0 = Sun ... 6 = Sat
  const daysUntilSat = (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilSat);
  return d;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${pad2(newH)}:${pad2(newM)}`;
}

export function PublishEventModal({
  visible,
  onClose,
  onPublished,
  onPublish,
  defaultScope,
  defaultCategory,
}: PublishEventModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { campusCode: defaultCampus, homeInstitutionCode } = useCampusScope();

  const isStaffOrAdmin = user?.role === 'admin' || user?.role === 'staff' || user?.actualRole === 'admin';
  const isAlumniHost = defaultScope === 'alumni' || user?.role === 'alumni';

  // Strictly bind to the current workspace's university institution
  const activeCampus = (defaultCampus && defaultCampus !== 'GLOBAL') ? defaultCampus : homeInstitutionCode;
  const institution = activeCampus ? getInstitutionByCode(activeCampus) : undefined;
  const institutionName = institution?.name ?? 'Campus';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<(typeof EVENT_TYPES)[number]>('Lioris Live Event (In-App)');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(
    (defaultCategory as any) || (isAlumniHost ? 'Alumni' : 'Academic')
  );
  const targetCampus = activeCampus;
  const [visibilityScope, setVisibilityScope] = useState<'campus' | 'global'>('campus');
  const [sponsored, setSponsored] = useState(false);
  const [capacity, setCapacity] = useState('');
  const [ticketPrice, setTicketPrice] = useState('0');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bannerUri, setBannerUri] = useState<string | null>(null);

  // Date/Time
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // Venue
  const [location, setLocation] = useState('');
  const [virtualLink, setVirtualLink] = useState('');

  function applyQuickDate(d: Date) {
    setEventDate(toDateInput(d));
    haptics.light();
  }

  function applyQuickStartTime(value: string) {
    setStartTime(value);
    haptics.light();
  }

  function applyQuickDuration(minutes: number) {
    if (!TIME_RE.test(startTime)) {
      setErrorMessage('Pick a start time first, then choose a duration.');
      haptics.error();
      return;
    }
    setEndTime(addMinutesToTime(startTime, minutes));
    haptics.light();
  }

  async function pickBanner() {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        document.body.removeChild(input);
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (dataUrl) {
            setBannerUri(dataUrl);
            haptics.light();
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setBannerUri(result.assets[0].uri);
      haptics.light();
    }
  }

  async function handleHost() {
    setErrorMessage(null);
    if (!title.trim()) {
      setErrorMessage('Please enter an event title.');
      haptics.error();
      return;
    }

    if (!DATE_RE.test(eventDate)) {
      setErrorMessage('Please pick or enter a valid event date (YYYY-MM-DD).');
      haptics.error();
      return;
    }
    if (!TIME_RE.test(startTime)) {
      setErrorMessage('Please pick or enter a valid start time (HH:MM, 24-hour).');
      haptics.error();
      return;
    }
    if (!TIME_RE.test(endTime)) {
      setErrorMessage('Please pick or enter a valid end time (HH:MM, 24-hour).');
      haptics.error();
      return;
    }

    const startAtDate = new Date(`${eventDate}T${startTime}:00`);
    const endAtDate = new Date(`${eventDate}T${endTime}:00`);
    if (isNaN(startAtDate.getTime()) || isNaN(endAtDate.getTime())) {
      setErrorMessage('That date/time could not be understood. Please double-check it.');
      haptics.error();
      return;
    }
    if (endAtDate <= startAtDate) {
      setErrorMessage('End time must be after the start time.');
      haptics.error();
      return;
    }

    const venueType =
      eventType === 'Lioris Live Event (In-App)'
        ? 'virtual'
        : eventType === 'Physical Event'
        ? 'physical'
        : 'external';

    if (venueType === 'virtual' && !virtualLink.trim()) {
      setErrorMessage('Please add a meeting link for the in-app live event.');
      haptics.error();
      return;
    }
    if (venueType !== 'virtual' && !location.trim()) {
      setErrorMessage('Please enter a location for the event.');
      haptics.error();
      return;
    }

    haptics.medium();
    setSubmitting(true);
    try {
      const finalCampus = visibilityScope === 'global' ? 'GLOBAL' : (targetCampus ? targetCampus.toUpperCase() : 'GLOBAL');
      await createEvent({
        title: title.trim(),
        description: description.trim() || 'No description provided.',
        category: CATEGORY_LABELS[category] || 'academic',
        location: venueType === 'virtual' ? 'Lioris Live (In-App)' : location.trim(),
        campusCode: finalCampus,
        visibilityScope,
        startAt: startAtDate.toISOString(),
        endAt: endAtDate.toISOString(),
        sponsored,
        imageUrl: bannerUri || null,
        venueType,
        virtualLink: venueType === 'virtual' ? virtualLink.trim() : null,
        capacity: capacity.trim() ? Number(capacity) : null,
        ticketPrice: Number(ticketPrice) || 0,
      });
      onPublish?.();
      onPublished?.();
      onClose();
      // Reset form
      setTitle('');
      setDescription('');
      setBannerUri(null);
      setEventDate('');
      setStartTime('');
      setEndTime('');
      setLocation('');
      setVirtualLink('');
      setCapacity('');
      setTicketPrice('0');
      setErrorMessage(null);
    } catch (err: any) {
      haptics.error();
      setErrorMessage(getFriendlyErrorMessage(err, 'Could not publish event. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent={isDesktop} animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          backgroundColor: isDesktop ? 'rgba(0, 0, 0, 0.65)' : colors.background,
          justifyContent: isDesktop ? 'center' : 'flex-start',
          alignItems: isDesktop ? 'center' : 'stretch',
          paddingTop: isDesktop ? spacing.lg : Math.max(insets.top, 16),
          paddingHorizontal: isDesktop ? spacing.lg : 16,
          paddingBottom: isDesktop ? spacing.lg : Math.max(insets.bottom, 16),
        }}
      >
        <View
          style={{
            flex: isDesktop ? undefined : 1,
            backgroundColor: colors.background,
            width: isDesktop ? '100%' : '100%',
            maxWidth: isDesktop ? 620 : undefined,
            maxHeight: isDesktop ? '92%' : '100%',
            borderRadius: isDesktop ? 24 : 0,
            padding: isDesktop ? spacing.xl : 0,
            borderWidth: isDesktop ? 1 : 0,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
            overflow: 'hidden',
          }}
        >
          <ScrollView
            style={{ flex: 1, width: '100%' }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: isDesktop ? spacing.md : 100 }}
          >
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, paddingTop: isDesktop ? 0 : spacing.sm }}>
              <View>
                <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold">
                  Host Campus Event
                </AppText>
                <AppText tone="secondary" variant="caption">
                  Seminars, hackathons, academic summits & mixers
                </AppText>
              </View>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </Pressable>
            </View>

            {/* Role Notice Banner */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: colors.divider,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                marginBottom: spacing.md,
              }}
            >
              <Ionicons name="information-circle" size={18} color={colors.textSecondary} />
              <AppText variant="caption" style={{ flex: 1, lineHeight: 16 }}>
                {isStaffOrAdmin
                  ? 'Official / Staff Event: submitted for moderation review - approve it from the Events tab once it appears in the queue.'
                  : 'Student Organizer: This event will be submitted for campus moderation review before appearing live.'}
              </AppText>
            </View>

            {/* Title & Description */}
            <AppTextField label="Event Title" placeholder="e.g. AI & Robotics Campus Symposium 2026" value={title} onChangeText={setTitle} />

            <AppTextField
              label="Event Description"
              placeholder="Provide agenda, speakers, eligibility and details..."
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />

            {/* Visibility Scope & Campus Selector */}
            <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.xs, marginTop: spacing.xs }}>
              Audience Scope:
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm }}>
              {(['campus', 'global'] as const).map((s) => {
                const selected = visibilityScope === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setVisibilityScope(s)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: radius.pill,
                      alignItems: 'center',
                      backgroundColor: selected ? colors.brandPrimary : colors.surface,
                      borderWidth: 1,
                      borderColor: selected ? colors.brandPrimary : colors.border,
                    }}
                  >
                    <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                      {s === 'campus' ? 'Campus Specific' : 'Global Network (All Nodes)'}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* University Workspace Node (Locked to Current Campus) */}
            <View style={{ backgroundColor: colors.divider, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="school" size={15} color={colors.textSecondary} />
                <AppText variant="caption" weight="bold" tone="secondary">
                  University Workspace: {institutionName} ({targetCampus})
                </AppText>
              </View>
              <AppText variant="caption" tone="secondary" style={{ marginTop: 2, fontSize: 11 }}>
                {visibilityScope === 'campus'
                  ? `This event will be published exclusively to verified members of ${institutionName}.`
                  : 'This event will be published across the global university federation.'}
              </AppText>
            </View>

            {/* Event Category */}
            <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.xs, marginTop: spacing.xs }}>
              Event Category:
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md }}>
              {CATEGORIES.filter((cat) => {
                // Students should only see campus student categories, not Alumni
                if (!isAlumniHost && !isStaffOrAdmin && cat === 'Alumni') return false;
                return true;
              }).map((cat) => {
                const selected = category === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: radius.pill,
                      backgroundColor: selected ? colors.brandPrimary : colors.surface,
                      borderWidth: 1,
                      borderColor: selected ? colors.brandPrimary : colors.border,
                    }}
                  >
                    <AppText variant="caption" weight="semiBold" tone={selected ? 'inverse' : 'secondary'}>
                      {cat}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Event Type & Venue */}
            <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.xs }}>
              Venue Format:
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
              {EVENT_TYPES.map((type) => {
                const selected = eventType === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => setEventType(type)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: radius.pill,
                      backgroundColor: selected ? colors.pastelPrimaryBg : 'transparent',
                      borderWidth: 1,
                      borderColor: selected ? colors.brandPrimary : colors.border,
                    }}
                  >
                    <AppText variant="caption" weight="semiBold" tone={selected ? 'brand' : 'secondary'}>
                      {type}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {eventType === 'Lioris Live Event (In-App)' ? (
              <AppTextField
                label="Virtual Meeting Link (Zoom, Google Meet, Teams)"
                placeholder="https://meet.google.com/xxx-xxxx-xxx or Zoom URL"
                value={virtualLink}
                onChangeText={setVirtualLink}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : eventType === 'Physical Event' ? (
              <VerifiedCampusLocationPicker
                campusCode={targetCampus || ''}
                value={location}
                onChangeLocation={(loc) => setLocation(loc)}
                placeholder="Search venues"
              />
            ) : (
              <AppTextField
                label="External Venue Address / URL"
                placeholder="e.g. Landmark Centre, Victoria Island, Lagos"
                value={location}
                onChangeText={setLocation}
              />
            )}

            {/* Date & Time */}
            <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.xs, marginTop: spacing.sm }}>
              Date & Timing:
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.xs }}>
              {[
                { label: 'Today', date: new Date() },
                { label: 'Tomorrow', date: new Date(Date.now() + 86400000) },
                { label: 'This Weekend', date: nextWeekendDate() },
              ].map((pick) => (
                <Pressable
                  key={pick.label}
                  onPress={() => applyQuickDate(pick.date)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: eventDate === toDateInput(pick.date) ? colors.pastelPrimaryBg : 'transparent',
                  }}
                >
                  <AppText variant="caption" weight="semiBold" tone={eventDate === toDateInput(pick.date) ? 'brand' : 'secondary'}>
                    {pick.label}
                  </AppText>
                </Pressable>
              ))}
            </View>

            <AppTextField
              label="Date (YYYY-MM-DD)"
              placeholder="2026-09-20"
              value={eventDate}
              onChangeText={setEventDate}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppTextField
                  label="Start Time (HH:MM)"
                  placeholder="14:00"
                  value={startTime}
                  onChangeText={setStartTime}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppTextField
                  label="End Time (HH:MM)"
                  placeholder="16:00"
                  value={endTime}
                  onChangeText={setEndTime}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Capacity & Price */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <AppTextField
                  label="Seat Capacity (Optional)"
                  placeholder="e.g. 150"
                  value={capacity}
                  onChangeText={setCapacity}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppTextField
                  label="Ticket Price (0 for Free)"
                  placeholder="NGN 0"
                  value={ticketPrice}
                  onChangeText={setTicketPrice}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Banner Image Picker */}
            <Pressable
              onPress={pickBanner}
              style={{
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                borderStyle: 'dashed',
                padding: spacing.md,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: spacing.md,
                marginBottom: spacing.md,
                backgroundColor: colors.surface,
                overflow: 'hidden',
              }}
            >
              {bannerUri ? (
                <Image source={{ uri: bannerUri }} style={{ width: '100%', height: 140 }} contentFit="cover" transition={200} />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={24} color={colors.textSecondary} style={{ marginBottom: spacing.xs }} />
                  <AppText weight="semiBold">
                    Upload Event Banner (Optional)
                  </AppText>
                  <AppText tone="secondary" variant="caption">
                    16:9 landscape photo recommended
                  </AppText>
                </>
              )}
            </Pressable>

            {/* Sponsored / Spotlight */}
            <Pressable
              onPress={() => setSponsored((v) => !v)}
              style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginBottom: spacing.lg }}
            >
              <Ionicons
                name={sponsored ? 'checkbox' : 'square-outline'}
                size={20}
                color={sponsored ? colors.brandPrimary : colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <AppText weight="semiBold" tone="brand">
                  Feature as Spotlight Event
                </AppText>
                <AppText tone="secondary" variant="caption">
                  Pin this event to the top carousel for highest student visibility
                </AppText>
              </View>
            </Pressable>
          </ScrollView>

          {/* Error Banner */}
          {errorMessage && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEE2E2',
                borderColor: colors.critical,
                borderWidth: 1,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                marginBottom: spacing.sm,
              }}
            >
              <Ionicons name="alert-circle" size={18} color={colors.critical} />
              <AppText variant="bodySmall" weight="semiBold" style={{ color: colors.critical, flex: 1 }}>
                {errorMessage}
              </AppText>
            </View>
          )}

          {/* Action Bar */}
          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', paddingVertical: spacing.sm }}>
            <AppButton label="Cancel" variant="ghost" onPress={onClose} />
            <AppButton label="Submit Event" onPress={handleHost} loading={submitting} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
