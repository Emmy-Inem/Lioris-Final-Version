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
import { ImageViewerModal } from'./ImageViewerModal';
import { useTheme } from'@/theme/ThemeProvider';
import { getEvent, rsvpToEvent } from'@/api/events';
import { haptics } from'@/utils/haptics';

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
 const { id } = useLocalSearchParams<{ id: string }>();
 const queryClient = useQueryClient();

 const [rsvpd, setRsvpdState] = useState<boolean | null>(null);
 const [submittingRsvp, setSubmittingRsvp] = useState(false);
 const [bookmarked, setBookmarked] = useState(false);
 const [activeTab, setActiveTab] = useState<'overview' | 'agenda' | 'map'>('overview');

 // Map & Navigation state
 const [zoomLevel, setZoomLevel] = useState(1);
 const [selectedWaypoint, setSelectedWaypoint] = useState<string>('Destination Venue');
 const [isSpeaking, setIsSpeaking] = useState(false);
 const [voiceStep, setVoiceStep] = useState(0);

 // Fullscreen Image Lightbox
 const [lightboxOpen, setLightboxOpen] = useState(false);

 // Calendar sync feedback
 const [icsExported, setIcsExported] = useState(false);

 const { data: event, isLoading } = useQuery({
 queryKey: ['events', 'detail', id],
 queryFn: () => getEvent(id),
 enabled: !!id,
 });

 const isRsvpd = rsvpd !== null ? rsvpd : !!event?.isRsvpd;
 const currentRsvpCount = (event?.rsvpCount ?? 34) + (rsvpd === true && !event?.isRsvpd ? 1 : rsvpd === false && event?.isRsvpd ? -1 : 0);
 const capacity = event?.capacity ?? 150;
 const remainingSpots = Math.max(0, capacity - currentRsvpCount);

 const walkingSteps = [
 'Start at the University Main Gate / Senate Bus Terminus.',
 'Walk straight North along Academic Palm Walk (120m).',
 'Pass Faculty of Science Courtyard and ICT Innovation Center.',
 `Arrive at ${event?.location ?? 'Venue Hall'} on your right (Ground Floor Auditorium).`,
 ];

 async function handleToggleRsvp() {
 if (!event) return;
 haptics.medium();
 setSubmittingRsvp(true);
 try {
 const action = isRsvpd ? 'cancel' : 'rsvp';
 await rsvpToEvent(event.id, action);
 setRsvpdState(!isRsvpd);
 queryClient.invalidateQueries({ queryKey: ['events'] });
 haptics.success();
 Alert.alert(
 !isRsvpd ? 'RSVP Confirmed! ' : 'RSVP Cancelled',
 !isRsvpd
 ? `You have secured a seat for"${event.title}". An in-app calendar reminder has been set.`
 : 'Your seat has been released for another student.',
 );
 } catch {
 Alert.alert('Error', 'Could not update RSVP status.');
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

 function handleVoiceGuide() {
 haptics.light();
 if (isSpeaking) {
 if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis'in window) {
 window.speechSynthesis.cancel();
 }
 setIsSpeaking(false);
 return;
 }

 const currentInstruction = walkingSteps[voiceStep];
 setIsSpeaking(true);

 if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis'in window) {
 const utterance = new SpeechSynthesisUtterance(currentInstruction);
 utterance.rate = 0.95;
 utterance.onend = () => {
 setIsSpeaking(false);
 setVoiceStep((s) => (s + 1) % walkingSteps.length);
 };
 window.speechSynthesis.speak(utterance);
 } else {
 setTimeout(() => {
 setIsSpeaking(false);
 setVoiceStep((s) => (s + 1) % walkingSteps.length);
 }, 2500);
 }
 }

 if (isLoading || !event) {
 return (
 <ScreenContainer>
 <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
 <Ionicons name="calendar-outline"size={36} color={colors.brandPrimary} />
 <AppText tone="secondary"style={{ marginTop: spacing.sm }}>Loading event details...</AppText>
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
 <ScreenContainer glow={true} style={{ paddingHorizontal: 0 }}>
 <ScrollView
 showsVerticalScrollIndicator={false}
 keyboardShouldPersistTaps="handled"nestedScrollEnabled
 contentContainerStyle={{ paddingBottom: 140 }}
 >
 {/* Top Hero Banner & Media Header */}
 <View style={{ width: '100%', height: 260, position: 'relative', backgroundColor: colors.surface }}>
 <Pressable onPress={() => setLightboxOpen(true)} style={{ width: '100%', height: '100%' }}>
 <Image
 source={heroImageSource}
 style={{ width: '100%', height: '100%' }}
 contentFit="cover"transition={300}
 />
 {/* Dark gradient backdrop overlay */}
 <View
 style={{
 position: 'absolute',
 top: 0,
 bottom: 0,
 left: 0,
 right: 0,
 backgroundColor: 'rgba(0,0,0,0.38)',
 }}
 />
 </Pressable>

 {/* Floating Navigation Controls */}
 <View style={{ position: 'absolute', top: 44, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
 <Pressable
 onPress={() => router.back()}
 style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
 >
 <Ionicons name="chevron-back"size={24} color="#FFFFFF" />
 </Pressable>

 <View style={{ flexDirection: 'row', gap: 10 }}>
 <Pressable
 onPress={() => {
 haptics.light();
 setBookmarked((b) => !b);
 Alert.alert(bookmarked ? 'Removed Bookmark' : 'Event Saved �', 'Added to your saved calendar events.');
 }}
 style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
 >
 <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={20} color={bookmarked ? colors.brandPrimary : '#FFFFFF'} />
 </Pressable>

 <Pressable
 onPress={() => setLightboxOpen(true)}
 style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}
 >
 <Ionicons name="expand-outline"size={20} color="#FFFFFF" />
 </Pressable>
 </View>
 </View>

 {/* Banner Badges */}
 <View style={{ position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
 <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
 <View style={{ backgroundColor: colors.brandPrimary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
 <AppText variant="caption"weight="bold"tone="inverse"style={{ textTransform: 'uppercase' }}>
 {event.category}
 </AppText>
 </View>
 {event.sponsored ? <Badge label="Featured"tone="accent" /> : null}
 </View>

 <View style={{ backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
 <AppText variant="caption"weight="bold"tone="inverse">
 {currentRsvpCount} / {capacity} Registered
 </AppText>
 </View>
 </View>
 </View>

 {/* Content Body Container */}
 <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
 {/* Event Title */}
 <AppText variant="h1"weight="bold"style={{ fontSize: 24, lineHeight: 30, marginBottom: spacing.xs }}>
 {event.title}
 </AppText>

 {/* Date & Location Pill Highlights */}
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
 <Ionicons name="calendar-outline"size={16} color={colors.brandPrimary} />
 <AppText weight="bold"variant="bodySmall"tone="primary">
 {event.startAt ? new Date(event.startAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Tomorrow, 10:00 AM'}
 </AppText>
 </View>

 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
 <Ionicons name="location-outline"size={16} color={colors.brandPrimary} />
 <AppText weight="bold"variant="bodySmall"tone="primary">
 {event.location}
 </AppText>
 </View>
 </View>

 {/* Capacity Progress Bar */}
 <View style={{ backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
 <AppText weight="bold"variant="bodySmall">
 Seats and Attendance
 </AppText>
 <AppText variant="caption"tone="brand"weight="bold">
 {remainingSpots > 0 ? `${remainingSpots} spots left` : 'Fully Booked'}
 </AppText>
 </View>

 <View style={{ width: '100%', height: 8, borderRadius: 4, backgroundColor: colors.divider, overflow: 'hidden' }}>
 <View
 style={{
 width: `${Math.min(100, Math.round((currentRsvpCount / capacity) * 100))}%`,
 height: '100%',
 backgroundColor: remainingSpots < 10 ? colors.critical : colors.brandPrimary,
 borderRadius: 4,
 }}
 />
 </View>

 {/* Attendee Avatars Row */}
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center' }}>
 <View style={{ marginLeft: 0 }}><Avatar name="Diana Prince"size={26} role="student" /></View>
 <View style={{ marginLeft: -8 }}><Avatar name="Tunde Adebayo"size={26} role="student" /></View>
 <View style={{ marginLeft: -8 }}><Avatar name="Amina Yusuf"size={26} role="student" /></View>
 <View style={{ marginLeft: -8 }}><Avatar name="Emeka Okafor"size={26} role="student" /></View>
 <AppText variant="caption"tone="secondary"style={{ marginLeft: 8, fontSize: 11 }}>
 +{currentRsvpCount} attending
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
 <AppText weight="bold"variant="bodySmall"tone={isSelected ? 'inverse' : 'secondary'}>
 {labels[tab]}
 </AppText>
 </Pressable>
 );
 })}
 </View>

 {/* TAB 1: OVERVIEW */}
 {activeTab === 'overview' && (
 <View>
 {/* Event Description */}
 <SolidCard style={{ marginBottom: spacing.md }}>
 <AppText weight="bold"variant="h3"style={{ marginBottom: 6 }}>
 About This Event
 </AppText>
 <AppText tone="primary"variant="bodySmall"style={{ lineHeight: 22 }}>
 {event.description}
 </AppText>
 </SolidCard>

 {/* Host & Organizer Card */}
 <SolidCard style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
 <Avatar name={event.organizerName ?? 'Faculty Student Council'} size={44} role="staff" />
 <View>
 <AppText weight="bold">{event.organizerName ?? 'Faculty Student Council'}</AppText>
 <AppText tone="secondary"variant="caption">Verified Campus Organizer</AppText>
 </View>
 </View>
 <AppButton
 label="Contact"variant="ghost"onPress={() => Alert.alert('Contact Organizer', `Sending query to ${event.organizerName ?? 'Organizer'}`)}
 />
 </View>
 </SolidCard>

 {/* Calendar Sync Actions */}
 <SolidCard style={{ marginBottom: spacing.md }}>
 <AppText weight="bold"variant="bodySmall"style={{ marginBottom: spacing.xs }}>
 Calendar Sync
 </AppText>
 <View style={{ flexDirection: 'row', gap: spacing.sm }}>
 <View style={{ flex: 1 }}>
 <AppButton
 label="Google Calendar"variant="secondary"onPress={handleGoogleCalendar}
 />
 </View>
 <View style={{ flex: 1 }}>
 <AppButton
 label={icsExported ? 'Saved .ICS' : 'Export .ICS'}
 variant="secondary"onPress={handleExportIcs}
 />
 </View>
 </View>
 </SolidCard>
 </View>
 )}

 {/* TAB 2: AGENDA */}
 {activeTab === 'agenda' && (
 <SolidCard style={{ marginBottom: spacing.md }}>
 <AppText weight="bold"variant="h3"style={{ marginBottom: spacing.md }}>
 Program Schedule & Timeline
 </AppText>

 {[
 { time: '09:30 AM', title: 'Arrival & QR Check-in', desc: 'Badge pick-up at Entrance Foyer & Welcome coffee.' },
 { time: '10:00 AM', title: 'Keynote & Opening Remarks', desc: 'Dean Welcome Address & Industry Guest introduction.' },
 { time: '11:15 AM', title: 'Interactive Technical Session', desc: 'Hands-on live demo, architectural teardown & workshop.' },
 { time: '01:00 PM', title: 'Networking Lunch & Peer Huddle', desc: 'Faculty plaza refreshments and alumni mentor discussions.' },
 { time: '02:30 PM', title: 'Closing Showcase & Awards', desc: 'Certificate distribution and closing photography.' },
 ].map((item, index) => (
 <View key={index} style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md, alignItems: 'flex-start' }}>
 <View style={{ alignItems: 'center' }}>
 <View style={{ backgroundColor: colors.brandPrimary, width: 12, height: 12, borderRadius: 6 }} />
 {index < 4 ? <View style={{ width: 2, height: 42, backgroundColor: colors.border, marginVertical: 2 }} /> : null}
 </View>
 <View style={{ flex: 1 }}>
 <AppText weight="bold"variant="caption"tone="brand">
 {item.time}
 </AppText>
 <AppText weight="bold"variant="bodySmall">
 {item.title}
 </AppText>
 <AppText tone="secondary"variant="caption"style={{ marginTop: 2 }}>
 {item.desc}
 </AppText>
 </View>
 </View>
 ))}
 </SolidCard>
 )}

 {/* TAB 3: CAMPUS MAP & NAVIGATION */}
 {activeTab === 'map' && (
 <View>
 {/* Real Interactive Google Maps Visualizer */}
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
 // Real Google Maps Live Web Embed
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

 {/* Step by Step Walking Route Guide */}
 <SolidCard style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
 <Ionicons name="compass"size={18} color={colors.brandPrimary} />
 <AppText weight="bold"variant="bodySmall">
 Turn-by-Turn Campus Guide
 </AppText>
 </View>
 <Badge label="Live GPS"tone="brand" />
 </View>

 <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.sm }}>
 Step {voiceStep + 1} of {walkingSteps.length}: {walkingSteps[voiceStep]}
 </AppText>

 <View style={{ flexDirection: 'row', gap: spacing.sm }}>
 <View style={{ flex: 1 }}>
 <AppButton
 label="Launch Maps"onPress={handleLaunchMaps}
 />
 </View>
 <View style={{ flex: 1 }}>
 <AppButton
 label={isSpeaking ? 'Stop Voice' : 'Voice Guide'}
 variant="secondary"onPress={handleVoiceGuide}
 />
 </View>
 </View>
 </SolidCard>
 </View>
 )}
 </View>
 </ScrollView>

 {/* Fullscreen Hero Image Lightbox Modal */}
 <ImageViewerModal
 visible={lightboxOpen}
 onClose={() => setLightboxOpen(false)}
 imageSource={heroImageSource}
 caption={`${event.title} - ${event.location}`}
 />
 </ScreenContainer>
 );
}
