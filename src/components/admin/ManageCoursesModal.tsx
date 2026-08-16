import React, { useState } from'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, TextInput, View } from'react-native';
import { Image } from'expo-image';
import { Ionicons } from'@expo/vector-icons';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { AppText } from'../AppText';
import { AppTextField } from'../AppTextField';
import { AppButton } from'../AppButton';
import { Badge } from'../Badge';
import { SolidCard } from'../SolidCard';
import { useTheme } from'@/theme/ThemeProvider';
import { listCourses, createCourse, updateCourse, deleteCourse, Course } from'@/api/courses';
import { haptics } from'@/utils/haptics';

const COURSE_COVER_PRESETS = [
  { id: 'campus_library_study', label: 'Library & Study', src: require('../../../assets/images/campus_library_study.jpg') },
  { id: 'event_tech_hackathon', label: 'Tech & Code Arena', src: require('../../../assets/images/event_tech_hackathon.jpg') },
  { id: 'campus_students_photo', label: 'Campus Quad', src: require('../../../assets/images/campus_students_photo.jpg') },
  { id: 'hero_student_3d', label: 'Studio & Labs', src: require('../../../assets/images/hero_student_3d.jpg') },
  { id: 'student_rep_group', label: 'Academic Senate', src: require('../../../assets/images/student_rep_group.jpg') },
];

interface ManageCoursesModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ManageCoursesModal({ visible, onClose }: ManageCoursesModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [formCode, setFormCode] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDept, setFormDept] = useState('');
  const [formUnits, setFormUnits] = useState('3');
  const [formLevel, setFormLevel] = useState('300');
  const [formLecturer, setFormLecturer] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCover, setFormCover] = useState('campus_library_study');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: courses = [], refetch } = useQuery({
    queryKey: ['courses'],
    queryFn: () => listCourses(),
  });

  const filteredCourses = courses.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return c.courseCode.toLowerCase().includes(q) || c.title.toLowerCase().includes(q) || c.department.toLowerCase().includes(q);
  });

  function handleOpenCreate() {
    haptics.light();
    setEditingCourse(null);
    setFormCode('');
    setFormTitle('');
    setFormDept('Computer Science & AI');
    setFormUnits('3');
    setFormLevel('300');
    setFormLecturer('');
    setFormDescription('');
    setFormCover('campus_library_study');
    setFormError(null);
    setIsCreating(true);
  }

  function handleOpenEdit(course: Course) {
    haptics.light();
    setEditingCourse(course);
    setFormCode(course.courseCode);
    setFormTitle(course.title);
    setFormDept(course.department);
    setFormUnits(String(course.units));
    setFormLevel(String(course.level));
    setFormLecturer(course.lecturerName ?? '');
    setFormDescription(course.description);
    setFormCover(course.coverImageUrl ?? 'campus_library_study');
    setFormError(null);
    setIsCreating(false);
  }

  async function handleSave() {
    setFormError(null);
    if (!formCode.trim()) {
      setFormError('Please enter a course code (e.g. CSC 301).');
      haptics.error();
      return;
    }
    if (!formTitle.trim()) {
      setFormError('Please enter a course title.');
      haptics.error();
      return;
    }

    haptics.medium();
    setSaving(true);
    try {
      if (editingCourse) {
        await updateCourse(editingCourse.id, {
          courseCode: formCode.trim(),
          title: formTitle.trim(),
          department: formDept.trim(),
          units: Number(formUnits) || 3,
          level: Number(formLevel) || 300,
          lecturerName: formLecturer.trim() || undefined,
          description: formDescription.trim(),
          coverImageUrl: formCover,
        });
      } else {
        await createCourse({
          courseCode: formCode.trim(),
          title: formTitle.trim(),
          department: formDept.trim(),
          units: Number(formUnits) || 3,
          level: Number(formLevel) || 300,
          lecturerName: formLecturer.trim() || undefined,
          description: formDescription.trim(),
          coverImageUrl: formCover,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      refetch();
      setIsCreating(false);
      setEditingCourse(null);
      setFormError(null);
      haptics.success();
    } catch (err: any) {
      haptics.error();
      setFormError(err?.message || 'Could not save course. Please verify fields and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(course: Course) {
    haptics.error();
    Alert.alert(
      'Delete Course',
      `Are you sure you want to delete ${course.courseCode}: ${course.title}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteCourse(course.id);
            await queryClient.invalidateQueries({ queryKey: ['courses'] });
            await refetch();
            Alert.alert('Deleted', `${course.courseCode} was removed.`);
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
                Manage Courses & Curriculum
              </AppText>
              <AppText tone="secondary"variant="caption">
                Admin course catalog & syllabus editor
              </AppText>
            </View>

            <Pressable onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
              <Ionicons name="close"size={24} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* Form Modal Sub-view (Add / Edit) */}
          {isCreating || editingCourse ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                <AppText variant="h3"weight="bold">
                  {editingCourse ? `Edit Course: ${editingCourse.courseCode}` : 'Add New Course'}
                </AppText>
                <Pressable
                  onPress={() => {
                    setIsCreating(false);
                    setEditingCourse(null);
                  }}
                >
                  <AppText tone="brand"variant="bodySmall"weight="bold">
                    Cancel
                  </AppText>
                </Pressable>
              </View>

              <AppTextField label="Course Code *"placeholder="e.g. CSC 301"value={formCode} onChangeText={setFormCode} />
              <AppTextField label="Course Title *"placeholder="e.g. Advanced Operating Systems"value={formTitle} onChangeText={setFormTitle} />
              <AppTextField label="Department"placeholder="e.g. Computer Science & AI"value={formDept} onChangeText={setFormDept} />
              
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <AppTextField label="Units"placeholder="3"keyboardType="numeric"value={formUnits} onChangeText={setFormUnits} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppTextField label="Level"placeholder="300"keyboardType="numeric"value={formLevel} onChangeText={setFormLevel} />
                </View>
              </View>

              <AppTextField label="Assigned Lecturer / Professor"placeholder="e.g. Prof. Adebayo"value={formLecturer} onChangeText={setFormLecturer} />
              <AppTextField label="Course Description & Syllabus"placeholder="Brief outline of topics and prerequisites"value={formDescription} onChangeText={setFormDescription} multiline numberOfLines={3} />

              {/* Cover Image Preset Picker */}
              <AppText variant="bodySmall"weight="bold"style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
                Select Course Cover Image
              </AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.lg }}>
                {COURSE_COVER_PRESETS.map((preset) => {
                  const isSelected = formCover === preset.id;
                  return (
                    <Pressable
                      key={preset.id}
                      onPress={() => setFormCover(preset.id)}
                      style={{
                        width: 100,
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

              <AppButton
                label={saving ? 'Saving...' : editingCourse ? 'Save Changes' : 'Create Course'}
                onPress={handleSave}
                loading={saving}
                fullWidth
              />
            </ScrollView>
          ) : (
            /* Courses List View */
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
                    placeholder="Search course code or title..."placeholderTextColor={colors.textSecondary}
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

                <AppButton label="Add Course"onPress={handleOpenCreate} />
              </View>

              {/* Course Items */}
              <FlatList
                data={filteredCourses}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 60 }}
                renderItem={({ item }) => {
                  const coverPreset = COURSE_COVER_PRESETS.find((p) => p.id === item.coverImageUrl)?.src ?? COURSE_COVER_PRESETS[0].src;

                  return (
                    <SolidCard style={{ marginBottom: spacing.sm, padding: spacing.md }}>
                      <View style={{ flexDirection: 'row', gap: spacing.md }}>
                        {/* Course Image Preview */}
                        <View style={{ width: 70, height: 70, borderRadius: 10, overflow: 'hidden' }}>
                          <Image source={coverPreset} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                        </View>

                        {/* Details */}
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Badge label={item.courseCode} tone="brand" />
                            <AppText variant="caption"tone="secondary">
                              {item.units} Units | Level {item.level}
                            </AppText>
                          </View>

                          <AppText weight="bold"variant="bodySmall"numberOfLines={1} style={{ marginTop: 2 }}>
                            {item.title}
                          </AppText>

                          <AppText tone="secondary"variant="caption"numberOfLines={1}>
                            {item.lecturerName ? `Lecturer: ${item.lecturerName}` : item.department}
                          </AppText>

                          {/* Actions */}
                          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                            <Pressable
                              onPress={() => handleOpenEdit(item)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 }}
                            >
                              <Ionicons name="pencil"size={13} color={colors.brandPrimary} />
                              <AppText variant="caption"tone="brand"weight="bold">
                                Edit Course & Cover
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
      </View>
    </Modal>
  );
}
