import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { SolidCard } from '@/components/SolidCard';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { ManagePortalLinksModal } from '@/components/admin/ManagePortalLinksModal';
import { LiquidGlassCustomizerModal } from '@/components/admin/LiquidGlassCustomizerModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { listCampuses } from '@/api/institutions';
import { createNotification } from '@/api/notifications';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';

/**
 * Platform > Console: the things an admin does to the whole platform day to day.
 * Broadcasts, the university portal shortcuts shown to members, and the look of the glass UI.
 * (Feature switches, campuses and health each have their own tab; content, people and reports
 * live in their own groups - none of it is repeated here.)
 */
export default function PlatformConsoleScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();

  const [portalLinksOpen, setPortalLinksOpen] = useState(false);
  const [glassStudioOpen, setGlassStudioOpen] = useState(false);

  const [audience, setAudience] = useState<string>('ALL');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const { data: campuses = [] } = useQuery({ queryKey: ['campuses'], queryFn: listCampuses });
  const audienceOptions = [
    { key: 'ALL', label: 'Everyone' },
    ...campuses.filter((c) => c.code !== 'GLOBAL' && c.isActive !== false).map((c) => ({ key: c.code, label: c.shortName || c.code })),
  ];
  const audienceLabel = audienceOptions.find((o) => o.key === audience)?.label ?? 'Everyone';

  function confirmSend() {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Missing details', 'Add a headline and a message before sending.');
      return;
    }
    Alert.alert(
      'Send this alert?',
      `"${title.trim()}" goes to ${audience === 'ALL' ? 'every member' : `everyone at ${audienceLabel}`} straight away. It cannot be recalled.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', style: 'destructive', onPress: () => void send() },
      ],
    );
  }

  async function send() {
    setSending(true);
    haptics.medium();
    try {
      await createNotification({
        type: 'announcement',
        title: title.trim(),
        body: body.trim(),
        deepLinkPath: '/dashboard',
        campusCode: audience,
      });
      await recordAuditLogEntry({
        action: 'global_push_broadcast',
        summary: `Broadcast sent: "${title.trim()}" to ${audience === 'ALL' ? 'all campuses' : audienceLabel}`,
        targetType: 'platform_config',
        targetId: 'broadcast',
        reason: `Audience: ${audienceLabel}`,
      });
      haptics.success();
      setTitle('');
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      Alert.alert('Alert sent', `Delivered to ${audience === 'ALL' ? 'all members' : `members at ${audienceLabel}`}.`);
    } catch (err: any) {
      haptics.error();
      Alert.alert('Could not send', err?.message || 'Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: isDesktop ? 4 : 8 }}>
        <AdminSectionTabs group="platform" />
      </View>
      <ScrollView
        style={{ flex: 1, width: '100%', minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150, gap: spacing.lg }}
      >
        <View>
          <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold">
            Platform Console
          </AppText>
          <AppText tone="secondary" variant="caption">
            Broadcasts, university portal links and the look of the app
          </AppText>
        </View>

        {/* Broadcast */}
        <SolidCard radius={20} style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Ionicons name="megaphone-outline" size={20} color={colors.critical} />
            <AppText variant="h3" weight="bold">Broadcast an alert</AppText>
          </View>
          <AppText tone="secondary" variant="bodySmall">
            Sends a notification to every member of the audience you pick, and shows in their Alerts.
          </AppText>

          <AppText variant="caption" weight="bold" tone="secondary" style={{ letterSpacing: 0.8 }}>
            AUDIENCE
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {audienceOptions.map((option) => {
              const selected = audience === option.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setAudience(option.key)}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: selected ? colors.brandPrimary : colors.border,
                    backgroundColor: selected ? colors.pastelPrimaryBg : colors.surface,
                  }}
                >
                  <AppText variant="caption" weight="bold" tone={selected ? 'brand' : 'secondary'}>
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <AppTextField label="Headline" value={title} onChangeText={setTitle} placeholder="e.g. Senate exam timetable revised" />
          <AppTextField
            label="Message"
            value={body}
            onChangeText={setBody}
            placeholder="Details, what to do, where to go…"
            multiline
            numberOfLines={4}
          />
          <AppButton
            label={sending ? 'Sending…' : 'Send alert'}
            onPress={confirmSend}
            loading={sending}
            disabled={sending || !title.trim() || !body.trim()}
            fullWidth
          />
        </SolidCard>

        {/* Portal links */}
        <SolidCard radius={20}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Ionicons name="link-outline" size={22} color={colors.textSecondary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText weight="bold" variant="bodySmall">University portal links</AppText>
              <AppText tone="secondary" variant="caption">
                The shortcuts members see on their home screen (student portal, library, LMS…)
              </AppText>
            </View>
            <AppButton label="Manage" size="sm" variant="secondary" onPress={() => setPortalLinksOpen(true)} />
          </View>
        </SolidCard>

        {/* Look & feel */}
        <SolidCard radius={20}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Ionicons name="color-wand-outline" size={22} color={colors.textSecondary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText weight="bold" variant="bodySmall">Liquid Glass Studio</AppText>
              <AppText tone="secondary" variant="caption">
                Tune blur, shine and tint of the glass surfaces on this device
              </AppText>
            </View>
            <AppButton label="Open" size="sm" variant="secondary" onPress={() => setGlassStudioOpen(true)} />
          </View>
        </SolidCard>
      </ScrollView>

      <ManagePortalLinksModal visible={portalLinksOpen} onClose={() => setPortalLinksOpen(false)} />
      <LiquidGlassCustomizerModal visible={glassStudioOpen} onClose={() => setGlassStudioOpen(false)} />
    </ScreenContainer>
  );
}
