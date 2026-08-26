import React, { useState } from'react';
import { Alert, Modal, Pressable, ScrollView, View } from'react-native';
import { router } from'expo-router';
import { useQuery } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { SolidCard } from'@/components/SolidCard';
import { AppTextField } from'@/components/AppTextField';
import { ChipSelect } from'@/components/ChipSelect';
import { Avatar } from'@/components/Avatar';
import { UserTypeBadge } from'@/components/UserTypeBadge';
import { AppButton } from'@/components/AppButton';
import { Badge } from'@/components/Badge';
import { useTheme } from'@/theme/ThemeProvider';
import { useAuth } from'@/auth/AuthContext';
import { searchAlumniDirectory } from'@/api/connections';
import { getMyProfile } from'@/api/profile';
import { useDebouncedValue } from'@/hooks/useDebouncedValue';
import { haptics } from'@/utils/haptics';

const TABS = ['Overview Hub', 'Member Search', 'Legacy & Giving'] as const;
const DEPARTMENTS = ['All Departments', 'Computer Science', 'Mathematics', 'Electrical Engineering'];
const GRAD_YEARS = ['All Years', '2012', '2015', '2018', '2020', '2022'];

const UPCOMING_MASTERCLASSES = [
  {
    id: 'mc-1',
    title: 'AI & Global Tech Leadership in 2026',
    speaker: 'Priya Nair \'18',
    role: 'Staff ML Engineer, Google',
    date: 'Aug 20, 2026',
    time: '5:00 PM GMT',
    registered: 142,
    tag: 'Webinar',
  },
  {
    id: 'mc-2',
    title: 'From Campus Founder to Series A Fintech',
    speaker: 'Marcus Webb \'15',
    role: 'Co-Founder & CEO, Lightbeam',
    date: 'Aug 26, 2026',
    time: '6:30 PM GMT',
    registered: 98,
    tag: 'Masterclass',
  },
];

const LEGACY_CAMPAIGNS = [
  {
    id: 'leg-1',
    title: 'STEM Lab High-Perf Computing & Laptop Grant',
    raised: 11400,
    target: 15000,
    donors: 38,
    category: 'Hardware & Labs',
    desc: 'Funding 25 high-performance laptops and server hardware for underprivileged final-year computing students.',
  },
  {
    id: 'leg-2',
    title: 'Need-Based Tuition Relief & Student Emergency Fund',
    raised: 19800,
    target: 25000,
    donors: 62,
    category: 'Scholarship',
    desc: 'Covering final semester clearance fees for 15 graduating students facing sudden financial hardship.',
  },
  {
    id: 'leg-3',
    title: 'Undergrad Renewable Energy & Clean Tech Fellowship',
    raised: 8500,
    target: 10000,
    donors: 29,
    category: 'Research',
    desc: 'Providing seed research grants and mentoring for innovative green campus engineering projects.',
  },
];

export default function AlumniHubScreen() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview Hub');
  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

 return (
 <ScreenContainer glow={true}>
 <AppHeader />

 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: spacing.lg, marginBottom: spacing.lg }}>
 <View>
 <AppText variant="h1"weight="bold">
 Alumni Hub 
 </AppText>
 <AppText tone="secondary">Welcome back, {user?.fullName?.split(' ')[0] ?? 'there'} </AppText>
 </View>
 {profile?.verificationStatus === 'verified' ? (
 <View
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 4,
 backgroundColor: '#FDF0DA',
 borderRadius: radius.pill,
 paddingHorizontal: spacing.sm,
 paddingVertical: 6,
 }}
 >
 <Ionicons name="checkmark-circle"size={16} color="#D97706" />
 <AppText variant="caption"weight="bold"style={{ color: '#D97706' }}>
 Verified Alumni
 </AppText>
 </View>
 ) : null}
 </View>

 <ScrollView
 horizontal
 showsHorizontalScrollIndicator={false}
 contentContainerStyle={{ flexDirection: 'row', gap: spacing.md, paddingBottom: 2 }}
 style={{ borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: spacing.md, maxHeight: 44 }}
 >
 {TABS.map((t) => {
 const selected = t === tab;
 return (
 <Pressable
 key={t}
 onPress={() => {
 haptics.light();
 setTab(t);
 }}
 accessibilityRole="tab"
 accessibilityState={{ selected }}
 accessibilityLabel={t}
 style={{ paddingBottom: spacing.xs, paddingHorizontal: 4 }}
 >
 <AppText
 variant="bodySmall"
 weight={selected ? 'bold' : 'medium'}
 style={{ color: selected ? colors.brandPrimary : colors.textSecondary }}
 >
 {t}
 </AppText>
 {selected ? (
 <View style={{ height: 2, backgroundColor: colors.brandPrimary, marginTop: spacing.xs, borderRadius: 1 }} />
 ) : null}
 </Pressable>
 );
 })}
 </ScrollView>

 {tab === 'Overview Hub' ? <OverviewHubTab /> : null}
 {tab === 'Member Search' ? <MemberSearchTab /> : null}
 {tab === 'Legacy & Giving' ? <LegacyGivingTab /> : null}
 </ScreenContainer>
 );
}

function OverviewHubTab() {
 const { colors, spacing, radius } = useTheme();
 const [registeredList, setRegisteredList] = useState<string[]>([]);

 const utilities = [
 {
 icon: 'chatbubbles-outline'as const,
 bg: colors.lavenderBg,
 iconColor: colors.lavenderText,
 title: 'Public Academic Forum',
 description: 'Answering student queries & posting career tips',
 onPress: () => router.push('/(alumni)/forum'),
 },
 {
 icon: 'briefcase-outline'as const,
 bg: colors.roseBg,
 iconColor: colors.roseText,
 title: 'External Job Board & Links',
 description: 'Access listings, post jobs, and share internships',
 onPress: () => router.push('/(alumni)/jobs'),
 },
 {
 icon: 'calendar-outline'as const,
 bg: colors.mintBg,
 iconColor: colors.mintText,
 title: 'Alumni Events & Reunions',
 description: 'Explore private masterclasses & networking calendars',
 onPress: () => router.push('/(alumni)/events'),
 },
 {
 icon: 'people-outline'as const,
 bg: colors.pastelPrimaryBg,
 iconColor: colors.brandPrimary,
 title: 'Mentorship Portal',
 description: 'Review student mentee applications and book 1-on-1 calls',
 onPress: () => router.push('/(alumni)/mentorship'),
 },
 ];

 function handleRegister(id: string, title: string) {
 haptics.medium();
 if (registeredList.includes(id)) {
 setRegisteredList((prev) => prev.filter((item) => item !== id));
 Alert.alert('Registration Cancelled', `You have unregistered from"${title}".`);
 } else {
 setRegisteredList((prev) => [...prev, id]);
 Alert.alert('Registered! ', `You are registered for"${title}". A calendar invitation and Zoom link will be sent to your email.`);
 }
 }

 return (
 <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 130 }}>
 {/* Live Masterclasses & Webinars Spotlight */}
 <View style={{ marginBottom: spacing.lg }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
 <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1 }}>
 UPCOMING ALUMNI WEBINARS 
 </AppText>
 <Badge label="Live Panels"tone="accent" />
 </View>

 {UPCOMING_MASTERCLASSES.map((mc) => {
 const isRegistered = registeredList.includes(mc.id);
 return (
 <SolidCard key={mc.id} radius={20} style={{ marginBottom: spacing.sm }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
 <Badge label={mc.tag} tone="brand" />
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
 <Ionicons name="time-outline"size={14} color={colors.textSecondary} />
 <AppText tone="secondary"variant="caption">
 {mc.date} • {mc.time}
 </AppText>
 </View>
 </View>

 <AppText variant="h3"weight="bold"style={{ marginVertical: 4 }}>
 {mc.title}
 </AppText>

 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.xs }}>
 <Avatar name={mc.speaker} size={32} role="alumni" />
 <View>
 <AppText weight="bold"variant="caption">
 {mc.speaker}
 </AppText>
 <AppText tone="secondary"variant="caption"style={{ fontSize: 11 }}>
 {mc.role}
 </AppText>
 </View>
 </View>

 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.divider }}>
 <AppText tone="secondary"variant="caption">
 {mc.registered + (isRegistered ? 1 : 0)} attending
 </AppText>
 <AppButton
 label={isRegistered ? 'Registered ✓' : 'Register Free'}
 variant={isRegistered ? 'secondary' : 'primary'}
 onPress={() => handleRegister(mc.id, mc.title)}
 />
 </View>
 </SolidCard>
 );
 })}
 </View>

 <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
 ALUMNI QUICK UTILITIES 
 </AppText>
 {utilities.map((u) => (
 <Pressable
 key={u.title}
 onPress={u.onPress}
 accessibilityRole="button"accessibilityLabel={`${u.title}. ${u.description}`}
 >
 <SolidCard radius={18} style={{ marginBottom: spacing.sm }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
 <View
 style={{
 width: 44,
 height: 44,
 borderRadius: 22,
 backgroundColor: u.bg,
 alignItems: 'center',
 justifyContent: 'center',
 }}
 >
 <Ionicons name={u.icon} size={20} color={u.iconColor} />
 </View>
 <View style={{ flex: 1 }}>
 <AppText weight="bold"variant="bodySmall">
 {u.title}
 </AppText>
 <AppText tone="secondary"variant="caption">
 {u.description}
 </AppText>
 </View>
 <Ionicons name="chevron-forward"size={18} color={colors.textSecondary} />
 </View>
 </SolidCard>
 </Pressable>
 ))}
 </ScrollView>
 );
}

function MemberSearchTab() {
 const { spacing } = useTheme();
 const [query, setQuery] = useState('');
 const debouncedQuery = useDebouncedValue(query);
 const [department, setDepartment] = useState('All Departments');
 const [gradYear, setGradYear] = useState('All Years');

 const { data: members } = useQuery({
 queryKey: ['directory', 'alumni-hub', debouncedQuery, department, gradYear],
 queryFn: () =>
 searchAlumniDirectory({
 q: debouncedQuery || undefined,
 department: department === 'All Departments' ? undefined : department,
 graduationYear: gradYear === 'All Years' ? undefined : Number(gradYear),
 }),
 });

 return (
 <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 130 }}>
 <AppTextField
 label=""placeholder="Search alumni by name, company, industry..."value={query}
 onChangeText={setQuery}
 />
 <View style={{ marginBottom: spacing.md }}>
 <ChipSelect options={DEPARTMENTS} selected={[department]} onToggle={setDepartment} />
 </View>
 <View style={{ marginBottom: spacing.lg }}>
 <ChipSelect options={GRAD_YEARS} selected={[gradYear]} onToggle={setGradYear} />
 </View>

 {members?.map((m) => (
 <MemberRow
 key={m.id}
 id={m.id}
 name={m.fullName}
 username={m.id}
 department={m.department}
 gradYear={m.graduationYear}
 />
 ))}
 </ScrollView>
 );
}

function MemberRow({
 id,
 name,
 username,
 department,
 gradYear,
}: {
 id: string;
 name: string;
 username: string;
 department?: string | null;
 gradYear?: number | null;
}) {
 const { spacing } = useTheme();
 const [connected, setConnected] = useState(false);

 async function handleConnect() {
 haptics.light();
 setConnected(true);
 try {
 const { sendConnectionRequest } = await import('@/api/connections');
 await sendConnectionRequest(id);
 } catch {}
 Alert.alert('Connection Sent', `Invitation sent to ${name}.`);
 }

 return (
 <SolidCard radius={18} style={{ marginBottom: spacing.sm }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}>
 <Avatar name={name} size={42} role="alumni" />
 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
 <AppText weight="bold" variant="bodySmall">
 {name}
 </AppText>
 <UserTypeBadge role="alumni" />
 </View>
 <AppText tone="secondary" variant="caption">
 @{username}
 </AppText>
 <AppText tone="secondary" variant="caption">
 {department ?? 'General'} {'\u00b7'} Class of {gradYear ?? '\u2014'}
 </AppText>
 </View>
 </View>
 <AppButton
 label={connected ? 'Connected ✓' : '+ Connect'}
 variant={connected ? 'secondary' : 'primary'}
 onPress={handleConnect}
 disabled={connected}
 />
 </View>
 </SolidCard>
 );
}

function LegacyGivingTab() {
 const { colors, spacing, radius } = useTheme();
 const [pledgeModalCampaign, setPledgeModalCampaign] = useState<(typeof LEGACY_CAMPAIGNS)[0] | null>(null);
 const [pledgeAmount, setPledgeAmount] = useState('100');
 const [pledgeNote, setPledgeNote] = useState('');
 const [pledgedList, setPledgedList] = useState<string[]>([]);

 function handleConfirmPledge() {
 if (!pledgeModalCampaign) return;
 haptics.medium();
 setPledgedList((prev) => [...prev, pledgeModalCampaign.id]);
 const campaignTitle = pledgeModalCampaign.title;
 setPledgeModalCampaign(null);
 setPledgeNote('');
 Alert.alert(
 'Pledge Confirmed! ',
 `Thank you for your generous pledge of $${pledgeAmount} towards"${campaignTitle}". You have unlocked the"Legacy Sponsor 2026"badge on your alumni profile!`,
 );
 }

 return (
 <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 130 }}>
 <SolidCard radius={20} backgroundColor={colors.pastelPrimaryBg} style={{ marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.brandPrimary }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
 <Ionicons name="trophy"size={24} color={colors.brandPrimary} />
 <AppText variant="h3"weight="bold"tone="brand">
 Alumni Giving & Legacy Fund 
 </AppText>
 </View>
 <AppText tone="primary"variant="bodySmall"style={{ lineHeight: 20 }}>
 Your alumni contributions empower current students through direct hardware grants, tuition relief, and research fellowships. All pledges earn verified Legacy Sponsor status.
 </AppText>
 </SolidCard>

 <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
 ACTIVE ENDOWMENT INITIATIVES 
 </AppText>

 {LEGACY_CAMPAIGNS.map((c) => {
 const isPledged = pledgedList.includes(c.id);
 const percent = Math.min(100, Math.round((c.raised / c.target) * 100));
 return (
 <SolidCard key={c.id} radius={20} style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs }}>
 <Badge label={c.category} tone="accent" />
 <AppText variant="caption"weight="bold"tone="brand">
 {percent}% funded
 </AppText>
 </View>

 <AppText variant="h3"weight="bold"style={{ marginVertical: 4 }}>
 {c.title}
 </AppText>
 <AppText tone="secondary"variant="bodySmall"style={{ lineHeight: 18, marginBottom: spacing.sm }}>
 {c.desc}
 </AppText>

 {/* Funding Progress Bar */}
 <View style={{ width: '100%', height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginBottom: spacing.xs }}>
 <View style={{ width: `${percent}%`, height: '100%', backgroundColor: colors.brandPrimary, borderRadius: 4 }} />
 </View>

 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
 <AppText variant="caption"weight="bold">
 ${c.raised.toLocaleString()} <AppText tone="secondary"variant="caption">raised of ${c.target.toLocaleString()}</AppText>
 </AppText>
 <AppText tone="secondary"variant="caption">
 {c.donors + (isPledged ? 1 : 0)} alumni donors
 </AppText>
 </View>

 <AppButton
 label={isPledged ? 'Pledged $100 ✓ (Sponsor Badge Earned)' : 'Pledge / Donate '}
 variant={isPledged ? 'secondary' : 'primary'}
 onPress={() => setPledgeModalCampaign(c)}
 fullWidth
 />
 </SolidCard>
 );
 })}

 {/* Pledge / Donation Interactive Modal */}
 <Modal visible={!!pledgeModalCampaign} transparent animationType="slide"onRequestClose={() => setPledgeModalCampaign(null)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
 <Pressable style={{ flex: 1 }} onPress={() => setPledgeModalCampaign(null)} />
 <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg }}>
 <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
 <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
 </View>

 <AppText variant="h2"weight="bold"style={{ marginBottom: 4 }}>
 Pledge to Student Legacy 
 </AppText>
 <AppText tone="secondary"variant="bodySmall"numberOfLines={1} style={{ marginBottom: spacing.md }}>
 {pledgeModalCampaign?.title}
 </AppText>

 <AppText variant="caption"weight="bold"tone="brand"style={{ marginBottom: spacing.xs }}>
 SELECT PLEDGE AMOUNT ($ USD)
 </AppText>
 <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
 {['25', '50', '100', '250', '500'].map((amt) => {
 const isSelected = pledgeAmount === amt;
 return (
 <Pressable
 key={amt}
 onPress={() => setPledgeAmount(amt)}
 style={{
 flex: 1,
 paddingVertical: 10,
 borderRadius: radius.md,
 backgroundColor: isSelected ? colors.brandPrimary : colors.surface,
 alignItems: 'center',
 borderWidth: 1,
 borderColor: isSelected ? colors.brandPrimary : colors.border,
 }}
 >
 <AppText weight="bold"tone={isSelected ? 'inverse' : 'primary'}>
 ${amt}
 </AppText>
 </Pressable>
 );
 })}
 </View>

 <AppTextField
 label="Legacy Note / Encouragement (Optional)"placeholder="e.g. Keep pushing forward! From Class of'18"value={pledgeNote}
 onChangeText={setPledgeNote}
 />

 <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
 <View style={{ flex: 1 }}>
 <AppButton label="Cancel"variant="ghost"onPress={() => setPledgeModalCampaign(null)} fullWidth />
 </View>
 <View style={{ flex: 2 }}>
 <AppButton label={`Confirm $${pledgeAmount} Pledge`} onPress={handleConfirmPledge} fullWidth />
 </View>
 </View>
 </View>
 </View>
 </Modal>
 </ScrollView>
 );
}
