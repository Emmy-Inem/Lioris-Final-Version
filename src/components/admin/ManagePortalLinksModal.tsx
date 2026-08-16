import React, { useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../AppText';
import { AppTextField } from '../AppTextField';
import { AppButton } from '../AppButton';
import { SolidCard } from '../SolidCard';
import { Badge } from '../Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';

export interface PortalLink {
  id: string;
  title: string;
  url: string;
  category: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
}

const INITIAL_LINKS: PortalLink[] = [
  { id: '1', title: 'Campus Student Portal', url: 'https://portal.unilag.edu.ng', category: 'Academic', icon: 'school-outline', active: true },
  { id: '2', title: 'LMS e-Learning Classroom', url: 'https://lms.ui.edu.ng', category: 'Classes', icon: 'laptop-outline', active: true },
  { id: '3', title: 'Main Library Digital Catalog', url: 'https://library.funaab.edu.ng', category: 'Library', icon: 'book-outline', active: true },
  { id: '4', title: 'Bursary & Fee Payment', url: 'https://bursary.campus.edu.ng', category: 'Finance', icon: 'card-outline', active: true },
  { id: '5', title: 'Hostels & Accommodation', url: 'https://hostels.campus.edu.ng', category: 'Housing', icon: 'home-outline', active: true },
  { id: '6', title: 'University Health Center', url: 'https://health.campus.edu.ng', category: 'Health', icon: 'medkit-outline', active: true },
];

export function ManagePortalLinksModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const [links, setLinks] = useState<PortalLink[]>(INITIAL_LINKS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('Academic');
  const [selectedIcon, setSelectedIcon] = useState<keyof typeof Ionicons.glyphMap>('link-outline');

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
    'link-outline',
  ];

  function startAdd() {
    haptics.light();
    setEditingId(null);
    setTitle('');
    setUrl('');
    setCategory('Academic');
    setSelectedIcon('link-outline');
    setFormError(null);
    setAdding(true);
  }

  function startEdit(link: PortalLink) {
    haptics.light();
    setAdding(false);
    setEditingId(link.id);
    setTitle(link.title);
    setUrl(link.url);
    setCategory(link.category);
    setSelectedIcon(link.icon);
    setFormError(null);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
    setTitle('');
    setUrl('');
    setFormError(null);
  }

  function handleSave() {
    setFormError(null);
    if (!title.trim()) {
      setFormError('Please enter a link title.');
      haptics.error();
      return;
    }
    if (!url.trim()) {
      setFormError('Please enter a valid URL destination.');
      haptics.error();
      return;
    }
    haptics.success();
    const formattedUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;

    if (editingId) {
      setLinks((prev) =>
        prev.map((l) =>
          l.id === editingId
            ? { ...l, title: title.trim(), url: formattedUrl, category: category.trim() || 'General', icon: selectedIcon }
            : l
        )
      );
      Alert.alert('Link Updated', `"${title.trim()}" changes saved.`);
    } else {
      const created: PortalLink = {
        id: String(Date.now()),
        title: title.trim(),
        url: formattedUrl,
        category: category.trim() || 'General',
        icon: selectedIcon,
        active: true,
      };
      setLinks((prev) => [created, ...prev]);
      Alert.alert('Link Published', `"${created.title}" is now available to students.`);
    }
    cancelForm();
  }

  function handleToggleActive(id: string) {
    haptics.light();
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, active: !l.active } : l))
    );
  }

  function handleDeleteLink(id: string) {
    haptics.medium();
    Alert.alert('Delete Portal Link', 'Are you sure you want to remove this institutional bookmark?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setLinks((prev) => prev.filter((l) => l.id !== id));
          if (editingId === id) cancelForm();
        },
      },
    ]);
  }

  function handleTestLink(targetUrl: string) {
    Linking.openURL(targetUrl).catch(() => {
      Alert.alert('Open Link', `Cannot open ${targetUrl}`);
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessible={false} />
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '90%' }}>
          <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
            <View style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name="link" size={22} color={colors.brandPrimary} />
              <AppText variant="h2" weight="bold">
                Manage Campus Portal Links
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <AppText tone="secondary" style={{ marginBottom: spacing.md }}>
            Publish, edit, reorder, and configure verified campus bookmarks and school portals displayed to students.
          </AppText>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
            {/* Add / Edit Form Drawer */}
            {(adding || editingId) ? (
              <SolidCard style={{ marginBottom: spacing.lg, borderWidth: 2, borderColor: colors.brandPrimary }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                  <AppText weight="bold" variant="h3" tone="brand">
                    {editingId ? 'Edit Portal Link' : 'Add New Portal Link'}
                  </AppText>
                  <Pressable onPress={cancelForm}>
                    <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                  </Pressable>
                </View>

                <AppTextField
                  label="Link Title"
                  placeholder="e.g. Student Fees & Bursary Portal"
                  value={title}
                  onChangeText={setTitle}
                />
                <AppTextField
                  label="URL Web Destination"
                  placeholder="https://bursary.campus.edu.ng"
                  value={url}
                  onChangeText={setUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <AppTextField
                  label="Category Label"
                  placeholder="e.g. Academic, Finance, Housing, Health"
                  value={category}
                  onChangeText={setCategory}
                />

                <AppText weight="bold" variant="caption" tone="secondary" style={{ marginBottom: spacing.xs, marginTop: spacing.xs }}>
                  Choose Portal Icon:
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
                  {ICON_CHOICES.map((ic) => {
                    const isSelected = selectedIcon === ic;
                    return (
                      <Pressable
                        key={ic}
                        onPress={() => setSelectedIcon(ic)}
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: radius.md,
                          backgroundColor: isSelected ? colors.brandPrimary : colors.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: isSelected ? colors.brandPrimary : colors.border,
                        }}
                      >
                        <Ionicons name={ic} size={18} color={isSelected ? '#FFFFFF' : colors.textPrimary} />
                      </Pressable>
                    );
                  })}
                </View>

                {formError ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEE2E2',
                      borderColor: colors.critical,
                      borderWidth: 1,
                      borderRadius: radius.md,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      marginBottom: spacing.md,
                    }}
                  >
                    <Ionicons name="alert-circle" size={18} color={colors.critical} />
                    <AppText
                      variant="bodySmall"
                      weight="semiBold"
                      style={{ color: colors.critical, flex: 1 }}
                    >
                      {formError}
                    </AppText>
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
                  <AppButton label="Cancel" variant="ghost" onPress={cancelForm} />
                  <AppButton
                    label={editingId ? 'Save Changes' : 'Publish Link'}
                    onPress={handleSave}
                  />
                </View>
              </SolidCard>
            ) : null}

            {/* List of portal links */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <AppText variant="h3" weight="bold">
                Active Bookmarks ({links.length})
              </AppText>
              {!adding && !editingId && (
                <AppButton label="+ New Link" variant="primary" onPress={startAdd} />
              )}
            </View>

            {links.map((link) => (
              <SolidCard
                key={link.id}
                radius={16}
                style={{
                  marginBottom: spacing.xs,
                  opacity: link.active ? 1 : 0.6,
                  borderLeftWidth: 4,
                  borderLeftColor: link.active ? colors.brandPrimary : colors.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: colors.pastelPrimaryBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={link.icon} size={20} color={colors.brandPrimary} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AppText weight="bold" variant="bodySmall">
                        {link.title}
                      </AppText>
                      <Badge label={link.category} tone={link.active ? 'brand' : 'neutral'} />
                    </View>
                    <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2 }}>
                      {link.url}
                    </AppText>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable
                      onPress={() => handleToggleActive(link.id)}
                      hitSlop={8}
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: radius.pill,
                        backgroundColor: link.active ? `${colors.brandPrimary}15` : colors.divider,
                      }}
                    >
                      <AppText variant="caption" weight="bold" tone={link.active ? 'brand' : 'secondary'}>
                        {link.active ? 'Active' : 'Hidden'}
                      </AppText>
                    </Pressable>

                    <Pressable onPress={() => handleTestLink(link.url)} hitSlop={8} style={{ padding: 4 }}>
                      <Ionicons name="open-outline" size={18} color={colors.brandPrimary} />
                    </Pressable>

                    <Pressable onPress={() => startEdit(link)} hitSlop={8} style={{ padding: 4 }}>
                      <Ionicons name="pencil" size={17} color={colors.brandPrimary} />
                    </Pressable>

                    <Pressable onPress={() => handleDeleteLink(link.id)} hitSlop={8} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={17} color={colors.critical} />
                    </Pressable>
                  </View>
                </View>
              </SolidCard>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
