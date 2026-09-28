import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Avatar } from '@/components/Avatar';
import { SolidCard } from '@/components/SolidCard';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useBotVisibility } from '@/hooks/useBotVisibility';
import { supabase } from '@/api/supabase';
import { haptics } from '@/utils/haptics';

interface AdminUniversalSearchModalProps {
  visible: boolean;
  onClose: () => void;
}

type SearchCategory = 'all' | 'features' | 'members' | 'content' | 'controls';

interface NavFeature {
  title: string;
  description: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  category: string;
  keywords: string[];
}

const ADMIN_FEATURES: NavFeature[] = [
  {
    title: 'ID Verification Requests',
    description: 'Review student, faculty & staff institutional verification IDs',
    route: '/(admin)/verification-requests',
    icon: 'checkmark-circle-outline',
    category: 'People',
    keywords: ['id', 'verify', 'verification', 'matric', 'student id', 'staff id', 'pending'],
  },
  {
    title: 'User & Member Directory',
    description: 'Manage accounts, university roles, permissions & ban status',
    route: '/(admin)/user-directory',
    icon: 'people-outline',
    category: 'People',
    keywords: ['users', 'members', 'directory', 'accounts', 'students', 'staff', 'alumni', 'ban', 'roles'],
  },
  {
    title: 'Support & Help Desk',
    description: 'Resolve user inquiries, technical tickets and bug reports',
    route: '/(admin)/support-desk',
    icon: 'help-buoy-outline',
    category: 'People',
    keywords: ['support', 'help', 'tickets', 'issues', 'bugs', 'contact'],
  },
  {
    title: 'Content & Discussion Desk',
    description: 'Manage threads, events, study resources and discussion spaces',
    route: '/(admin)/content-desk',
    icon: 'layers-outline',
    category: 'Content',
    keywords: ['content', 'forum', 'discussions', 'discussion space', 'posts', 'threads', 'comments'],
  },
  {
    title: 'Moderation Queue & Reports',
    description: 'Investigate reported community threads, harassment, and spam flags',
    route: '/(admin)/moderation-queue',
    icon: 'flag-outline',
    category: 'Safety',
    keywords: ['reports', 'flag', 'moderation', 'spam', 'abuse', 'queue', 'safety'],
  },
  {
    title: 'Copyright & DMCA Takedowns',
    description: 'Process academic resource copyright and intellectual property notices',
    route: '/(admin)/takedown-requests',
    icon: 'document-lock-outline',
    category: 'Safety',
    keywords: ['copyright', 'dmca', 'takedown', 'ip', 'infringement', 'materials'],
  },
  {
    title: 'System Audit Logs',
    description: 'Review tamper-evident security logs and administrative action history',
    route: '/(admin)/audit-logs',
    icon: 'shield-checkmark-outline',
    category: 'Safety',
    keywords: ['audit', 'logs', 'history', 'security', 'trail', 'admin actions'],
  },
  {
    title: 'Live Campus Analytics & Activity',
    description: 'Real student activity metrics, retention, page traffic & engagement',
    route: '/(admin)/analytics',
    icon: 'stats-chart-outline',
    category: 'Platform',
    keywords: ['analytics', 'metrics', 'activity', 'online', 'dau', 'traffic', 'real users', 'stats'],
  },
  {
    title: 'Feature Controls & Toggles',
    description: 'Enable or disable features including bot accounts and alumni network',
    route: '/(admin)/feature-controls',
    icon: 'toggle-outline',
    category: 'Platform',
    keywords: ['features', 'flags', 'toggles', 'switches', 'bots', 'alumni network', 'config'],
  },
  {
    title: 'Campuses & Security Configuration',
    description: 'Manage launch universities, domain whitelist, and MFA security',
    route: '/(admin)/super-admin-config',
    icon: 'business-outline',
    category: 'Platform',
    keywords: ['campus', 'campuses', 'security', 'domains', 'unilag', 'ui', 'oau', 'mfa'],
  },
  {
    title: 'Platform System Health',
    description: 'Inspect Supabase connectivity, database counts, and storage buckets',
    route: '/(admin)/system-health',
    icon: 'pulse-outline',
    category: 'Platform',
    keywords: ['health', 'system', 'database', 'supabase', 'storage', 'status', 'ping'],
  },
  {
    title: 'Platform Console & Broadcasts',
    description: 'Official announcements, emergency banners, and university portal links',
    route: '/(admin)/platform-config',
    icon: 'settings-outline',
    category: 'Platform',
    keywords: ['console', 'broadcasts', 'announcements', 'bulletins', 'portals', 'links'],
  },
];

export function AdminUniversalSearchModal({ visible, onClose }: AdminUniversalSearchModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled, setFeature } = useFeatureFlags();
  const { showBots, toggleBotVisibility } = useBotVisibility();

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
  const [loading, setLoading] = useState(false);

  const [memberResults, setMemberResults] = useState<any[]>([]);
  const [postResults, setPostResults] = useState<any[]>([]);
  const [resourceResults, setResourceResults] = useState<any[]>([]);

  const isAlumniNetworkOn = isFeatureEnabled('alumni_network');

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setMemberResults([]);
      setPostResults([]);
      setResourceResults([]);
    }
  }, [visible]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setMemberResults([]);
      setPostResults([]);
      setResourceResults([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const [membersRes, postsRes, resourcesRes] = await Promise.all([
          // profiles.email is no longer selectable via a plain table query
          // (docs/security/security-assessment-2026-09-28.md, finding 1.1);
          // this admin-only search goes through a role-checked RPC instead.
          supabase.rpc('admin_search_profiles', { p_query: trimmed, p_limit: 5 }),
          supabase
            .from('posts')
            .select('id, title, category, author_name, campus_code')
            .ilike('title', `%${trimmed}%`)
            .limit(5),
          supabase
            .from('resources')
            .select('id, title, course_code, file_format, campus_code')
            .or(`title.ilike.%${trimmed}%,course_code.ilike.%${trimmed}%`)
            .limit(5),
        ]);

        if (isMounted) {
          setMemberResults(membersRes.data ?? []);
          setPostResults(postsRes.data ?? []);
          setResourceResults(resourcesRes.data ?? []);
          setLoading(false);
        }
      } catch {
        if (isMounted) setLoading(false);
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [query]);

  const matchedFeatures = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ADMIN_FEATURES;
    return ADMIN_FEATURES.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.keywords.some((kw) => kw.includes(q)),
    );
  }, [query]);

  const matchedControls = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items: Array<{
      id: string;
      label: string;
      description: string;
      state: string;
      active: boolean;
      onToggle: () => void;
      icon: keyof typeof Ionicons.glyphMap;
    }> = [];

    if (!q || q.includes('bot') || q.includes('mock') || q.includes('community') || q.includes('account')) {
      items.push({
        id: 'community_bots',
        label: 'Community Bot Accounts',
        description: 'Toggles mock seed profiles and bot generated discussion threads platform-wide',
        state: showBots ? 'Enabled' : 'Disabled (Hidden)',
        active: showBots,
        onToggle: () => {
          haptics.medium();
          toggleBotVisibility();
        },
        icon: 'hardware-chip-outline',
      });
    }

    if (!q || q.includes('alumni') || q.includes('network') || q.includes('fellow')) {
      items.push({
        id: 'alumni_network',
        label: 'Alumni Network Directory',
        description: 'Hides or displays the Alumni directory and fellow explorer in the Alumni role',
        state: isAlumniNetworkOn ? 'Active' : 'Hidden',
        active: isAlumniNetworkOn,
        onToggle: () => {
          haptics.medium();
          void setFeature('alumni_network', !isAlumniNetworkOn);
        },
        icon: 'people-circle-outline',
      });
    }

    return items;
  }, [query, showBots, isAlumniNetworkOn, toggleBotVisibility, setFeature]);

  function navigateTo(route: string) {
    haptics.light();
    onClose();
    router.push(route as any);
  }

  const showFeatures = activeCategory === 'all' || activeCategory === 'features';
  const showControls = activeCategory === 'all' || activeCategory === 'controls';
  const showMembers = activeCategory === 'all' || activeCategory === 'members';
  const showContent = activeCategory === 'all' || activeCategory === 'content';

  const totalResults =
    (showFeatures ? matchedFeatures.length : 0) +
    (showControls ? matchedControls.length : 0) +
    (showMembers ? memberResults.length : 0) +
    (showContent ? postResults.length + resourceResults.length : 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              width: isDesktop ? 620 : '94%',
              maxHeight: isDesktop ? '80%' : '88%',
            },
          ]}
        >
          {/* Search Header */}
          <View
            style={[
              styles.header,
              {
                borderBottomColor: colors.border,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Ionicons name="search" size={20} color={colors.brandPrimary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search features, members, content, or system controls..."
                placeholderTextColor={colors.textSecondary}
                autoFocus
                style={[
                  styles.searchInput,
                  {
                    color: colors.textPrimary,
                  },
                ]}
              />
              {loading && <ActivityIndicator size="small" color={colors.brandPrimary} />}
              {query.length > 0 && !loading && (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
            >
              <AppText variant="caption" weight="bold">
                ESC
              </AppText>
            </Pressable>
          </View>

          {/* Category Filter Chips */}
          <View style={[styles.categoryBar, { borderBottomColor: colors.border, paddingHorizontal: spacing.md }]}>
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'features', label: `Features (${matchedFeatures.length})` },
                { id: 'controls', label: `Controls (${matchedControls.length})` },
                { id: 'members', label: `Members (${memberResults.length})` },
                { id: 'content', label: `Content (${postResults.length + resourceResults.length})` },
              ] as const
            ).map((cat) => {
              const active = activeCategory === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => {
                    haptics.light();
                    setActiveCategory(cat.id);
                  }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.brandPrimary : (isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9'),
                      borderColor: active ? colors.brandPrimary : colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    weight={active ? 'bold' : 'regular'}
                    style={{ color: active ? '#FFFFFF' : colors.textSecondary, fontSize: 11 }}
                  >
                    {cat.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Results Area */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Quick System Controls */}
            {showControls && matchedControls.length > 0 && (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Quick Controls
                </AppText>
                {matchedControls.map((control) => (
                  <SolidCard
                    key={control.id}
                    radius={14}
                    style={{
                      padding: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderWidth: 1,
                      borderColor: control.active ? 'rgba(16, 185, 129, 0.3)' : colors.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          backgroundColor: control.active ? 'rgba(16, 185, 129, 0.15)' : (isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9'),
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons
                          name={control.icon}
                          size={18}
                          color={control.active ? '#10B981' : colors.textSecondary}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText weight="bold" style={{ fontSize: 13 }}>
                          {control.label}
                        </AppText>
                        <AppText variant="caption" tone="secondary" numberOfLines={1}>
                          {control.description}
                        </AppText>
                      </View>
                    </View>
                    <Pressable
                      onPress={control.onToggle}
                      style={{
                        paddingVertical: 5,
                        paddingHorizontal: 12,
                        borderRadius: 12,
                        backgroundColor: control.active ? '#10B981' : (isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9'),
                        borderWidth: 1,
                        borderColor: control.active ? '#10B981' : colors.border,
                      }}
                    >
                      <AppText
                        variant="caption"
                        weight="bold"
                        style={{ color: control.active ? '#FFFFFF' : colors.textSecondary }}
                      >
                        {control.state}
                      </AppText>
                    </Pressable>
                  </SolidCard>
                ))}
              </View>
            )}

            {/* Navigation & Features */}
            {showFeatures && matchedFeatures.length > 0 && (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Admin Features & Pages
                </AppText>
                {matchedFeatures.map((feat) => (
                  <Pressable
                    key={feat.route}
                    onPress={() => navigateTo(feat.route)}
                    style={({ pressed }) => [
                      styles.resultRow,
                      {
                        backgroundColor: pressed ? (isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9') : colors.surface,
                        borderColor: colors.border,
                        borderRadius: radius.md,
                      },
                    ]}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: colors.pastelPrimaryBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name={feat.icon} size={18} color={colors.brandPrimary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <AppText weight="bold" style={{ fontSize: 13.5 }}>
                          {feat.title}
                        </AppText>
                        <Badge label={feat.category} tone="neutral" />
                      </View>
                      <AppText variant="caption" tone="secondary" numberOfLines={1}>
                        {feat.description}
                      </AppText>
                    </View>
                    <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            )}

            {/* Members / Profiles */}
            {showMembers && memberResults.length > 0 && (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Members ({memberResults.length})
                </AppText>
                {memberResults.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => navigateTo(`/(admin)/user-directory?q=${encodeURIComponent(m.full_name || m.email)}`)}
                    style={({ pressed }) => [
                      styles.resultRow,
                      {
                        backgroundColor: pressed ? (isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9') : colors.surface,
                        borderColor: colors.border,
                        borderRadius: radius.md,
                      },
                    ]}
                  >
                    <Avatar name={m.full_name || 'Member'} size={34} role={m.role} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <AppText weight="bold" style={{ fontSize: 13 }}>
                          {m.full_name || 'Anonymous User'}
                        </AppText>
                        <Badge label={m.role} tone={m.role === 'admin' ? 'critical' : 'brand'} />
                        {m.campus_code && <Badge label={m.campus_code} tone="neutral" />}
                      </View>
                      <AppText variant="caption" tone="secondary" numberOfLines={1}>
                        {m.email}
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            )}

            {/* Content: Posts & Resources */}
            {showContent && (postResults.length > 0 || resourceResults.length > 0) && (
              <View style={{ gap: spacing.xs }}>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Discussions & Academic Resources
                </AppText>
                {postResults.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => navigateTo('/(admin)/content-desk')}
                    style={({ pressed }) => [
                      styles.resultRow,
                      {
                        backgroundColor: pressed ? (isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9') : colors.surface,
                        borderColor: colors.border,
                        borderRadius: radius.md,
                      },
                    ]}
                  >
                    <Ionicons name="chatbubbles-outline" size={20} color="#EC4899" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText weight="bold" numberOfLines={1} style={{ fontSize: 13 }}>
                        {p.title}
                      </AppText>
                      <AppText variant="caption" tone="secondary">
                        By {p.author_name || 'Member'} • {p.category || 'General'}
                      </AppText>
                    </View>
                    <Badge label="Discussion" tone="neutral" />
                  </Pressable>
                ))}
                {resourceResults.map((r) => (
                  <Pressable
                    key={r.id}
                    onPress={() => navigateTo('/(admin)/content-desk')}
                    style={({ pressed }) => [
                      styles.resultRow,
                      {
                        backgroundColor: pressed ? (isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9') : colors.surface,
                        borderColor: colors.border,
                        borderRadius: radius.md,
                      },
                    ]}
                  >
                    <Ionicons name="document-text-outline" size={20} color="#3B82F6" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText weight="bold" numberOfLines={1} style={{ fontSize: 13 }}>
                        {r.title}
                      </AppText>
                      <AppText variant="caption" tone="secondary">
                        {r.course_code ? `${r.course_code} • ` : ''}{r.file_format?.toUpperCase() || 'DOCUMENT'}
                      </AppText>
                    </View>
                    <Badge label="Resource" tone="neutral" />
                  </Pressable>
                ))}
              </View>
            )}

            {totalResults === 0 && !loading && (
              <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="search-outline" size={36} color={colors.textSecondary} style={{ marginBottom: spacing.xs }} />
                <AppText weight="bold" style={{ fontSize: 15 }}>
                  No matching admin records found
                </AppText>
                <AppText tone="secondary" variant="caption" style={{ marginTop: 4, textAlign: 'center' }}>
                  Try searching for 'verification', 'bots', 'audit', or a student's name
                </AppText>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14.5,
    paddingVertical: Platform.OS === 'web' ? 8 : 4,
    outlineWidth: 0,
  } as any,
  closeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 6,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    gap: 10,
  },
});
