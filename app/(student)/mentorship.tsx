import React, { useState } from'react';
import { Alert, Modal, Pressable, ScrollView, View } from'react-native';
import { Image } from'expo-image';
import { router } from'expo-router';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { AppButton } from'@/components/AppButton';
import { ChipSelect } from'@/components/ChipSelect';
import { SolidCard } from'@/components/SolidCard';
import { Badge } from'@/components/Badge';
import { MentorCard } from'@/components/MentorCard';
import { EmptyState } from'@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { listMentorships, searchMentors } from '@/api/mentorship';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const EXPERTISE_CATEGORIES = ['All Fields', 'Software', 'Resume Prep', 'Finance', 'Research', 'Design'];

export default function StudentMentorshipScreen() {
 const { colors, spacing, radius } = useTheme();
 const { user } = useAuth();
 const { isDesktop } = useResponsive();
 const queryClient = useQueryClient();
 const [activeSection, setActiveSection] = useState<'rep' | 'mentors'>('rep');
 const [query, setQuery] = useState('');
 const debouncedQuery = useDebouncedValue(query);
 const [expertise, setExpertise] = useState('All Fields');
 const [messageModalOpen, setMessageModalOpen] = useState(false);
 const [messageText, setMessageText] = useState('');

 const { data: mentorships } = useQuery({ queryKey: ['mentorships'], queryFn: listMentorships });
 const { data: mentors, isLoading } = useQuery({
 queryKey: ['mentors', debouncedQuery, expertise],
 queryFn: () => searchMentors({ q: debouncedQuery || undefined, focusArea: expertise }),
 });

 const myApplications = mentorships?.filter((m) => !!user?.id && m.studentId === user.id) ?? [];

 function handleSendMessage() {
 if (!messageText.trim()) return;
 setMessageModalOpen(false);
 setMessageText('');
 Alert.alert('Message Sent', 'Your message has been delivered directly to your Class Representative.');
 }

 return (
 <ScreenContainer glow={false}>
 {!isDesktop && <AppHeader />}
 <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
 {/* Top Header & Intro */}
 <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.sm, marginBottom: spacing.md }}>
 <AppText variant="h1" weight="bold">
 Connect & Leadership 
 </AppText>
 <AppText tone="secondary" variant="bodySmall">
 Stay connected with your class representative, department leaders, and verified alumni mentors.
 </AppText>
 </View>

 {/* Tab Switcher on Mobile Only */}
 {!isDesktop && (
 <View
 style={{
 flexDirection: 'row',
 backgroundColor: colors.surface,
 borderRadius: radius.pill,
 padding: 4,
 marginBottom: spacing.lg,
 borderWidth: 1,
 borderColor: colors.border,
 }}
 >
 <Pressable
 onPress={() => setActiveSection('rep')}
 style={{
 flex: 1,
 paddingVertical: 8,
 borderRadius: radius.pill,
 backgroundColor: activeSection === 'rep' ? colors.brandPrimary : 'transparent',
 alignItems: 'center',
 }}
 >
 <AppText
 weight="bold"
 variant="bodySmall"
 tone={activeSection === 'rep' ? 'inverse' : 'secondary'}
 >
 Class Representative 
 </AppText>
 </Pressable>
 <Pressable
 onPress={() => setActiveSection('mentors')}
 style={{
 flex: 1,
 paddingVertical: 8,
 borderRadius: radius.pill,
 backgroundColor: activeSection === 'mentors' ? colors.brandPrimary : 'transparent',
 alignItems: 'center',
 }}
 >
 <AppText
 weight="bold"
 variant="bodySmall"
 tone={activeSection === 'mentors' ? 'inverse' : 'secondary'}
 >
 Alumni Mentors 
 </AppText>
 </Pressable>
 </View>
 )}

 <View style={isDesktop ? { flexDirection: 'row', gap: 28, alignItems: 'flex-start' } : undefined}>
 {/* Left Column (Desktop) or Rep Tab (Mobile) */}
 {(isDesktop || activeSection === 'rep') && (
 <View style={isDesktop ? { width: 380 } : undefined}>
 {/* Representative Spotlight Card */}
 <SolidCard radius={24} style={{ marginBottom: spacing.lg }}>
 {/* Profile Top */}
 <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
 <View
 style={{
 width: 96,
 height: 96,
 borderRadius: 48,
 padding: 3,
 backgroundColor: colors.pastelPrimaryBg,
 borderWidth: 2,
 borderColor: colors.brandPrimary,
 marginBottom: spacing.xs,
 }}
 >
 <Image
 source={require('@/../assets/images/class_rep_portrait.jpg')}
 style={{ width: '100%', height: '100%', borderRadius: 45 }}
 contentFit="cover"
 />
 </View>
 <AppText variant="h2" weight="bold">
 Tara Vaishnavi
 </AppText>
 <View
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 4,
 backgroundColor: colors.pastelPrimaryBg,
 borderRadius: radius.pill,
 paddingHorizontal: 10,
 paddingVertical: 3,
 marginTop: 4,
 marginBottom: 4,
 }}
 >
 <Ionicons name="school" size={12} color={colors.brandPrimary} />
 <AppText variant="caption" weight="bold" tone="brand">
 Class Representative
 </AppText>
 </View>
 <AppText tone="secondary" variant="bodySmall">
 III B.Sc Computer Science - Cohort A
 </AppText>
 </View>

 {/* Quote Block */}
 <View
 style={{
 backgroundColor: colors.pastelPrimaryBg,
 borderRadius: radius.md,
 padding: spacing.md,
 marginBottom: spacing.lg,
 borderLeftWidth: 3,
 borderLeftColor: colors.brandPrimary,
 }}
 >
 <AppText variant="bodySmall" style={{ fontStyle: 'italic', color: colors.sectionLabel }}>
 "Let's grow together, support each other, and make our class the best it can be."
 </AppText>
 </View>

 {/* Achievements & Highlights */}
 <AppText variant="bodySmall" weight="bold" tone="brand" style={{ letterSpacing: 0.5, marginBottom: spacing.xs }}>
 ACHIEVEMENTS & HIGHLIGHTS 
 </AppText>
 <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.lg }}>
 <AchievementBox icon="trophy-outline" title="Tech Fest" subtitle="Annual Hackathon" />
 <AchievementBox icon="ribbon-outline" title="Class Topper" subtitle="GPA 4.8 / 5.0" />
 <AchievementBox icon="medal-outline" title="Debate Final" subtitle="Campus Cup" />
 </View>

 {/* Responsibilities Checklist */}
 <AppText variant="bodySmall" weight="bold" tone="brand" style={{ letterSpacing: 0.5, marginBottom: spacing.xs }}>
 CORE RESPONSIBILITIES 
 </AppText>
 <View style={{ gap: spacing.xs, marginBottom: spacing.lg }}>
 <CheckItem text="Voice student concerns and academic suggestions" />
 <CheckItem text="Communicate lecture schedule updates & notices" />
 <CheckItem text="Represent cohort in Faculty & Senate meetings" />
 <CheckItem text="Coordinate exam study circles & project teams" />
 </View>

 {/* Full Width Primary Message Button */}
 <AppButton
 label="Message Representative "
 onPress={() => setMessageModalOpen(true)}
 fullWidth
 />
 </SolidCard>

 {/* My Sent Applications (Desktop view) */}
 {isDesktop && myApplications.length > 0 ? (
 <SolidCard style={{ marginBottom: spacing.lg }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
 <AppText weight="bold" tone="brand">
 My Sent Applications 
 </AppText>
 <Badge label={`${myApplications.length} pending`} tone="brand" />
 </View>
 {myApplications.map((app) => (
 <View key={app.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
 <AppText weight="bold" variant="bodySmall">
 {app.mentorName}
 </AppText>
 {app.focusArea ? (
 <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
 Focus: {app.focusArea}
 </AppText>
 ) : null}
 </View>
 ))}
 </SolidCard>
 ) : null}
 </View>
 )}

 {/* Right Column (Desktop) or Mentors Tab (Mobile) */}
 {(isDesktop || activeSection === 'mentors') && (
 <View style={isDesktop ? { flex: 1 } : undefined}>
 <AppTextField
 label=""
 placeholder="Search mentors by name, company, or skills..."
 value={query}
 onChangeText={setQuery}
 />

 <View style={{ marginBottom: spacing.lg }}>
 <ChipSelect
 options={EXPERTISE_CATEGORIES}
 selected={[expertise]}
 onToggle={(value) => setExpertise(value)}
 />
 </View>

 {!isDesktop && myApplications.length > 0 ? (
 <SolidCard style={{ marginBottom: spacing.lg }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
 <AppText weight="bold" tone="brand">
 My Sent Applications 
 </AppText>
 <Badge label={`${myApplications.length} pending`} tone="brand" />
 </View>
 <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
 {myApplications.map((app) => (
 <SolidCard key={app.id} radius={12} style={{ width: 200 }}>
 <AppText weight="bold" variant="bodySmall" numberOfLines={1}>
 {app.mentorName}
 </AppText>
 {app.focusArea ? (
 <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>
 Focus: {app.focusArea}
 </AppText>
 ) : null}
 </SolidCard>
 ))}
 </ScrollView>
 </SolidCard>
 ) : null}

 <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.md }}>
 Verified Alumni Mentors 
 </AppText>
 <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
 {mentors?.map((mentor) => (
 <View key={mentor.id} style={isDesktop ? { width: '48.5%' } : undefined}>
 <MentorCard
 mentor={mentor}
 onRequested={() => queryClient.invalidateQueries({ queryKey: ['mentorships'] })}
 />
 </View>
 ))}
 </View>
 {!isLoading && (mentors?.length ?? 0) === 0 ? (
 <EmptyState title="No mentors found" description="Try a different search term or category." />
 ) : null}
 </View>
 )}
 </View>
 </ScrollView>

 {/* Direct Message to Rep Modal */}
 <Modal visible={messageModalOpen} transparent animationType="fade" onRequestClose={() => setMessageModalOpen(false)}>
 <Pressable
 style={{
 flex: 1,
 backgroundColor: 'rgba(0, 0, 0, 0.65)',
 justifyContent: isDesktop ? 'center' : 'flex-end',
 alignItems: isDesktop ? 'center' : 'stretch',
 padding: isDesktop ? 20 : 0,
 }}
 onPress={() => setMessageModalOpen(false)}
 >
 <Pressable
 style={{
 backgroundColor: colors.background,
 borderTopLeftRadius: 24,
 borderTopRightRadius: 24,
 borderRadius: isDesktop ? 24 : undefined,
 maxWidth: isDesktop ? 520 : undefined,
 width: '100%',
 padding: spacing.lg,
 shadowColor: '#000',
 shadowOffset: { width: 0, height: 8 },
 shadowOpacity: 0.25,
 shadowRadius: 24,
 }}
 onPress={(e) => e.stopPropagation()}
 >
 {!isDesktop && (
 <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
 <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
 </View>
 )}
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
 <Ionicons name="chatbubble-ellipses" size={20} color={colors.brandPrimary} />
 <AppText variant="h3" weight="bold">
 Message Class Representative
 </AppText>
 </View>
 <Pressable onPress={() => setMessageModalOpen(false)} hitSlop={8}>
 <Ionicons name="close" size={22} color={colors.textSecondary} />
 </Pressable>
 </View>
 <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
 Your message goes directly to Tara Vaishnavi. For urgent timetable inquiries, please include your matric number.
 </AppText>
 <AppTextField
 label="Message"
 placeholder="Hi Tara, I have a question regarding the updated semester timetable..."
 value={messageText}
 onChangeText={setMessageText}
 multiline
 numberOfLines={4}
 />
 <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
 <AppButton label="Cancel" variant="ghost" onPress={() => setMessageModalOpen(false)} />
 <AppButton label="Send Message" disabled={!messageText.trim()} onPress={handleSendMessage} />
 </View>
 </Pressable>
 </Pressable>
 </Modal>
 </ScreenContainer>
 );
}

function AchievementBox({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }) {
 const { colors, spacing, radius } = useTheme();
 return (
 <View
 style={{
 flex: 1,
 backgroundColor: colors.surface,
 borderRadius: radius.md,
 padding: spacing.sm,
 alignItems: 'center',
 borderWidth: 1,
 borderColor: colors.border,
 }}
 >
 <Ionicons name={icon} size={20} color={colors.brandPrimary} style={{ marginBottom: 4 }} />
 <AppText weight="bold"variant="caption"style={{ textAlign: 'center', marginBottom: 2 }}>
 {title}
 </AppText>
 <AppText tone="secondary"variant="caption"style={{ fontSize: 10, textAlign: 'center' }}>
 {subtitle}
 </AppText>
 </View>
 );
}

function CheckItem({ text }: { text: string }) {
 const { colors, spacing } = useTheme();
 return (
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
 <Ionicons name="checkmark-circle"size={18} color={colors.brandPrimary} />
 <AppText variant="bodySmall"weight="medium"style={{ flex: 1 }}>
 {text}
 </AppText>
 </View>
 );
}
