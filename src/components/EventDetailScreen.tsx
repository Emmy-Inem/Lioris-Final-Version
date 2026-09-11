import React, { useState } from'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from'react-native';
import { router, useLocalSearchParams } from'expo-router';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { Image } from'expo-image';
import { ScreenContainer } from'./ScreenContainer';
import { AppText } from'./AppText';
import { SolidCard } from'./SolidCard';
import { AppButton } from'./AppButton';
import { Badge } from'./Badge';
import { Avatar } from'./Avatar';
import { AppTextField } from'./AppTextField';
import { ImageViewerModal } from'./ImageViewerModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/context/ToastContext';
import { getEvent, rsvpToEvent, updateEvent, purgeEvent } from '@/api/events';
import { getOrCreateConversationWithUser } from '@/api/messaging';
import { CampusMapModal } from './CampusMapModal';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { haptics } from '@/utils/haptics';

const EVENT_MEDIA_MAP: Record<string, any> = {
  event_tech_hackathon: require('../../assets/images/event_tech_hackathon.jpg'),
  event_academic_symposium: require('../../assets/images/event_academic_symposium.jpg'),
  campus_students_photo: require('../../assets/images/campus_students_photo.jpg'),
  campus_library_study: require('../../assets/images/campus_library_study.jpg'),
  student_rep_group: require('../../assets/images/student_rep_group.jpg'),
  hero_student_3d: require('../../assets/images/hero_student_3d.jpg'),
};

export function EventDetailScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop, contentMaxWidth } = useResponsive();
  const { user } = useAuth();
  const toast = useToast();
  const roleGroup = user?.role ? `(${user.role})` : '(student)';
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [rsvpd, setRsvpdState] = useState<boolean | null>(null);
  const [submittingRsvp, setSubmittingRsvp] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'agenda' | 'map'>('overview');

  // Fullscreen Image Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Calendar sync feedback
  const [icsExported, setIcsExported] = useState(false);

  const { data: event, isLoading } = useQuery({
    queryKey: ['events', 'detail', id],
    queryFn: () => getEvent(id),
    enabled: !!id,
  });

  const [contactingOrganizer, setContactingOrganizer] = useState(false);
  const [campusMapOpen, setCampusMapOpen] = useState(false);
  const { isFeatureEnabled } = useFeatureFlags();

  // Organizer-only management (Edit / Cancel). Only the event's own
  // creator gets these - admins already have a separate admin-only
  // moderation surface for every other event.
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editStartAt, setEditStartAt] = useState('');
  const [editEndAt, setEditEndAt] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [cancellingEvent, setCancellingEvent] = useState(false);

  /**
   * Opens (or creates) the real conversation with this event's organizer.
   * This used to push a hardcoded `messages/conv-1`, which is not a
   * conversation anyone owns - the button looked live but always landed on
   * an empty thread.
   */
  async function handleContactOrganizer() {
    haptics.light();
    if (!event?.organizerId) {
      toast.show('This event has no organizer to contact yet.');
      return;
    }
    setContactingOrganizer(true);
    try {
      const conversation = await getOrCreateConversationWithUser(
        event.organizerId,
        event.organizerName ?? 'Event Organizer',
      );
      router.push(`/${roleGroup}/messages/${conversation.id}` as any);
    } catch {
      toast.show('Could not open that conversation. Please try again.');
    } finally {
      setContactingOrganizer(false);
    }
  }

  const isRsvpd = rsvpd !== null ? rsvpd : !!event?.isRsvpd;
  // Real numbers only. These used to fall back to 34 RSVPs and a capacity of
  // 150, so a brand-new event with nobody signed up advertised "34 / 150
  // Registered" and "116 spots left".
  const currentRsvpCount =
    (event?.rsvpCount ?? 0) + (rsvpd === true && !event?.isRsvpd ? 1 : rsvpd === false && event?.isRsvpd ? -1 : 0);
  /** null means the organiser set no cap - not "we don't know yet". */
  const capacity = typeof event?.capacity === 'number' && event.capacity > 0 ? event.capacity : null;
  const hasCapacity = capacity !== null;
  const remainingSpots = hasCapacity ? Math.max(0, capacity - currentRsvpCount) : null;
  const filledPercent = hasCapacity ? Math.min(100, Math.round((currentRsvpCount / capacity) * 100)) : 0;

  const isOwner = !!user?.id && !!event?.organizerId && user.id === event.organizerId;

  /** "YYYY-MM-DDTHH:mm" for a plain text datetime input - local time, no seconds. */
  function toLocalInputValue(iso?: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function handleOpenEdit() {
    if (!event) return;
    haptics.light();
    setEditTitle(event.title ?? '');
    setEditDescription(event.description ?? '');
    setEditLocation(event.location ?? '');
    setEditStartAt(toLocalInputValue(event.startAt));
    setEditEndAt(toLocalInputValue(event.endAt));
    setEditModalOpen(true);
  }

  async function handleSaveEdit() {
    if (!event) return;
    if (!editTitle.trim()) {
      toast.show('Event title cannot be empty.');
      return;
    }
    const startDate = editStartAt ? new Date(editStartAt) : null;
    const endDate = editEndAt ? new Date(editEndAt) : null;
    if ((editStartAt && (!startDate || isNaN(startDate.getTime()))) || (editEndAt && (!endDate || isNaN(endDate.getTime())))) {
      toast.show('Please enter valid start and end times.');
      return;
    }
    haptics.medium();
    setSavingEdit(true);
    try {
      await updateEvent(event.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        location: editLocation.trim(),
        startAt: startDate ? startDate.toISOString() : event.startAt,
        endAt: endDate ? endDate.toISOString() : event.endAt,
      });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['events', 'detail', event.id] });
      haptics.success();
      toast.success('Event details updated.');
      setEditModalOpen(false);
    } catch {
      haptics.error();
      toast.error('Could not save changes. Please try again.');
    } finally {
      setSavingEdit(false);
    }
  }

  function handleCancelEvent() {
    if (!event) return;
    haptics.light();
    Alert.alert(
      'Cancel This Event?',
      `This will permanently remove "${event.title}" and cannot be undone.`,
      [
        { text: 'Keep Event', style: 'cancel' },
        {
          text: 'Cancel Event',
          style: 'destructive',
          onPress: async () => {
            setCancellingEvent(true);
            try {
              await purgeEvent(event.id);
              queryClient.invalidateQueries({ queryKey: ['events'] });
              haptics.success();
              toast.success('Event cancelled.');
              router.back();
            } catch {
              haptics.error();
              toast.error('Could not cancel this event. Please try again.');
            } finally {
              setCancellingEvent(false);
            }
          },
        },
      ],
    );
  }

  async function handleToggleRsvp() {
    if (!event) return;
    haptics.medium();
      setSubmittingRsvp(true);
    try {
      const action = isRsvpd ? 'cancel' : 'rsvp';
      await rsvpToEvent(event.id, action);
      setRsvpdState(!isRsvpd);
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['event', event.id] });
      haptics.success();
      toast.success(
        !isRsvpd
          ? `Seat secured for "${event.title}"! Added to your campus schedule.`
          : 'Your RSVP has been cancelled and seat released.'
      );
    } catch {
      toast.error('Could not update RSVP status. Please try again.');
    } finally {
      setSubmittingRsvp(false);
    }
  }

 function handleLaunchMaps() {
 if (!event) return;
 haptics.light();
 const query = encodeURIComponent(`${event.location} University Campus`);
 const mapsUrl = Platform.OS === 'ios'
 ? `maps://?q=${query}`
 : `https://www.google.com/maps/search/?api=1&query=${query}`;

 Linking.canOpenURL(mapsUrl).then((supported) => {
 if (supported) {
 Linking.openURL(mapsUrl);
 } else {
 Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
 }
 }).catch(() => {
 Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
 });
 }

 function handleGoogleCalendar() {
 if (!event) return;
 haptics.light();
 const startIso = event.startAt ? new Date(event.startAt) : new Date(Date.now() + 86400000);
 const endIso = event.endAt ? new Date(event.endAt) : new Date(Date.now() + 93600000);
 const startTime = startIso.toISOString().replace(/-|:|\.\d\d\d/g, '');
 const endTime = endIso.toISOString().replace(/-|:|\.\d\d\d/g, '');
 const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startTime}/${endTime}&details=${encodeURIComponent(event.description ?? '')}&location=${encodeURIComponent(event.location)}`;
 Linking.openURL(gcalUrl).catch(() => {
 Alert.alert('Calendar', 'Could not open Google Calendar link.');
 });
 }

 function handleExportIcs() {
 if (!event) return;
 haptics.light();
 const icsContent = [
 'BEGIN:VCALENDAR',
 'VERSION:2.0',
 'PRODID:-//Lioris Campus Platform//EN',
 'CALSCALE:GREGORIAN',
 'BEGIN:VEVENT',
 `SUMMARY:${event.title}`,
 `DESCRIPTION:${event.description?.replace(/\n/g, ' ') ?? ''}`,
 `LOCATION:${event.location}`,
 `STATUS:CONFIRMED`,
 'END:VEVENT',
 'END:VCALENDAR',
 ].join('\r\n');

 if (Platform.OS === 'web' && typeof document !== 'undefined') {
 const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
 const link = document.createElement('a');
 link.href = window.URL.createObjectURL(blob);
 link.setAttribute('download', `${event.title.replace(/\s+/g, '_')}.ics`);
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 }
 setIcsExported(true);
 setTimeout(() => setIcsExported(false), 3000);
 }

  if (isLoading || !event) {
 return (
 <ScreenContainer>
 <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
 <Ionicons name="calendar-outline"size={36} color={colors.brandPrimary} />
 <AppText tone="secondary"style={{ marginTop: spacing.sm }}>Loading event details...</AppText>
 </View>
   <CampusMapModal
        visible={campusMapOpen}
        onClose={() => setCampusMapOpen(false)}
        initialLandmarkName={event?.location}
        campusFilter={event?.campusCode || 'UI'}
      />
    </ScreenContainer>
 );
 }

 const heroImageSource = event.coverImageUrl
 ? EVENT_MEDIA_MAP[event.coverImageUrl] ?? { uri: event.coverImageUrl }
 : event.category === 'academic'
 ? EVENT_MEDIA_MAP.event_academic_symposium
 : EVENT_MEDIA_MAP.event_tech_hackathon;

  return (
    <ScreenContainer glow={true} style={{ paddingHorizontal: isDesktop ? 24 : 0 }}>
      {/* Top Desktop Breadcrumb & Navigation Bar */}
      {isDesktop ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: spacing.lg }}>
          <Pressable
            onPress={() => router.back()}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            <AppText weight="bold" variant="bodySmall">
              Back to Events
            </AppText>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => {
                haptics.light();
                setBookmarked((b) => !b);
                Alert.alert(bookmarked ? 'Removed Bookmark' : 'Event Saved', 'Added to your saved calendar events.');
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: radius.pill,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={16} color={bookmarked ? colors.brandPrimary : colors.textPrimary} />
              <AppText variant="caption" weight="semiBold">
                {bookmarked ? 'Saved' : 'Save Event'}
              </AppText>
            </Pressable>

            <Pressable
              onPress={() => setLightboxOpen(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: radius.pill,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="expand-outline" size={16} color={colors.textPrimary} />
              <AppText variant="caption" weight="semiBold">
                Fullscreen Image
              </AppText>
            </Pressable>
          </View>
        </View>
      ) : null}

      <ScrollView style={{ flex: 1, width: '100%' }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130,
    paddingHorizontal: isDesktop ? spacing.lg : 0 }}
      >
        {isDesktop ? (
          /* DESKTOP 2-COLUMN BALANCED LAYOUT */
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start', maxWidth: 1040, width: '100%', alignSelf: 'center' }}>
            {/* Left Column: Cover Image, Title, Description, Agenda & Map */}
            <View style={{ flex: 1, minWidth: 320, maxWidth: 660 }}>
              {/* Event Cover Image Card */}
              <Pressable
                onPress={() => setLightboxOpen(true)}
                style={{
                  width: '100%',
                  height: 320,
                  borderRadius: 20,
                  overflow: 'hidden',
                  position: 'relative',
                  backgroundColor: colors.surface,
                  marginBottom: spacing.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Image
                  source={heroImageSource}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                  transition={300}
                />
                <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.32)' }} />
                
                {/* Badges on Cover Image */}
                <View style={{ position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={{ backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill }}>
                      <AppText variant="caption" weight="bold" tone="inverse" style={{ textTransform: 'uppercase', fontSize: 11 }}>
                        {event.category}
                      </AppText>
                    </View>
                    {event.sponsored ? <Badge label="SPONSORED" tone="brand" /> : null}
                  </View>

                  <View style={{ backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill }}>
                    <AppText variant="caption" weight="bold" tone="inverse" style={{ fontSize: 11 }}>
                      {hasCapacity ? `${currentRsvpCount} / ${capacity} Registered` : `${currentRsvpCount} Registered`}
                    </AppText>
                  </View>
                </View>
              </Pressable>

              {/* Event Title */}
              <AppText variant="h1" weight="bold" style={{ fontSize: 26, lineHeight: 34, marginBottom: spacing.sm }}>
                {event.title}
              </AppText>

              {/* Date & Location Chips */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', marginBottom: spacing.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.pastelPrimaryBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill }}>
                  <Ionicons name="calendar" size={16} color={colors.brandPrimary} />
                  <AppText weight="bold" variant="bodySmall" tone="brand">
                    {event.startAt ? new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Tomorrow, 10:00 AM'}
                  </AppText>
                </View>

                <Pressable
                  onPress={() => isFeatureEnabled('campus_map') && setCampusMapOpen(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border }}
                >
                  <Ionicons name="location" size={16} color={colors.brandPrimary} />
                  <AppText weight="bold" variant="bodySmall" tone="primary">
                    {event.location}
                  </AppText>
                  {isFeatureEnabled('campus_map') && (
                    <Badge label="Interactive Map" tone="brand" />
                  )}
                </Pressable>
              </View>

              {/* Segmented Navigation Tabs */}
              <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg }}>
                {(['overview', 'agenda', 'map'] as const).map((tab) => {
                  const isSelected = activeTab === tab;
                  const labels = { overview: 'Overview', agenda: 'Agenda', map: 'Campus Map & Directions' };
                  return (
                    <Pressable
                      key={tab}
                      onPress={() => setActiveTab(tab)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        alignItems: 'center',
                        borderRadius: radius.pill,
                        backgroundColor: isSelected ? colors.brandPrimary : 'transparent',
                      }}
                    >
                      <AppText weight="bold" variant="bodySmall" tone={isSelected ? 'inverse' : 'secondary'}>
                        {labels[tab]}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <View>
                  <SolidCard style={{ marginBottom: spacing.lg, padding: spacing.lg }}>
                    <AppText weight="bold" variant="h3" style={{ marginBottom: spacing.sm }}>
                      About This Event
                    </AppText>
                    <AppText tone="primary" variant="bodySmall" style={{ lineHeight: 24, fontSize: 14 }}>
                      {event.description}
                    </AppText>
                  </SolidCard>

                  <SolidCard style={{ marginBottom: spacing.lg, padding: spacing.lg }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                        <Avatar name={event.organizerName ?? 'Faculty Student Council'} size={48} role="staff" />
                        <View>
                          <AppText weight="bold" variant="bodySmall">{event.organizerName ?? 'Faculty Student Council'}</AppText>
                          <AppText tone="secondary" variant="caption">Verified Campus Organizer</AppText>
                        </View>
                      </View>
                      <AppButton
                        label="Contact Organizer"
                        variant="ghost"
                        loading={contactingOrganizer}
                        onPress={handleContactOrganizer}
                      />
                    </View>
                  </SolidCard>
                </View>
              )}

              {/* TAB 2: AGENDA */}
              {activeTab === 'agenda' && (
                <SolidCard style={{ marginBottom: spacing.lg, padding: spacing.lg }}>
                  <AppText weight="bold" variant="h3" style={{ marginBottom: spacing.lg }}>
                    Program Schedule & Timeline
                  </AppText>

                  <AppText tone="secondary" variant="bodySmall">
                    Agenda details are not available for this event yet.
                  </AppText>
                </SolidCard>
              )}

              {/* TAB 3: CAMPUS MAP & NAVIGATION */}
              {activeTab === 'map' && (
                <View>
                  <View
                    style={{
                      height: 320,
                      borderWidth: 1.5,
                      borderColor: colors.brandPrimary,
                      borderRadius: radius.lg,
                      backgroundColor: colors.surface,
                      marginBottom: spacing.lg,
                      overflow: 'hidden',
                    }}
                  >
                    {Platform.OS === 'web' ? (
                      <iframe
                        title={`Google Map - ${event.location}`}
                        width="100%"
                        height="100%"
                        style={{ border: 0, width: '100%', height: '100%' }}
                        loading="lazy"
                        allowFullScreen
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(event.location + ' University Campus')}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                      />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.pastelPrimaryBg }}>
                        <Ionicons name="location" size={44} color={colors.brandPrimary} />
                        <AppText weight="bold" variant="h3" style={{ marginTop: spacing.xs, textAlign: 'center' }}>
                          {event.location}
                        </AppText>
                        <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 4, marginBottom: spacing.md }}>
                          {event.campusCode ? `${event.campusCode} Campus Venue` : 'Campus Location'} • Tap below to navigate
                        </AppText>
                        <AppButton label="Open in Google Maps" onPress={handleLaunchMaps} />
                      </View>
                    )}
                  </View>

                </View>
              )}
            </View>

            {/* Right Column: Sticky Action & Ticket Registration Card */}
            <View style={{ width: 330, minWidth: 280, flexShrink: 0 }}>
              <SolidCard radius={20} style={{ padding: spacing.lg, marginBottom: spacing.lg }}>
                {/* RSVP / Registration Status Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                  <AppText weight="bold" variant="h3">
                    Registration
                  </AppText>
                  <Badge
                    label={
                      isRsvpd
                        ? 'Seat Confirmed'
                        : remainingSpots === null
                        ? 'Open Registration'
                        : remainingSpots > 0
                        ? `${remainingSpots} spots left`
                        : 'Sold Out'
                    }
                    tone={isRsvpd || remainingSpots === null ? 'brand' : remainingSpots > 0 ? 'accent' : 'critical'}
                  />
                </View>

                {/* Progress Bar */}
                <View style={{ width: '100%', height: 8, borderRadius: 4, backgroundColor: colors.divider, overflow: 'hidden', marginBottom: spacing.md }}>
                  <View
                    style={{
                      width: `${filledPercent}%`,
                      height: '100%',
                      backgroundColor: remainingSpots !== null && remainingSpots < 10 ? colors.critical : colors.brandPrimary,
                      borderRadius: 4,
                    }}
                  />
                </View>

                {/* Main RSVP Action Button */}
                <View style={{ marginBottom: spacing.md }}>
                  <AppButton
                    label={isRsvpd ? 'Release / Cancel Seat' : 'Claim Your Seat (RSVP)'}
                    variant={isRsvpd ? 'secondary' : 'primary'}
                    loading={submittingRsvp}
                    onPress={handleToggleRsvp}
                    fullWidth
                  />
                </View>

                {/* Attendee Avatars */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg }}>
                  <AppText variant="caption" tone="secondary" style={{ fontSize: 12 }}>
                    {currentRsvpCount} students attending
                  </AppText>
                </View>

                {/* Calendar Sync Shortcuts */}
                <AppText weight="bold" variant="caption" tone="secondary" style={{ letterSpacing: 0.5, marginBottom: spacing.sm, textTransform: 'uppercase' }}>
                  Add to Calendar
                </AppText>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Google Cal"
                      variant="secondary"
                      onPress={handleGoogleCalendar}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label={icsExported ? 'Saved .ICS' : '.ICS File'}
                      variant="secondary"
                      onPress={handleExportIcs}
                    />
                  </View>
                </View>

                {/* Venue Quick Link */}
                <AppText weight="bold" variant="caption" tone="secondary" style={{ letterSpacing: 0.5, marginBottom: spacing.xs, textTransform: 'uppercase' }}>
                  Venue Location
                </AppText>
                <AppText variant="bodySmall" weight="medium" style={{ marginBottom: spacing.sm }}>
                  {event.location}
                </AppText>
                <AppButton
                  label="Open Navigation"
                  variant="ghost"
                  onPress={handleLaunchMaps}
                />
              </SolidCard>

              {/* Organizer-only Management Card */}
              {isOwner ? (
                <SolidCard radius={20} style={{ padding: spacing.lg, marginBottom: spacing.lg }}>
                  <AppText weight="bold" variant="h3" style={{ marginBottom: spacing.sm }}>
                    Manage Your Event
                  </AppText>
                  <AppText tone="secondary" variant="caption" style={{ marginBottom: spacing.md }}>
                    You're the organizer of this event.
                  </AppText>
                  <View style={{ gap: spacing.sm }}>
                    <AppButton label="Edit Event" variant="secondary" icon="create-outline" onPress={handleOpenEdit} />
                    <AppButton
                      label="Cancel Event"
                      variant="ghost"
                      icon="trash-outline"
                      loading={cancellingEvent}
                      onPress={handleCancelEvent}
                    />
                  </View>
                </SolidCard>
              ) : null}
            </View>
          </View>
        ) : (
          /* MOBILE SINGLE COLUMN LAYOUT */
          <>
            {/* Top Hero Banner & Media Header */}
            <View style={{ width: '100%', height: 260, position: 'relative', backgroundColor: colors.surface }}>
              <Pressable onPress={() => setLightboxOpen(true)} style={{ width: '100%', height: '100%' }}>
                <Image
                  source={heroImageSource}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                  transition={300}
                />
                <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.38)' }} />
              </Pressable>

              {/* Floating Navigation Controls */}
              <View style={{ position: 'absolute', top: 44, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Pressable
                  onPress={() => router.back()}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
                </Pressable>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={() => {
                      haptics.light();
                      setBookmarked((b) => !b);
                      Alert.alert(bookmarked ? 'Removed Bookmark' : 'Event Saved', 'Added to your saved calendar events.');
                    }}
                    style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={bookmarked ? colors.brandPrimary : '#FFFFFF'} />
                  </Pressable>

                  <Pressable
                    onPress={() => setLightboxOpen(true)}
                    style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="expand-outline" size={20} color="#FFFFFF" />
                  </Pressable>
                </View>
              </View>

              {/* Banner Badges */}
              <View style={{ position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <View style={{ backgroundColor: colors.brandPrimary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
                    <AppText variant="caption" weight="bold" tone="inverse" style={{ textTransform: 'uppercase' }}>
                      {event.category}
                    </AppText>
                  </View>
                  {event.sponsored ? <Badge label="SPONSORED" tone="brand" /> : null}
                </View>

                <View style={{ backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
                  <AppText variant="caption" weight="bold" tone="inverse">
                    {hasCapacity ? `${currentRsvpCount} / ${capacity} Registered` : `${currentRsvpCount} Registered`}
                  </AppText>
                </View>
              </View>
            </View>

            {/* Content Body Container */}
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, width: '100%' }}>
              {/* Event Title */}
              <AppText variant="h2" weight="bold" style={{ fontSize: isDesktop ? 24 : 20, lineHeight: isDesktop ? 30 : 26, marginBottom: spacing.xs }}>
                {event.title}
              </AppText>

              {/* Organizer-only Management Row */}
              {isOwner ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <AppButton label="Edit Event" variant="secondary" size="sm" icon="create-outline" onPress={handleOpenEdit} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Cancel Event"
                      variant="ghost"
                      size="sm"
                      icon="trash-outline"
                      loading={cancellingEvent}
                      onPress={handleCancelEvent}
                    />
                  </View>
                </View>
              ) : null}

              {/* Date & Location Pill Highlights */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="calendar-outline" size={16} color={colors.brandPrimary} />
                  <AppText weight="bold" variant="bodySmall" tone="primary">
                    {event.startAt ? new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Tomorrow, 10:00 AM'}
                  </AppText>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="location-outline" size={16} color={colors.brandPrimary} />
                  <AppText weight="bold" variant="bodySmall" tone="primary">
                    {event.location}
                  </AppText>
                </View>
              </View>

              {/* Capacity Progress Bar */}
              <View style={{ backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <AppText weight="bold" variant="bodySmall">
                    Seats and Attendance
                  </AppText>
                  <AppText variant="caption" tone="brand" weight="bold">
                    {remainingSpots === null
                      ? 'Open Registration'
                      : remainingSpots > 0
                      ? `${remainingSpots} spots left`
                      : 'Fully Booked'}
                  </AppText>
                </View>

                <View style={{ width: '100%', height: 8, borderRadius: 4, backgroundColor: colors.divider, overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${filledPercent}%`,
                      height: '100%',
                      backgroundColor: remainingSpots !== null && remainingSpots < 10 ? colors.critical : colors.brandPrimary,
                      borderRadius: 4,
                    }}
                  />
                </View>

                {/* Attendee Avatars Row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                      {currentRsvpCount} attending
                    </AppText>
                  </View>

                  <AppButton
                    label={isRsvpd ? 'Seat Claimed' : 'RSVP Now'}
                    variant={isRsvpd ? 'secondary' : 'primary'}
                    loading={submittingRsvp}
                    onPress={handleToggleRsvp}
                  />
                </View>
              </View>

              {/* Segmented Navigation Tabs */}
              <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md }}>
                {(['overview', 'agenda', 'map'] as const).map((tab) => {
                  const isSelected = activeTab === tab;
                  const labels = { overview: 'Overview', agenda: 'Agenda', map: 'Campus Map' };
                  return (
                    <Pressable
                      key={tab}
                      onPress={() => setActiveTab(tab)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        alignItems: 'center',
                        borderRadius: radius.pill,
                        backgroundColor: isSelected ? colors.brandPrimary : 'transparent',
                      }}
                    >
                      <AppText weight="bold" variant="bodySmall" tone={isSelected ? 'inverse' : 'secondary'}>
                        {labels[tab]}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <View>
                  <SolidCard style={{ marginBottom: spacing.md }}>
                    <AppText weight="bold" variant="h3" style={{ marginBottom: 6 }}>
                      About This Event
                    </AppText>
                    <AppText tone="primary" variant="bodySmall" style={{ lineHeight: 22 }}>
                      {event.description}
                    </AppText>
                  </SolidCard>

                  <SolidCard style={{ marginBottom: spacing.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <Avatar name={event.organizerName ?? 'Faculty Student Council'} size={44} role="staff" />
                        <View>
                          <AppText weight="bold">{event.organizerName ?? 'Faculty Student Council'}</AppText>
                          <AppText tone="secondary" variant="caption">Verified Campus Organizer</AppText>
                        </View>
                      </View>
                      <AppButton
                        label="Contact"
                        variant="ghost"
                        loading={contactingOrganizer}
                        onPress={handleContactOrganizer}
                      />
                    </View>
                  </SolidCard>

                  <SolidCard style={{ marginBottom: spacing.md }}>
                    <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.xs }}>
                      Calendar Sync
                    </AppText>
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <View style={{ flex: 1 }}>
                        <AppButton
                          label="Google Calendar"
                          variant="secondary"
                          onPress={handleGoogleCalendar}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppButton
                          label={icsExported ? 'Saved .ICS' : 'Export .ICS'}
                          variant="secondary"
                          onPress={handleExportIcs}
                        />
                      </View>
                    </View>
                  </SolidCard>
                </View>
              )}

              {/* TAB 2: AGENDA */}
              {activeTab === 'agenda' && (
                <SolidCard style={{ marginBottom: spacing.md }}>
                  <AppText weight="bold" variant="h3" style={{ marginBottom: spacing.md }}>
                    Program Schedule & Timeline
                  </AppText>

                  <AppText tone="secondary" variant="bodySmall">
                    No detailed agenda provided for this event.
                  </AppText>
                </SolidCard>
              )}

              {/* TAB 3: CAMPUS MAP & NAVIGATION */}
              {activeTab === 'map' && (
                <View>
                  <View
                    style={{
                      height: 280,
                      borderWidth: 1.5,
                      borderColor: colors.brandPrimary,
                      borderRadius: radius.lg,
                      backgroundColor: colors.surface,
                      marginBottom: spacing.md,
                      overflow: 'hidden',
                    }}
                  >
                    {Platform.OS === 'web' ? (
                      <iframe
                        title={`Google Map - ${event.location}`}
                        width="100%"
                        height="100%"
                        style={{ border: 0, width: '100%', height: '100%' }}
                        loading="lazy"
                        allowFullScreen
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(event.location + ' University Campus')}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                      />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.pastelPrimaryBg }}>
                        <Ionicons name="location" size={44} color={colors.brandPrimary} />
                        <AppText weight="bold" variant="h3" style={{ marginTop: spacing.xs, textAlign: 'center' }}>
                          {event.location}
                        </AppText>
                        <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 4, marginBottom: spacing.md }}>
                          {event.campusCode ? `${event.campusCode} Campus Venue` : 'Campus Location'} • Tap below to navigate
                        </AppText>
                        <AppButton label="Open in Google Maps" onPress={handleLaunchMaps} />
                      </View>
                    )}
                  </View>


                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Fullscreen Hero Image Lightbox Modal */}
 <ImageViewerModal
 visible={lightboxOpen}
 onClose={() => setLightboxOpen(false)}
 imageSource={heroImageSource}
 caption={`${event.title} - ${event.location}`}
 />

      {/* Organizer-only Edit Event Modal - minimal inline form covering the
          fields a non-admin organizer may reasonably change themselves. */}
      <Modal visible={editModalOpen} transparent animationType="fade" onRequestClose={() => setEditModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
          <View
            style={{
              width: '100%',
              maxWidth: 480,
              maxHeight: '85%',
              backgroundColor: colors.background,
              borderRadius: radius.lg,
              padding: spacing.lg,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <AppText weight="bold" variant="h3">
                Edit Event
              </AppText>
              <Pressable onPress={() => setEditModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <AppTextField
                label="Title"
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Event title"
              />
              <AppTextField
                label="Description"
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Event description"
                multiline
                numberOfLines={4}
                style={{ minHeight: 90, textAlignVertical: 'top' }}
              />
              <AppTextField
                label="Location / Venue"
                value={editLocation}
                onChangeText={setEditLocation}
                placeholder="Campus Main Hall"
              />
              <AppTextField
                label="Start Time"
                value={editStartAt}
                onChangeText={setEditStartAt}
                placeholder="YYYY-MM-DDTHH:mm"
              />
              <AppTextField
                label="End Time"
                value={editEndAt}
                onChangeText={setEditEndAt}
                placeholder="YYYY-MM-DDTHH:mm"
              />
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppButton label="Cancel" variant="ghost" onPress={() => setEditModalOpen(false)} fullWidth />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton label="Save Changes" variant="primary" loading={savingEdit} onPress={handleSaveEdit} fullWidth />
              </View>
            </View>
          </View>
        </View>
      </Modal>
 </ScreenContainer>
 );
}
