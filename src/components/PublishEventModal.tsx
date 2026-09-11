import React, { useState } from'react';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Image } from'expo-image';
import * as ImagePicker from'expo-image-picker';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { AppTextField } from'./AppTextField';
import { AppButton } from'./AppButton';
import { useTheme } from'@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { createEvent } from'@/api/events';
import { EventCategory } from'@/api/types';
import { haptics } from'@/utils/haptics';

const EVENT_TYPES = ['Lioris Live Event (In-App)', 'Physical Event', 'External Event'] as const;
const CATEGORY_LABELS: Record<string, EventCategory> = {
 Academic: 'academic',
 Career: 'career',
 Social: 'student',
};
const CATEGORIES = Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const START_TIME_PICKS: Array<{ label: string; value: string }> = [
 { label: '9:00 AM', value: '09:00' },
 { label: '12:00 PM', value: '12:00' },
 { label: '3:00 PM', value: '15:00' },
 { label: '6:00 PM', value: '18:00' },
];

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

function toTimeInput(d: Date): string {
 return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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
 const total = h * 60 + m + minutes;
 const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
 return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

interface PublishEventModalProps {
 visible: boolean;
 onClose: () => void;
 onPublish: () => void;
}

export function PublishEventModal({ visible, onClose, onPublish }: PublishEventModalProps) {
 const { colors, spacing, radius, isDark } = useTheme();
 const { isDesktop } = useResponsive();
 const [title, setTitle] = useState('');
 const [description, setDescription] = useState('');
 const [eventType, setEventType] = useState<(typeof EVENT_TYPES)[number]>('Lioris Live Event (In-App)');
 const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Academic');
 const [sponsored, setSponsored] = useState(false);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [submitting, setSubmitting] = useState(false);
 const [bannerUri, setBannerUri] = useState<string | null>(null);

 // Date/time - there is no calendar picker component anywhere in this
 // codebase to reuse, so this is a real (if simple) text-input based
 // picker with quick-pick shortcuts, rather than a hardcoded fake date.
 const [eventDate, setEventDate] = useState('');
 const [startTime, setStartTime] = useState('');
 const [endTime, setEndTime] = useState('');

 // Venue - wired to the real venueType/virtualLink fields instead of just
 // toggling a display string.
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

 const venueType = eventType === 'Lioris Live Event (In-App)'
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
 await createEvent({
 title: title.trim(),
 description: description.trim() || 'No description provided.',
 category: CATEGORY_LABELS[category],
 location: venueType === 'virtual' ? 'Lioris Live (In-App)' : location.trim(),
 visibilityScope: 'campus',
 startAt: startAtDate.toISOString(),
 endAt: endAtDate.toISOString(),
 sponsored,
 imageUrl: bannerUri || null,
 venueType,
 virtualLink: venueType === 'virtual' ? virtualLink.trim() : null,
 });
 onPublish();
 onClose();
 setTitle('');
 setDescription('');
 setBannerUri(null);
 setEventDate('');
 setStartTime('');
 setEndTime('');
 setLocation('');
 setVirtualLink('');
 setErrorMessage(null);
 } catch (err: any) {
 haptics.error();
 setErrorMessage(err?.message || 'Could not publish event. Please try again.');
 } finally {
 setSubmitting(false);
 }
 }

 return (
 <Modal visible={visible} transparent={isDesktop} animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={onClose}>
 <View
 style={{
 flex: 1,
 backgroundColor: isDesktop ? 'rgba(0, 0, 0, 0.65)' : colors.background,
 justifyContent: isDesktop ? 'center' : 'flex-start',
 alignItems: isDesktop ? 'center' : 'stretch',
 paddingTop: isDesktop ? spacing.lg : 56,
 paddingHorizontal: spacing.lg,
 paddingBottom: isDesktop ? spacing.lg : 0,
 }}
 >
 <View
 style={{
 flex: isDesktop ? undefined : 1,
 backgroundColor: colors.background,
 width: isDesktop ? '100%' : undefined,
 maxWidth: isDesktop ? 620 : undefined,
 maxHeight: isDesktop ? '90%' : undefined,
 borderRadius: isDesktop ? 24 : 0,
 padding: isDesktop ? spacing.xl : 0,
 borderWidth: isDesktop ? 1 : 0,
 borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
 overflow: 'hidden',
 }}
 >
 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isDesktop ? spacing.md : 40 }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
 <AppText variant="h1" weight="bold">
 Publish Event
 </AppText>
 <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
 <Ionicons name="close" size={24} color={colors.textPrimary} />
 </Pressable>
 </View>

 <AppTextField label=""placeholder="Event Title"value={title} onChangeText={setTitle} />
 <AppTextField
 label=""placeholder="Event Objective description"value={description}
 onChangeText={setDescription}
 multiline
 numberOfLines={3}
 />

 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginBottom: spacing.lg }}>
 <Ionicons name="bulb-outline"size={12} color={colors.brandPrimary} />
 <AppText variant="caption"weight="semiBold"tone="brand">
 Auto-suggest details
 </AppText>
 </View>

 <AppText weight="bold"variant="bodySmall"style={{ marginBottom: spacing.sm }}>
 Event Type:
 </AppText>
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
 {EVENT_TYPES.map((type) => {
 const selected = eventType === type;
 return (
 <Pressable
 key={type}
 onPress={() => setEventType(type)}
 accessibilityRole="radio"accessibilityState={{ checked: selected }}
 accessibilityLabel={type}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: spacing.sm,
 borderRadius: radius.pill,
 backgroundColor: selected ? colors.pastelPrimaryBg : 'transparent',
 borderWidth: selected ? 0 : 1,
 borderColor: colors.border,
 }}
 >
 <AppText variant="bodySmall"weight="semiBold"tone={selected ? 'brand' : 'secondary'}>
 {type}
 </AppText>
 </Pressable>
 );
 })}
 </View>

 {eventType === 'Lioris Live Event (In-App)' ? (
 <>
 <View style={{ backgroundColor: colors.pastelPrimaryBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm }}>
 <AppText variant="bodySmall"style={{ color: colors.sectionLabel }}>
 Lioris Live: This event will be marked as an in-app live event. Add the
 meeting link students should join at the start time.
 </AppText>
 </View>
 <AppTextField
 label="Meeting Link"
 placeholder="https://meet.google.com/xxx-xxxx-xxx"
 value={virtualLink}
 onChangeText={setVirtualLink}
 autoCapitalize="none"
 autoCorrect={false}
 />
 </>
 ) : (
 <AppTextField
 label={eventType === 'Physical Event' ? 'Venue / Location' : 'External Location or Link'}
 placeholder={eventType === 'Physical Event' ? 'e.g. Campus Main Hall' : 'e.g. Off-campus venue or event page URL'}
 value={location}
 onChangeText={setLocation}
 />
 )}

 <AppText weight="bold"variant="bodySmall"style={{ marginBottom: spacing.sm, marginTop: spacing.sm }}>
 Date & Time:
 </AppText>
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm }}>
 {[
 { label: 'Today', date: new Date() },
 { label: 'Tomorrow', date: new Date(Date.now() + 86400000) },
 { label: 'This Weekend', date: nextWeekendDate() },
 ].map((pick) => (
 <Pressable
 key={pick.label}
 onPress={() => applyQuickDate(pick.date)}
 accessibilityRole="button"accessibilityLabel={`Set date to ${pick.label}`}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: spacing.xs,
 borderRadius: radius.pill,
 borderWidth: 1,
 borderColor: colors.border,
 backgroundColor: eventDate === toDateInput(pick.date) ? colors.pastelPrimaryBg : 'transparent',
 }}
 >
 <AppText variant="caption"weight="semiBold"tone={eventDate === toDateInput(pick.date) ? 'brand' : 'secondary'}>
 {pick.label}
 </AppText>
 </Pressable>
 ))}
 </View>
 <AppTextField
 label="Date (YYYY-MM-DD)"
 placeholder="2026-09-18"
 value={eventDate}
 onChangeText={setEventDate}
 autoCapitalize="none"
 autoCorrect={false}
 />

 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm }}>
 {START_TIME_PICKS.map((pick) => (
 <Pressable
 key={pick.value}
 onPress={() => applyQuickStartTime(pick.value)}
 accessibilityRole="button"accessibilityLabel={`Set start time to ${pick.label}`}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: spacing.xs,
 borderRadius: radius.pill,
 borderWidth: 1,
 borderColor: colors.border,
 backgroundColor: startTime === pick.value ? colors.pastelPrimaryBg : 'transparent',
 }}
 >
 <AppText variant="caption"weight="semiBold"tone={startTime === pick.value ? 'brand' : 'secondary'}>
 {pick.label}
 </AppText>
 </Pressable>
 ))}
 </View>
 <AppTextField
 label="Start Time (24-hour HH:MM)"
 placeholder="14:00"
 value={startTime}
 onChangeText={setStartTime}
 autoCapitalize="none"
 autoCorrect={false}
 />

 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm }}>
 {DURATION_PICKS.map((pick) => (
 <Pressable
 key={pick.label}
 onPress={() => applyQuickDuration(pick.minutes)}
 accessibilityRole="button"accessibilityLabel={`Set duration to ${pick.label}`}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: spacing.xs,
 borderRadius: radius.pill,
 borderWidth: 1,
 borderColor: colors.border,
 }}
 >
 <AppText variant="caption"weight="semiBold"tone="secondary">
 {pick.label}
 </AppText>
 </Pressable>
 ))}
 </View>
 <AppTextField
 label="End Time (24-hour HH:MM)"
 placeholder="15:30"
 value={endTime}
 onChangeText={setEndTime}
 autoCapitalize="none"
 autoCorrect={false}
 />

 <Pressable
 onPress={pickBanner}
 accessibilityRole="button"accessibilityLabel={bannerUri ? 'Change event banner' : 'Upload event banner'}
 style={{
 borderWidth: 1,
 borderColor: colors.border,
 borderRadius: radius.md,
 backgroundColor: colors.pastelPrimaryBg,
 alignItems: 'center',
 paddingVertical: bannerUri ? 0 : spacing.lg,
 marginBottom: spacing.lg,
 overflow: 'hidden',
 }}
 >
 {bannerUri ? (
 <Image source={{ uri: bannerUri }} style={{ width: '100%', height: 140 }} contentFit="cover"transition={200} />
 ) : (
 <>
 <Ionicons name="cloud-upload"size={22} color={colors.brandPrimary} style={{ marginBottom: spacing.xs }} />
 <AppText weight="semiBold"tone="brand">
 Upload Event Banner (Photo)
 </AppText>
 </>
 )}
 </Pressable>

 <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
 {CATEGORIES.map((cat) => {
 const selected = category === cat;
 return (
 <Pressable
 key={cat}
 onPress={() => setCategory(cat)}
 accessibilityRole="radio"accessibilityState={{ checked: selected }}
 accessibilityLabel={cat}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: spacing.sm,
 borderRadius: radius.pill,
 backgroundColor: selected ? colors.pastelPrimaryBg : 'transparent',
 borderWidth: selected ? 0 : 1,
 borderColor: colors.border,
 }}
 >
 <AppText variant="bodySmall"weight="semiBold"tone={selected ? 'brand' : 'secondary'}>
 {cat}
 </AppText>
 </Pressable>
 );
 })}
 </View>

 <Pressable
 onPress={() => setSponsored((v) => !v)}
 accessibilityRole="checkbox"accessibilityState={{ checked: sponsored }}
 accessibilityLabel="Feature as sponsored event"style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl }}
 >
 <Ionicons
 name={sponsored ? 'checkbox' : 'square-outline'}
 size={20}
 color={sponsored ? colors.brandPrimary : colors.textSecondary}
 />
 <View style={{ flex: 1 }}>
 <AppText weight="semiBold"tone="brand">
 Feature as Sponsored Event
 </AppText>
 <AppText tone="secondary"variant="caption">
 Place this event under the top Showcase & Sponsored carousel
 </AppText>
 </View>
 </Pressable>
 </ScrollView>

 {errorMessage ? (
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
 <AppText
 variant="bodySmall"
 weight="semiBold"
 style={{ color: colors.critical, flex: 1 }}
 >
 {errorMessage}
 </AppText>
 </View>
 ) : null}

 <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', paddingVertical: spacing.md }}>
 <AppButton label="Cancel" variant="ghost" onPress={onClose} />
 <AppButton label="Host Event" onPress={handleHost} loading={submitting} />
 </View>
 </View>
 </View>
 </Modal>
 );
}
