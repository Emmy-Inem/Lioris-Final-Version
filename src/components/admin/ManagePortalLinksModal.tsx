import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../AppText';
import { AppTextField } from '../AppTextField';
import { AppButton } from '../AppButton';
import { SolidCard } from '../SolidCard';
import { Badge } from '../Badge';
import { EmptyState } from '../EmptyState';
import { FormSheet } from '../common/FormSheet';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useCampusScope } from '@/hooks/useCampusScope';
import { haptics } from '@/utils/haptics';
import { openExternalUrl } from '@/utils/openExternalUrl';
import {
  DEFAULT_CAMPUS_PORTAL_LINKS,
  PortalLink,
  createPortalLink,
  deletePortalLink,
  importSuggestedPortalLinks,
  listPortalLinks,
  updatePortalLink,
} from '@/api/portalLinks';
import { Institution, listCampuses } from '@/api/institutions';
import { recordAuditLogEntry } from '@/api/auditLog';

export { PortalLink };

const ICON_CHOICES: (keyof typeof Ionicons.glyphMap)[] = [
  'school-outline',
  'laptop-outline',
  'book-outline',
  'card-outline',
  'home-outline',
  'medkit-outline',
  'calendar-outline',
  'document-text-outline',
  'library-outline',
  'globe-outline',
  'link-outline',
];
const CATEGORY_HINTS = ['Academic', 'Library', 'Classes', 'Finance', 'Housing', 'Health', 'Admissions', 'Results', 'ICT & Services', 'Central Portal'];

function normaliseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Admin (and campus staff) editor for the university portal shortcuts students see on Resources and their dashboards.
 * Shows every university's links - hidden ones too - with a filter per university, a search box and a campus picker
 * on the form. Every save is confirmed by the database (a failure is shown, never reported as success).
 */
export function ManagePortalLinksModal({
  visible,
  onClose,
  initialCampus,
}: {
  visible: boolean;
  onClose: () => void;
  /** Open with this university's links selected. */
  initialCampus?: string;
}) {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const { homeInstitutionCode } = useCampusScope();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin' || user?.actualRole === 'admin';

  const [filter, setFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(true);
  const [editing, setEditing] = useState<PortalLink | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // form
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('Academic');
  const [campusCode, setCampusCode] = useState('GLOBAL');
  const [icon, setIcon] = useState<keyof typeof Ionicons.glyphMap>('link-outline');
  const [active, setActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const campusesQuery = useQuery({ queryKey: ['campuses'], queryFn: listCampuses, enabled: visible });
  const linksQuery = useQuery({
    queryKey: ['portal-links', 'admin', isAdmin ? 'ALL' : homeInstitutionCode],
    queryFn: () => listPortalLinks(isAdmin ? 'ALL' : homeInstitutionCode || 'GLOBAL', { includeInactive: true }),
    enabled: visible,
  });

  // Staff can only manage their own campus (the database enforces it; the picker just does not offer more).
  const campuses: Institution[] = useMemo(() => {
    const all = (campusesQuery.data ?? []).filter((c) => c.isActive !== false || c.code === 'GLOBAL');
    const scoped = isAdmin ? all : all.filter((c) => c.code === homeInstitutionCode);
    return scoped.sort((a, b) => (a.code === 'GLOBAL' ? -1 : b.code === 'GLOBAL' ? 1 : a.name.localeCompare(b.name)));
  }, [campusesQuery.data, isAdmin, homeInstitutionCode]);

  useEffect(() => {
    if (visible) {
      setFilter(initialCampus && initialCampus !== 'ALL' ? initialCampus.toUpperCase() : isAdmin ? 'ALL' : homeInstitutionCode || 'ALL');
      setSearch('');
      setEditing(null);
    }
  }, [visible, initialCampus, isAdmin, homeInstitutionCode]);

  const links = linksQuery.data ?? [];
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of links) map.set(l.campusCode || 'GLOBAL', (map.get(l.campusCode || 'GLOBAL') ?? 0) + 1);
    return map;
  }, [links]);

  const q = search.trim().toLowerCase();
  const visibleLinks = links
    .filter((l) => filter === 'ALL' || (l.campusCode || 'GLOBAL') === filter)
    .filter((l) => showHidden || l.active)
    .filter((l) => !q || l.title.toLowerCase().includes(q) || l.url.toLowerCase().includes(q) || l.category.toLowerCase().includes(q));

  const grouped = useMemo(() => {
    const map = new Map<string, PortalLink[]>();
    for (const l of visibleLinks) {
      const code = l.campusCode || 'GLOBAL';
      if (!map.has(code)) map.set(code, []);
      map.get(code)!.push(l);
    }
    for (const list of map.values()) list.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.title.localeCompare(b.title));
    const order = campuses.map((c) => c.code);
    return [...map.entries()].sort((a, b) => (order.indexOf(a[0]) === -1 ? 99 : order.indexOf(a[0])) - (order.indexOf(b[0]) === -1 ? 99 : order.indexOf(b[0])));
  }, [visibleLinks, campuses]);

  const campusName = (code: string) => campuses.find((c) => c.code === code)?.shortName || code;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['portal-links'] });
  const suggestionsAvailable = filter !== 'ALL' && (DEFAULT_CAMPUS_PORTAL_LINKS[filter]?.length ?? 0) > 0;

  function startAdd() {
    haptics.light();
    setEditing('new');
    setTitle('');
    setUrl('');
    setCategory('Academic');
    setCampusCode(filter !== 'ALL' ? filter : campuses.find((c) => c.code !== 'GLOBAL')?.code ?? 'GLOBAL');
    setIcon('link-outline');
    setActive(true);
    setFormError(null);
  }

  function startEdit(link: PortalLink) {
    haptics.light();
    setEditing(link);
    setTitle(link.title);
    setUrl(link.url);
    setCategory(link.category);
    setCampusCode(link.campusCode || 'GLOBAL');
    setIcon(link.icon);
    setActive(link.active);
    setFormError(null);
  }

  async function save() {
    if (saving) return;
    setFormError(null);
    if (title.trim().length < 3) return setFormError('Enter a title (at least 3 characters).');
    const cleanUrl = normaliseUrl(url);
    if (!cleanUrl) return setFormError('Enter a valid web address, e.g. portal.university.edu.ng');
    if (!campusCode) return setFormError('Choose which university this link belongs to.');
    setSaving(true);
    try {
      if (editing && editing !== 'new') {
        const updated = await updatePortalLink(editing.id, { title, url: cleanUrl, category: category.trim() || 'Academic', icon, active, campusCode });
        recordAuditLogEntry({ action: 'portal_link_updated', summary: `Updated portal link "${updated.title}" for ${campusCode}`, targetType: 'portal_link', targetId: updated.id, institutionCode: campusCode }).catch(() => {});
        haptics.success();
      } else {
        const inCampus = links.filter((l) => (l.campusCode || 'GLOBAL') === campusCode);
        const created = await createPortalLink({ title, url: cleanUrl, category: category.trim() || 'Academic', icon, active, campusCode, displayOrder: inCampus.reduce((m, l) => Math.max(m, l.displayOrder ?? 0), 0) + 1 });
        recordAuditLogEntry({ action: 'portal_link_created', summary: `Published portal link "${created.title}" for ${campusCode}`, targetType: 'portal_link', targetId: created.id, institutionCode: campusCode }).catch(() => {});
        haptics.success();
        if (filter !== 'ALL' && filter !== campusCode) setFilter(campusCode);
      }
      setEditing(null);
      await refresh();
    } catch (err: any) {
      haptics.error();
      setFormError(err?.message || 'Could not save this link.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(link: PortalLink) {
    setBusyId(link.id);
    try {
      await updatePortalLink(link.id, { active: !link.active });
      recordAuditLogEntry({ action: 'portal_link_updated', summary: `${link.active ? 'Hid' : 'Showed'} portal link "${link.title}"`, targetType: 'portal_link', targetId: link.id, institutionCode: link.campusCode }).catch(() => {});
    } catch (err: any) {
      Alert.alert('Could not update the link', err?.message || 'Please try again.');
    } finally {
      setBusyId(null);
      refresh();
    }
  }

  async function move(link: PortalLink, direction: -1 | 1, list: PortalLink[]) {
    const index = list.findIndex((l) => l.id === link.id);
    const other = list[index + direction];
    if (!other) return;
    setBusyId(link.id);
    try {
      // Give every link in the campus a clean 1..n order first so swapping never collides with equal values.
      const ordered = list.map((l, i) => ({ id: l.id, order: i + 1 }));
      const a = ordered[index];
      const b = ordered[index + direction];
      const swap = a.order;
      a.order = b.order;
      b.order = swap;
      await Promise.all(ordered.filter((o) => list.find((l) => l.id === o.id)?.displayOrder !== o.order).map((o) => updatePortalLink(o.id, { displayOrder: o.order })));
    } catch (err: any) {
      Alert.alert('Could not reorder', err?.message || 'Please try again.');
    } finally {
      setBusyId(null);
      refresh();
    }
  }

  function remove(link: PortalLink) {
    haptics.medium();
    Alert.alert('Delete this link?', `"${link.title}" disappears for every student at ${campusName(link.campusCode || 'GLOBAL')}. Hide it instead if you might want it back.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyId(link.id);
          try {
            await deletePortalLink(link.id);
            recordAuditLogEntry({ action: 'portal_link_deleted', summary: `Deleted portal link "${link.title}"`, targetType: 'portal_link', targetId: link.id, institutionCode: link.campusCode }).catch(() => {});
          } catch (err: any) {
            Alert.alert('Could not delete the link', err?.message || 'Please try again.');
          } finally {
            setBusyId(null);
            refresh();
          }
        },
      },
    ]);
  }

  async function importSuggestions() {
    if (!suggestionsAvailable || importing) return;
    setImporting(true);
    try {
      const added = await importSuggestedPortalLinks(filter);
      haptics.success();
      Alert.alert(added > 0 ? 'Links added' : 'Nothing to add', added > 0 ? `${added} suggested link${added === 1 ? '' : 's'} added for ${campusName(filter)}.` : `${campusName(filter)} already has all the suggested links.`);
    } catch (err: any) {
      Alert.alert('Could not import', err?.message || 'Please try again.');
    } finally {
      setImporting(false);
      refresh();
    }
  }

  const chip = (code: string, label: string, count?: number) => {
    const selected = filter === code;
    return (
      <Pressable
        key={code}
        onPress={() => setFilter(code)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: selected ? colors.brandPrimary : colors.surface, borderWidth: 1, borderColor: selected ? colors.brandPrimary : colors.border }}
      >
        <AppText variant="caption" weight={selected ? 'bold' : 'medium'} style={{ color: selected ? '#FFFFFF' : colors.textPrimary }}>
          {label}
        </AppText>
        {count !== undefined ? (
          <AppText variant="caption" weight="bold" style={{ color: selected ? 'rgba(255,255,255,0.8)' : colors.textSecondary, fontSize: 10.5 }}>
            {count}
          </AppText>
        ) : null}
      </Pressable>
    );
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Campus portal links"
      subtitle={isAdmin ? 'The shortcuts students see for their university. Filter by university to manage one at a time.' : 'The shortcuts students on your campus see.'}
      maxWidth={760}
    >
      {/* filter by university */}
      {campuses.length > 1 || isAdmin ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingRight: 16 }} {...({ 'data-horizontal-scroll': 'true' } as any)}>
          {isAdmin ? chip('ALL', 'All universities', links.length) : null}
          {campuses.map((c) => chip(c.code, c.code === 'GLOBAL' ? 'Global / National' : c.shortName || c.code, counts.get(c.code) ?? 0))}
        </ScrollView>
      ) : null}

      <AppTextField label="" value={search} onChangeText={setSearch} placeholder="Search by title, address or category…" leftIcon="search" />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Switch value={showHidden} onValueChange={setShowHidden} trackColor={{ false: colors.divider, true: colors.brandPrimary }} />
          <AppText variant="caption" tone="secondary">
            Show hidden links
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
          {suggestionsAvailable ? <AppButton label="Add suggested links" size="sm" variant="ghost" loading={importing} onPress={importSuggestions} /> : null}
          {!editing ? <AppButton label="+ New link" size="sm" onPress={startAdd} /> : null}
        </View>
      </View>

      {/* add / edit form */}
      {editing ? (
        <SolidCard style={{ borderWidth: 2, borderColor: colors.brandPrimary, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText weight="bold" tone="brand">
              {editing === 'new' ? 'New portal link' : 'Edit portal link'}
            </AppText>
            <Pressable onPress={() => setEditing(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close form">
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={{ gap: 6 }}>
            <AppText weight="semiBold" variant="bodySmall">
              University *
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingRight: 16 }} {...({ 'data-horizontal-scroll': 'true' } as any)}>
              {campuses.map((c) => {
                const selected = campusCode === c.code;
                return (
                  <Pressable
                    key={c.code}
                    onPress={() => setCampusCode(c.code)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1.5, borderColor: selected ? colors.brandPrimary : colors.border, backgroundColor: selected ? `${colors.brandPrimary}18` : 'transparent' }}
                  >
                    <AppText variant="caption" weight="semiBold" tone={selected ? 'brand' : 'secondary'}>
                      {c.code === 'GLOBAL' ? 'Global / National' : c.shortName || c.code}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <AppTextField label="Title *" placeholder="e.g. Student fees & bursary portal" value={title} onChangeText={(v) => setTitle(v.slice(0, 120))} />
          <AppTextField label="Web address *" placeholder="bursary.university.edu.ng" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" autoCorrect={false} />
          <AppTextField label="Category" placeholder="Academic, Finance, Housing…" value={category} onChangeText={(v) => setCategory(v.slice(0, 40))} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORY_HINTS.map((h) => (
              <Pressable key={h} onPress={() => setCategory(h)} style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border }}>
                <AppText variant="caption" tone="secondary">
                  {h}
                </AppText>
              </Pressable>
            ))}
          </View>

          <View style={{ gap: 6 }}>
            <AppText weight="semiBold" variant="bodySmall">
              Icon
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {ICON_CHOICES.map((ic) => {
                const selected = icon === ic;
                return (
                  <Pressable
                    key={ic}
                    onPress={() => setIcon(ic)}
                    accessibilityRole="button"
                    accessibilityLabel={`Icon ${ic}`}
                    accessibilityState={{ selected }}
                    style={{ width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.brandPrimary : colors.surface, borderWidth: 1, borderColor: selected ? colors.brandPrimary : colors.border }}
                  >
                    <Ionicons name={ic} size={18} color={selected ? '#FFFFFF' : colors.textPrimary} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <AppText variant="bodySmall" weight="bold">
                Visible to students
              </AppText>
              <AppText variant="caption" tone="secondary">
                Hidden links stay here but students do not see them.
              </AppText>
            </View>
            <Switch value={active} onValueChange={setActive} trackColor={{ false: colors.divider, true: colors.brandPrimary }} />
          </View>

          {formError ? (
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
              <Ionicons name="alert-circle" size={16} color={colors.critical} style={{ marginTop: 1 }} />
              <AppText variant="caption" weight="semiBold" style={{ color: colors.critical, flex: 1 }}>
                {formError}
              </AppText>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
            <AppButton label="Cancel" variant="ghost" onPress={() => setEditing(null)} disabled={saving} />
            <AppButton label={editing === 'new' ? 'Publish link' : 'Save changes'} onPress={save} loading={saving} />
          </View>
        </SolidCard>
      ) : null}

      {linksQuery.isError ? (
        <EmptyState icon="cloud-offline-outline" title="Could not load portal links" description={(linksQuery.error as Error)?.message || 'Check your connection and try again.'} actionLabel="Try again" onAction={() => linksQuery.refetch()} />
      ) : linksQuery.isLoading ? (
        <AppText tone="secondary" variant="bodySmall">
          Loading links…
        </AppText>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon="link-outline"
          title={q ? 'No links match your search' : filter === 'ALL' ? 'No portal links yet' : `No links for ${campusName(filter)} yet`}
          description={q ? 'Try a different search.' : 'Add the first link, or use "Add suggested links" when it is available.'}
        />
      ) : (
        grouped.map(([code, list]) => (
          <View key={code} style={{ gap: spacing.xs }}>
            {filter === 'ALL' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.xs }}>
                <AppText weight="bold">{code === 'GLOBAL' ? 'Global / National' : campuses.find((c) => c.code === code)?.name || code}</AppText>
                <Badge label={`${list.length}`} tone="neutral" />
              </View>
            ) : null}
            {list.map((link, index) => (
              <SolidCard key={link.id} radius={16} style={{ opacity: link.active ? 1 : 0.6, borderLeftWidth: 4, borderLeftColor: link.active ? colors.brandPrimary : colors.border, gap: spacing.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.divider, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={link.icon} size={19} color={colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <AppText weight="bold" variant="bodySmall" style={{ flexShrink: 1 }}>
                        {link.title}
                      </AppText>
                      <Badge label={link.category} tone={link.active ? 'brand' : 'neutral'} />
                    </View>
                    <AppText tone="secondary" variant="caption" numberOfLines={1}>
                      {link.url}
                    </AppText>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14 }}>
                  <Pressable onPress={() => toggleActive(link)} disabled={busyId === link.id} hitSlop={8} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: link.active ? `${colors.brandPrimary}15` : colors.divider }} accessibilityRole="button">
                    <AppText variant="caption" weight="bold" tone={link.active ? 'brand' : 'secondary'}>
                      {link.active ? 'Visible' : 'Hidden'}
                    </AppText>
                  </Pressable>
                  <Pressable onPress={() => move(link, -1, list)} disabled={index === 0 || busyId === link.id} hitSlop={8} accessibilityRole="button" accessibilityLabel="Move up" style={{ opacity: index === 0 ? 0.3 : 1 }}>
                    <Ionicons name="arrow-up" size={17} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => move(link, 1, list)} disabled={index === list.length - 1 || busyId === link.id} hitSlop={8} accessibilityRole="button" accessibilityLabel="Move down" style={{ opacity: index === list.length - 1 ? 0.3 : 1 }}>
                    <Ionicons name="arrow-down" size={17} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => openExternalUrl(link.url).then((ok) => !ok && Alert.alert('Open link', 'Only valid http(s) links can be opened.'))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open link">
                    <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => startEdit(link)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit link">
                    <Ionicons name="pencil" size={17} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable onPress={() => remove(link)} disabled={busyId === link.id} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete link">
                    <Ionicons name="trash-outline" size={17} color={colors.critical} />
                  </Pressable>
                </View>
              </SolidCard>
            ))}
          </View>
        ))
      )}
    </FormSheet>
  );
}
