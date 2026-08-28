import React, { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Image } from'expo-image';
import { Ionicons } from'@expo/vector-icons';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { AppText } from'../AppText';
import { AppTextField } from'../AppTextField';
import { AppButton } from'../AppButton';
import { Badge } from'../Badge';
import { SolidCard } from'../SolidCard';
import { useTheme } from'@/theme/ThemeProvider';
import { listResources, createResource, updateResource, deleteResource } from'@/api/resources';
import { Resource } from'@/api/types';
import { haptics } from'@/utils/haptics';

const RESOURCE_COVER_PRESETS = [
 { id: 'campus_library_study', label: 'Study Archive', src: require('../../../assets/images/campus_library_study.jpg') },
 { id: 'event_tech_hackathon', label: 'Code & Systems', src: require('../../../assets/images/event_tech_hackathon.jpg') },
 { id: 'student_rep_group', label: 'Faculty Notes', src: require('../../../assets/images/student_rep_group.jpg') },
 { id: 'campus_students_photo', label: 'Quad Guides', src: require('../../../assets/images/campus_students_photo.jpg') },
];

const CATEGORIES: Resource['category'][] = ['Past Questions', 'Notes', 'Projects'];

interface ManageResourcesModalProps {
 visible: boolean;
 onClose: () => void;
}

export function ManageResourcesModal({ visible, onClose }: ManageResourcesModalProps) {
 const { colors, spacing, radius, isDark } = useTheme();
 const queryClient = useQueryClient();
 const [searchQuery, setSearchQuery] = useState('');
 const [selectedCategory, setSelectedCategory] = useState<Resource['category'] | 'all'>('all');
 const [editingResource, setEditingResource] = useState<Resource | null>(null);
 const [isCreating, setIsCreating] = useState(false);

 // Form state
 const [formTitle, setFormTitle] = useState('');
 const [formCode, setFormCode] = useState('');
 const [formDept, setFormDept] = useState('');
 const [formCategory, setFormCategory] = useState<Resource['category']>('Notes');
 const [formDescription, setFormDescription] = useState('');
 const [formFileSize, setFormFileSize] = useState('2.4 MB');
 const [formCover, setFormCover] = useState('campus_library_study');
 const [saving, setSaving] = useState(false);

 const { data: resources = [], refetch } = useQuery({
 queryKey: ['resources', selectedCategory],
 queryFn: () => listResources(selectedCategory === 'all' ? {} : { category: selectedCategory }),
 });

 const filteredResources = resources.filter((r) => {
 if (!searchQuery.trim()) return true;
 const q = searchQuery.toLowerCase();
 return r.title.toLowerCase().includes(q) || r.courseCode.toLowerCase().includes(q) || r.department.toLowerCase().includes(q);
 });

 function handleOpenCreate() {
 haptics.light();
 setEditingResource(null);
 setFormTitle('');
 setFormCode('');
 setFormDept('Computer Science & AI');
 setFormCategory('Notes');
 setFormDescription('');
 setFormFileSize('3.2 MB');
 setFormCover('campus_library_study');
 setIsCreating(true);
 }

 function handleOpenEdit(resource: Resource) {
 haptics.light();
 setEditingResource(resource);
 setFormTitle(resource.title);
 setFormCode(resource.courseCode);
 setFormDept(resource.department);
 setFormCategory(resource.category);
 setFormDescription(resource.description);
 setFormFileSize(resource.fileSize);
 setFormCover('campus_library_study');
 setIsCreating(false);
 }

 async function handleSave() {
 if (!formTitle.trim() || !formCode.trim()) {
 Alert.alert('Required Fields', 'Please enter resource title and course code.');
 return;
 }

 haptics.medium();
 setSaving(true);
 try {
 if (editingResource) {
 await updateResource(editingResource.id, {
 title: formTitle.trim(),
 courseCode: formCode.trim(),
 department: formDept.trim() || 'General',
 category: formCategory,
 description: formDescription.trim(),
 fileSize: formFileSize.trim(),
 });
 Alert.alert('Resource Updated', `Saved changes for ${formTitle.trim()}.`);
 } else {
 await createResource({
 title: formTitle.trim(),
 courseCode: formCode.trim(),
 category: formCategory,
 description: formDescription.trim(),
 });
 Alert.alert('Resource Created', `${formTitle.trim()} published to library.`);
 }

 await queryClient.invalidateQueries({ queryKey: ['resources'] });
 await refetch();
 setEditingResource(null);
 setIsCreating(false);
 } catch (err: any) {
 Alert.alert('Error', err?.message ?? 'Could not save resource.');
 } finally {
 setSaving(false);
 }
 }

 async function handleDelete(resource: Resource) {
 haptics.error();
 Alert.alert(
 'Delete Resource',
 `Are you sure you want to remove"${resource.title}"? Students will no longer be able to download this file.`,
 [
 { text: 'Cancel', style: 'cancel' },
 {
 text: 'Delete',
 style: 'destructive',
 onPress: async () => {
 await deleteResource(resource.id);
 await queryClient.invalidateQueries({ queryKey: ['resources'] });
 await refetch();
 Alert.alert('Deleted', 'Resource removed from library.');
 },
 },
 ]
 );
 }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.70)', justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
              <AppText variant="h2" weight="bold">
                Manage Academic Library
              </AppText>
              <AppText tone="secondary" variant="caption">
                Admin resource files, documents & past questions
              </AppText>
            </View>

            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={{ padding: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Close resources management modal"
            >
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>

 {isCreating || editingResource ? (
 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
 <AppText variant="h3"weight="bold">
 {editingResource ? `Edit Resource: ${editingResource.title}` : 'Add Academic Resource'}
 </AppText>
 <Pressable
 onPress={() => {
 setIsCreating(false);
 setEditingResource(null);
 }}
 >
 <AppText tone="brand"variant="bodySmall"weight="bold">
 Cancel
 </AppText>
 </Pressable>
 </View>

 <AppTextField label="Resource Title *"placeholder="e.g. CSC 301 Past Exam 2024 with Solutions"value={formTitle} onChangeText={setFormTitle} />
 
 <View style={{ flexDirection: 'row', gap: spacing.md }}>
 <View style={{ flex: 1 }}>
 <AppTextField label="Course Code *"placeholder="CSC 301"value={formCode} onChangeText={setFormCode} />
 </View>
 <View style={{ flex: 1 }}>
 <AppTextField label="File Size"placeholder="3.2 MB"value={formFileSize} onChangeText={setFormFileSize} />
 </View>
 </View>

 <AppTextField label="Department"placeholder="Computer Science & AI"value={formDept} onChangeText={setFormDept} />

 {/* Category Pills */}
 <AppText variant="bodySmall"weight="bold"style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
 Category
 </AppText>
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md }}>
 {CATEGORIES.map((cat) => {
 const isSelected = formCategory === cat;
 return (
 <Pressable
 key={cat}
 onPress={() => setFormCategory(cat)}
 style={{
 paddingHorizontal: 12,
 paddingVertical: 6,
 borderRadius: radius.pill,
 backgroundColor: isSelected ? colors.brandPrimary : colors.surface,
 borderWidth: 1,
 borderColor: isSelected ? colors.brandPrimary : colors.border,
 }}
 >
 <AppText variant="caption"weight={isSelected ? 'bold' : 'regular'} style={{ color: isSelected ? (isDark ? '#0B1120' : '#FFFFFF') : colors.textPrimary }}>
 {cat}
 </AppText>
 </Pressable>
 );
 })}
 </View>

 <AppTextField label="Description & Notes"placeholder="Key topics covered, semester year, solutions guide..."value={formDescription} onChangeText={setFormDescription} multiline numberOfLines={3} />

 {/* Cover Image Selector */}
 <AppText variant="bodySmall"weight="bold"style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
 Select Resource Thumbnail / Cover
 </AppText>
 <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.lg }}>
 {RESOURCE_COVER_PRESETS.map((preset) => {
 const isSelected = formCover === preset.id;
 return (
 <Pressable
 key={preset.id}
 onPress={() => setFormCover(preset.id)}
 style={{
 width: 95,
 borderRadius: 12,
 overflow: 'hidden',
 borderWidth: 2,
 borderColor: isSelected ? colors.brandPrimary : colors.border,
 }}
 >
 <Image source={preset.src} style={{ width: '100%', height: 60 }} contentFit="cover" />
 <View style={{ padding: 4, backgroundColor: isSelected ? colors.pastelPrimaryBg : colors.surface }}>
 <AppText variant="caption"weight={isSelected ? 'bold' : 'regular'} style={{ fontSize: 9 }} numberOfLines={1}>
 {preset.label}
 </AppText>
 </View>
 </Pressable>
 );
 })}
 </ScrollView>

 <AppButton
 label={saving ? 'Saving...' : editingResource ? 'Save Resource Changes' : 'Publish Resource'}
 onPress={handleSave}
 loading={saving}
 fullWidth
 />
 </ScrollView>
 ) : (
 <View style={{ padding: spacing.lg, flex: 1 }}>
 {/* Category Filter bar */}
 <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: spacing.sm }}>
 <Pressable
 onPress={() => setSelectedCategory('all')}
 style={{
 paddingHorizontal: 12,
 paddingVertical: 5,
 borderRadius: radius.pill,
 backgroundColor: selectedCategory === 'all' ? colors.brandPrimary : colors.surface,
 borderWidth: 1,
 borderColor: selectedCategory === 'all' ? colors.brandPrimary : colors.border,
 }}
 >
 <AppText variant="caption"weight={selectedCategory === 'all' ? 'bold' : 'regular'} style={{ color: selectedCategory === 'all' ? (isDark ? '#0B1120' : '#FFFFFF') : colors.textPrimary }}>
 All
 </AppText>
 </Pressable>
 {CATEGORIES.map((cat) => {
 const isSel = selectedCategory === cat;
 return (
 <Pressable
 key={cat}
 onPress={() => setSelectedCategory(cat)}
 style={{
 paddingHorizontal: 12,
 paddingVertical: 5,
 borderRadius: radius.pill,
 backgroundColor: isSel ? colors.brandPrimary : colors.surface,
 borderWidth: 1,
 borderColor: isSel ? colors.brandPrimary : colors.border,
 }}
 >
 <AppText variant="caption"weight={isSel ? 'bold' : 'regular'} style={{ color: isSel ? (isDark ? '#0B1120' : '#FFFFFF') : colors.textPrimary }}>
 {cat}
 </AppText>
 </Pressable>
 );
 })}
 </ScrollView>

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
 placeholder="Search title, course code or department..."placeholderTextColor={colors.textSecondary}
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

 <AppButton label="Add Resource"onPress={handleOpenCreate} />
 </View>

 {/* Resource List */}
 <FlatList
 data={filteredResources}
 keyExtractor={(item) => item.id}
 showsVerticalScrollIndicator={false}
 contentContainerStyle={{ paddingBottom: 60 }}
 renderItem={({ item }) => {
 return (
 <SolidCard style={{ marginBottom: spacing.sm, padding: spacing.md }}>
 <View style={{ flexDirection: 'row', gap: spacing.md }}>
 <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}>
 <Ionicons name="document-text"size={24} color={colors.brandPrimary} />
 </View>

 <View style={{ flex: 1 }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
 <Badge label={item.courseCode} tone="brand" />
 <AppText variant="caption"tone="secondary">
 {item.fileSize} | {item.downloadsCount} dl
 </AppText>
 </View>

 <AppText weight="bold"variant="bodySmall"numberOfLines={1} style={{ marginTop: 2 }}>
 {item.title}
 </AppText>

 <AppText tone="secondary"variant="caption"numberOfLines={1}>
 {item.category} • {item.department}
 </AppText>

 <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
 <Pressable
 onPress={() => handleOpenEdit(item)}
 style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 }}
 >
 <Ionicons name="pencil"size={13} color={colors.brandPrimary} />
 <AppText variant="caption"tone="brand"weight="bold">
 Edit Resource & Cover
 </AppText>
 </Pressable>

 <Pressable
 onPress={() => handleDelete(item)}
 style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, marginLeft: spacing.sm }}
 >
 <Ionicons name="trash-outline"size={13} color={colors.critical} />
 <AppText variant="caption"style={{ color: colors.critical }} weight="bold">
 Delete
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
    </KeyboardAvoidingView>
  </Modal>
);
}
