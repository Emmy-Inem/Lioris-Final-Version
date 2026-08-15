import React, { useState } from'react';
import { Alert, Linking, Modal, Pressable, ScrollView, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'../AppText';
import { AppTextField } from'../AppTextField';
import { AppButton } from'../AppButton';
import { SolidCard } from'../SolidCard';
import { useTheme } from'@/theme/ThemeProvider';

export interface PortalLink {
  id: string;
  title: string;
  url: string;
  category: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const INITIAL_LINKS: PortalLink[] = [
  { id: '1', title: 'Campus Student Portal', url: 'https://portal.unilag.edu.ng', category: 'Academic', icon: 'school-outline' },
  { id: '2', title: 'LMS e-Learning Classroom', url: 'https://lms.ui.edu.ng', category: 'Classes', icon: 'laptop-outline' },
  { id: '3', title: 'Main Library Digital Catalog', url: 'https://library.funaab.edu.ng', category: 'Library', icon: 'book-outline' },
  { id: '4', title: 'Bursary & Fee Payment', url: 'https://bursary.campus.edu.ng', category: 'Finance', icon: 'card-outline' },
  { id: '5', title: 'University Health Center', url: 'https://health.campus.edu.ng', category: 'Health', icon: 'medkit-outline' },
];

export function ManagePortalLinksModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const [links, setLinks] = useState<PortalLink[]>(INITIAL_LINKS);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState('Academic');

  function handleDeleteLink(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  function handleCreateLink() {
    if (!newTitle.trim() || !newUrl.trim()) return;
    const created: PortalLink = {
      id: String(Date.now()),
      title: newTitle.trim(),
      url: newUrl.trim().startsWith('http') ? newUrl.trim() : `https://${newUrl.trim()}`,
      category: newCategory.trim() || 'General',
      icon: 'link-outline',
    };
    setLinks((prev) => [created, ...prev]);
    setAdding(false);
    setNewTitle('');
    setNewUrl('');
    Alert.alert('Link Published', `"${created.title}"is now available in the student Utility Hub.`);
  }

  function handleOpenLink(url: string) {
    Linking.openURL(url).catch(() => {
      Alert.alert('Open Link', `Would navigate to ${url}`);
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide"onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessible={false} />
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '85%' }}>
          <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name="link"size={20} color={colors.brandPrimary} />
              <AppText variant="h2"weight="bold">
                Manage Campus Portal Links 🔗
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close"size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <AppText tone="secondary"style={{ marginBottom: spacing.md }}>
            Publish, edit, and organize verified institutional bookmarks displayed to students and staff.
          </AppText>

          <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
            {links.map((link) => (
              <View
                key={link.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  backgroundColor: colors.surface,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: spacing.sm,
                  marginBottom: spacing.xs,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={link.icon} size={18} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold"variant="bodySmall">
                    {link.title}
                  </AppText>
                  <AppText tone="secondary"variant="caption"numberOfLines={1}>
                    {link.url} • {link.category}
                  </AppText>
                </View>
                <Pressable
                  onPress={() => handleOpenLink(link.url)}
                  hitSlop={8}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="open-outline"size={18} color={colors.brandPrimary} />
                </Pressable>
                <Pressable
                  onPress={() => handleDeleteLink(link.id)}
                  hitSlop={8}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="trash-outline"size={18} color={colors.critical} />
                </Pressable>
              </View>
            ))}

            {adding ? (
              <SolidCard style={{ marginTop: spacing.sm, borderWidth: 1, borderColor: colors.brandPrimary }}>
                <AppText weight="bold"variant="bodySmall"tone="brand"style={{ marginBottom: spacing.xs }}>
                  Add New Portal Bookmark
                </AppText>
                <AppTextField label="Link Title"placeholder="e.g. Hostels & Accommodation Portal"value={newTitle} onChangeText={setNewTitle} />
                <AppTextField label="URL Destination"placeholder="https://hostels.campus.edu.ng"value={newUrl} onChangeText={setNewUrl} autoCapitalize="none"keyboardType="url" />
                <AppTextField label="Category"placeholder="e.g. Housing, Exams, Library"value={newCategory} onChangeText={setNewCategory} />
                <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm }}>
                  <AppButton label="Cancel"variant="ghost"onPress={() => setAdding(false)} />
                  <AppButton label="Save Bookmark"disabled={!newTitle.trim() || !newUrl.trim()} onPress={handleCreateLink} />
                </View>
              </SolidCard>
            ) : null}
          </ScrollView>

          {!adding ? (
            <AppButton
              label="+ Add Portal Link"variant="secondary"onPress={() => setAdding(true)}
              fullWidth
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
