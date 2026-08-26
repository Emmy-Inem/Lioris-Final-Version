import React, { useState } from'react';
import { ScrollView, View, Pressable, Alert } from'react-native';
import { router } from'expo-router';
import { useQuery } from'@tanstack/react-query';
import { Image } from'expo-image';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { SolidCard } from'@/components/SolidCard';
import { AppText } from'@/components/AppText';
import { AppButton } from'@/components/AppButton';
import { Badge } from'@/components/Badge';
import { Avatar } from'@/components/Avatar';
import { AnnouncementCard } from'@/components/AnnouncementCard';
import { ManagePortalLinksModal } from '@/components/admin/ManagePortalLinksModal';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { listAnnouncements } from '@/api/announcements';
import { listEvents } from '@/api/events';
import { haptics } from '@/utils/haptics';

export default function StaffDashboard() {
 const { colors, spacing, radius } = useTheme();
 const { isDesktop } = useResponsive();
 const { user } = useAuth();
 const [portalModalOpen, setPortalModalOpen] = useState(false);
 const { data: announcements } = useQuery({ queryKey: ['announcements'], queryFn: listAnnouncements });
 const { data: events } = useQuery({ queryKey: ['events', 'staff'], queryFn: () => listEvents({}) });

 return (
 <ScreenContainer glow={true}>
 {!isDesktop && <AppHeader />}
 <ScrollView
 showsVerticalScrollIndicator={false}
 keyboardShouldPersistTaps="handled"
 nestedScrollEnabled
 contentContainerStyle={{ paddingBottom: isDesktop ? 40 : 140, paddingTop: isDesktop ? spacing.md : 0 }}
 >
 {/* Staff Coordinator Banner Header */}
 <View style={{ marginTop: spacing.md, marginBottom: spacing.md, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface }}>
 <View style={{ width: '100%', height: 140, position: 'relative' }}>
 <Image
 source={require('../../assets/images/campus_students_photo.jpg')}
 style={{ width: '100%', height: '100%' }}
 contentFit="cover"
 />
 <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(10, 19, 38, 0.75)' }} />

 <View style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
 <View style={{ backgroundColor: colors.brandPrimary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill }}>
 <AppText variant="caption"weight="bold"tone="inverse"style={{ fontSize: 10 }}>
 FACULTY COORDINATOR
 </AppText>
 </View>
 <AppText variant="caption"tone="inverse"style={{ opacity: 0.9 }}>
 Department of Computer Science
 </AppText>
 </View>
 <AppText variant="h1"weight="bold"tone="inverse"numberOfLines={1} style={{ fontSize: 22 }}>
 Welcome, {user?.fullName?.split(' ')[0] ?? 'Prof'} �‍
 </AppText>
 <AppText variant="caption"tone="inverse"style={{ opacity: 0.85, marginTop: 2 }}>
 Semester Term: Harmattan 2026 • UI Node
 </AppText>
 </View>

 <Avatar name={user?.fullName ?? 'Faculty Coordinator'} size={56} role="staff" />
 </View>
 </View>
 </View>

 {/* Academic Action Controls */}
 <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
 <Pressable
 onPress={() => router.push('/(staff)/announcements')}
 style={{ flex: 1, backgroundColor: colors.pastelPrimaryBg, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.brandPrimary }}
 >
 <Ionicons name="megaphone"size={22} color={colors.brandPrimary} style={{ marginBottom: 4 }} />
 <AppText weight="bold"variant="bodySmall"tone="brand">
 Post Announcement
 </AppText>
 <AppText tone="secondary"variant="caption"style={{ marginTop: 2 }}>
 Broadcast to faculty & students
 </AppText>
 </Pressable>

 <Pressable
 onPress={() => router.push('/(staff)/moderation')}
 style={{ flex: 1, backgroundColor: colors.surface, padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
 >
 <Ionicons name="shield-checkmark-outline"size={22} color={colors.textPrimary} style={{ marginBottom: 4 }} />
 <AppText weight="bold"variant="bodySmall">
 Staff Workdesk
 </AppText>
 <AppText tone="secondary"variant="caption"style={{ marginTop: 2 }}>
 Reports & course approvals
 </AppText>
 </Pressable>
 </View>

 {/* Course Milestones & Grading Alert */}
 <SolidCard radius={20} style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
 <Ionicons name="time"size={18} color="#D97706" />
 <AppText weight="bold"variant="bodySmall">
 Upcoming Academic Deadlines 
 </AppText>
 </View>
 <Badge label="In 3 Days"tone="accent" />
 </View>
 <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.sm }}>
 CSC 301 Midterm Test score entry portal closes on Friday, 11:59 PM.
 </AppText>
 <View style={{ flexDirection: 'row', gap: spacing.sm }}>
 <AppButton
 label="Open Grades Portal"onPress={() => setPortalModalOpen(true)}
 />
 <AppButton
 label="Lecture Timetable"variant="secondary"onPress={() => router.push('/(staff)/events')}
 />
 </View>
 </SolidCard>

 {/* Live Announcements */}
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
 <AppText variant="h3"weight="bold">
 Recent Faculty Notices �
 </AppText>
 <AppText tone="brand"weight="bold"variant="bodySmall"onPress={() => router.push('/(staff)/announcements')}>
 Manage
 </AppText>
 </View>

 {announcements?.slice(0, 3).map((a) => (
 <AnnouncementCard key={a.id} announcement={a} />
 ))}
 </ScrollView>

 <ManagePortalLinksModal
 visible={portalModalOpen}
 onClose={() => setPortalModalOpen(false)}
 />
 </ScreenContainer>
 );
}
