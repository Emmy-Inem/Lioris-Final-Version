import React, { useState } from 'react';
import { View, Pressable, Modal, ScrollView, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { GlassCard } from './GlassCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
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
 title = 'Campus Announcements',
 action,
 showWhenEmpty = false,
 emptyMessage = 'No bulletins posted yet. New notices will appear here.',
}: {
 scope?: 'student' | 'alumni' | 'staff' | 'global';
 compact?: boolean;
 /** Header text. Callers that want their own wording (e.g. staff's "Campus Bulletins") pass it here rather than rendering a second header above the widget. */
 title?: string;
 /** Optional control rendered at the right of the header, e.g. staff's "+ New Notice". */
 action?: React.ReactNode;
 /** Render the header and an empty-state card when there's nothing to show, instead of collapsing to null. */
 showWhenEmpty?: boolean;
 emptyMessage?: string;
}) {
 const { colors, spacing, radius, isDark } = useTheme();
 const { isDesktop } = useResponsive();
 const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
 const [dismissedIds, setDismissedIds] = useState<string[]>([]);

 const { data: announcements, isLoading } = useQuery({
 queryKey: ['announcements'],
 queryFn: listAnnouncements,
 });

 // Filter announcements for current audience scope and active expiration
 const activeAnnouncements = (announcements ?? [])
 .filter((a) => !dismissedIds.includes(a.id))
 .filter((a) => {
 if (!scope || scope === 'global') return true;
 return a.audienceScope === 'global' || a.audienceScope === scope;
 })
 .filter((a) => {
 if (!a.expiresAt) return true;
 return new Date(a.expiresAt).getTime() > Date.now();
 });

 if (isLoading || activeAnnouncements.length === 0) {
 // Callers that own a section header (and its action) need the widget to
 // keep rendering when empty - otherwise the header is left dangling
 // above nothing, which is what the staff dashboard used to show.
 if (!showWhenEmpty || compact || isLoading) {
 return null;
 }

 return (
 <View style={{ marginBottom: spacing.lg }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
 <Ionicons name="megaphone" size={16} color={colors.brandPrimary} style={{ flexShrink: 0 }} />
 <AppText
 weight="bold"
 numberOfLines={1}
 style={{ flex: 1, fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2 }}
 >
 {title}
 </AppText>
 </View>
 {action}
 </View>
 <SolidCard radius={16} style={{ padding: spacing.lg, alignItems: 'center' }}>
 <Ionicons name="megaphone-outline" size={32} color={colors.textSecondary} style={{ marginBottom: 8 }} />
 <AppText tone="secondary" variant="caption" style={{ textAlign: 'center' }}>
 {emptyMessage}
 </AppText>
 </SolidCard>
 </View>
 );
 }

 const critical = activeAnnouncements.find((a) => a.priority === 'critical');
 const displayItems = critical ? [critical, ...activeAnnouncements.filter((a) => a.id !== critical.id)] : activeAnnouncements;
 const topAnnouncement = displayItems[0];

  if (compact) {
    return (
      <View style={{ marginBottom: spacing.md }}>
        <Pressable
          onPress={() => setSelectedAnnouncement(topAnnouncement)}
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: topAnnouncement.priority === 'critical'
                ? (isDark ? 'rgba(239, 68, 68, 0.20)' : 'rgba(254, 226, 226, 0.85)')
                : (isDark ? 'rgba(15, 23, 42, 0.60)' : 'rgba(255, 255, 255, 0.70)'),
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: topAnnouncement.priority === 'critical'
                ? (isDark ? 'rgba(239, 68, 68, 0.40)' : 'rgba(239, 68, 68, 0.30)')
                : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.80)'),
              borderLeftWidth: 4,
              borderLeftColor: topAnnouncement.priority === 'critical' ? '#DC2626' : colors.brandPrimary,
              gap: spacing.sm,
            },
            Platform.OS === 'web' &&
              ({
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                boxShadow: isDark
                  ? 'inset 0 1px 1px rgba(255, 255, 255, 0.12), 0 4px 12px rgba(0,0,0,0.30)'
                  : 'inset 0 1px 1px #fff, 0 4px 12px rgba(0,0,0,0.06)',
              } as any),
          ]}
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
            <GlassCard radius={20} style={{ width: '100%', maxWidth: 440 }}>
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

                  <ScrollView style={{ flex: 1, width: '100%', maxHeight: 250, marginBottom: spacing.lg }} showsVerticalScrollIndicator={false}>
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
            </GlassCard>
          </View>
        </Modal>
      </View>
    );
  }

 return (
 <View style={{ marginBottom: spacing.lg }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: spacing.sm }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
 <Ionicons name="megaphone" size={16} color={colors.brandPrimary} style={{ flexShrink: 0 }} />
 <AppText
 weight="bold"
 numberOfLines={1}
 style={{ flex: 1, fontSize: isDesktop ? 18 : 15, lineHeight: isDesktop ? 24 : 20, letterSpacing: -0.2 }}
 >
 {title}
 </AppText>
 </View>
 <View style={{ flexShrink: 0 }}>
 {action ?? <Badge label={`${activeAnnouncements.length} New`} tone="brand" />}
 </View>
 </View>

 <View style={{ gap: spacing.sm }}>
 {activeAnnouncements.slice(0, 3).map((item) => (
 <GlassCard key={item.id} radius={16}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
 <Badge label={item.priority.toUpperCase()} tone={PRIORITY_TONE[item.priority]} />
 <Pressable
 onPress={() => setDismissedIds((prev) => [...prev, item.id])}
 hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
 >
 <Ionicons name="close" size={16} color={colors.textSecondary} />
 </Pressable>
 </View>

 <AppText variant="bodySmall" weight="bold" numberOfLines={2} style={{ marginTop: 4, marginBottom: 2 }}>
 {item.title}
 </AppText>

 <AppText variant="caption" tone="secondary" numberOfLines={2} style={{ marginBottom: spacing.xs }}>
 {item.content}
 </AppText>

 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
 <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 11, flex: 1, minWidth: 0, paddingRight: 8 }}>
 {item.authorName} • {new Date(item.publishedAt).toLocaleDateString()}
 </AppText>
 <Pressable onPress={() => setSelectedAnnouncement(item)} style={{ flexShrink: 0 }}>
 <AppText variant="caption" weight="bold" tone="brand">
 Read More →
 </AppText>
 </Pressable>
 </View>
 </GlassCard>
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

 <ScrollView style={{ flex: 1, width: '100%',  maxHeight: 250, marginBottom: spacing.lg }} showsVerticalScrollIndicator={false}>
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
