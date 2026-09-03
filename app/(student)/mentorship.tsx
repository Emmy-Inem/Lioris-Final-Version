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
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { listMentorships, searchMentors } from '@/api/mentorship';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const EXPERTISE_CATEGORIES = ['All Fields', 'Software', 'Resume Prep', 'Finance', 'Research', 'Design'];

export default function StudentMentorshipScreen() {
 const { colors, spacing, radius } = useTheme();
  const toast = useToast();
 const { user } = useAuth();
 const { isDesktop } = useResponsive();
 const queryClient = useQueryClient();
 const [activeSection, setActiveSection] = useState<'rep' | 'mentors'>('mentors');
 const [query, setQuery] = useState('');
 const debouncedQuery = useDebouncedValue(query);
 const [expertise, setExpertise] = useState('All Fields');
 const { data: mentorships } = useQuery({ queryKey: ['mentorships'], queryFn: listMentorships });
 const { data: mentors, isLoading } = useQuery({
 queryKey: ['mentors', debouncedQuery, expertise],
 queryFn: () => searchMentors({ q: debouncedQuery || undefined, focusArea: expertise }),
 });

 const myApplications = mentorships?.filter((m) => !!user?.id && m.studentId === user.id) ?? [];

 return (
 <ScreenContainer glow={false}>
 {!isDesktop && <AppHeader />}
 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
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
  <SolidCard radius={24} style={{ marginBottom: spacing.lg, padding: spacing.lg }}>
    <AppText tone="secondary" variant="bodySmall">
      No class representative assigned for your cohort yet.
    </AppText>
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
 <View key={mentor.id} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 300 } : undefined}>
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
