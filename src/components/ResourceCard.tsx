import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { Resource } from '@/api/types';
import { trackResourceDownload, toggleResourceUpvote } from '@/api/resources';
import { haptics } from '@/utils/haptics';

export function ResourceCard({ resource }: { resource: Resource }) {
 const { colors, spacing, radius } = useTheme();
 const [downloading, setDownloading] = useState(false);
 const [downloaded, setDownloaded] = useState(false);
 const [upvoted, setUpvoted] = useState(false);
 const [upvotes, setUpvotes] = useState(resource.likesCount);

 async function handleDownload() {
 haptics.light();
 setDownloading(true);
 try {
 if (resource.fileUrl) {
 if (Platform.OS === 'web' && typeof window !== 'undefined') {
 window.open(resource.fileUrl, '_blank');
 } else {
 await Linking.openURL(resource.fileUrl);
 }
 setDownloaded(true);
 trackResourceDownload(resource.id).catch(() => {});
 } else {
 Alert.alert(
 'Sample Curriculum Reference',
 `"${resource.title}" is a seeded reference placeholder. You can upload and download real course materials directly via the "+ Share Study Material" button.`,
 );
 }
 } catch {
 if (resource.fileUrl) {
 Linking.openURL(resource.fileUrl).catch(() => {});
 }
 } finally {
 setDownloading(false);
 }
 }

 function handleToggleUpvote() {
 haptics.light();
 const nextUpvoted = !upvoted;
 setUpvoted(nextUpvoted);
 setUpvotes(upvotes + (nextUpvoted ? 1 : -1));
 toggleResourceUpvote(resource.id, nextUpvoted).catch(() => {});
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
 <Ionicons
 name={resource.category === 'Past Questions' ? 'help-circle-outline' : 'document-text-outline'}
 size={22}
 color={colors.brandPrimary}
 />
 </View>
 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
 <Badge label={resource.category} tone="brand" />
 <AppText tone="secondary" variant="caption">
 {resource.fileSize}
 </AppText>
 </View>
 <AppText weight="bold" variant="bodySmall" style={{ marginTop: 2 }}>
 {resource.title}
 </AppText>
 <AppText tone="secondary" variant="caption">
 {resource.courseCode} • {resource.department}
 </AppText>
 </View>
 </View>

 <AppText tone="secondary" variant="bodySmall" style={{ marginTop: spacing.sm, lineHeight: 18 }}>
 {resource.description}
 </AppText>

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
 <View style={{ flexDirection: 'row', gap: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
 <Ionicons name="download-outline" size={14} color={colors.textSecondary} />
 <AppText tone="secondary" variant="caption">
 {resource.downloadsCount + (downloaded ? 1 : 0)}
 </AppText>
 </View>
 <Pressable onPress={handleToggleUpvote} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
 <Ionicons
 name={upvoted ? 'thumbs-up' : 'thumbs-up-outline'}
 size={14}
 color={upvoted ? colors.brandPrimary : colors.textSecondary}
 />
 <AppText tone={upvoted ? 'brand' : 'secondary'} variant="caption" weight={upvoted ? 'bold' : 'regular'}>
 {upvotes}
 </AppText>
 </Pressable>
 </View>

 <AppButton
 label={downloaded ? 'Saved' : resource.fileUrl ? 'Download' : 'Info'}
 variant={downloaded ? 'secondary' : resource.fileUrl ? 'primary' : 'ghost'}
 onPress={handleDownload}
 loading={downloading}
 />
 </View>
 </SolidCard>
 );
}
