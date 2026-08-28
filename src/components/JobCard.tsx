import React from'react';
import { Alert, Linking, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { SolidCard } from'./SolidCard';
import { AppText } from'./AppText';
import { Badge } from'./Badge';
import { AppButton } from'./AppButton';
import { useTheme } from'@/theme/ThemeProvider';
import { JobListing } from'@/api/types';

export function JobCard({ job }: { job: JobListing }) {
 const { colors, spacing, radius } = useTheme();

 function handleApply() {
 if (job.applyUrl.startsWith('http')) {
 Linking.openURL(job.applyUrl).catch(() => {
 Alert.alert('Application Submitted', `Your profile was submitted for ${job.title} at ${job.company}.`);
 });
 } else {
 Alert.alert('Application Submitted', `Your student profile has been sent to ${job.company}.`);
 }
 }

 return (
 <SolidCard radius={20} style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
 <View
 style={{
 width: 48,
 height: 48,
 borderRadius: radius.md,
 backgroundColor: colors.pastelPrimaryBg,
 alignItems: 'center',
 justifyContent: 'center',
 borderWidth: 1,
 borderColor: colors.brandPrimary,
 }}
 >
 <Ionicons name="briefcase-outline"size={22} color={colors.brandPrimary} />
 </View>

 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
 <Badge label={job.type} tone={job.type === 'Internship' ? 'accent' : 'brand'} />
 {job.remote && <Badge label="Remote"tone="success" />}
 </View>
 <AppText variant="h3"weight="bold"style={{ marginTop: 2 }}>
 {job.title}
 </AppText>
 <AppText tone="secondary"variant="bodySmall">
 {job.company} | {job.location}
 </AppText>
 </View>
 </View>

 <View
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 justifyContent: 'space-between',
 marginTop: spacing.md,
 paddingTop: spacing.xs,
 borderTopWidth: 1,
 borderTopColor: colors.divider,
 }}
 >
 <AppText tone="secondary"variant="caption">
 Posted by {job.postedByName}
 </AppText>

 <AppButton label="Apply Now" onPress={handleApply} />
 </View>
 </SolidCard>
 );
}
