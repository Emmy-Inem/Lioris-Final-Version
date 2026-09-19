import React, { useState, useMemo } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ScreenContainer } from './ScreenContainer';
import { AppText } from './AppText';
import { SolidCard } from './SolidCard';
import { AppButton } from './AppButton';
import { Badge } from './Badge';
import { Avatar } from './Avatar';
import { AppTextField } from './AppTextField';
import { ImageViewerModal } from './ImageViewerModal';
import { CampusMapModal } from './CampusMapModal';
import { VerifiedCampusLocationPicker } from './VerifiedCampusLocationPicker';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import {
  getEvent,
  rsvpToEvent,
  updateEvent,
  purgeEvent,
  approveEvent,
  revokeEventApproval,
  setEventSpotlight,
  listEventAttendees,
} from '@/api/events';
import { getOrCreateConversationWithUser } from '@/api/messaging';
import { CAMPUS_LANDMARKS, CAMPUS_CENTERS, CampusLandmark } from '@/api/campusMap';
import { EventAttendeeInfo, EventCategory, EventAgendaItem } from '@/api/types';
import { getMyProfile, markVerificationPending } from '@/api/profile';
import { submitVerificationRequest } from '@/api/verification';
import { isUnverifiedPersonalUser } from '@/utils/verificationGate';
import { VerificationRequiredGate } from './VerificationRequiredGate';
import { ApplyForVerificationModal } from './ApplyForVerificationModal';
import { haptics } from '@/utils/haptics';

const EVENT_MEDIA_MAP: Record<string, any> = {
  event_tech_hackathon: require('../../assets/images/event_tech_hackathon.jpg'),
  event_academic_symposium: require('../../assets/images/event_academic_symposium.jpg'),
  campus_students_photo: require('../../assets/images/campus_students_photo.jpg'),
  campus_library_study: require('../../assets/images/campus_library_study.jpg'),
  student_rep_group: require('../../assets/images/student_rep_group.jpg'),
  hero_student_3d: require('../../assets/images/hero_student_3d.jpg'),
};

const CATEGORIES = ['Academic', 'Career', 'Workshop', 'Seminar', 'Social', 'Alumni'] as const;
const VENUE_FORMATS = ['Physical Event', 'Lioris Live Event (In-App)', 'External Event'] as const;

export function EventDetailScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
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

  // Data fetching
  const { data: event, isLoading } = useQuery({
    queryKey: ['events', 'detail', id],
    queryFn: () => getEvent(id),
    enabled: !!id,
  });

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });
  const isRestrictedGuest = isUnverifiedPersonalUser(profile);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);

  async function handleSubmitVerification(data: {
    institutionClaimed: string;
    documentType: any;
    documentReference?: string;
    documentPhotoUri?: string | null;
    photoBlob?: Blob;
  }) {
    if (!user) return;
    try {
      await submitVerificationRequest({
        userId: user.id,
        applicantName: profile?.fullName ?? user.fullName,
        documentType: data.documentType,
        documentReference: data.documentReference,
        institutionClaimed: data.institutionClaimed,
        documentPhotoUri: data.documentPhotoUri,
        photoBlob: data.photoBlob,
      });
      markVerificationPending(user.id);
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setVerificationModalOpen(false);
      toast.success('Verification submitted! Campus moderators are reviewing your credentials.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not submit verification request. Please try again.');
    }
  }

  const [contactingOrganizer, setContactingOrganizer] = useState(false);
  const [campusMapOpen, setCampusMapOpen] = useState(false);
  const { isFeatureEnabled } = useFeatureFlags();

  // Organizer & Admin permissions
  const isOwner = !!user?.id && !!event?.organizerId && user.id === event.organizerId;
  const isAdmin = user?.role === 'admin' || user?.role === 'staff';
  const canManage = isOwner || isAdmin;

  // Management Action State
  const [cancellingEvent, setCancellingEvent] = useState(false);
  const [actingApproval, setActingApproval] = useState(false);
  const [actingSpotlight, setActingSpotlight] = useState(false);

  // Comprehensive Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<string>('Academic');
  const [editCampus, setEditCampus] = useState<string>('GLOBAL');
  const [editScope, setEditScope] = useState<'campus' | 'global'>('campus');
  const [editVenueType, setEditVenueType] = useState<'physical' | 'virtual' | 'external'>('physical');
  const [editLocation, setEditLocation] = useState('');
  const [editRoomDetail, setEditRoomDetail] = useState('');
  const [editVirtualLink, setEditVirtualLink] = useState('');
  const [editStartAt, setEditStartAt] = useState('');
  const [editEndAt, setEditEndAt] = useState('');
  const [editCapacity, setEditCapacity] = useState<string>('');
  const [editTicketPrice, setEditTicketPrice] = useState<string>('');
  const [editTargetCohort, setEditTargetCohort] = useState<string>('');
  const [editApprovalStatus, setEditApprovalStatus] = useState<'approved' | 'pending' | 'rejected'>('approved');
  const [editIsSpotlight, setEditIsSpotlight] = useState<boolean>(false);
  const [editSponsored, setEditSponsored] = useState<boolean>(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Attendee Roster Modal State
  const [rosterModalOpen, setRosterModalOpen] = useState(false);
  const [rosterAttendees, setRosterAttendees] = useState<EventAttendeeInfo[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');

  // Agenda Editor State
  const [agendaEditorOpen, setAgendaEditorOpen] = useState(false);
  const [editAgendaItems, setEditAgendaItems] = useState<EventAgendaItem[]>([]);
  const [savingAgenda, setSavingAgenda] = useState(false);

  // Verified Landmark Matcher
  const matchedLandmark = useMemo(() => {
    if (!event?.location) return null;
    const locLower = event.location.toLowerCase().trim();
    const campus = (event.campusCode || 'GLOBAL').toUpperCase();
    return CAMPUS_LANDMARKS.find(
      (l) =>
        (l.campus.toUpperCase() === campus || campus === 'GLOBAL') &&
        (l.name.toLowerCase() === locLower ||
          l.name.toLowerCase().includes(locLower) ||
          locLower.includes(l.name.toLowerCase()) ||
          (l.shortCode && l.shortCode.toLowerCase() === locLower))
    );
  }, [event?.location, event?.campusCode]);

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
        event.organizerName ?? 'Event Organizer'
      );
      router.push(`/${roleGroup}/messages/${conversation.id}` as any);
    } catch {
      toast.show('Could not open that conversation. Please try again.');
    } finally {
      setContactingOrganizer(false);
    }
  }

  const isRsvpd = rsvpd !== null ? rsvpd : !!event?.isRsvpd;
  const currentRsvpCount =
    (event?.rsvpCount ?? 0) + (rsvpd === true && !event?.isRsvpd ? 1 : rsvpd === false && event?.isRsvpd ? -1 : 0);
  const capacity = typeof event?.capacity === 'number' && event.capacity > 0 ? event.capacity : null;
  const hasCapacity = capacity !== null;
  const remainingSpots = hasCapacity ? Math.max(0, capacity - currentRsvpCount) : null;
  const filledPercent = hasCapacity ? Math.min(100, Math.round((currentRsvpCount / capacity) * 100)) : 0;

  function toLocalInputValue(iso?: string | null) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function addMinutesToDateTime(dtStr: string, minutes: number) {
    const d = dtStr ? new Date(dtStr) : new Date();
    if (isNaN(d.getTime())) return '';
    d.setMinutes(d.getMinutes() + minutes);
    return toLocalInputValue(d.toISOString());
  }

  function handleOpenEdit() {
    if (!event) return;
    haptics.light();
    setEditTitle(event.title ?? '');
    setEditDescription(event.description ?? '');
    setEditCategory(event.category ? event.category.charAt(0).toUpperCase() + event.category.slice(1) : 'Academic');
    setEditCampus(event.campusCode ?? 'GLOBAL');
    setEditScope((event.visibilityScope as any) === 'global' ? 'global' : 'campus');
    setEditVenueType(event.venueType ?? 'physical');
    setEditLocation(event.location ?? '');
    setEditRoomDetail('');
    setEditVirtualLink(event.virtualLink ?? '');
    setEditStartAt(toLocalInputValue(event.startAt));
    setEditEndAt(toLocalInputValue(event.endAt));
    setEditCapacity(event.capacity ? String(event.capacity) : '');
    setEditTicketPrice(event.ticketPrice ? String(event.ticketPrice) : '');
    setEditTargetCohort(event.targetCohort ?? '');
    setEditApprovalStatus(event.approvalStatus ?? 'approved');
    setEditIsSpotlight(!!event.isSpotlight);
    setEditSponsored(!!event.sponsored);
    setEditModalOpen(true);
  }

  function handleOpenAgendaEditor() {
    if (!event) return;
    haptics.light();
    setEditAgendaItems(event.agenda ? [...event.agenda.map(a => ({ ...a }))] : []);
    setAgendaEditorOpen(true);
  }

  function handleAddAgendaItem() {
    haptics.light();
    setEditAgendaItems(prev => [...prev, { time: '', title: '', speaker: '', description: '' }]);
  }

  function handleRemoveAgendaItem(index: number) {
    haptics.light();
    setEditAgendaItems(prev => prev.filter((_, i) => i !== index));
  }

  function handleUpdateAgendaItem(index: number, field: keyof EventAgendaItem, value: string) {
    setEditAgendaItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  async function handleSaveAgenda() {
    if (!event) return;
    const cleanedAgenda = editAgendaItems.filter(item => item.time.trim() && item.title.trim());
    haptics.medium();
    setSavingAgenda(true);
    try {
      await updateEvent(event.id, { agenda: cleanedAgenda } as any);
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      await queryClient.invalidateQueries({ queryKey: ['events', 'detail', event.id] });
      haptics.success();
      toast.success('Event schedule updated successfully.');
      setAgendaEditorOpen(false);
    } catch {
      haptics.error();
      toast.error('Could not save schedule. Please try again.');
    } finally {
      setSavingAgenda(false);
    }
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

    const resolvedLocation =
      editVenueType === 'virtual'
        ? (editVirtualLink.trim() || 'Online Virtual Meeting')
        : editRoomDetail.trim()
        ? `${editLocation.trim()} (${editRoomDetail.trim()})`
        : editLocation.trim();

    haptics.medium();
    setSavingEdit(true);
    try {
      await updateEvent(event.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        category: editCategory.toLowerCase() as any,
        campusCode: editCampus,
        visibilityScope: editScope,
        venueType: editVenueType,
        location: resolvedLocation,
        virtualLink: editVenueType === 'virtual' ? editVirtualLink.trim() : null,
        startAt: startDate ? startDate.toISOString() : event.startAt,
        endAt: endDate ? endDate.toISOString() : event.endAt,
        capacity: editCapacity.trim() ? parseInt(editCapacity.trim(), 10) : null,
        ticketPrice: editTicketPrice.trim() ? parseFloat(editTicketPrice.trim()) : 0,
        targetCohort: editTargetCohort.trim() || undefined,
        ...(isAdmin
          ? {
              approvalStatus: editApprovalStatus,
              isSpotlight: editIsSpotlight,
              sponsored: editSponsored,
            }
          : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      await queryClient.invalidateQueries({ queryKey: ['events', 'detail', event.id] });
      haptics.success();
      toast.success('Event details updated successfully.');
      setEditModalOpen(false);
    } catch {
      haptics.error();
      toast.error('Could not save changes. Please try again.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleSpotlight() {
    if (!event) return;
    haptics.medium();
    setActingSpotlight(true);
    const nextSpotlight = !event.isSpotlight;
    try {
      await setEventSpotlight(event.id, nextSpotlight);
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      await queryClient.invalidateQueries({ queryKey: ['events', 'detail', event.id] });
      haptics.success();
      toast.success(nextSpotlight ? 'Featured in Top Spotlight Carousel!' : 'Removed from Featured Carousel.');
    } catch {
      haptics.error();
      toast.error('Could not update spotlight status.');
    } finally {
      setActingSpotlight(false);
    }
  }

  async function handleToggleApproval() {
    if (!event) return;
    haptics.medium();
    setActingApproval(true);
    const isCurrentlyApproved = event.approvalStatus === 'approved';
    try {
      if (isCurrentlyApproved) {
        await revokeEventApproval(event.id);
        toast.show('Event publication revoked (moved to Under Review).');
      } else {
        await approveEvent(event.id);
        toast.success('Event approved and published live!');
      }
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      await queryClient.invalidateQueries({ queryKey: ['events', 'detail', event.id] });
      haptics.success();
    } catch {
      haptics.error();
      toast.error('Could not update approval status.');
    } finally {
      setActingApproval(false);
    }
  }

  async function handleOpenRoster() {
    if (!event) return;
    haptics.light();
    setRosterModalOpen(true);
    setLoadingRoster(true);
    try {
      const attendees = await listEventAttendees(event.id);
      setRosterAttendees(attendees);
    } catch {
      toast.show('Could not load attendee roster.');
    } finally {
      setLoadingRoster(false);
    }
  }

  function handleCancelEvent() {
    if (!event) return;
    haptics.light();
    Alert.alert(
      'Cancel & Purge This Event?',
      `This will permanently delete "${event.title}" and cancel all registrations. This cannot be undone.`,
      [
        { text: 'Keep Event', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            setCancellingEvent(true);
            try {
              await purgeEvent(event.id);
              await queryClient.invalidateQueries({ queryKey: ['events'] });
              haptics.success();
              toast.success('Event purged.');
              router.back();
            } catch {
              haptics.error();
              toast.error('Could not delete this event. Please try again.');
            } finally {
              setCancellingEvent(false);
            }
          },
        },
      ]
    );
  }

  async function handleToggleRsvp() {
    if (!event) return;
    if (isRestrictedGuest) {
      haptics.light();
      setVerificationModalOpen(true);
      return;
    }
    haptics.medium();
    setSubmittingRsvp(true);
    try {
      const action = isRsvpd ? 'cancel' : 'rsvp';
      await rsvpToEvent(event.id, action);
      setRsvpdState(!isRsvpd);
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      await queryClient.invalidateQueries({ queryKey: ['events', 'detail', event.id] });
      haptics.success();
      toast.success(
        !isRsvpd
          ? `Seat secured for "${event.title}"! Added to your schedule.`
          : 'Your RSVP has been cancelled.'
      );
    } catch {
      toast.error('Could not update RSVP status. Please try again.');
    } finally {
      setSubmittingRsvp(false);
    }
  }

  function handleLaunchMaps() {
    if (!event) return;
    if (isRestrictedGuest) {
      haptics.light();
      setVerificationModalOpen(true);
      return;
    }
    haptics.light();
    const query = matchedLandmark
      ? `${matchedLandmark.latitude},${matchedLandmark.longitude}`
      : encodeURIComponent(`${event.location} ${event.campusCode || ''} University Campus`);
    void openExternalUrl(`https://www.google.com/maps/search/?api=1&query=${query}`);
  }

  function handleGoogleCalendar() {
    if (!event) return;
    haptics.light();
    const startIso = event.startAt ? new Date(event.startAt) : new Date(Date.now() + 86400000);
    const endIso = event.endAt ? new Date(event.endAt) : new Date(Date.now() + 93600000);
    const startTime = startIso.toISOString().replace(/-|:|.ddd/g, '');
    const endTime = endIso.toISOString().replace(/-|:|.ddd/g, '');
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
      event.title
    )}&dates=${startTime}/${endTime}&details=${encodeURIComponent(event.description ?? '')}&location=${encodeURIComponent(
      event.location
    )}`;
    openExternalUrl(gcalUrl).then((opened) => {
      if (!opened) Alert.alert('Calendar', 'Could not open Google Calendar link.');
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

  const filteredRoster = useMemo(() => {
    if (!rosterSearch.trim()) return rosterAttendees;
    const q = rosterSearch.toLowerCase();
    return rosterAttendees.filter(
      (a) =>
        a.fullName.toLowerCase().includes(q) ||
        (a.matricNumber && a.matricNumber.toLowerCase().includes(q)) ||
        (a.department && a.department.toLowerCase().includes(q)) ||
        (a.ticketCode && a.ticketCode.toLowerCase().includes(q))
    );
  }, [rosterAttendees, rosterSearch]);

  if (isLoading || !event) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
          <AppText tone="secondary" style={{ marginTop: spacing.sm }}>
            Loading campus event details...
          </AppText>
        </View>
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
      {isDesktop && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            marginBottom: spacing.lg,
          }}
        >
          <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
            <AppText weight="bold" variant="bodySmall">
              Back to Events Hub
            </AppText>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => {
                haptics.light();
                setBookmarked((b) => !b);
                Alert.alert(bookmarked ? 'Bookmark Removed' : 'Event Saved', 'Added to your calendar bookmarks.');
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
              <Ionicons
                name={bookmarked ? 'bookmark' : 'bookmark-outline'}
                size={16}
                color={bookmarked ? colors.brandPrimary : colors.textPrimary}
              />
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
                Fullscreen Poster
              </AppText>
            </Pressable>
          </View>
        </View>
      )}

      {/* ========================================================================= */}
      {/* DESKTOP ADMINISTRATIVE & ORGANIZER COMMAND BAR */}
      {/* ========================================================================= */}
      {isDesktop && (
        isAdmin ? (
          <View style={{ paddingHorizontal: 0, marginBottom: spacing.md }}>
            <SolidCard
              frosted
              style={{
                padding: spacing.md,
                borderWidth: 1.5,
                borderColor: colors.border,
                borderRadius: radius.lg,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="shield-checkmark" size={18} color={colors.textSecondary} />
                  <AppText weight="bold" variant="caption" tone="secondary" style={{ letterSpacing: 0.8 }}>
                    ADMINISTRATIVE CONTROL & MODERATION HUB
                  </AppText>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  {event.isSpotlight && <Badge label="FEATURED SPOTLIGHT" tone="neutral" />}
                  <Badge
                    label={
                      event.approvalStatus === 'pending'
                        ? 'PENDING REVIEW'
                        : event.approvalStatus === 'approved'
                        ? 'APPROVED & LIVE'
                        : 'REVOKED'
                    }
                    tone={
                      event.approvalStatus === 'pending'
                        ? 'warning'
                        : event.approvalStatus === 'approved'
                        ? 'success'
                        : 'critical'
                    }
                  />
                </View>
              </View>

              {/* Quick Action Control Buttons */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' }}>
                <View style={{ flex: 1, minWidth: 120 }}>
                  <AppButton
                    label="Edit All Details"
                    size="sm"
                    variant="secondary"
                    icon="create-outline"
                    onPress={handleOpenEdit}
                  />
                </View>

                <View style={{ flex: 1, minWidth: 130 }}>
                  <AppButton
                    label={event.isSpotlight ? 'Featured ★' : 'Feature Event ★'}
                    size="sm"
                    variant={event.isSpotlight ? 'primary' : 'secondary'}
                    loading={actingSpotlight}
                    onPress={handleToggleSpotlight}
                  />
                </View>

                <View style={{ flex: 1, minWidth: 110 }}>
                  <AppButton
                    label={event.approvalStatus === 'approved' ? 'Revoke Approval' : 'Approve & Publish'}
                    size="sm"
                    variant={event.approvalStatus === 'approved' ? 'ghost' : 'primary'}
                    loading={actingApproval}
                    onPress={handleToggleApproval}
                  />
                </View>

                <View style={{ flex: 1, minWidth: 125 }}>
                  <AppButton
                    label={`Roster (${currentRsvpCount})`}
                    size="sm"
                    variant="secondary"
                    icon="people-outline"
                    onPress={handleOpenRoster}
                  />
                </View>

                <Pressable accessibilityRole="button" accessibilityLabel="Delete"
                  onPress={handleCancelEvent}
                  hitSlop={8}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: radius.md,
                    backgroundColor: isDark ? '#374151' : '#FEE2E2',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </Pressable>
              </View>
            </SolidCard>
          </View>
        ) : isOwner ? (
          <View style={{ paddingHorizontal: 0, marginBottom: spacing.md }}>
            <SolidCard
              frosted
              style={{
                padding: spacing.md,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.lg,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="settings-outline" size={18} color={colors.textSecondary} />
                  <AppText weight="bold" variant="caption" tone="secondary" style={{ letterSpacing: 0.8 }}>
                    YOUR EVENT CONTROLS
                  </AppText>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Badge
                    label={
                      event.approvalStatus === 'pending'
                        ? 'PENDING REVIEW'
                        : event.approvalStatus === 'approved'
                        ? 'APPROVED'
                        : 'REVOKED'
                    }
                    tone={
                      event.approvalStatus === 'pending'
                        ? 'warning'
                        : event.approvalStatus === 'approved'
                        ? 'success'
                        : 'critical'
                    }
                  />
                </View>
              </View>

              {/* Quick Action Control Buttons */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' }}>
                <View style={{ flex: 1, minWidth: 120 }}>
                  <AppButton
                    label="Edit My Event"
                    size="sm"
                    variant="secondary"
                    icon="create-outline"
                    onPress={handleOpenEdit}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 125 }}>
                  <AppButton
                    label={`View Roster (${currentRsvpCount})`}
                    size="sm"
                    variant="secondary"
                    icon="people-outline"
                    onPress={handleOpenRoster}
                  />
                </View>
              </View>
            </SolidCard>
          </View>
        ) : null
      )}

      {/* ========================================================================= */}
      {/* DESKTOP VIEW */}
      {/* ========================================================================= */}
      {isDesktop ? (
        <View style={{ flexDirection: 'row', gap: 32, alignItems: 'flex-start' }}>
          {/* Left / Main Column */}
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Hero Cover Media Banner */}
            <View style={{ width: '100%', height: 320, borderRadius: 24, overflow: 'hidden', position: 'relative', marginBottom: spacing.lg, backgroundColor: colors.surface }}>
              <Image source={heroImageSource} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={300} />
              <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />

              <View style={{ position: 'absolute', top: 16, right: 16, flexDirection: 'row', gap: 8 }}>
                <Pressable accessibilityRole="button" accessibilityLabel="View full size" onPress={() => setLightboxOpen(true)} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="expand-outline" size={18} color="#FFFFFF" />
                </Pressable>
              </View>

              <View style={{ position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <View style={{ backgroundColor: colors.brandPrimary, paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill }}>
                    <AppText variant="caption" weight="bold" tone="inverse" style={{ textTransform: 'uppercase' }}>
                      {event.category}
                    </AppText>
                  </View>
                  <Badge label={event.campusCode ? `${event.campusCode} NODE` : 'GLOBAL'} tone="neutral" />
                  {event.ticketPrice ? <Badge label={`NGN ${event.ticketPrice.toLocaleString()}`} tone="neutral" /> : <Badge label="FREE ENTRY" tone="success" />}
                  {event.sponsored ? <Badge label="SPONSORED" tone="neutral" /> : null}
                  {event.isSpotlight ? <Badge label="FEATURED ★" tone="neutral" /> : null}
                </View>

                <View style={{ backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill }}>
                  <AppText variant="caption" weight="bold" tone="inverse">
                    {hasCapacity ? `${currentRsvpCount} / ${capacity} Registered` : `${currentRsvpCount} Registered`}
                  </AppText>
                </View>
              </View>
            </View>

            {/* Title & Verified Location Row */}
            <View style={{ marginBottom: spacing.md }}>
              <AppText variant="h1" weight="bold" style={{ fontSize: 28, lineHeight: 34, marginBottom: 8 }}>
                {event.title}
              </AppText>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                  <AppText weight="bold" variant="bodySmall">
                    {event.startAt ? new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBA'}
                  </AppText>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                  <AppText variant="bodySmall" tone="secondary">
                    {event.startAt ? new Date(event.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} -{' '}
                    {event.endAt ? new Date(event.endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </AppText>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                  <AppText weight="bold" variant="bodySmall" tone={isRestrictedGuest ? 'secondary' : 'primary'}>
                    {isRestrictedGuest
                      ? `🔒 Exclusive to Verified ${event.campusCode || 'Campus'} Students`
                      : event.location}
                  </AppText>
                  {!isRestrictedGuest && matchedLandmark && (
                    <Badge label="✓ Verified Campus Venue" tone="success" />
                  )}
                </View>
              </View>
            </View>

            {/* Tab Navigation Controls */}
            <View style={{ flexDirection: 'row', gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: spacing.lg }}>
              {(['overview', 'agenda', 'map'] as const).map((tab) => {
                const active = activeTab === tab;
                const label = tab === 'overview' ? 'Overview' : tab === 'agenda' ? 'Agenda & Schedule' : 'Campus Map & Directions';
                return (
                  <Pressable
                    key={tab}
                    onPress={() => {
                      haptics.light();
                      setActiveTab(tab);
                    }}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderBottomWidth: 2,
                      borderBottomColor: active ? colors.brandPrimary : 'transparent',
                    }}
                  >
                    <AppText weight={active ? 'bold' : 'medium'} tone={active ? 'brand' : 'secondary'}>
                      {label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Tab 1: Overview */}
            {activeTab === 'overview' && (
              <View style={{ gap: spacing.lg }}>
                <SolidCard style={{ padding: spacing.lg }}>
                  <AppText weight="bold" variant="h3" style={{ marginBottom: spacing.sm }}>
                    About This Event
                  </AppText>
                  <AppText style={{ lineHeight: 22, fontSize: 14.5 }}>
                    {event.description || 'No detailed description provided by the organizer.'}
                  </AppText>
                </SolidCard>

                {/* Verified Venue Detail Card */}
                {matchedLandmark && (
                  <SolidCard style={{ padding: spacing.lg, backgroundColor: isDark ? '#064E3B20' : '#ECFDF5', borderWidth: 1, borderColor: '#10B981' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Badge label="VERIFIED CAMPUS VENUE" tone="success" />
                          <Badge label={matchedLandmark.category} tone="neutral" />
                          {matchedLandmark.shortCode && <Badge label={matchedLandmark.shortCode} tone="neutral" />}
                        </View>
                        <AppText weight="bold" variant="h3">
                          {matchedLandmark.name}
                        </AppText>
                        <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
                          {matchedLandmark.description}
                        </AppText>
                        {matchedLandmark.walkingTip && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                            <Ionicons name="navigate-circle" size={16} color={colors.textSecondary} />
                            <AppText variant="caption" tone="secondary" weight="bold">
                              Walking Directions: {matchedLandmark.walkingTip}
                            </AppText>
                          </View>
                        )}
                      </View>
                      <AppButton
                        label="View on Campus Map"
                        size="sm"
                        variant="secondary"
                        onPress={() => setActiveTab('map')}
                      />
                    </View>
                  </SolidCard>
                )}

                {/* Organizer Card */}
                <SolidCard style={{ padding: spacing.lg }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Avatar name={event.organizerName || 'Organizer'} size={48} role="staff" />
                      <View>
                        <AppText weight="bold" variant="h3">
                          {event.organizerName || 'Campus Event Organizer'}
                        </AppText>
                        <AppText tone="secondary" variant="caption">
                          Verified Campus Organizer • {event.campusCode || 'University'} Host
                        </AppText>
                      </View>
                    </View>
                    {isFeatureEnabled('e2ee_messaging') && (
                      <AppButton
                        label="Contact Organizer"
                        variant="ghost"
                        loading={contactingOrganizer}
                        onPress={handleContactOrganizer}
                      />
                    )}
                  </View>
                </SolidCard>
              </View>
            )}

            {/* Tab 2: Agenda */}
            {activeTab === 'agenda' && (
              <SolidCard style={{ padding: spacing.lg }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
                  <AppText weight="bold" variant="h3">
                    Program Schedule & Timeline
                  </AppText>
                  {canManage && (
                    <AppButton
                      label={isAdmin ? 'Edit Schedule' : 'Edit My Schedule'}
                      size="sm"
                      variant="ghost"
                      icon="create-outline"
                      onPress={handleOpenAgendaEditor}
                    />
                  )}
                </View>

                {event.agenda && event.agenda.length > 0 ? (
                  <View style={{ gap: spacing.md }}>
                    {event.agenda.map((stage, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                        <View style={{ backgroundColor: colors.divider, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm, minWidth: 80, alignItems: 'center' }}>
                          <AppText weight="bold" variant="caption">
                            {stage.time}
                          </AppText>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <AppText weight="bold" variant="bodySmall">
                            {stage.title}
                          </AppText>
                          {stage.speaker && (
                            <AppText tone="secondary" variant="caption">
                              Speaker: {stage.speaker}
                            </AppText>
                          )}
                          {stage.description && (
                            <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                              {stage.description}
                            </AppText>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ paddingVertical: 24, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="time-outline" size={36} color={colors.textSecondary} />
                    <AppText tone="secondary" variant="bodySmall" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                      Detailed program stages haven't been published yet.
                    </AppText>
                    {canManage && (
                      <View style={{ marginTop: spacing.md }}>
                        <AppButton
                          label="Add Program Agenda"
                          variant="secondary"
                          size="sm"
                          onPress={handleOpenAgendaEditor}
                        />
                      </View>
                    )}
                  </View>
                )}
              </SolidCard>
            )}

            {/* Tab 3: Campus Map & Navigation */}
            {activeTab === 'map' && (
              isRestrictedGuest ? (
                <VerificationRequiredGate
                  campusCode={event.campusCode}
                  featureName="venue"
                  onStartVerification={() => setVerificationModalOpen(true)}
                />
              ) : (
                <View style={{ gap: spacing.md }}>
                <View
                  style={{
                    height: 360,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    borderRadius: radius.lg,
                    backgroundColor: colors.surface,
                    overflow: 'hidden',
                  }}
                >
                  {Platform.OS === 'web' ? (
                    <iframe
                      title={`Map - ${event.location}`}
                      width="100%"
                      height="100%"
                      style={{ border: 0, width: '100%', height: '100%' }}
                      loading="lazy"
                      allowFullScreen
                      src={matchedLandmark
                        ? `https://maps.google.com/maps?q=${matchedLandmark.latitude},${matchedLandmark.longitude}&t=&z=17&ie=UTF8&iwloc=&output=embed`
                        : `https://maps.google.com/maps?q=${encodeURIComponent(
                            event.location + ' ' + (event.campusCode || '') + ' University Campus'
                          )}&t=&z=16&ie=UTF8&iwloc=&output=embed`
                      }
                    />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.divider }}>
                      <Ionicons name="location" size={44} color={colors.textSecondary} />
                      <AppText weight="bold" variant="h3" style={{ marginTop: spacing.xs, textAlign: 'center' }}>
                        {matchedLandmark ? matchedLandmark.name : event.location}
                      </AppText>
                      {matchedLandmark && (
                        <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 4 }}>
                          GPS: {matchedLandmark.latitude.toFixed(4)}, {matchedLandmark.longitude.toFixed(4)}
                        </AppText>
                      )}
                      <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 4, marginBottom: spacing.md }}>
                        {event.campusCode ? `${event.campusCode} Campus Venue` : 'Campus Location'} • Tap below to navigate
                      </AppText>
                      <AppButton label="Open in Google Maps" onPress={handleLaunchMaps} />
                    </View>
                  )}
                </View>

                {/* Venue details card synced with campus POI data */}
                {matchedLandmark && (
                  <SolidCard style={{ padding: spacing.md, borderWidth: 1, borderColor: '#10B981', backgroundColor: isDark ? '#064E3B20' : '#ECFDF5' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Badge label="VERIFIED VENUE" tone="success" />
                      <Badge label={matchedLandmark.category} tone="neutral" />
                      {matchedLandmark.shortCode && <Badge label={matchedLandmark.shortCode} tone="neutral" />}
                    </View>
                    <AppText weight="bold" variant="h3">{matchedLandmark.name}</AppText>
                    <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>{matchedLandmark.description}</AppText>
                    {matchedLandmark.walkingTip && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <Ionicons name="navigate-circle" size={16} color={colors.textSecondary} />
                        <AppText variant="caption" tone="secondary" weight="bold">
                          Walking Directions: {matchedLandmark.walkingTip}
                        </AppText>
                      </View>
                    )}
                    <AppText variant="caption" tone="secondary" style={{ marginTop: 4 }}>
                      Coordinates: {matchedLandmark.latitude.toFixed(5)}°N, {matchedLandmark.longitude.toFixed(5)}°E
                    </AppText>
                  </SolidCard>
                )}

                <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'flex-end' }}>
                  <AppButton
                    label="Open Full Campus Map"
                    variant="secondary"
                    icon="map-outline"
                    onPress={() => setCampusMapOpen(true)}
                  />
                  <AppButton
                    label="Get Directions in Maps"
                    variant="primary"
                    icon="navigate-outline"
                    onPress={handleLaunchMaps}
                  />
                </View>
              </View>
            ))}
          </View>

          {/* Right Column: Sticky Action & Ticket Registration Card */}
          <View style={{ width: 340, minWidth: 280, flexShrink: 0 }}>
            <SolidCard radius={20} style={{ padding: spacing.lg, marginBottom: spacing.lg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                <AppText weight="bold" variant="h3">
                  Registration
                </AppText>
                <Badge
                  label={
                    isRsvpd
                      ? 'Seat Confirmed'
                      : remainingSpots === null
                      ? 'Open Entry'
                      : remainingSpots > 0
                      ? `${remainingSpots} spots left`
                      : 'Full'
                  }
                  tone={isRsvpd || remainingSpots === null ? 'brand' : remainingSpots > 0 ? 'accent' : 'critical'}
                />
              </View>

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

              <View style={{ marginBottom: spacing.md }}>
                <AppButton
                  label={
                    isRestrictedGuest
                      ? 'Verify Student ID to RSVP'
                      : isRsvpd
                      ? 'Release / Cancel Seat'
                      : 'Claim Your Seat (RSVP)'
                  }
                  variant={isRestrictedGuest ? 'primary' : isRsvpd ? 'secondary' : 'primary'}
                  loading={submittingRsvp}
                  onPress={handleToggleRsvp}
                  fullWidth
                />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
                <AppText variant="caption" tone="secondary" style={{ fontSize: 12 }}>
                  {currentRsvpCount} students registered
                </AppText>
                {canManage && (
                  <Pressable onPress={handleOpenRoster}>
                    <AppText variant="caption" weight="bold" tone="brand">
                      View Roster
                    </AppText>
                  </Pressable>
                )}
              </View>

              <AppText weight="bold" variant="caption" tone="secondary" style={{ letterSpacing: 0.5, marginBottom: spacing.sm, textTransform: 'uppercase' }}>
                Add to Calendar
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
                <View style={{ flex: 1 }}>
                  <AppButton label="Google Cal" variant="secondary" onPress={handleGoogleCalendar} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppButton label={icsExported ? 'Saved .ICS' : '.ICS File'} variant="secondary" onPress={handleExportIcs} />
                </View>
              </View>

              <AppText weight="bold" variant="caption" tone="secondary" style={{ letterSpacing: 0.5, marginBottom: spacing.xs, textTransform: 'uppercase' }}>
                Venue Location
              </AppText>
              <AppText variant="bodySmall" weight="medium" tone={isRestrictedGuest ? 'secondary' : 'primary'} style={{ marginBottom: spacing.sm }}>
                {isRestrictedGuest
                  ? `🔒 Exclusive to Verified ${event.campusCode || 'Campus'} Students`
                  : event.location}
              </AppText>
              <AppButton
                label={isRestrictedGuest ? 'Verify to View Venue' : 'Open Navigation'}
                variant="ghost"
                onPress={handleLaunchMaps}
              />
            </SolidCard>
          </View>
        </View>
      ) : (
        /* ========================================================================= */
        /* MOBILE VIEW */
        /* ========================================================================= */
        <ScrollView
          style={{ flex: 1, width: '100%' }}
          contentContainerStyle={{ paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Hero Banner */}
          <View style={{ width: '100%', height: 260, position: 'relative', backgroundColor: colors.surface }}>
            <Pressable accessibilityRole="button" accessibilityLabel="View event image full screen" onPress={() => setLightboxOpen(true)} style={{ width: '100%', height: '100%' }}>
              <Image source={heroImageSource} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={300} />
              <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.38)' }} />
            </Pressable>

            {/* Floating Navigation Controls */}
            <View style={{ position: 'absolute', top: 44, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Go back"
                onPress={() => router.back()}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </Pressable>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark event'}
                  onPress={() => {
                    haptics.light();
                    setBookmarked((b) => !b);
                    Alert.alert(bookmarked ? 'Bookmark Removed' : 'Event Saved', 'Added to your calendar bookmarks.');
                  }}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={bookmarked ? colors.brandPrimary : '#FFFFFF'} />
                </Pressable>

                <Pressable accessibilityRole="button" accessibilityLabel="View full size"
                  onPress={() => setLightboxOpen(true)}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="expand-outline" size={20} color="#FFFFFF" />
                </Pressable>
              </View>
            </View>

            {/* Banner Badges */}
            <View style={{ position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <View style={{ backgroundColor: colors.brandPrimary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
                  <AppText variant="caption" weight="bold" tone="inverse" style={{ textTransform: 'uppercase' }}>
                    {event.category}
                  </AppText>
                </View>
                {event.ticketPrice ? <Badge label={`NGN ${event.ticketPrice.toLocaleString()}`} tone="neutral" /> : <Badge label="FREE" tone="success" />}
                {event.sponsored ? <Badge label="SPONSORED" tone="neutral" /> : null}
                {event.isSpotlight ? <Badge label="FEATURED ★" tone="neutral" /> : null}
              </View>

              <View style={{ backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
                <AppText variant="caption" weight="bold" tone="inverse">
                  {hasCapacity ? `${currentRsvpCount} / ${capacity} Registered` : `${currentRsvpCount} Registered`}
                </AppText>
              </View>
            </View>
          </View>

          {/* Content Body */}
          <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md, width: '100%' }}>
            {/* Mobile Admin / Organizer Command Hub */}
            {isAdmin ? (
              <SolidCard
                frosted
                style={{
                  padding: spacing.sm,
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  borderRadius: radius.md,
                  gap: 8,
                  marginBottom: spacing.md,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="shield-checkmark" size={16} color={colors.textSecondary} />
                    <AppText weight="bold" variant="caption" tone="secondary" style={{ letterSpacing: 0.6, fontSize: 11 }}>
                      ADMIN MODERATION HUB
                    </AppText>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                    {event.isSpotlight && <Badge label="FEATURED" tone="neutral" />}
                    <Badge
                      label={
                        event.approvalStatus === 'pending'
                          ? 'PENDING'
                          : event.approvalStatus === 'approved'
                          ? 'APPROVED'
                          : 'REVOKED'
                      }
                      tone={
                        event.approvalStatus === 'pending'
                          ? 'warning'
                          : event.approvalStatus === 'approved'
                          ? 'success'
                          : 'critical'
                      }
                    />
                  </View>
                </View>

                {/* Mobile Admin Action Buttons */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <View style={{ flex: 1, minWidth: 90 }}>
                    <AppButton
                      label="Edit"
                      size="sm"
                      variant="secondary"
                      icon="create-outline"
                      onPress={handleOpenEdit}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 105 }}>
                    <AppButton
                      label={event.isSpotlight ? 'Featured ★' : 'Feature ★'}
                      size="sm"
                      variant={event.isSpotlight ? 'primary' : 'secondary'}
                      loading={actingSpotlight}
                      onPress={handleToggleSpotlight}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 95 }}>
                    <AppButton
                      label={event.approvalStatus === 'approved' ? 'Revoke' : 'Approve'}
                      size="sm"
                      variant={event.approvalStatus === 'approved' ? 'ghost' : 'primary'}
                      loading={actingApproval}
                      onPress={handleToggleApproval}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 95 }}>
                    <AppButton
                      label={`Roster (${currentRsvpCount})`}
                      size="sm"
                      variant="secondary"
                      icon="people-outline"
                      onPress={handleOpenRoster}
                    />
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Delete"
                    onPress={handleCancelEvent}
                    hitSlop={8}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: radius.sm,
                      backgroundColor: isDark ? '#374151' : '#FEE2E2',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </Pressable>
                </View>
              </SolidCard>
            ) : isOwner ? (
              <SolidCard
                frosted
                style={{
                  padding: spacing.sm,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.md,
                  gap: 8,
                  marginBottom: spacing.md,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="settings-outline" size={16} color={colors.textSecondary} />
                    <AppText weight="bold" variant="caption" tone="secondary" style={{ letterSpacing: 0.6, fontSize: 11 }}>
                      YOUR EVENT CONTROLS
                    </AppText>
                  </View>
                  <Badge
                    label={
                      event.approvalStatus === 'pending'
                        ? 'PENDING REVIEW'
                        : event.approvalStatus === 'approved'
                        ? 'APPROVED'
                        : 'REVOKED'
                    }
                    tone={
                      event.approvalStatus === 'pending'
                        ? 'warning'
                        : event.approvalStatus === 'approved'
                        ? 'success'
                        : 'critical'
                    }
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Edit My Event"
                      size="sm"
                      variant="secondary"
                      icon="create-outline"
                      onPress={handleOpenEdit}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label={`View Roster (${currentRsvpCount})`}
                      size="sm"
                      variant="secondary"
                      icon="people-outline"
                      onPress={handleOpenRoster}
                    />
                  </View>
                </View>
              </SolidCard>
            ) : null}

            <AppText variant="h2" weight="bold" style={{ fontSize: 22, lineHeight: 28, marginBottom: 4 }}>
              {event.title}
            </AppText>

            {/* Date & Location Pill Highlights */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                <AppText weight="bold" variant="bodySmall" tone="primary">
                  {event.startAt ? new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Date TBA'}
                </AppText>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                <AppText weight="bold" variant="bodySmall" tone={isRestrictedGuest ? 'secondary' : 'primary'}>
                  {isRestrictedGuest
                    ? `🔒 Exclusive to Verified ${event.campusCode || 'Campus'} Students`
                    : event.location}
                </AppText>
                {!isRestrictedGuest && matchedLandmark && <Badge label="✓ Verified" tone="success" />}
              </View>
            </View>

            {/* Capacity & Attendance Card */}
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

              <View style={{ marginTop: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="caption" tone="secondary">
                  {currentRsvpCount} attending
                </AppText>
                <View style={{ width: 140 }}>
                  <AppButton
                    label={isRestrictedGuest ? 'Verify to RSVP' : isRsvpd ? 'Cancel Seat' : 'RSVP Now'}
                    size="sm"
                    variant={isRestrictedGuest ? 'primary' : isRsvpd ? 'secondary' : 'primary'}
                    loading={submittingRsvp}
                    onPress={handleToggleRsvp}
                  />
                </View>
              </View>
            </View>

            {/* Mobile Tab Selectors */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.md }}>
              {(['overview', 'agenda', 'map'] as const).map((tab) => {
                const active = activeTab === tab;
                const label = tab === 'overview' ? 'Overview' : tab === 'agenda' ? 'Agenda' : 'Campus Map';
                return (
                  <Pressable
                    key={tab}
                    onPress={() => {
                      haptics.light();
                      setActiveTab(tab);
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: radius.pill,
                      backgroundColor: active ? colors.brandPrimary : colors.surface,
                      borderWidth: 1,
                      borderColor: active ? colors.brandPrimary : colors.border,
                      alignItems: 'center',
                    }}
                  >
                    <AppText variant="caption" weight="bold" tone={active ? 'inverse' : 'secondary'}>
                      {label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Tab 1: Overview */}
            {activeTab === 'overview' && (
              <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
                <SolidCard style={{ padding: spacing.md }}>
                  <AppText weight="bold" variant="h3" style={{ marginBottom: spacing.xs }}>
                    About This Event
                  </AppText>
                  <AppText style={{ lineHeight: 20, fontSize: 14 }}>
                    {event.description || 'No detailed description provided.'}
                  </AppText>
                </SolidCard>

                {matchedLandmark && (
                  <SolidCard style={{ padding: spacing.md, backgroundColor: isDark ? '#064E3B20' : '#ECFDF5', borderWidth: 1, borderColor: '#10B981' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Badge label="VERIFIED CAMPUS VENUE" tone="success" />
                      {matchedLandmark.shortCode && <Badge label={matchedLandmark.shortCode} tone="neutral" />}
                    </View>
                    <AppText weight="bold" style={{ fontSize: 15 }}>
                      {matchedLandmark.name}
                    </AppText>
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                      {matchedLandmark.description}
                    </AppText>
                    {matchedLandmark.walkingTip && (
                      <AppText variant="caption" tone="brand" weight="bold" style={{ marginTop: 4 }}>
                        Directions: {matchedLandmark.walkingTip}
                      </AppText>
                    )}
                  </SolidCard>
                )}

                {/* Organizer Card */}
                <SolidCard style={{ padding: spacing.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Avatar name={event.organizerName || 'Organizer'} size={40} role="staff" />
                      <View>
                        <AppText weight="bold" style={{ fontSize: 14 }}>
                          {event.organizerName || 'Campus Event Organizer'}
                        </AppText>
                        <AppText tone="secondary" variant="caption">
                          Verified Campus Organizer
                        </AppText>
                      </View>
                    </View>
                    {isFeatureEnabled('e2ee_messaging') && (
                      <AppButton
                        label="Contact"
                        size="sm"
                        variant="ghost"
                        loading={contactingOrganizer}
                        onPress={handleContactOrganizer}
                      />
                    )}
                  </View>
                </SolidCard>
              </View>
            )}

            {/* Tab 2: Agenda */}
            {activeTab === 'agenda' && (
              <SolidCard style={{ padding: spacing.md, marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                  <AppText weight="bold" variant="h3">
                    Program Schedule
                  </AppText>
                  {canManage && (
                    <Pressable onPress={handleOpenAgendaEditor}>
                      <AppText variant="caption" weight="bold" tone="brand">
                        {isOwner && !isAdmin ? 'Edit My Schedule' : 'Edit Schedule'}
                      </AppText>
                    </Pressable>
                  )}
                </View>

                {event.agenda && event.agenda.length > 0 ? (
                  <View style={{ gap: spacing.md }}>
                    {event.agenda.map((stage, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                        <View style={{ backgroundColor: colors.divider, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm }}>
                          <AppText weight="bold" variant="caption">
                            {stage.time}
                          </AppText>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <AppText weight="bold" variant="bodySmall">
                            {stage.title}
                          </AppText>
                          {stage.speaker && (
                            <AppText tone="secondary" variant="caption">
                              {stage.speaker}
                            </AppText>
                          )}
                          {stage.description && (
                            <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                              {stage.description}
                            </AppText>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                    <Ionicons name="time-outline" size={32} color={colors.textSecondary} />
                    <AppText tone="secondary" variant="caption" style={{ marginTop: 4 }}>
                      Program timeline not announced yet.
                    </AppText>
                    {canManage && (
                      <View style={{ marginTop: spacing.sm }}>
                        <AppButton
                          label={isOwner && !isAdmin ? 'Add My Schedule' : 'Add Program Agenda'}
                          variant="secondary"
                          size="sm"
                          onPress={handleOpenAgendaEditor}
                        />
                      </View>
                    )}
                  </View>
                )}
              </SolidCard>
            )}

            {/* Tab 3: Campus Map */}
            {activeTab === 'map' && (
              isRestrictedGuest ? (
                <VerificationRequiredGate
                  campusCode={event.campusCode}
                  featureName="venue"
                  onStartVerification={() => setVerificationModalOpen(true)}
                />
              ) : (
                <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
                <View
                  style={{
                    height: 280,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    borderRadius: radius.md,
                    backgroundColor: colors.surface,
                    overflow: 'hidden',
                  }}
                >
                  {Platform.OS === 'web' ? (
                    <iframe
                      title={`Mobile Map - ${event.location}`}
                      width="100%"
                      height="100%"
                      style={{ border: 0, width: '100%', height: '100%' }}
                      loading="lazy"
                      allowFullScreen
                      src={matchedLandmark
                        ? `https://maps.google.com/maps?q=${matchedLandmark.latitude},${matchedLandmark.longitude}&t=&z=17&ie=UTF8&iwloc=&output=embed`
                        : `https://maps.google.com/maps?q=${encodeURIComponent(
                            event.location + ' ' + (event.campusCode || '') + ' University Campus'
                          )}&t=&z=16&ie=UTF8&iwloc=&output=embed`
                      }
                    />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.divider }}>
                      <Ionicons name="location" size={40} color={colors.textSecondary} />
                      <AppText weight="bold" style={{ marginTop: 6, textAlign: 'center' }}>
                        {matchedLandmark ? matchedLandmark.name : event.location}
                      </AppText>
                      {matchedLandmark && (
                        <AppText tone="secondary" variant="caption" style={{ textAlign: 'center', marginTop: 4 }}>
                          GPS: {matchedLandmark.latitude.toFixed(4)}, {matchedLandmark.longitude.toFixed(4)}
                        </AppText>
                      )}
                      <AppButton label="Open in Google Maps" size="sm" onPress={handleLaunchMaps} />
                    </View>
                  )}
                </View>

                {/* Venue details card synced with campus POI data */}
                {matchedLandmark && (
                  <SolidCard style={{ padding: spacing.md, borderWidth: 1, borderColor: '#10B981', backgroundColor: isDark ? '#064E3B20' : '#ECFDF5' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Badge label="VERIFIED VENUE" tone="success" />
                      {matchedLandmark.shortCode && <Badge label={matchedLandmark.shortCode} tone="neutral" />}
                    </View>
                    <AppText weight="bold" style={{ fontSize: 16 }}>{matchedLandmark.name}</AppText>
                    <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>{matchedLandmark.description}</AppText>
                    {matchedLandmark.walkingTip && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <Ionicons name="navigate-circle" size={16} color={colors.textSecondary} />
                        <AppText variant="caption" tone="secondary" weight="bold">
                          Directions: {matchedLandmark.walkingTip}
                        </AppText>
                      </View>
                    )}
                  </SolidCard>
                )}

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Full Campus Map"
                      size="sm"
                      variant="secondary"
                      icon="map-outline"
                      onPress={() => setCampusMapOpen(true)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Navigate"
                      size="sm"
                      variant="primary"
                      icon="navigate-outline"
                      onPress={handleLaunchMaps}
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ========================================================================= */}
      {/* ATTENDEE ROSTER MODAL */}
      {/* ========================================================================= */}
      <Modal visible={rosterModalOpen} transparent animationType="slide" onRequestClose={() => setRosterModalOpen(false)}>
        <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRosterModalOpen(false)} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: isDesktop ? spacing.xl : spacing.lg,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              width: '100%',
              maxWidth: 600,
              alignSelf: 'center',
              maxHeight: '85%',
            }}
          >
            {/* Mobile grab handle */}
            {!isDesktop && (
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.border,
                  alignSelf: 'center',
                  marginBottom: spacing.sm,
                }}
              />
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="people-outline" size={20} color={colors.textSecondary} />
                <AppText variant="h2" weight="bold">
                  Registered Attendees ({rosterAttendees.length})
                </AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setRosterModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Search Bar */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.background,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.sm,
                height: 38,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: spacing.md,
              }}
            >
              <Ionicons name="search-outline" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
              <TextInput accessibilityLabel="Search by name, department, or matric"
                style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
                placeholder="Search by name, department, or matric..."
                placeholderTextColor={colors.textSecondary}
                value={rosterSearch}
                onChangeText={setRosterSearch}
              />
              {rosterSearch ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear" onPress={() => setRosterSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            {loadingRoster ? (
              <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.brandPrimary} />
                <AppText tone="secondary" variant="caption" style={{ marginTop: 8 }}>
                  Loading attendee list...
                </AppText>
              </View>
            ) : filteredRoster.length > 0 ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%', marginBottom: spacing.md }}>
                {filteredRoster.map((item, idx) => (
                  <View
                    key={item.userId || idx}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.divider,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <Avatar name={item.fullName} size={36} role={(item.role as any) || 'student'} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <AppText weight="bold" numberOfLines={1} style={{ fontSize: 13.5 }}>
                            {item.fullName}
                          </AppText>
                          {item.matricNumber && <Badge label={item.matricNumber} tone="neutral" />}
                        </View>
                        <AppText tone="secondary" variant="caption" numberOfLines={1}>
                          {item.department || 'Student'} • {new Date(item.registeredAt).toLocaleDateString()}
                        </AppText>
                      </View>
                    </View>

                    {item.ticketCode && (
                      <View style={{ backgroundColor: colors.divider, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, marginLeft: 8 }}>
                        <AppText variant="caption" weight="bold" style={{ fontSize: 11 }}>
                          #{item.ticketCode.toUpperCase()}
                        </AppText>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <Ionicons name="people-outline" size={36} color={colors.textSecondary} />
                <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 6 }}>
                  {rosterSearch ? 'No matching attendees found.' : 'No attendees have registered for this event yet.'}
                </AppText>
              </View>
            )}

            <AppButton label="Done" onPress={() => setRosterModalOpen(false)} fullWidth />
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* COMPREHENSIVE EDIT EVENT MODAL */}
      {/* ========================================================================= */}
      <Modal visible={editModalOpen} transparent animationType="slide" onRequestClose={() => setEditModalOpen(false)}>
        <KeyboardAvoidingView accessibilityViewIsModal
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditModalOpen(false)} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: isDesktop ? spacing.xl : spacing.lg,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              width: '100%',
              maxWidth: 640,
              alignSelf: 'center',
              maxHeight: '92%',
            }}
          >
            {/* Mobile grab handle */}
            {!isDesktop && (
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.border,
                  alignSelf: 'center',
                  marginBottom: spacing.sm,
                }}
              />
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
                <AppText weight="bold" variant="h2">
                  Edit Event Details & Controls
                </AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setEditModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ width: '100%', marginBottom: spacing.md }}>
              <AppTextField
                label="Event Title"
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="e.g. Annual Faculty Hackathon & Innovation Summit"
              />

              {/* University Workspace Indicator (Locked to Workspace) */}
              <View style={{ backgroundColor: colors.divider, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="school" size={15} color={colors.textSecondary} />
                  <AppText variant="caption" weight="bold" tone="secondary">
                    Campus Workspace: {event?.campusCode || editCampus || 'GLOBAL'}
                  </AppText>
                </View>
                <AppText variant="caption" tone="secondary" style={{ marginTop: 2, fontSize: 11 }}>
                  Scoped strictly to verified members of this university workspace.
                </AppText>
              </View>

              {/* Event Category Selector */}
              <AppText variant="caption" weight="bold" tone="secondary" style={{ letterSpacing: 0.8, marginBottom: spacing.xs }}>
                EVENT CATEGORY
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md }}>
                {CATEGORIES.map((cat) => {
                  const active = editCategory.toLowerCase() === cat.toLowerCase();
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => setEditCategory(cat)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: radius.pill,
                        backgroundColor: active ? colors.brandPrimary : colors.surface,
                        borderWidth: 1,
                        borderColor: active ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <AppText variant="caption" weight="bold" tone={active ? 'inverse' : 'secondary'} style={{ fontSize: 11 }}>
                        {cat}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              {/* Venue Format */}
              <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 0.8, marginBottom: spacing.xs }}>
                VENUE FORMAT
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
                {VENUE_FORMATS.map((vf) => {
                  const typeKey = vf === 'Physical Event' ? 'physical' : vf === 'Lioris Live Event (In-App)' ? 'virtual' : 'external';
                  const active = editVenueType === typeKey;
                  return (
                    <Pressable
                      key={vf}
                      onPress={() => setEditVenueType(typeKey)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: radius.pill,
                        backgroundColor: active ? colors.brandPrimary : colors.surface,
                        borderWidth: 1,
                        borderColor: active ? colors.brandPrimary : colors.border,
                        alignItems: 'center',
                      }}
                    >
                      <AppText variant="caption" weight="bold" tone={active ? 'inverse' : 'secondary'} style={{ fontSize: 10.5 }}>
                        {vf === 'Physical Event' ? 'Physical' : vf === 'Lioris Live Event (In-App)' ? 'Virtual' : 'External'}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              {/* Location or Virtual Link */}
              {editVenueType === 'virtual' ? (
                <AppTextField
                  label="Virtual Meeting Link (Zoom, Google Meet, Teams)"
                  placeholder="https://meet.google.com/xxx-xxxx-xxx or Zoom URL"
                  value={editVirtualLink}
                  onChangeText={setEditVirtualLink}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              ) : editVenueType === 'physical' ? (
                <VerifiedCampusLocationPicker
                  campusCode={editCampus}
                  value={editLocation}
                  onChangeLocation={(loc) => setEditLocation(loc)}
                  roomDetail={editRoomDetail}
                  onChangeRoomDetail={setEditRoomDetail}
                  placeholder="Search verified campus venues..."
                />
              ) : (
                <AppTextField
                  label="External Location / Address"
                  placeholder="e.g. Landmark Centre, Lagos"
                  value={editLocation}
                  onChangeText={setEditLocation}
                />
              )}

              {/* Description */}
              <AppTextField
                label="Full Description & Overview"
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Details, requirements, eligibility..."
                multiline
                numberOfLines={4}
                style={{ minHeight: 90, textAlignVertical: 'top' }}
              />

              {/* Timing */}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                <View style={{ flex: 1 }}>
                  <AppTextField
                    label="Start Time"
                    value={editStartAt}
                    onChangeText={setEditStartAt}
                    placeholder="YYYY-MM-DDTHH:mm"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <AppTextField
                    label="End Time"
                    value={editEndAt}
                    onChangeText={setEditEndAt}
                    placeholder="YYYY-MM-DDTHH:mm"
                  />
                </View>
              </View>

              {/* Duration Quick Helpers */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.md }}>
                {[
                  { label: '+1 Hour', mins: 60 },
                  { label: '+2 Hours', mins: 120 },
                  { label: '+3 Hours', mins: 180 },
                ].map((q) => (
                  <Pressable
                    key={q.label}
                    onPress={() => {
                      if (editStartAt) {
                        setEditEndAt(addMinutesToDateTime(editStartAt, q.mins));
                        haptics.light();
                      }
                    }}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: radius.sm,
                      backgroundColor: colors.divider,
                    }}
                  >
                    <AppText variant="caption" weight="bold" style={{ fontSize: 11 }}>
                      {q.label}
                    </AppText>
                  </Pressable>
                ))}
              </View>

              {/* Capacity & Ticket Pricing */}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <AppTextField
                    label="Seat Capacity"
                    placeholder="e.g. 150 (Blank = Unlimited)"
                    value={editCapacity}
                    onChangeText={setEditCapacity}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <AppTextField
                    label="Ticket Price (NGN)"
                    placeholder="0 = Free Admission"
                    value={editTicketPrice}
                    onChangeText={setEditTicketPrice}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Target Cohort */}
              <AppTextField
                label="Target Audience / Cohort"
                placeholder="e.g. All Students, Faculty of Tech, Finalists..."
                value={editTargetCohort}
                onChangeText={setEditTargetCohort}
              />

              {/* ============================================================= */}
              {/* ADMIN-ONLY MODERATION CONTROLS */}
              {/* ============================================================= */}
              {isAdmin && (
                <View style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.divider, borderRadius: radius.md, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="shield" size={16} color={colors.textSecondary} />
                    <AppText weight="bold" variant="caption" tone="secondary">
                      ADMINISTRATIVE STATUS & SPOTLIGHT OVERRIDES
                    </AppText>
                  </View>

                  {/* Approval Status */}
                  <View>
                    <AppText variant="caption" weight="bold" style={{ marginBottom: 4 }}>
                      Approval Status:
                    </AppText>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {(['approved', 'pending', 'rejected'] as const).map((st) => {
                        const active = editApprovalStatus === st;
                        const label = st === 'approved' ? 'Approved & Live' : st === 'pending' ? 'Under Review' : 'Revoked';
                        return (
                          <Pressable
                            key={st}
                            onPress={() => setEditApprovalStatus(st)}
                            style={{
                              flex: 1,
                              paddingVertical: 7,
                              alignItems: 'center',
                              borderRadius: radius.pill,
                              backgroundColor: active ? (st === 'approved' ? '#10B981' : st === 'pending' ? '#F59E0B' : '#EF4444') : colors.surface,
                            }}
                          >
                            <AppText variant="caption" weight="bold" style={{ color: active ? '#FFFFFF' : colors.textPrimary, fontSize: 11 }}>
                              {label}
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Spotlight Carousel Toggle */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <AppText weight="bold" style={{ fontSize: 13 }}>
                        Feature in Hero Spotlight Carousel
                      </AppText>
                      <AppText tone="secondary" variant="caption">
                        Places this event in the top animated banner
                      </AppText>
                    </View>
                    <Pressable
                      onPress={() => setEditIsSpotlight(!editIsSpotlight)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: radius.pill,
                        backgroundColor: editIsSpotlight ? colors.brandPrimary : colors.surface,
                        borderWidth: 1,
                        borderColor: editIsSpotlight ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <AppText weight="bold" style={{ fontSize: 11, color: editIsSpotlight ? '#FFFFFF' : colors.textSecondary }}>
                        {editIsSpotlight ? 'FEATURED ★' : 'STANDARD'}
                      </AppText>
                    </Pressable>
                  </View>

                  {/* Sponsored Toggle */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <AppText weight="bold" style={{ fontSize: 13 }}>
                        Promoted / Sponsored Event
                      </AppText>
                      <AppText tone="secondary" variant="caption">
                        Highlights with gold sponsored badge
                      </AppText>
                    </View>
                    <Pressable
                      onPress={() => setEditSponsored(!editSponsored)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: radius.pill,
                        backgroundColor: editSponsored ? '#F59E0B' : colors.surface,
                        borderWidth: 1,
                        borderColor: editSponsored ? '#F59E0B' : colors.border,
                      }}
                    >
                      <AppText weight="bold" style={{ fontSize: 11, color: editSponsored ? '#FFFFFF' : colors.textSecondary }}>
                        {editSponsored ? 'SPONSORED' : 'STANDARD'}
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <AppButton label="Cancel" variant="ghost" onPress={() => setEditModalOpen(false)} fullWidth />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton label="Save Changes" variant="primary" loading={savingEdit} onPress={handleSaveEdit} fullWidth />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Fullscreen Poster Lightbox */}
      <ImageViewerModal
        visible={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        imageSource={heroImageSource}
        caption={isRestrictedGuest ? event.title : `${event.title} - ${event.location}`}
      />

      {/* Campus Map Focused Modal */}
      <CampusMapModal
        visible={campusMapOpen}
        onClose={() => setCampusMapOpen(false)}
        initialLandmarkName={event.location}
        campusFilter={event.campusCode}
      />
      {/* AGENDA SCHEDULE EDITOR MODAL */}
      <Modal visible={agendaEditorOpen} transparent animationType="slide" onRequestClose={() => setAgendaEditorOpen(false)}>
        <KeyboardAvoidingView accessibilityViewIsModal
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAgendaEditorOpen(false)} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: isDesktop ? spacing.xl : spacing.lg,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              width: '100%',
              maxWidth: 600,
              alignSelf: 'center',
              maxHeight: '90%',
            }}
          >
            {/* Mobile grab handle */}
            {!isDesktop && (
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.border,
                  alignSelf: 'center',
                  marginBottom: spacing.sm,
                }}
              />
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
                <AppText weight="bold" variant="h2">
                  Edit Event Schedule
                </AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setAgendaEditorOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ width: '100%', marginBottom: spacing.md }}>
              {editAgendaItems.length > 0 ? (
                <View style={{ gap: spacing.md }}>
                  {editAgendaItems.map((item, idx) => (
                    <View
                      key={idx}
                      style={{
                        padding: spacing.md,
                        backgroundColor: colors.background,
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: colors.border,
                        gap: spacing.xs,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <AppText weight="bold" variant="caption" tone="secondary">
                          SESSION {idx + 1}
                        </AppText>
                        <Pressable accessibilityRole="button" accessibilityLabel="Delete"
                          onPress={() => handleRemoveAgendaItem(idx)}
                          hitSlop={8}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: isDark ? '#374151' : '#FEE2E2',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name="trash-outline" size={14} color="#EF4444" />
                        </Pressable>
                      </View>

                      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                        <View style={{ width: 100 }}>
                          <AppTextField
                            label="Time"
                            placeholder="e.g. 10:00 AM"
                            value={item.time}
                            onChangeText={(v) => handleUpdateAgendaItem(idx, 'time', v)}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppTextField
                            label="Session Title"
                            placeholder="e.g. Opening Keynote"
                            value={item.title}
                            onChangeText={(v) => handleUpdateAgendaItem(idx, 'title', v)}
                          />
                        </View>
                      </View>

                      <AppTextField
                        label="Speaker (Optional)"
                        placeholder="e.g. Prof. Adeyemi"
                        value={item.speaker ?? ''}
                        onChangeText={(v) => handleUpdateAgendaItem(idx, 'speaker', v)}
                      />

                      <AppTextField
                        label="Description (Optional)"
                        placeholder="Brief session details..."
                        value={item.description ?? ''}
                        onChangeText={(v) => handleUpdateAgendaItem(idx, 'description', v)}
                        multiline
                        numberOfLines={2}
                        style={{ minHeight: 50, textAlignVertical: 'top' }}
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <Ionicons name="time-outline" size={40} color={colors.textSecondary} />
                  <AppText tone="secondary" variant="bodySmall" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
                    No sessions added yet. Tap below to build your event timeline.
                  </AppText>
                </View>
              )}

              <Pressable
                onPress={handleAddAgendaItem}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 12,
                  marginTop: spacing.md,
                  borderWidth: 1.5,
                  borderColor: colors.brandPrimary,
                  borderRadius: radius.md,
                  borderStyle: 'dashed',
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.brandPrimary} />
                <AppText weight="bold" variant="bodySmall" tone="brand">
                  Add New Session
                </AppText>
              </Pressable>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <AppButton label="Cancel" variant="ghost" onPress={() => setAgendaEditorOpen(false)} fullWidth />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton label="Save Schedule" variant="primary" loading={savingAgenda} onPress={handleSaveAgenda} fullWidth />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <ApplyForVerificationModal
        visible={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
        onSubmit={handleSubmitVerification}
        defaultInstitution={event?.campusCode || profile?.institutionCode}
      />
    </ScreenContainer>
  );
}
