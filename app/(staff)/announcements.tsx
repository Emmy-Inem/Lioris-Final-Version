import React, { useState } from'react';
import { Pressable, ScrollView, View } from'react-native';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { AppButton } from'@/components/AppButton';
import { AnnouncementCard } from'@/components/AnnouncementCard';
import { SolidCard } from'@/components/SolidCard';
import { useTheme } from'@/theme/ThemeProvider';
import { listAnnouncements, publishAnnouncement, PublishAnnouncementPayload } from'@/api/announcements';
import { haptics } from'@/utils/haptics';

const AUDIENCES: PublishAnnouncementPayload['audienceScope'][] = ['student', 'alumni', 'staff', 'global'];
const PRIORITIES: PublishAnnouncementPayload['priority'][] = ['normal', 'high', 'critical'];

export default function StaffAnnouncementsScreen() {
 const { colors, spacing, radius } = useTheme();
 const queryClient = useQueryClient();
 const [composing, setComposing] = useState(false);
 const [title, setTitle] = useState('');
 const [content, setContent] = useState('');
 const [audience, setAudience] = useState<PublishAnnouncementPayload['audienceScope']>('student');
 const [priority, setPriority] = useState<PublishAnnouncementPayload['priority']>('normal');
 const [submitting, setSubmitting] = useState(false);

 const { data: announcements, isLoading } = useQuery({ queryKey: ['announcements'], queryFn: listAnnouncements });

 async function handlePublish() {
 haptics.medium();
 setSubmitting(true);
 try {
 await publishAnnouncement({ title, content, audienceScope: audience, priority });
 queryClient.invalidateQueries({ queryKey: ['announcements'] });
 queryClient.invalidateQueries({ queryKey: ['notifications'] });
 setTitle('');
 setContent('');
 setComposing(false);
 } finally {
 setSubmitting(false);
 }
 }

 return (
 <ScreenContainer glow={false}>
 <AppHeader />
 <ScrollView showsVerticalScrollIndicator={true}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.lg }}>
 <AppText variant="h1"weight="bold">
 Announcements
 </AppText>
 <AppButton label={composing ? 'Cancel' : 'New'} variant={composing ? 'ghost' : 'primary'} onPress={() => setComposing((v) => !v)} />
 </View>

 {composing ? (
 <SolidCard style={{ marginBottom: spacing.lg }}>
 <AppTextField label="Title"value={title} onChangeText={setTitle} placeholder="Midterm Advising Week" />
 <AppTextField
 label="Content"value={content}
 onChangeText={setContent}
 placeholder="Details for your audience..."multiline
 numberOfLines={4}
 />

 <AppText variant="bodySmall"weight="medium"tone="secondary"style={{ marginBottom: spacing.sm }}>
 Audience
 </AppText>
 <ChipRow options={AUDIENCES} selected={audience} onSelect={setAudience} />

 <AppText variant="bodySmall"weight="medium"tone="secondary"style={{ marginVertical: spacing.sm }}>
 Priority
 </AppText>
 <ChipRow options={PRIORITIES} selected={priority} onSelect={setPriority} />

 <View style={{ marginTop: spacing.lg }}>
 <AppButton
 label="Publish"onPress={handlePublish}
 loading={submitting}
 disabled={!title || !content}
 fullWidth
 />
 </View>
 </SolidCard>
 ) : null}

 {announcements?.map((a) => (
 <AnnouncementCard key={a.id} announcement={a} />
 ))}
 </ScrollView>
 </ScreenContainer>
 );
}

function ChipRow<T extends string>({
 options,
 selected,
 onSelect,
}: {
 options: T[];
 selected: T;
 onSelect: (value: T) => void;
}) {
 const { colors, radius, spacing } = useTheme();
 return (
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
 {options.map((option) => {
 const isSelected = option === selected;
 return (
 <Pressable
 key={option}
 onPress={() => onSelect(option)}
 accessibilityRole="radio"accessibilityState={{ checked: isSelected }}
 accessibilityLabel={option}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: spacing.sm,
 borderRadius: radius.pill,
 borderWidth: 1.5,
 borderColor: isSelected ? colors.brandPrimary : colors.border,
 backgroundColor: isSelected ? `${colors.brandPrimary}18` : 'transparent',
 }}
 >
 <AppText variant="bodySmall"weight="semiBold"tone={isSelected ? 'brand' : 'secondary'}>
 {option}
 </AppText>
 </Pressable>
 );
 })}
 </View>
 );
}
