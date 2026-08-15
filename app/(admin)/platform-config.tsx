import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { ModerationQueue } from '@/components/ModerationQueue';
import { AnalyticsTab } from '@/components/admin/AnalyticsTab';
import { ForumsModerationTab } from '@/components/admin/ForumsModerationTab';
import { EventsModerationTab } from '@/components/admin/EventsModerationTab';
import { LocalHubControlTab } from '@/components/admin/LocalHubControlTab';
import { useTheme } from '@/theme/ThemeProvider';
import { listResources } from '@/api/resources';
import { LAUNCH_INSTITUTIONS, listWaitlist, respondToWaitlistEntry } from '@/api/institutions';
import { listReports } from '@/api/moderation';
import { listVerificationRequests } from '@/api/verification';

const WORKDESK_TABS = ['Analytics', 'Flags', 'User Profiles', 'Utility Hub', 'Forums', 'Events', 'Library', 'Approvals'] as const;
const PREVIEW_ROLES = ['Default (Admin)', 'Student', 'Staff', 'Alumni', 'Admin'];
const SCOPE_OPTIONS = ['All Campuses', ...LAUNCH_INSTITUTIONS.map((inst) => inst.name)];

export default function PlatformConfigScreen() {
  const { colors, spacing, radius } = useTheme();
  const [tab, setTab] = useState<(typeof WORKDESK_TABS)[number]>('Analytics');
  const [institution, setInstitution] = useState(SCOPE_OPTIONS[0]);
  const [institutionPickerOpen, setInstitutionPickerOpen] = useState(false);
  const [previewRole, setPreviewRole] = useState(PREVIEW_ROLES[0]);
  const [previewPickerOpen, setPreviewPickerOpen] = useState(false);

  const { data: openReports } = useQuery({ queryKey: ['reports', 'open', 'all'], queryFn: () => listReports({ status: 'open' }) });
  const { data: pendingVerifications } = useQuery({ queryKey: ['verification-requests'], queryFn: listVerificationRequests });

  return (
    <ScreenContainer glow={false}>
      <AppHeader />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: spacing.lg, marginBottom: spacing.md }}>
        <View style={{ flex: 1 }}>
          <AppText variant="h1" weight="bold">
            Staff & Admin Workdesk 🛡️
          </AppText>
          <AppText tone="secondary">Centralized university moderation & control parameters</AppText>
        </View>
        <Badge label="Lioris Root Admin" tone="critical" />
      </View>

      <SolidCard backgroundColor={colors.pastelPrimaryBg} style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
          <Ionicons name="school" size={16} color={colors.brandPrimary} />
          <AppText weight="bold" tone="brand">
            Active Campus Workspace Scope 🏫
          </AppText>
        </View>
        <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
          Configures which university network data you view, edit, and moderate globally.
        </AppText>
        <Pressable
          onPress={() => setInstitutionPickerOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`Campus workspace scope: ${institution}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary }} />
            <AppText weight="semiBold">{institution}</AppText>
          </View>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </Pressable>
        {institutionPickerOpen ? (
          <View style={{ marginTop: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm }}>
            {SCOPE_OPTIONS.map((inst) => (
              <Pressable
                key={inst}
                onPress={() => { setInstitution(inst); setInstitutionPickerOpen(false); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: inst === institution }}
                accessibilityLabel={inst}
                style={{ paddingVertical: spacing.sm }}
              >
                <AppText weight={inst === institution ? 'bold' : 'regular'} tone={inst === institution ? 'brand' : 'primary'}>
                  {inst}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </SolidCard>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
        <EcosystemTile
          icon="link-outline"
          label="Manage Portal Links"
          description="Configure UI & bookmarks"
          onPress={() => Alert.alert('Manage Portal Links', 'Would open the portal-links editor here.')}
        />
        <EcosystemTile
          icon="people-outline"
          label="Ecosystem Nodes"
          description="Registered accounts"
          badge="7"
          onPress={() => router.push('/(admin)/user-directory')}
        />
        <EcosystemTile
          icon="shield-outline"
          label="Ecosystem Safety"
          description="Moderation & Reports"
          badge={`${openReports?.length ?? 0} Pending`}
          onPress={() => router.push('/(admin)/moderation-queue')}
        />
        <EcosystemTile
          icon="checkmark-circle-outline"
          label="Verify Credentials"
          description="Review uploaded files"
          badge={String(pendingVerifications?.length ?? 0)}
          onPress={() => router.push('/(admin)/verification-requests')}
        />
      </View>

      <Pressable
        onPress={() => router.push('/(admin)/super-admin-config')}
        accessibilityRole="button"
        accessibilityLabel="Open Super Admin Configuration"
      >
        <SolidCard
          style={{ marginBottom: spacing.lg, borderWidth: 1, borderColor: `${colors.brandPrimary}40` }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Ionicons name="construct" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <AppText weight="bold">Super Admin Configuration</AppText>
              <AppText tone="secondary" variant="caption">
                Multi-tenant, financial, security, and platform-wide root settings (9 sections)
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </View>
        </SolidCard>
      </Pressable>

      <AppText weight="semiBold" variant="bodySmall" tone="secondary" style={{ marginBottom: spacing.sm }}>
        Preview As:
      </AppText>
      <Pressable
        onPress={() => setPreviewPickerOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`Preview as: ${previewRole}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          backgroundColor: colors.pastelPrimaryBg,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginBottom: spacing.lg,
        }}
      >
        <Ionicons name="person-circle-outline" size={16} color={colors.brandPrimary} />
        <AppText weight="semiBold" tone="brand" variant="bodySmall">
          {previewRole}
        </AppText>
        <Ionicons name="chevron-down" size={14} color={colors.brandPrimary} />
      </Pressable>
      {previewPickerOpen ? (
        <SolidCard style={{ marginBottom: spacing.lg }}>
          {PREVIEW_ROLES.map((role) => (
            <Pressable
              key={role}
              onPress={() => { setPreviewRole(role); setPreviewPickerOpen(false); }}
              accessibilityRole="radio"
              accessibilityState={{ checked: role === previewRole }}
              accessibilityLabel={role}
              style={{ paddingVertical: spacing.sm }}
            >
              <AppText weight={role === previewRole ? 'bold' : 'regular'} tone={role === previewRole ? 'brand' : 'primary'}>
                {role}
              </AppText>
            </Pressable>
          ))}
          <AppText tone="secondary" variant="caption" style={{ marginTop: spacing.sm }}>
            Note: this changes the label only in this build — it doesn't yet render the actual
            role's screens inline.
          </AppText>
        </SolidCard>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.lg }} style={{ marginBottom: spacing.lg }}>
        {WORKDESK_TABS.map((t) => {
          const selected = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t}
            >
              <AppText variant="bodySmall" weight={selected ? 'bold' : 'medium'} tone={selected ? 'brand' : 'secondary'}>
                {t}
              </AppText>
              {selected ? <View style={{ height: 2, backgroundColor: colors.brandPrimary, marginTop: spacing.xs, borderRadius: 1 }} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false}>
        {tab === 'Analytics' ? <AnalyticsTab /> : null}
        {tab === 'Flags' ? (
          <ModerationQueue
            institutionCode={institution === 'All Campuses' ? undefined : LAUNCH_INSTITUTIONS.find((i) => i.name === institution)?.code}
            emptyTitle={institution === 'All Campuses' ? 'Queue is clear' : `${institution} queue is clear`}
          />
        ) : null}
        {tab === 'User Profiles' ? <UserProfilesPreview /> : null}
        {tab === 'Utility Hub' ? <LocalHubControlTab /> : null}
        {tab === 'Forums' ? <ForumsModerationTab /> : null}
        {tab === 'Events' ? <EventsModerationTab /> : null}
        {tab === 'Library' ? <LibraryModerationTab /> : null}
        {tab === 'Approvals' ? <ApprovalsTab /> : null}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </ScreenContainer>
  );
}

function EcosystemTile({
  icon,
  label,
  description,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  badge?: string;
  onPress: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${description}${badge ? `. ${badge}` : ''}`}
      style={{ width: '47%' }}
    >
      <SolidCard radius={16}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm }}>
          <Ionicons name={icon} size={18} color={colors.brandPrimary} />
          {badge ? (
            <View style={{ backgroundColor: colors.pastelPrimaryBg, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
              <AppText variant="caption" weight="bold" tone="brand">
                {badge}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText weight="bold" variant="bodySmall">
          {label}
        </AppText>
        <AppText tone="secondary" variant="caption">
          {description}
        </AppText>
      </SolidCard>
    </Pressable>
  );
}

function UserProfilesPreview() {
  const { spacing } = useTheme();
  return (
    <View>
      <AppText tone="secondary" style={{ marginBottom: spacing.md }}>
        Quick preview — open the full Global User Directory for search, role changes, and
        suspension controls.
      </AppText>
      <Pressable
        onPress={() => router.push('/(admin)/user-directory')}
        accessibilityRole="button"
        accessibilityLabel="Open Global User Directory"
      >
        <SolidCard>
          <AppText weight="bold" tone="brand">
            Open Global User Directory →
          </AppText>
        </SolidCard>
      </Pressable>
    </View>
  );
}

function LibraryModerationTab() {
  const { spacing } = useTheme();
  const { data: resources } = useQuery({ queryKey: ['resources', 'admin-moderation'], queryFn: () => listResources() });

  return (
    <View>
      {resources?.map((r) => (
        <SolidCard key={r.id} style={{ marginBottom: spacing.md }}>
          <AppText weight="bold" variant="bodySmall">
            {r.title}
          </AppText>
          <AppText tone="secondary" variant="caption" style={{ marginBottom: spacing.sm }}>
            {r.courseCode} {'\u00b7'} {r.authorName}
          </AppText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Badge label="Approved" tone="success" />
          </View>
        </SolidCard>
      ))}
    </View>
  );
}

function ApprovalsTab() {
  const { spacing } = useTheme();
  const queryClient = useQueryClient();

  const { data: waitlist, isLoading } = useQuery({ queryKey: ['waitlist'], queryFn: listWaitlist });

  async function respond(id: string, status: 'approved' | 'rejected') {
    await respondToWaitlistEntry(id, status);
    queryClient.invalidateQueries({ queryKey: ['waitlist'] });
  }

  return (
    <View>
      <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
        Institutions that joined the launch waitlist (via the login screen), pending onboarding
        approval.
      </AppText>
      {waitlist?.map((w) => (
        <SolidCard key={w.id} style={{ marginBottom: spacing.md }}>
          <AppText weight="bold">{w.universityName}</AppText>
          <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
            {w.email}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Pressable
                onPress={() => respond(w.id, 'approved')}
                accessibilityRole="button"
                accessibilityLabel={`Approve ${w.universityName}`}
              >
                <SolidCard backgroundColor="#ECFDF5" radius={10} padded={false} style={{ paddingVertical: 10, alignItems: 'center' }}>
                  <AppText weight="bold" style={{ color: '#059669' }}>
                    Approve
                  </AppText>
                </SolidCard>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Pressable
                onPress={() => respond(w.id, 'rejected')}
                accessibilityRole="button"
                accessibilityLabel={`Reject ${w.universityName}`}
              >
                <SolidCard backgroundColor="#FEF2F2" radius={10} padded={false} style={{ paddingVertical: 10, alignItems: 'center' }}>
                  <AppText weight="bold" style={{ color: '#DC2626' }}>
                    Reject
                  </AppText>
                </SolidCard>
              </Pressable>
            </View>
          </View>
        </SolidCard>
      ))}
      {!isLoading && (waitlist?.length ?? 0) === 0 ? <AppText tone="secondary">No pending approvals.</AppText> : null}
    </View>
  );
}
