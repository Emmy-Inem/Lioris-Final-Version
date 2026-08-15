import React, { useState } from'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, TextInput, View } from'react-native';
import { Image } from'expo-image';
import { Ionicons } from'@expo/vector-icons';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { AppText } from'../AppText';
import { AppTextField } from'../AppTextField';
import { AppButton } from'../AppButton';
import { Avatar } from'../Avatar';
import { Badge } from'../Badge';
import { SolidCard } from'../SolidCard';
import { useTheme } from'@/theme/ThemeProvider';
import { listDirectory, createDirectoryEntry, updateDirectoryEntry, deleteDirectoryEntry } from'@/api/directory';
import { AlumniDirectoryEntry } from'@/api/types';
import { haptics } from'@/utils/haptics';

const AVATAR_PRESETS = [
  { id: 'avatar_male', label: 'Student Alpha', src: require('../../../assets/images/avatar_male.jpg') },
  { id: 'avatar_female', label: 'Student Beta', src: require('../../../assets/images/avatar_female.jpg') },
  { id: 'avatar_male_2', label: 'Engineer Rep', src: require('../../../assets/images/avatar_male_2.jpg') },
  { id: 'avatar_female_2', label: 'Honor Scholar', src: require('../../../assets/images/avatar_female_2.jpg') },
  { id: 'avatar_alumni_2', label: 'Alumni Founder', src: require('../../../assets/images/avatar_alumni_2.jpg') },
  { id: 'avatar_mentor', label: 'Faculty Lead', src: require('../../../assets/images/avatar_mentor.jpg') },
];

interface ManageDirectoryModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ManageDirectoryModal({ visible, onClose }: ManageDirectoryModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEntry, setEditingEntry] = useState<AlumniDirectoryEntry | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formIndustry, setFormIndustry] = useState('Fintech');
  const [formYear, setFormYear] = useState('2021');
  const [formBio, setFormBio] = useState('');
  const [formAvatar, setFormAvatar] = useState('avatar_alumni_2');
  const [saving, setSaving] = useState(false);

  const { data: directory = [], refetch } = useQuery({
    queryKey: ['alumni-directory'],
    queryFn: () => listDirectory(),
  });

  const filteredDirectory = directory.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return d.fullName.toLowerCase().includes(q) || (d.company?.toLowerCase().includes(q) ?? false) || (d.industry?.toLowerCase().includes(q) ?? false);
  });

  function handleOpenCreate() {
    haptics.light();
    setEditingEntry(null);
    setFormName('');
    setFormCompany('Google Nigeria');
    setFormIndustry('Fintech & AI');
    setFormYear('2022');
    setFormBio('Alumni working on distributed cloud systems and tech mentorship.');
    setFormAvatar('avatar_alumni_2');
    setIsCreating(true);
  }

  function handleOpenEdit(entry: AlumniDirectoryEntry) {
    haptics.light();
    setEditingEntry(entry);
    setFormName(entry.fullName);
    setFormCompany(entry.company ?? '');
    setFormIndustry(entry.industry ?? '');
    setFormYear(String(entry.graduationYear ?? 2021));
    setFormBio(entry.bio ?? '');
    setFormAvatar(entry.avatarUrl ?? 'avatar_alumni_2');
    setIsCreating(false);
  }

  async function handleSave() {
    if (!formName.trim() || !formCompany.trim()) {
      Alert.alert('Required Fields', 'Please enter member full name and organization/company.');
      return;
    }

    haptics.medium();
    setSaving(true);
    try {
      if (editingEntry) {
        await updateDirectoryEntry(editingEntry.id, {
          fullName: formName.trim(),
          company: formCompany.trim(),
          industry: formIndustry.trim(),
          graduationYear: Number(formYear) || 2021,
          bio: formBio.trim(),
          avatarUrl: formAvatar,
        });
        Alert.alert('Directory Member Updated', `Updated profile for ${formName.trim()}.`);
      } else {
        await createDirectoryEntry({
          fullName: formName.trim(),
          company: formCompany.trim(),
          industry: formIndustry.trim() || 'Technology',
          graduationYear: Number(formYear) || 2022,
          bio: formBio.trim(),
          avatarUrl: formAvatar,
        });
        Alert.alert('Member Added', `${formName.trim()} added to verified campus directory.`);
      }

      await queryClient.invalidateQueries({ queryKey: ['alumni-directory'] });
      await refetch();
      setEditingEntry(null);
      setIsCreating(false);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not save directory entry.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry: AlumniDirectoryEntry) {
    haptics.error();
    Alert.alert(
      'Remove Directory Entry',
      `Are you sure you want to remove ${entry.fullName} from the campus directory?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteDirectoryEntry(entry.id);
            await queryClient.invalidateQueries({ queryKey: ['alumni-directory'] });
            await refetch();
            Alert.alert('Removed', `${entry.fullName} was removed.`);
          },
        },
      ]
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide"onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.70)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderTopWidth: 1,
            borderColor: colors.border,
            maxHeight: '92%',
            paddingBottom: 30,
          }}
        >
          {/* Header Bar */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: colors.divider,
            }}
          >
            <View>
              <AppText variant="h2"weight="bold">
                Manage Campus Directory
              </AppText>
              <AppText tone="secondary"variant="caption">
                Admin directory profiles, verified alumni & staff
              </AppText>
            </View>

            <Pressable onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
              <Ionicons name="close"size={24} color={colors.textPrimary} />
            </Pressable>
          </View>

          {isCreating || editingEntry ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                <AppText variant="h3"weight="bold">
                  {editingEntry ? `Edit Member: ${editingEntry.fullName}` : 'Add Directory Member'}
                </AppText>
                <Pressable
                  onPress={() => {
                    setIsCreating(false);
                    setEditingEntry(null);
                  }}
                >
                  <AppText tone="brand"variant="bodySmall"weight="bold">
                    Cancel
                  </AppText>
                </Pressable>
              </View>

              <AppTextField label="Full Name *"placeholder="e.g. Dr. Folake Solanke"value={formName} onChangeText={setFormName} />
              
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <AppTextField label="Organization / Company *"placeholder="e.g. Paystack / Google"value={formCompany} onChangeText={setFormCompany} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppTextField label="Class Year"placeholder="2020"keyboardType="numeric"value={formYear} onChangeText={setFormYear} />
                </View>
              </View>

              <AppTextField label="Industry / Specialty"placeholder="Fintech, AI, Cloud Infrastructure"value={formIndustry} onChangeText={setFormIndustry} />
              <AppTextField label="Professional Bio & Focus"placeholder="Roles, research interests, mentorship willingness..."value={formBio} onChangeText={setFormBio} multiline numberOfLines={3} />

              {/* Avatar Preset Selector */}
              <AppText variant="bodySmall"weight="bold"style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
                Select Profile Avatar Photo
              </AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.lg }}>
                {AVATAR_PRESETS.map((preset) => {
                  const isSelected = formAvatar === preset.id;
                  return (
                    <Pressable
                      key={preset.id}
                      onPress={() => setFormAvatar(preset.id)}
                      style={{
                        width: 80,
                        alignItems: 'center',
                        padding: 6,
                        borderRadius: 12,
                        backgroundColor: isSelected ? colors.pastelPrimaryBg : colors.surface,
                        borderWidth: 2,
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <Image source={preset.src} style={{ width: 50, height: 50, borderRadius: 25 }} contentFit="cover" />
                      <AppText variant="caption"weight={isSelected ? 'bold' : 'regular'} style={{ fontSize: 9, marginTop: 4 }} numberOfLines={1}>
                        {preset.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <AppButton
                label={saving ? 'Saving...' : editingEntry ? 'Save Member Profile' : 'Add to Directory'}
                onPress={handleSave}
                loading={saving}
                fullWidth
              />
            </ScrollView>
          ) : (
            <View style={{ padding: spacing.lg, flex: 1 }}>
              {/* Search & Add New Button Row */}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.surface,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.sm,
                    borderWidth: 1,
                    borderColor: colors.border,
                    height: 44,
                  }}
                >
                  <Ionicons name="search"size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
                  <TextInput
                    placeholder="Search name, company, or industry..."placeholderTextColor={colors.textSecondary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
                  />
                  {searchQuery ? (
                    <Pressable onPress={() => setSearchQuery('')}>
                      <Ionicons name="close-circle"size={16} color={colors.textSecondary} />
                    </Pressable>
                  ) : null}
                </View>

                <AppButton label="Add Member"onPress={handleOpenCreate} />
              </View>

              {/* Directory List */}
              <FlatList
                data={filteredDirectory}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 60 }}
                renderItem={({ item }) => {
                  return (
                    <SolidCard style={{ marginBottom: spacing.sm, padding: spacing.md }}>
                      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                        <Avatar name={item.fullName} uri={item.avatarUrl} size={50} role="alumni" />

                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <AppText weight="bold"variant="bodySmall">
                              {item.fullName}
                            </AppText>
                            <Badge label={`Class of'${String(item.graduationYear).slice(-2)}`} tone="brand" />
                          </View>

                          <AppText tone="brand"variant="caption"weight="semiBold">
                            {item.company} • {item.industry}
                          </AppText>

                          <AppText tone="secondary"variant="caption"numberOfLines={1}>
                            {item.bio}
                          </AppText>

                          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                            <Pressable
                              onPress={() => handleOpenEdit(item)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 }}
                            >
                              <Ionicons name="pencil"size={13} color={colors.brandPrimary} />
                              <AppText variant="caption"tone="brand"weight="bold">
                                Edit Profile & Avatar
                              </AppText>
                            </Pressable>

                            <Pressable
                              onPress={() => handleDelete(item)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, marginLeft: spacing.sm }}
                            >
                              <Ionicons name="trash-outline"size={13} color={colors.critical} />
                              <AppText variant="caption"style={{ color: colors.critical }} weight="bold">
                                Remove
                              </AppText>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    </SolidCard>
                  );
                }}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
