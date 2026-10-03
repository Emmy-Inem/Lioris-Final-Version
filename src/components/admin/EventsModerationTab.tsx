import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
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
import { listEvents, createEvent, updateEvent, revokeEventApproval, approveEvent, purgeEvent, cancelEvent, listEventAttendees } from '@/api/events';
import { CampusEvent, EventCategory } from '@/api/types';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';
import { VerifiedCampusLocationPicker } from '@/components/VerifiedCampusLocationPicker';
import { PaidEventsDesk } from '@/components/admin/PaidEventsDesk';
import { TicketSettingsFields } from '@/components/events/TicketSettingsFields';
import { getEventPaymentDetails, saveEventPaymentDetails } from '@/api/paidEvents';
import { EMPTY_TICKET_FORM, TicketFormValues, paidLabel, parsePrice, validateTicketForm } from '@/utils/paidEvents';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '@/hooks/useResponsive';

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



const EVENT_CATEGORIES: EventCategory[] = ['academic', 'career', 'alumni', 'student', 'seminar', 'workshop'];
const VENUE_TYPES: NonNullable<CampusEvent['venueType']>[] = ['physical', 'virtual', 'external'];
const VENUE_TYPE_LABELS: Record<NonNullable<CampusEvent['venueType']>, string> = {
 physical: 'Physical',
 virtual: 'Virtual',
 external: 'External',
};

export function EventsModerationTab() {
 const { colors, spacing, radius, isDark } = useTheme();
 const { isDesktop } = useResponsive();
 const insets = useSafeAreaInsets();
 const queryClient = useQueryClient();
 const [section, setSection] = useState<'approved' | 'pending' | 'paid'>('approved');
 const [focusPaid, setFocusPaid] = useState<string | null>(null);
 const [searchQuery, setSearchQuery] = useState('');
 const [selectedCategory, setSelectedCategory] = useState<EventCategory | 'all'>('all');
 const [actingId, setActingId] = useState<string | null>(null);
 const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
 const [bulkProcessing, setBulkProcessing] = useState(false);

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
 const [formCover, setFormCover] = useState('');
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
 setFormCover('');
 setFormSponsored(true);
 setFormSpotlight(true);
 setFormTargetCohort('All Levels (100L - 500L)');
 const defaultStart = new Date(Date.now() + 86400000 * 3);
 const defaultEnd = new Date(Date.now() + 86400000 * 3 + 14400000);
 setFormStartAt(toLocalInputValue(defaultStart.toISOString()));
 setFormEndAt(toLocalInputValue(defaultEnd.toISOString()));
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
 setFormCover(event.coverImageUrl || '');
 setFormSponsored(!!event.sponsored);
 setFormSpotlight(!!event.isSpotlight);
 setFormTargetCohort(event.targetCohort || 'All Levels');
 setFormStartAt(toLocalInputValue(event.startAt));
 setFormEndAt(toLocalInputValue(event.endAt));
 setEditModalOpen(true);
 }

 async function handleSaveEvent() {
 if (!formTitle.trim() || !formLocation.trim()) {
 Alert.alert('Required Fields', 'Please provide event title and venue location.');
 return;
 }

 const startDate = formStartAt ? new Date(formStartAt) : null;
 const endDate = formEndAt ? new Date(formEndAt) : null;

 if (formStartAt && (!startDate || isNaN(startDate.getTime()))) {
 Alert.alert('Invalid Date', 'Please enter a valid start date and time.');
 return;
 }
 if (formEndAt && (!endDate || isNaN(endDate.getTime()))) {
 Alert.alert('Invalid Date', 'Please enter a valid end date and time.');
 return;
 }
 if (startDate && endDate && endDate <= startDate) {
 Alert.alert('Invalid Schedule', 'Event end time must be after the start time.');
 return;
 }

 const startIso = startDate ? startDate.toISOString() : new Date().toISOString();
 const endIso = endDate ? endDate.toISOString() : new Date(Date.now() + 7200000).toISOString();

 const ticketProblem = validateTicketForm(formTicket, { eventEndAt: endIso });
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
 startAt: startIso,
 endAt: endIso,
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
 Alert.alert('Event Updated', `Changes to "${formTitle.trim()}" have been saved.`);
 } else {
 await createEvent({
 title: formTitle.trim(),
 description: formDesc.trim(),
 category: formCategory,
 location: formLocation.trim(),
 visibilityScope: 'global',
 startAt: startIso,
 endAt: endIso,
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

 function toggleSelected(id: string) {
 haptics.light();
 setSelectedIds((prev) => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 return next;
 });
 }

 function clearSelection() {
 setSelectedIds(new Set());
 }

 async function handleBulkApprove() {
 const targets = pendingEvents.filter((e) => selectedIds.has(e.id));
 if (targets.length === 0 || bulkProcessing) return;
 haptics.medium();
 setBulkProcessing(true);
 let succeeded = 0;
 let failed = 0;
 for (const event of targets) {
 try {
 await approveEvent(event.id);
 succeeded += 1;
 } catch {
 failed += 1;
 }
 }
 await queryClient.invalidateQueries({ queryKey: ['events'] });
 await refetch();
 setBulkProcessing(false);
 clearSelection();
 if (failed > 0) haptics.error();
 else haptics.success();
 Alert.alert('Bulk Approve Complete', failed > 0 ? `${succeeded} approved, ${failed} failed. Retry the failed ones individually.` : `${succeeded} event${succeeded === 1 ? '' : 's'} approved.`);
 }

 function handleBulkPurgeConfirm() {
 const targets = pendingEvents.filter((e) => selectedIds.has(e.id));
 if (targets.length === 0 || bulkProcessing) return;
 haptics.error();
 Alert.alert(
 'Reject & Purge These Events?',
 `Permanently delete ${targets.length} pending event${targets.length === 1 ? '' : 's'}? This action is irreversible.`,
 [
 { text: 'Cancel', style: 'cancel' },
 {
 text: 'Purge',
 style: 'destructive',
 onPress: async () => {
 setBulkProcessing(true);
 let succeeded = 0;
 let failed = 0;
 for (const event of targets) {
 try {
 await purgeEvent(event.id);
 succeeded += 1;
 } catch {
 failed += 1;
 }
 }
 await queryClient.invalidateQueries({ queryKey: ['events'] });
 await refetch();
 setBulkProcessing(false);
 clearSelection();
 if (failed > 0) haptics.error();
 else haptics.success();
 Alert.alert('Bulk Reject Complete', failed > 0 ? `${succeeded} purged, ${failed} failed. Retry the failed ones individually.` : `${succeeded} event${succeeded === 1 ? '' : 's'} purged.`);
 },
 },
 ],
 );
 }

 function handleCancelConfirm(event: CampusEvent) {
 haptics.error();
 const doCancel = async (reason?: string) => {
 setActingId(event.id);
 try {
 await cancelEvent(event.id, reason);
 await queryClient.invalidateQueries({ queryKey: ['events'] });
 await refetch();
 Alert.alert('Event Cancelled', 'Everyone registered has been notified. Registrations were kept, not deleted.');
 } catch (err: any) {
 Alert.alert('Could not cancel', err?.message ?? 'Please try again.');
 } finally {
 setActingId(null);
 }
 };
 const body = `Everyone registered for"${event.title}"(${event.rsvpCount}) will be notified that it was cancelled. Registrations are kept, not deleted.`;
 if (Alert.prompt) {
 Alert.prompt(
 'Cancel This Event?',
 `${body}\n\nOptional reason (shown to attendees):`,
 [
 { text: 'Keep Event', style: 'cancel' },
 { text: 'Cancel Event', style: 'destructive', onPress: (reason?: string) => doCancel(reason) },
 ],
 'plain-text',
 );
 } else {
 Alert.alert('Cancel This Event?', body, [
 { text: 'Keep Event', style: 'cancel' },
 { text: 'Cancel Event', style: 'destructive', onPress: () => doCancel() },
 ]);
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
 clearSelection();
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
 clearSelection();
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

 {section === 'pending' && selectedIds.size > 0 && (
 <SolidCard radius={16} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.pastelPrimaryBg }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
 <View style={{ flex: 1, minWidth: 120 }}>
 <AppText weight="bold" variant="bodySmall">{selectedIds.size} selected</AppText>
 </View>
 <View style={{ flexShrink: 0 }}>
 <AppButton label="Clear" variant="ghost" size="sm" onPress={clearSelection} disabled={bulkProcessing} />
 </View>
 <View style={{ flexShrink: 0, minWidth: 110 }}>
 <AppButton label="Bulk Reject" variant="secondary" size="sm" loading={bulkProcessing} onPress={handleBulkPurgeConfirm} />
 </View>
 <View style={{ flexShrink: 0, minWidth: 130 }}>
 <AppButton label="Bulk Approve" size="sm" loading={bulkProcessing} onPress={handleBulkApprove} />
 </View>
 </View>
 </SolidCard>
 )}

 {/* Events List */}
 {displayedEvents.map((event) => {
 const isPending = section === 'pending';
 const isApproved = section === 'approved';
 const hasValidImage = !!event.coverImageUrl && (event.coverImageUrl.startsWith('http://') || event.coverImageUrl.startsWith('https://') || event.coverImageUrl.startsWith('data:'));

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
 {hasValidImage ? (
 <Image
 source={{ uri: event.coverImageUrl! }}
 style={{ width: 85, height: 85, borderRadius: radius.md }}
 contentFit="cover"
 />
 ) : (
 <View
 style={{
 width: 85,
 height: 85,
 borderRadius: radius.md,
 backgroundColor: colors.pastelPrimaryBg,
 alignItems: 'center',
 justifyContent: 'center',
 borderWidth: 1,
 borderColor: `${colors.brandPrimary}25`,
 padding: spacing.xs,
 }}
 >
 <Ionicons name="calendar-outline" size={28} color={colors.brandPrimary} />
 <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 10, marginTop: 4, textTransform: 'uppercase' }}>
 {event.category}
 </AppText>
 </View>
 )}
 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
 <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, flex: 1, marginRight: 6 }}>
 {isPending ? (
 <Pressable
 onPress={() => toggleSelected(event.id)}
 hitSlop={8}
 accessibilityRole="checkbox"
 accessibilityState={{ checked: selectedIds.has(event.id) }}
 accessibilityLabel={`Select ${event.title}`}
 style={{ paddingTop: 2 }}
 >
 <Ionicons
 name={selectedIds.has(event.id) ? 'checkbox' : 'square-outline'}
 size={18}
 color={selectedIds.has(event.id) ? colors.brandPrimary : colors.textSecondary}
 />
 </Pressable>
 ) : null}
 <AppText variant="body"weight="bold"style={{ flex: 1 }}>
 {event.title}
 </AppText>
 </View>
 <Badge
 label={event.isCancelled ? 'Cancelled' : isPending ? 'Pending Review' : isApproved ? 'Live & Approved' : 'Revoked'}
 tone={isPending ? 'warning' : isApproved && !event.isCancelled ? 'success' : 'critical'}
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
 {isApproved && !event.isCancelled ? (
 <View style={{ flex: 1 }}>
 <AppButton
 label="Cancel"
 variant="secondary"
 loading={actingId === event.id}
 onPress={() => handleCancelConfirm(event)}
 />
 </View>
 ) : null}
 <Pressable accessibilityRole="button" accessibilityLabel="Permanently delete"
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
 <Modal visible={editModalOpen} transparent animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={() => setEditModalOpen(false)}>
 <KeyboardAvoidingView
 behavior={Platform.OS === 'ios' ? 'padding' : undefined}
 style={{
 flex: 1,
 backgroundColor: 'rgba(0,0,0,0.65)',
 justifyContent: isDesktop ? 'center' : 'flex-end',
 alignItems: isDesktop ? 'center' : 'stretch',
 paddingTop: isDesktop ? spacing.lg : Math.max(insets.top, 16),
 paddingHorizontal: isDesktop ? spacing.lg : 0,
 paddingBottom: isDesktop ? spacing.lg : 0,
 }}
 >
 <Pressable style={{ flex: isDesktop ? 0 : 1 }} onPress={() => setEditModalOpen(false)} />
 <View
 accessibilityViewIsModal
 style={{
 backgroundColor: colors.surface,
 borderTopLeftRadius: 24,
 borderTopRightRadius: 24,
 borderBottomLeftRadius: isDesktop ? 24 : 0,
 borderBottomRightRadius: isDesktop ? 24 : 0,
 padding: spacing.lg,
 maxHeight: isDesktop ? '90%' : '92%',
 width: '100%',
 maxWidth: isDesktop ? 640 : undefined,
 alignSelf: 'center',
 shadowColor: '#000',
 shadowOffset: { width: 0, height: 6 },
 shadowOpacity: 0.25,
 shadowRadius: 16,
 elevation: 8,
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

 <ScrollView
 style={{ flex: 1, width: '100%' }}
 showsVerticalScrollIndicator={false}
 keyboardShouldPersistTaps="handled"
 contentContainerStyle={{ paddingBottom: spacing.lg }}
 >
 <AppTextField
 label="Event Title"placeholder="e.g. Annual Faculty Hackathon & Symposium"value={formTitle}
 onChangeText={setFormTitle}
 />

 {/* Timing / Schedule */}
 <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 0.8, marginBottom: spacing.xs }}>
 DATE & SCHEDULE
 </AppText>
 <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: spacing.sm, marginBottom: spacing.xs }}>
 <View style={{ flex: 1 }}>
 <AppTextField
 label="Start Time (YYYY-MM-DDTHH:mm)"
 placeholder="2026-10-15T09:00"
 value={formStartAt}
 onChangeText={setFormStartAt}
 />
 </View>
 <View style={{ flex: 1 }}>
 <AppTextField
 label="End Time (YYYY-MM-DDTHH:mm)"
 placeholder="2026-10-15T13:00"
 value={formEndAt}
 onChangeText={setFormEndAt}
 />
 </View>
 </View>

 {/* Duration Quick Helpers */}
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md }}>
 {[
 { label: '+1 Hour', mins: 60 },
 { label: '+2 Hours', mins: 120 },
 { label: '+3 Hours', mins: 180 },
 { label: 'All Day (+8h)', mins: 480 },
 ].map((q) => (
 <Pressable
 key={q.label}
 onPress={() => {
 if (formStartAt) {
 setFormEndAt(addMinutesToDateTime(formStartAt, q.mins));
 haptics.light();
 }
 }}
 style={{
 paddingHorizontal: spacing.sm,
 paddingVertical: 5,
 borderRadius: radius.pill,
 backgroundColor: colors.pastelPrimaryBg,
 borderWidth: 1,
 borderColor: colors.brandPrimary,
 }}
 >
 <AppText variant="caption"weight="bold"tone="brand"style={{ fontSize: 11 }}>
 {q.label}
 </AppText>
 </Pressable>
 ))}
 </View>

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

 <AppTextField
 label="Cover Image URL (Optional)"
 placeholder="https://... (leave blank for clean campus badge)"
 value={formCover}
 onChangeText={setFormCover}
 autoCapitalize="none"
 autoCorrect={false}
 />

 <AppTextField
 label="Event Description & Agenda"placeholder="Detail keynotes, panel discussions, prerequisites..."value={formDesc}
 onChangeText={setFormDesc}
 multiline
 numberOfLines={4}
 />
 </ScrollView>

 <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
 <AppButton label="Cancel"variant="ghost"onPress={() => setEditModalOpen(false)} />
 <AppButton
 label={editingEvent ? 'Save Changes' : 'Publish Live'}
 loading={saving}
 disabled={!formTitle.trim() || !formLocation.trim()}
 onPress={handleSaveEvent}
 />
 </View>
 </View>
 </KeyboardAvoidingView>
 </Modal>

 {/* Attendee Roster Modal */}
 <Modal visible={!!rosterEvent} transparent animationType="fade"onRequestClose={() => setRosterEvent(null)}>
 <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: isDesktop ? spacing.lg : spacing.md }}>
 <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, maxHeight: '85%', width: '100%', maxWidth: 560 }}>
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
