import React, { useState } from 'react';
import { View, Pressable, Modal, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { listAnnouncements } from '@/api/announcements';
import { Announcement } from '@/api/types';

const PRIORITY_TONE = {
 normal: 'neutral',
 high: 'warning',
 critical: 'critical',
} as const;

export function AnnouncementsWidget({
 scope,
 compact = false,
}: {
 scope?: 'student' | 'alumni' | 'staff' | 'global';
 compact?: boolean;
}) {
 const { colors, spacing, radius } = useTheme();
 const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
 const [dismissedIds, setDismissedIds] = useState<string[]>([]);

 const { data: announcements, isLoading } = useQuery({
 queryKey: ['announcements'],
 queryFn: listAnnouncements,
 });

 if (isLoading || !announcements || announcements.length === 0) {
 return null;
 }

 // Filter announcements for current audience scope and active expiration
 const activeAnnouncements = announcements
 .filter((a) => !dismissedIds.includes(a.id))
 .filter((a) => {
 if (!scope || scope === 'global') return true;
 return a.audienceScope === 'global' || a.audienceScope === scope;
 })
 .filter((a) => {
 if (!a.expiresAt) return true;
 return new Date(a.expiresAt).getTime() > Date.now();
 });

 if (activeAnnouncements.length === 0) {
 return null;
 }

 const critical = activeAnnouncements.find((a) => a.priority === 'critical');
 const displayItems = critical ? [critical, ...activeAnnouncements.filter((a) => a.id !== critical.id)] : activeAnnouncements;
 const topAnnouncement = displayItems[0];

 if (compact) {
 return (
 <View style={{ marginBottom: spacing.md }}>
 <Pressable
 onPress={() => setSelectedAnnouncement(topAnnouncement)}
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 backgroundColor: topAnnouncement.priority === 'critical' ? '#FEE2E2' : colors.surface,
 paddingHorizontal: spacing.md,
 paddingVertical: spacing.sm,
 borderRadius: radius.md,
 borderLeftWidth: 4,
 borderLeftColor: topAnnouncement.priority === 'critical' ? '#DC2626' : colors.brandPrimary,
 gap: spacing.sm,
 }}
 >
 <Ionicons
 name={topAnnouncement.priority === 'critical' ? 'alert-circle' : 'megaphone'}
 size={18}
 color={topAnnouncement.priority === 'critical' ? '#DC2626' : colors.brandPrimary}
 />
 <View style={{ flex: 1 }}>
 <AppText
 variant="caption"
 weight="bold"
 style={{ color: topAnnouncement.priority === 'critical' ? '#991B1B' : colors.textPrimary }}
 numberOfLines={1}
 >
 {topAnnouncement.title}
 </AppText>
 <AppText
 variant="caption"
 tone="secondary"
 numberOfLines={1}
 style={{ fontSize: 11 }}
 >
 {topAnnouncement.content}
 </AppText>
 </View>
 <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
 </Pressable>

 {/* Full Details Modal */}
 <Modal
 visible={!!selectedAnnouncement}
 transparent
 animationType="fade"
 onRequestClose={() => setSelectedAnnouncement(null)}
 >
 <View
 style={{
 flex: 1,
 backgroundColor: 'rgba(0,0,0,0.5)',
 justifyContent: 'center',
 alignItems: 'center',
 padding: spacing.lg,
 }}
 >
 <SolidCard radius={20} style={{ width: '100%', maxWidth: 440, padding: spacing.lg }}>
 {selectedAnnouncement && (
 <>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
 <Badge
 label={selectedAnnouncement.priority.toUpperCase()}
 tone={PRIORITY_TONE[selectedAnnouncement.priority]}
 />
 <Pressable onPress={() => setSelectedAnnouncement(null)}>
 <Ionicons name="close" size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 <AppText variant="h2" weight="bold" style={{ marginBottom: spacing.xs }}>
 {selectedAnnouncement.title}
 </AppText>

 <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.md }}>
 Posted by {selectedAnnouncement.authorName} • {new Date(selectedAnnouncement.publishedAt).toLocaleDateString()}
 </AppText>

 <ScrollView style={{ flex: 1, width: '100%',  maxHeight: 250, marginBottom: spacing.lg }}>
 <AppText variant="bodySmall" style={{ lineHeight: 22 }}>
 {selectedAnnouncement.content}
 </AppText>
 </ScrollView>

 <AppButton
 label="Dismiss"
 variant="primary"
 onPress={() => setSelectedAnnouncement(null)}
 />
 </>
 )}
 </SolidCard>
 </View>
 </Modal>
 </View>
 );
 }

 return (
 <View style={{ marginBottom: spacing.lg }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
 <Ionicons name="megaphone" size={18} color={colors.brandPrimary} />
 <AppText variant="h3" weight="bold">
 Campus Announcements
 </AppText>
 </View>
 <Badge label={`${activeAnnouncements.length} New`} tone="brand" />
 </View>

 <View style={{ gap: spacing.sm }}>
 {activeAnnouncements.slice(0, 3).map((item) => (
 <SolidCard key={item.id} radius={16}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
 <Badge label={item.priority.toUpperCase()} tone={PRIORITY_TONE[item.priority]} />
 <Pressable
 onPress={() => setDismissedIds((prev) => [...prev, item.id])}
 hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
 >
 <Ionicons name="close" size={16} color={colors.textSecondary} />
 </Pressable>
 </View>

 <AppText variant="bodySmall" weight="bold" style={{ marginTop: 4, marginBottom: 2 }}>
 {item.title}
 </AppText>

 <AppText variant="caption" tone="secondary" numberOfLines={2} style={{ marginBottom: spacing.xs }}>
 {item.content}
 </AppText>

 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
 <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
 {item.authorName} • {new Date(item.publishedAt).toLocaleDateString()}
 </AppText>
 <Pressable onPress={() => setSelectedAnnouncement(item)}>
 <AppText variant="caption" weight="bold" tone="brand">
 Read More →
 </AppText>
 </Pressable>
 </View>
 </SolidCard>
 ))}
 </View>

 {/* Full Details Modal */}
 <Modal
 visible={!!selectedAnnouncement}
 transparent
 animationType="fade"
 onRequestClose={() => setSelectedAnnouncement(null)}
 >
 <View
 style={{
 flex: 1,
 backgroundColor: 'rgba(0,0,0,0.5)',
 justifyContent: 'center',
 alignItems: 'center',
 padding: spacing.lg,
 }}
 >
 <SolidCard radius={20} style={{ width: '100%', maxWidth: 440, padding: spacing.lg }}>
 {selectedAnnouncement && (
 <>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
 <Badge
 label={selectedAnnouncement.priority.toUpperCase()}
 tone={PRIORITY_TONE[selectedAnnouncement.priority]}
 />
 <Pressable onPress={() => setSelectedAnnouncement(null)}>
 <Ionicons name="close" size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 <AppText variant="h2" weight="bold" style={{ marginBottom: spacing.xs }}>
 {selectedAnnouncement.title}
 </AppText>

 <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.md }}>
 Posted by {selectedAnnouncement.authorName} • {new Date(selectedAnnouncement.publishedAt).toLocaleDateString()}
 </AppText>

 <ScrollView style={{ flex: 1, width: '100%',  maxHeight: 250, marginBottom: spacing.lg }}>
 <AppText variant="bodySmall" style={{ lineHeight: 22 }}>
 {selectedAnnouncement.content}
 </AppText>
 </ScrollView>

 <AppButton
 label="Close"
 variant="primary"
 onPress={() => setSelectedAnnouncement(null)}
 />
 </>
 )}
 </SolidCard>
 </View>
 </Modal>
 </View>
 );
}
