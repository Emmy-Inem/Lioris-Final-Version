import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listEvents, createEvent, updateEvent, revokeEventApproval, approveEvent, purgeEvent, listEventAttendees } from '@/api/events';
import { CampusEvent, EventCategory } from '@/api/types';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';
import { VerifiedCampusLocationPicker } from '@/components/VerifiedCampusLocationPicker';
import { PaidEventsDesk } from '@/components/admin/PaidEventsDesk';
import { TicketSettingsFields } from '@/components/events/TicketSettingsFields';
import { getEventPaymentDetails, saveEventPaymentDetails } from '@/api/paidEvents';
import { EMPTY_TICKET_FORM, TicketFormValues, paidLabel, parsePrice, validateTicketForm } from '@/utils/paidEvents';

const EVENT_COVER_PRESETS = [
 { id: 'event_tech_hackathon', label: 'Hackathon & Tech', src: require('../../../assets/images/event_tech_hackathon.jpg') },
 { id: 'event_academic_symposium', label: 'Academic Symposium', src: require('../../../assets/images/event_academic_symposium.jpg') },
 { id: 'campus_students_photo', label: 'Quad & Social', src: require('../../../assets/images/campus_students_photo.jpg') },
 { id: 'campus_library_study', label: 'Library & Research', src: require('../../../assets/images/campus_library_study.jpg') },
];

const EVENT_CATEGORIES: EventCategory[] = ['academic', 'career', 'alumni', 'student', 'seminar', 'workshop'];
const VENUE_TYPES: NonNullable<CampusEvent['venueType']>[] = ['physical', 'virtual', 'external'];
const VENUE_TYPE_LABELS: Record<NonNullable<CampusEvent['venueType']>, string> = {
 physical: 'Physical',
 virtual: 'Virtual',
 external: 'External',
};

export function EventsModerationTab() {
 const { colors, spacing, radius, isDark } = useTheme();
 const queryClient = useQueryClient();
 const [section, setSection] = useState<'approved' | 'pending' | 'paid'>('approved');
 const [focusPaid, setFocusPaid] = useState<string | null>(null);
 const [searchQuery, setSearchQuery] = useState('');
 const [selectedCategory, setSelectedCategory] = useState<EventCategory | 'all'>('all');
 const [actingId, setActingId] = useState<string | null>(null);

 // Edit / Create Modal State
 const [editModalOpen, setEditModalOpen] = useState(false);
 const [editingEvent, setEditingEvent] = useState<CampusEvent | null>(null);
 const [formTitle, setFormTitle] = useState('');
 const [formDesc, setFormDesc] = useState('');
 const [formCategory, setFormCategory] = useState<EventCategory>('academic');
 const [formVenueType, setFormVenueType] = useState<NonNullable<CampusEvent['venueType']>>('physical');
 const [formLocation, setFormLocation] = useState('');
 const [formVirtualLink, setFormVirtualLink] = useState('');
 const [formCapacity, setFormCapacity] = useState('150');
 const [formTicket, setFormTicket] = useState<TicketFormValues>(EMPTY_TICKET_FORM);
 const [formCover, setFormCover] = useState('event_tech_hackathon');
 const [formSponsored, setFormSponsored] = useState(false);
 const [formSpotlight, setFormSpotlight] = useState(true);
 const [formTargetCohort, setFormTargetCohort] = useState('All Levels (100L - 500L)');
 const [formStartAt, setFormStartAt] = useState('');
 const [formEndAt, setFormEndAt] = useState('');
 const [saving, setSaving] = useState(false);

 // Attendee Roster Modal State
 const [rosterEvent, setRosterEvent] = useState<CampusEvent | null>(null);

 const { data: eventAttendees = [], isLoading: isLoadingAttendees } = useQuery({
 queryKey: ['event-attendees', rosterEvent?.id],
 queryFn: () => (rosterEvent ? listEventAttendees(rosterEvent.id) : Promise.resolve([])),
 enabled: !!rosterEvent,
 });

 const { data: allEvents = [], isLoading, refetch } = useQuery({
 queryKey: ['events', 'admin-all-with-pending'],
 queryFn: () => listEvents({ approvalStatus: 'all' }),
 });

 const pendingEvents = allEvents.filter((e) => e.approvalStatus === 'pending');
 const approvedEvents = allEvents.filter((e) => e.approvalStatus !== 'pending');

 const displayedEvents = (section === 'approved' ? approvedEvents : pendingEvents).filter((e) => {
 const matchesCategory = selectedCategory === 'all' || e.category === selectedCategory;
 const matchesSearch =
 !searchQuery.trim() ||
 e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
 e.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
 (e.organizerName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
 return matchesCategory && matchesSearch;
 });

 function handleOpenCreate() {
 haptics.light();
 setEditingEvent(null);
 setFormTitle('');
 setFormDesc('');
 setFormCategory('academic');
 setFormVenueType('physical');
 setFormLocation('Faculty of Science Main Auditorium');
 setFormVirtualLink('');
 setFormCapacity('200');
 setFormTicket(EMPTY_TICKET_FORM);
 setFormCover('event_tech_hackathon');
 setFormSponsored(true);
 setFormSpotlight(true);
 setFormTargetCohort('All Levels (100L - 500L)');
 setFormStartAt(new Date(Date.now() + 86400000 * 3).toISOString());
 setFormEndAt(new Date(Date.now() + 86400000 * 3 + 14400000).toISOString());
 setEditModalOpen(true);
 }

 function handleOpenEdit(event: CampusEvent) {
 haptics.light();
 setEditingEvent(event);
 setFormTitle(event.title);
 setFormDesc(event.description);
 setFormCategory(event.category);
 setFormVenueType(event.venueType || 'physical');
 setFormLocation(event.location);
 setFormVirtualLink(event.virtualLink || '');
 setFormCapacity(event.capacity ? String(event.capacity) : '150');
 setFormTicket({
 ...EMPTY_TICKET_FORM,
 ticketType: event.ticketType === 'paid' ? 'paid' : 'free',
 price: event.ticketPrice ? String(event.ticketPrice) : '',
 method: event.paymentMethod ?? 'online',
 reservationHeld: !!event.reservationHeld,
 bookingDeadline: event.bookingDeadline ?? '',
 });
 if (event.ticketType === 'paid') {
 getEventPaymentDetails(event.id)
 .then((d) => {
 if (d) setFormTicket((t) => ({ ...t, paymentUrl: d.paymentUrl, instructions: d.instructions }));
 })
 .catch(() => {});
 }
 setFormCover(event.coverImageUrl || 'event_tech_hackathon');
 setFormSponsored(!!event.sponsored);
 setFormSpotlight(!!event.isSpotlight);
 setFormTargetCohort(event.targetCohort || 'All Levels');
 setFormStartAt(event.startAt);
 setFormEndAt(event.endAt);
 setEditModalOpen(true);
 }

 async function handleSaveEvent() {
 if (!formTitle.trim() || !formLocation.trim()) {
 Alert.alert('Required Fields', 'Please provide event title and venue location.');
 return;
 }

 const ticketProblem = validateTicketForm(formTicket, { eventEndAt: formEndAt });
 if (ticketProblem) {
 Alert.alert('Ticket settings', ticketProblem);
 return;
 }

 haptics.medium();
 setSaving(true);
 try {
 if (editingEvent) {
 await updateEvent(editingEvent.id, {
 title: formTitle.trim(),
 description: formDesc.trim(),
 category: formCategory,
 venueType: formVenueType,
 location: formLocation.trim(),
 virtualLink: formVirtualLink.trim() || null,
 capacity: Number(formCapacity) || 150,
 ticketType: formTicket.ticketType,
 ticketPrice: formTicket.ticketType === 'paid' ? parsePrice(formTicket.price) : 0,
 paymentMethod: formTicket.ticketType === 'paid' ? formTicket.method : null,
 reservationHeld: formTicket.ticketType === 'paid' && formTicket.method !== 'online' ? formTicket.reservationHeld : false,
 bookingDeadline: formTicket.ticketType === 'paid' && formTicket.bookingDeadline ? formTicket.bookingDeadline : null,
 coverImageUrl: formCover,
 sponsored: formSponsored,
 isSpotlight: formSpotlight,
 targetCohort: formTargetCohort.trim(),
 startAt: formStartAt,
 endAt: formEndAt,
 });
 if (formTicket.ticketType === 'paid') {
 await saveEventPaymentDetails(editingEvent.id, formTicket.method === 'at_venue' ? '' : formTicket.paymentUrl, formTicket.instructions);
 }
 recordAuditLogEntry({
 action: 'event_approval_revoked',
 summary: `Updated details for campus event: "${formTitle.trim()}"`,
 targetType: 'event',
 targetId: editingEvent.id,
 reason: 'Administrative event parameter revision',
 });
 Alert.alert('Event Updated', `Changes to"${formTitle.trim()}"have been saved.`);
 } else {
 await createEvent({
 title: formTitle.trim(),
 description: formDesc.trim(),
 category: formCategory,
 location: formLocation.trim(),
 visibilityScope: 'global',
 startAt: formStartAt || new Date().toISOString(),
 endAt: formEndAt || new Date(Date.now() + 7200000).toISOString(),
 imageUrl: formCover,
 sponsored: formSponsored,
 venueType: formVenueType,
 virtualLink: formVirtualLink.trim() || null,
 capacity: Number(formCapacity) || 150,
 isSpotlight: formSpotlight,
 ticketType: formTicket.ticketType,
 ticketPrice: formTicket.ticketType === 'paid' ? parsePrice(formTicket.price) : 0,
 paymentMethod: formTicket.ticketType === 'paid' ? formTicket.method : null,
 reservationHeld: formTicket.ticketType === 'paid' && formTicket.method !== 'online' ? formTicket.reservationHeld : false,
 bookingDeadline: formTicket.ticketType === 'paid' && formTicket.bookingDeadline ? formTicket.bookingDeadline : null,
 paymentUrl: formTicket.ticketType === 'paid' && formTicket.method !== 'at_venue' ? formTicket.paymentUrl.trim() : null,
 paymentInstructions: formTicket.ticketType === 'paid' ? formTicket.instructions.trim() : null,
 targetCohort: formTargetCohort.trim(),
 });
 Alert.alert('Event Published', `"${formTitle.trim()}"is now live on the campus calendar.`);
 }

 await queryClient.invalidateQueries({ queryKey: ['events'] });
 await refetch();
 setEditModalOpen(false);
 setEditingEvent(null);
 } catch (err: any) {
 Alert.alert('Error', err?.message ?? 'Could not save event.');
 } finally {
 setSaving(false);
 }
 }

 async function handleToggleSpotlight(event: CampusEvent) {
 haptics.medium();
 const next = !event.isSpotlight;
 try {
 await updateEvent(event.id, { isSpotlight: next });
 await queryClient.invalidateQueries({ queryKey: ['events'] });
 await refetch();
 Alert.alert(next ? 'Pinned to Spotlight' : 'Unpinned from Spotlight', `"${event.title}"banner preference updated.`);
 } catch (err: any) {
 Alert.alert('Could not change the spotlight', err?.message ?? 'Please try again.');
 }
 }

 async function handleToggleApproval(event: CampusEvent) {
 if (event.ticketType === 'paid' && event.paymentReviewStatus === 'pending' && event.approvalStatus !== 'approved') {
 // Approved together with its payment details, in the review.
 haptics.light();
 setFocusPaid(event.id);
 setSection('paid');
 return;
 }
 haptics.medium();
 setActingId(event.id);
 const isApproved = event.approvalStatus !== 'rejected' && event.approvalStatus !== 'pending';
 try {
 if (isApproved) {
 await revokeEventApproval(event.id);
 Alert.alert('Approval Revoked', `"${event.title}"has been taken down from public event listings.`);
 } else {
 await approveEvent(event.id);
 Alert.alert('Event Approved & Live', `"${event.title}"is now published to all student feeds.`);
 }
 queryClient.invalidateQueries({ queryKey: ['events'] });
 await refetch();
 } finally {
 setActingId(null);
 }
 }

 function handlePurgeConfirm(id: string, title: string) {
 haptics.error();
 Alert.alert(
 'Purge Campus Event?',
 `Permanently delete"${title}"and purge all RSVPs? This action is irreversible.`,
 [
 { text: 'Cancel', style: 'cancel' },
 {
 text: 'Purge Event',
 style: 'destructive',
 onPress: async () => {
 setActingId(id);
 try {
 await purgeEvent(id);
 queryClient.invalidateQueries({ queryKey: ['events'] });
 await refetch();
 Alert.alert('Event Purged', 'The event and RSVPs have been wiped from the database.');
 } finally {
 setActingId(null);
 }
 },
 },
 ],
 );
 }

 return (
 <View>
 {/* Top Segmented Controls: Live vs Pending Submissions */}
 <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
 <Pressable
 onPress={() => {
 haptics.light();
 setSection('approved');
 }}
 style={{
 flex: 1,
 paddingVertical: 8,
 alignItems: 'center',
 borderRadius: radius.pill,
 backgroundColor: section === 'approved' ? colors.brandPrimary : colors.divider,
 }}
 >
 <AppText variant="caption"weight="bold"tone={section === 'approved' ? 'inverse' : 'secondary'}>
 Live Events Catalog ({approvedEvents.length})
 </AppText>
 </Pressable>

 <Pressable
 onPress={() => {
 haptics.light();
 setSection('pending');
 }}
 style={{
 flex: 1,
 paddingVertical: 8,
 alignItems: 'center',
 borderRadius: radius.pill,
 backgroundColor: section === 'pending' ? colors.brandPrimary : colors.divider,
 }}
 >
 <AppText variant="caption"weight="bold"tone={section === 'pending' ? 'inverse' : 'secondary'}>
 Pending Review ({pendingEvents.length})
 </AppText>
 </Pressable>

 <Pressable
 onPress={() => {
 haptics.light();
 setSection('paid');
 }}
 style={{
 flex: 1,
 paddingVertical: 8,
 alignItems: 'center',
 borderRadius: radius.pill,
 backgroundColor: section === 'paid' ? colors.brandPrimary : colors.divider,
 }}
 >
 <AppText variant="caption"weight="bold"tone={section === 'paid' ? 'inverse' : 'secondary'}>
 Paid events
 </AppText>
 </Pressable>
 </View>

 {section === 'paid' ? (
 <PaidEventsDesk focusEventId={focusPaid} onFocusHandled={() => setFocusPaid(null)} />
 ) : (
 <>
 {/* Header with Search and Create Action */}
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
 <View style={{ flex: 1, marginRight: spacing.sm }}>
 <AppTextField
 label=""placeholder="Search events by title, organizer, location..."value={searchQuery}
 onChangeText={setSearchQuery}
 />
 </View>
 <AppButton label="+ Add Event"onPress={handleOpenCreate} variant="primary" />
 </View>

 {/* Category Pills */}
 <ScrollView
 horizontal
 showsHorizontalScrollIndicator={false}
 contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.md }}
 style={{ flex: 1, minWidth: 0 }}
 >
 <Pressable
 onPress={() => {
 haptics.light();
 setSelectedCategory('all');
 }}
 style={{
 paddingHorizontal: spacing.sm,
 paddingVertical: 5,
 borderRadius: radius.pill,
 backgroundColor: selectedCategory === 'all' ? colors.brandPrimary : colors.divider,
 }}
 >
 <AppText variant="caption"weight="bold"tone={selectedCategory === 'all' ? 'inverse' : 'secondary'}>
 All ({section === 'approved' ? approvedEvents.length : pendingEvents.length})
 </AppText>
 </Pressable>
 {EVENT_CATEGORIES.map((cat) => {
 const selected = selectedCategory === cat;
 const count = (section === 'approved' ? approvedEvents : pendingEvents).filter((e) => e.category === cat).length;
 return (
 <Pressable
 key={cat}
 onPress={() => {
 haptics.light();
 setSelectedCategory(cat);
 }}
 style={{
 paddingHorizontal: spacing.sm,
 paddingVertical: 5,
 borderRadius: radius.pill,
 backgroundColor: selected ? colors.brandPrimary : colors.divider,
 }}
 >
 <AppText variant="caption"weight="bold"tone={selected ? 'inverse' : 'secondary'}>
 {cat.charAt(0).toUpperCase() + cat.slice(1)} ({count})
 </AppText>
 </Pressable>
 );
 })}
 </ScrollView>

 {/* Events List */}
 {displayedEvents.map((event) => {
 const isApproved = event.approvalStatus === 'approved';
 const isPending = event.approvalStatus === 'pending';
 const coverPreset = EVENT_COVER_PRESETS.find((p) => p.id === event.coverImageUrl) || EVENT_COVER_PRESETS[0];

 return (
 <SolidCard
 key={event.id}
 radius={18}
 frosted
 style={{
 marginBottom: spacing.md,
 borderWidth: isPending ? 1 : 0,
 borderColor: isPending ? `${colors.brandPrimary}50` : 'transparent',
 }}
 >
 <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm }}>
 <Image
 source={coverPreset.src}
 style={{ width: 85, height: 85, borderRadius: radius.md }}
 contentFit="cover"
 />
 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
 <AppText variant="body"weight="bold"style={{ flex: 1, marginRight: 6 }}>
 {event.title}
 </AppText>
 <Badge
 label={isPending ? 'Pending Review' : isApproved ? 'Live & Approved' : 'Revoked'}
 tone={isPending ? 'warning' : isApproved ? 'success' : 'critical'}
 />
 </View>

 <AppText tone="brand"variant="caption"weight="bold"style={{ marginTop: 2 }}>
 {event.category.toUpperCase()} • {VENUE_TYPE_LABELS[event.venueType || 'physical']} • {event.rsvpCount} RSVPs {event.capacity ? `/ ${event.capacity} seats` : ''}
 </AppText>

 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
 <Ionicons name="location-outline"size={13} color={colors.textSecondary} />
 <AppText tone="secondary"variant="caption"numberOfLines={1} style={{ flex: 1 }}>
 {event.location}
 </AppText>
 </View>

 {event.organizerName ? (
 <AppText tone="secondary"variant="caption"style={{ marginTop: 2 }}>
 Organizer: <AppText weight="bold">{event.organizerName}</AppText>
 </AppText>
 ) : null}
 </View>
 </View>

 <AppText tone="secondary"variant="bodySmall"numberOfLines={2} style={{ marginBottom: spacing.md }}>
 {event.description}
 </AppText>

 {/* Quick Badges: Spotlight & Pricing */}
 <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
 <Pressable
 onPress={() => handleToggleSpotlight(event)}
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 4,
 backgroundColor: event.isSpotlight ? colors.pastelPrimaryBg : colors.divider,
 paddingHorizontal: spacing.sm,
 paddingVertical: 4,
 borderRadius: radius.pill,
 }}
 >
 <Ionicons name="star"size={12} color={event.isSpotlight ? colors.brandPrimary : colors.textSecondary} />
 <AppText variant="caption"weight="bold"tone={event.isSpotlight ? 'brand' : 'secondary'}>
 {event.isSpotlight ? 'Spotlight Carousel Active' : 'Enable Spotlight'}
 </AppText>
 </Pressable>

 <View style={{ backgroundColor: colors.divider, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill }}>
 <AppText variant="caption"weight="bold">
 {event.ticketType === 'paid' ? `${paidLabel(event.ticketPrice)}${event.paymentReviewStatus === 'pending' ? ' · needs review' : event.paymentReviewStatus === 'rejected' ? ' · sent back' : ''}` : 'Free'}
 </AppText>
 </View>

 <Pressable
 onPress={() => setRosterEvent(event)}
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 4,
 marginLeft: 'auto',
 }}
 >
 <Ionicons name="people-outline"size={14} color={colors.brandPrimary} />
 <AppText variant="caption"weight="bold"tone="brand">
 View Roster ({event.rsvpCount})
 </AppText>
 </Pressable>
 </View>

 {/* Admin Action Buttons */}
 <View style={{ flexDirection: 'row', gap: spacing.xs }}>
 <View style={{ flex: 1 }}>
 <AppButton
 label="Edit"variant="secondary"onPress={() => handleOpenEdit(event)}
 />
 </View>
 <View style={{ flex: 1 }}>
 <AppButton
 label={isApproved ? 'Revoke' : event.ticketType === 'paid' && event.paymentReviewStatus === 'pending' ? 'Review & approve' : 'Approve'}
 variant={isApproved ? 'ghost' : 'primary'}
 loading={actingId === event.id}
 onPress={() => handleToggleApproval(event)}
 />
 </View>
 <Pressable accessibilityRole="button" accessibilityLabel="Delete"
 onPress={() => handlePurgeConfirm(event.id, event.title)}
 hitSlop={8}
 style={{
 width: 40,
 height: 40,
 borderRadius: radius.md,
 backgroundColor: colors.divider,
 alignItems: 'center',
 justifyContent: 'center',
 }}
 >
 <Ionicons name="trash-outline"size={18} color={colors.critical} />
 </Pressable>
 </View>
 </SolidCard>
 );
 })}

 {!isLoading && displayedEvents.length === 0 ? (
 <EmptyState
 title={section === 'pending' ? 'No pending events to review' : 'No campus events found'}
 description={section === 'pending' ? 'All student club and faculty event submissions have been approved.' : 'Try a different search query or publish a new event.'}
 />
 ) : null}

 </>
 )}

 {/* Create / Edit Event Modal */}
 <Modal visible={editModalOpen} transparent animationType="slide"onRequestClose={() => setEditModalOpen(false)}>
 <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
 <Pressable style={{ flex: 1 }} onPress={() => setEditModalOpen(false)} />
 <View
 style={{
 backgroundColor: colors.surface,
 borderTopLeftRadius: 24,
 borderTopRightRadius: 24,
 padding: spacing.lg,
 maxHeight: '90%',
 }}
 >
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
 <Ionicons name="calendar-outline"size={20} color={colors.textSecondary} />
 <AppText variant="h2"weight="bold">
 {editingEvent ? 'Edit Campus Event' : 'Publish Campus Event'}
 </AppText>
 </View>
 <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setEditModalOpen(false)} hitSlop={8}>
 <Ionicons name="close"size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false}>
 <AppTextField
 label="Event Title"placeholder="e.g. Annual Faculty Hackathon & Symposium"value={formTitle}
 onChangeText={setFormTitle}
 />

 {/* Venue Type Picker */}
 <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 0.8, marginBottom: spacing.xs }}>
 VENUE TYPE
 </AppText>
 <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
 {VENUE_TYPES.map((v) => (
 <Pressable
 key={v}
 onPress={() => setFormVenueType(v)}
 style={{
 flex: 1,
 paddingVertical: 7,
 alignItems: 'center',
 borderRadius: radius.pill,
 borderWidth: 1,
 borderColor: formVenueType === v ? colors.brandPrimary : colors.border,
 backgroundColor: formVenueType === v ? colors.pastelPrimaryBg : colors.surface,
 }}
 >
 <AppText variant="caption"weight="bold"tone={formVenueType === v ? 'brand' : 'secondary'} numberOfLines={1}>
 {VENUE_TYPE_LABELS[v]}
 </AppText>
 </Pressable>
 ))}
 </View>

  {formVenueType === 'physical' ? (
    <View style={{ marginBottom: spacing.md }}>
      <VerifiedCampusLocationPicker
        campusCode={editingEvent?.campusCode || 'GLOBAL'}
        value={formLocation}
        onChangeLocation={(loc) => setFormLocation(loc)}
        placeholder="Select or search verified campus venue..."
      />
    </View>
  ) : (
    <AppTextField
      label={formVenueType === 'virtual' ? 'Platform / Online Venue' : 'External Venue / Address'}
      placeholder={formVenueType === 'virtual' ? 'e.g. Google Meet / Zoom / YouTube Live' : 'e.g. Landmark Event Centre, Victoria Island'}
      value={formLocation}
      onChangeText={setFormLocation}
    />
  )}

  {formVenueType === 'virtual' && (
    <AppTextField
      label="Virtual Meeting Link (Required)"
      placeholder="https://meet.google.com/xyz or Zoom link"
      value={formVirtualLink}
      onChangeText={setFormVirtualLink}
    />
  )}

 {/* Category Selector */}
 <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 0.8, marginBottom: spacing.xs }}>
 EVENT CATEGORY
 </AppText>
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
 {EVENT_CATEGORIES.map((cat) => (
 <Pressable
 key={cat}
 onPress={() => setFormCategory(cat)}
 style={{
 paddingHorizontal: spacing.sm,
 paddingVertical: 6,
 borderRadius: radius.pill,
 borderWidth: 1,
 borderColor: formCategory === cat ? colors.brandPrimary : colors.border,
 backgroundColor: formCategory === cat ? colors.pastelPrimaryBg : colors.surface,
 }}
 >
 <AppText variant="caption"weight="bold"tone={formCategory === cat ? 'brand' : 'secondary'}>
 {cat.charAt(0).toUpperCase() + cat.slice(1)}
 </AppText>
 </Pressable>
 ))}
 </View>

 <AppTextField
 label="Seat Capacity"placeholder="e.g. 200"value={formCapacity}
 onChangeText={setFormCapacity}
 keyboardType="numeric"
 />

 <TicketSettingsFields
 value={formTicket}
 onChange={setFormTicket}
 eventStartAt={formStartAt ? new Date(formStartAt) : null}
 reviewNote={editingEvent?.paymentReviewStatus === 'rejected' ? editingEvent.paymentReviewNote : null}
 />

 <AppTextField
 label="Target Cohort"placeholder="e.g. 300L - 500L or Open to All"value={formTargetCohort}
 onChangeText={setFormTargetCohort}
 />

 {/* Cover Photo Preset Selector */}
 <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 0.8, marginBottom: spacing.xs }}>
 EVENT BANNER PHOTO
 </AppText>
 <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.md }}>
 {EVENT_COVER_PRESETS.map((preset) => {
 const isSelected = formCover === preset.id;
 return (
 <Pressable
 key={preset.id}
 onPress={() => setFormCover(preset.id)}
 style={{
 width: 110,
 borderRadius: radius.md,
 overflow: 'hidden',
 borderWidth: isSelected ? 2 : 1,
 borderColor: isSelected ? colors.brandPrimary : colors.border,
 }}
 >
 <Image source={preset.src} style={{ width: '100%', height: 60 }} contentFit="cover" />
 <View style={{ padding: 4, backgroundColor: colors.surface }}>
 <AppText variant="caption"weight={isSelected ? 'bold' : 'regular'} numberOfLines={1}>
 {preset.label}
 </AppText>
 </View>
 </Pressable>
 );
 })}
 </ScrollView>

 <AppTextField
 label="Event Description & Agenda"placeholder="Detail keynotes, panel discussions, prerequisites..."value={formDesc}
 onChangeText={setFormDesc}
 multiline
 numberOfLines={4}
 />
 </ScrollView>

 <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
 <AppButton label="Cancel"variant="ghost"onPress={() => setEditModalOpen(false)} />
 <AppButton
 label={editingEvent ? 'Save Changes' : 'Publish Live'}
 loading={saving}
 disabled={!formTitle.trim() || !formLocation.trim()}
 onPress={handleSaveEvent}
 />
 </View>
 </View>
 </View>
 </Modal>

 {/* Attendee Roster Modal */}
 <Modal visible={!!rosterEvent} transparent animationType="fade"onRequestClose={() => setRosterEvent(null)}>
 <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: spacing.lg }}>
 <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, maxHeight: '80%' }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
 <AppText variant="h3"weight="bold">
 Registered Attendees
 </AppText>
 <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setRosterEvent(null)} hitSlop={8}>
 <Ionicons name="close"size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 {rosterEvent ? (
 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false}>
 <AppText variant="body"weight="bold"style={{ marginBottom: 2 }}>
 {rosterEvent.title}
 </AppText>
 <AppText tone="secondary"variant="caption"style={{ marginBottom: spacing.md }}>
 {rosterEvent.rsvpCount} students registered • Capacity: {rosterEvent.capacity || 'Unlimited'}
 </AppText>

  <View style={{ backgroundColor: colors.divider, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md }}>
    <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: spacing.xs }}>
      CHECKED-IN & REGISTERED ROSTER:
    </AppText>
    {isLoadingAttendees ? (
      <View style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={colors.brandPrimary} />
        <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.xs }}>
          Loading registered students...
        </AppText>
      </View>
    ) : eventAttendees.length > 0 ? (
      eventAttendees.map((att, i) => (
        <View key={att.userId || i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: i < eventAttendees.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.textSecondary, alignItems: 'center', justifyContent: 'center' }}>
              <AppText variant="caption" weight="bold" tone="inverse">
                {(att.fullName || att.name || 'S').charAt(0).toUpperCase()}
              </AppText>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="bodySmall" weight="semiBold" numberOfLines={1}>
                {att.fullName || att.name || 'Student'}
              </AppText>
              <AppText variant="caption" tone="secondary" numberOfLines={1}>
                {att.matricNumber || att.department || att.role}
              </AppText>
            </View>
          </View>
          <Badge label="Confirmed" tone="success" />
        </View>
      ))
    ) : (
      <View style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
        <Ionicons name="people-outline" size={28} color={colors.textSecondary} />
        <AppText variant="caption" tone="secondary" style={{ marginTop: spacing.xs }}>
          No students registered yet for this event.
        </AppText>
      </View>
    )}
  </View>
 </ScrollView>
 ) : null}

 <View style={{ marginTop: spacing.md }}>
 <AppButton label="Done"onPress={() => setRosterEvent(null)} />
 </View>
 </View>
 </View>
 </Modal>
 </View>
 );
}
