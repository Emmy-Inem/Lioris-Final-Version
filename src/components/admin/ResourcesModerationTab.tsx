import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { listResources, createResource, updateResource, approveResource, rejectResource, deleteResource } from '@/api/resources';
import { Resource } from '@/api/types';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';

const RESOURCE_COVER_PRESETS = [
  { id: 'campus_library_study', label: 'Study Archive', src: require('../../../assets/images/campus_library_study.jpg') },
  { id: 'event_tech_hackathon', label: 'Code & Systems', src: require('../../../assets/images/event_tech_hackathon.jpg') },
  { id: 'student_rep_group', label: 'Faculty Notes', src: require('../../../assets/images/student_rep_group.jpg') },
  { id: 'campus_students_photo', label: 'Quad Guides', src: require('../../../assets/images/campus_students_photo.jpg') },
];

const CATEGORIES: Resource['category'][] = ['Past Questions', 'Notes', 'Projects'];
const LEVELS: Resource['academicLevel'][] = ['100L', '200L', '300L', '400L', '500L', 'Postgraduate'];
const FILE_TYPES: Resource['fileType'][] = ['PDF', 'DOCX', 'ZIP', 'EPUB'];

export function ResourcesModerationTab() {
  const { colors, spacing, radius, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<'approved' | 'pending'>('approved');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Resource['category'] | 'all'>('all');
  const [actingId, setActingId] = useState<string | null>(null);

  // Edit / Create Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDept, setFormDept] = useState('');
  const [formCategory, setFormCategory] = useState<Resource['category']>('Notes');
  const [formLevel, setFormLevel] = useState<Resource['academicLevel']>('300L');
  const [formFileType, setFormFileType] = useState<Resource['fileType']>('PDF');
  const [formDesc, setFormDesc] = useState('');
  const [formFileSize, setFormFileSize] = useState('3.8 MB');
  const [saving, setSaving] = useState(false);

  // Preview Document Modal State
  const [previewModalResource, setPreviewModalResource] = useState<Resource | null>(null);

  const { data: allResources = [], isLoading, refetch } = useQuery({
    queryKey: ['resources', 'admin-all-with-pending'],
    queryFn: () => listResources({ approvalStatus: 'all' }),
  });

  const pendingSubmissions = allResources.filter((r) => r.approvalStatus === 'pending');
  const approvedResources = allResources.filter((r) => r.approvalStatus !== 'pending');

  const displayedResources = (section === 'approved' ? approvedResources : pendingSubmissions).filter((r) => {
    const matchesCategory = selectedCategory === 'all' || r.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery.trim() ||
      r.title.toLowerCase().includes(q) ||
      r.courseCode.toLowerCase().includes(q) ||
      r.department.toLowerCase().includes(q) ||
      r.authorName.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  function handleOpenCreate() {
    haptics.light();
    setEditingResource(null);
    setFormTitle('');
    setFormCode('');
    setFormDept('Computer Science & AI');
    setFormCategory('Notes');
    setFormLevel('300L');
    setFormFileType('PDF');
    setFormDesc('');
    setFormFileSize('4.2 MB');
    setEditModalOpen(true);
  }

  function handleOpenEdit(resource: Resource) {
    haptics.light();
    setEditingResource(resource);
    setFormTitle(resource.title);
    setFormCode(resource.courseCode);
    setFormDept(resource.department);
    setFormCategory(resource.category);
    setFormLevel(resource.academicLevel || '300L');
    setFormFileType(resource.fileType || 'PDF');
    setFormDesc(resource.description);
    setFormFileSize(resource.fileSize);
    setEditModalOpen(true);
  }

  async function handleApprove(resource: Resource) {
    haptics.medium();
    setActingId(resource.id);
    try {
      await approveResource(resource.id);
      recordAuditLogEntry({
        action: 'report_resolved',
        summary: `Approved academic file upload: "${resource.title}" (${resource.courseCode}) by ${resource.authorName}`,
        targetType: 'resource',
        targetId: resource.id,
        reason: 'Syllabus compliance and document authenticity verified',
      });
      await queryClient.invalidateQueries({ queryKey: ['resources'] });
      await refetch();
      Alert.alert('Resource Approved & Indexed', `"${resource.title}" is now live in the student catalog.`);
    } finally {
      setActingId(null);
    }
  }

  function handleRejectConfirm(resource: Resource) {
    haptics.error();
    Alert.prompt
      ? Alert.prompt(
          'Reject Submission',
          `Provide a reason for declining "${resource.title}":`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Decline File',
              style: 'destructive',
              onPress: async (reason?: string) => {
                await rejectResource(resource.id, reason || 'Did not meet quality standards.');
                await queryClient.invalidateQueries({ queryKey: ['resources'] });
                await refetch();
                Alert.alert('Submission Rejected', 'The student has been notified with feedback.');
              },
            },
          ],
          'plain-text',
          'Incomplete solutions or unclear scans.',
        )
      : Alert.alert(
          'Reject Submission?',
          `Decline "${resource.title}" by ${resource.authorName}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Decline File',
              style: 'destructive',
              onPress: async () => {
                await rejectResource(resource.id, 'Did not meet quality standards.');
                await queryClient.invalidateQueries({ queryKey: ['resources'] });
                await refetch();
                Alert.alert('Submission Rejected', 'The file has been returned to the uploader.');
              },
            },
          ],
        );
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
          academicLevel: formLevel,
          fileType: formFileType,
          description: formDesc.trim(),
          fileSize: formFileSize.trim(),
        });
        recordAuditLogEntry({
          action: 'report_resolved',
          summary: `Updated academic resource file: "${formTitle.trim()}" (${formCode.trim()})`,
          targetType: 'resource',
          targetId: editingResource.id,
          reason: 'Resource metadata revision',
        });
        Alert.alert('Resource Updated', `Changes to "${formTitle.trim()}" have been saved.`);
      } else {
        await createResource({
          title: formTitle.trim(),
          courseCode: formCode.trim(),
          department: formDept.trim() || 'General',
          category: formCategory,
          academicLevel: formLevel,
          fileType: formFileType,
          fileSize: formFileSize.trim(),
          description: formDesc.trim(),
        });
        Alert.alert('Resource Published', `"${formTitle.trim()}" is now available in the university library.`);
      }

      await queryClient.invalidateQueries({ queryKey: ['resources'] });
      await refetch();
      setEditModalOpen(false);
      setEditingResource(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not save resource.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm(resource: Resource) {
    haptics.error();
    Alert.alert(
      'Purge Academic Resource?',
      `Permanently remove "${resource.title}" (${resource.courseCode}) from the student archive?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete File',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteResource(resource.id);
              recordAuditLogEntry({
                action: 'event_purged',
                summary: `Purged resource file: "${resource.title}" (${resource.courseCode})`,
                targetType: 'resource',
                targetId: resource.id,
                reason: 'Administrative library cleanup',
              });
              await queryClient.invalidateQueries({ queryKey: ['resources'] });
              await refetch();
              Alert.alert('Resource Deleted', 'The file has been wiped from the library catalog.');
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? 'Could not delete resource.');
            }
          },
        },
      ],
    );
  }

  return (
    <View>
      {/* Top Segmented Controls: Live Catalog vs. Review Queue */}
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
        <Pressable
          onPress={() => {
            haptics.light();
            setSection('approved');
          }}
          style={{
            flex: 1,
            paddingVertical: 8,
            alignItems: 'center',
            borderRadius: radius.pill,
            backgroundColor: section === 'approved' ? colors.brandPrimary : colors.divider,
          }}
        >
          <AppText variant="caption" weight="bold" tone={section === 'approved' ? 'inverse' : 'secondary'}>
            Live Library Archive ({approvedResources.length})
          </AppText>
        </Pressable>

        <Pressable
          onPress={() => {
            haptics.light();
            setSection('pending');
          }}
          style={{
            flex: 1,
            paddingVertical: 8,
            alignItems: 'center',
            borderRadius: radius.pill,
            backgroundColor: section === 'pending' ? colors.brandPrimary : colors.divider,
          }}
        >
          <AppText variant="caption" weight="bold" tone={section === 'pending' ? 'inverse' : 'secondary'}>
            Pending Review Queue ({pendingSubmissions.length})
          </AppText>
        </Pressable>
      </View>

      {/* Header with Search and Upload Action */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
        <View style={{ flex: 1, marginRight: spacing.sm }}>
          <AppTextField
            label=""
            placeholder="Search by course, title, uploader..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <AppButton label="+ Add File" onPress={handleOpenCreate} variant="primary" />
      </View>

      {/* Category Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.md }}
      >
        <Pressable
          onPress={() => {
            haptics.light();
            setSelectedCategory('all');
          }}
          style={{
            paddingHorizontal: spacing.sm,
            paddingVertical: 5,
            borderRadius: radius.pill,
            backgroundColor: selectedCategory === 'all' ? colors.brandPrimary : colors.divider,
          }}
        >
          <AppText variant="caption" weight="bold" tone={selectedCategory === 'all' ? 'inverse' : 'secondary'}>
            All ({section === 'approved' ? approvedResources.length : pendingSubmissions.length})
          </AppText>
        </Pressable>
        {CATEGORIES.map((cat) => {
          const selected = selectedCategory === cat;
          const count = (section === 'approved' ? approvedResources : pendingSubmissions).filter((r) => r.category === cat).length;
          return (
            <Pressable
              key={cat}
              onPress={() => {
                haptics.light();
                setSelectedCategory(cat);
              }}
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: 5,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.brandPrimary : colors.divider,
              }}
            >
              <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                {cat} ({count})
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Review Queue or Live Catalog List */}
      {displayedResources.map((resource) => {
        const isPending = resource.approvalStatus === 'pending';

        return (
          <SolidCard
            key={resource.id}
            radius={18}
            frosted
            style={{
              marginBottom: spacing.md,
              borderWidth: isPending ? 1 : 0,
              borderColor: isPending ? `${colors.brandPrimary}50` : 'transparent',
            }}
          >
            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm }}>
              <Image
                source={RESOURCE_COVER_PRESETS[0].src}
                style={{ width: 75, height: 75, borderRadius: radius.md }}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <AppText variant="body" weight="bold" style={{ flex: 1, marginRight: 6 }}>
                    {resource.title}
                  </AppText>
                  <Badge
                    label={isPending ? 'Pending Review' : 'Indexed'}
                    tone={isPending ? 'warning' : 'success'}
                  />
                </View>

                <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                  {resource.courseCode} &bull; {resource.department} &bull; {resource.fileSize} &bull; {resource.fileType || 'PDF'}
                </AppText>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <Ionicons name="person-outline" size={12} color={colors.textSecondary} />
                  <AppText tone="secondary" variant="caption">
                    Uploaded by: <AppText weight="bold">{resource.authorName}</AppText> ({resource.academicLevel || 'Student'})
                  </AppText>
                </View>
              </View>
            </View>

            {/* Document excerpt preview */}
            <View style={{ backgroundColor: colors.pastelPrimaryBg, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md }}>
              <AppText variant="caption" weight="bold" tone="brand" style={{ marginBottom: 2 }}>
                SYLLABUS & DOCUMENT EXCERPT:
              </AppText>
              <AppText tone="secondary" variant="bodySmall" numberOfLines={3}>
                {resource.description}
              </AppText>
            </View>

            {/* Actions for Pending vs Approved */}
            {isPending ? (
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <View style={{ flex: 1 }}>
                  <AppButton
                    label="Approve & Index ✓"
                    variant="primary"
                    loading={actingId === resource.id}
                    onPress={() => handleApprove(resource)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <AppButton
                    label="Reject File ✕"
                    variant="secondary"
                    loading={actingId === resource.id}
                    onPress={() => handleRejectConfirm(resource)}
                  />
                </View>
                <Pressable
                  onPress={() => setPreviewModalResource(resource)}
                  hitSlop={8}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.md,
                    backgroundColor: colors.divider,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="eye-outline" size={18} color={colors.textPrimary} />
                </Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <View style={{ flex: 1 }}>
                  <AppButton label="Edit Resource" variant="secondary" onPress={() => handleOpenEdit(resource)} />
                </View>
                <Pressable
                  onPress={() => handleDeleteConfirm(resource)}
                  hitSlop={8}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.md,
                    backgroundColor: colors.divider,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.critical} />
                </Pressable>
              </View>
            )}
          </SolidCard>
        );
      })}

      {!isLoading && displayedResources.length === 0 ? (
        <EmptyState
          title={section === 'pending' ? 'Review queue is empty' : 'No library resources found'}
          description={section === 'pending' ? 'All student and faculty upload submissions have been reviewed.' : 'Try uploading a new academic file.'}
        />
      ) : null}

      {/* Create / Edit Resource Modal */}
      <Modal visible={editModalOpen} transparent animationType="slide" onRequestClose={() => setEditModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setEditModalOpen(false)} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: spacing.lg,
              maxHeight: '90%',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="folder-outline" size={20} color={colors.brandPrimary} />
                <AppText variant="h2" weight="bold">
                  {editingResource ? 'Edit Academic Resource' : 'Publish Academic Resource'}
                </AppText>
              </View>
              <Pressable onPress={() => setEditModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <AppTextField
                label="Resource Title"
                placeholder="e.g. CSC 301 Operating Systems Past Questions 2024"
                value={formTitle}
                onChangeText={setFormTitle}
              />
              <AppTextField
                label="Course Code"
                placeholder="e.g. CSC 301"
                value={formCode}
                onChangeText={setFormCode}
                autoCapitalize="characters"
              />
              <AppTextField
                label="Academic Department"
                placeholder="e.g. Computer Science & AI"
                value={formDept}
                onChangeText={setFormDept}
              />

              {/* Category Picker */}
              <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 0.8, marginBottom: spacing.xs }}>
                RESOURCE TYPE / CATEGORY
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setFormCategory(cat)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      alignItems: 'center',
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: formCategory === cat ? colors.brandPrimary : colors.border,
                      backgroundColor: formCategory === cat ? colors.pastelPrimaryBg : colors.surface,
                    }}
                  >
                    <AppText variant="caption" weight="bold" tone={formCategory === cat ? 'brand' : 'secondary'}>
                      {cat}
                    </AppText>
                  </Pressable>
                ))}
              </View>

              {/* Academic Level & Format Row */}
              <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="caption" weight="bold" tone="brand" style={{ marginBottom: spacing.xs }}>
                    LEVEL COHORT
                  </AppText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                    {LEVELS.map((lvl) => (
                      <Pressable
                        key={lvl}
                        onPress={() => setFormLevel(lvl)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: radius.pill,
                          borderWidth: 1,
                          borderColor: formLevel === lvl ? colors.brandPrimary : colors.border,
                          backgroundColor: formLevel === lvl ? colors.pastelPrimaryBg : colors.surface,
                        }}
                      >
                        <AppText variant="caption" weight="bold" tone={formLevel === lvl ? 'brand' : 'secondary'}>
                          {lvl}
                        </AppText>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                <View style={{ flex: 1 }}>
                  <AppText variant="caption" weight="bold" tone="brand" style={{ marginBottom: spacing.xs }}>
                    FILE FORMAT
                  </AppText>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {FILE_TYPES.map((ft) => (
                      <Pressable
                        key={ft}
                        onPress={() => setFormFileType(ft)}
                        style={{
                          flex: 1,
                          paddingVertical: 6,
                          alignItems: 'center',
                          borderRadius: radius.pill,
                          borderWidth: 1,
                          borderColor: formFileType === ft ? colors.brandPrimary : colors.border,
                          backgroundColor: formFileType === ft ? colors.pastelPrimaryBg : colors.surface,
                        }}
                      >
                        <AppText variant="caption" weight="bold" tone={formFileType === ft ? 'brand' : 'secondary'}>
                          {ft}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              <AppTextField
                label="File Size (Estimated)"
                placeholder="e.g. 4.8 MB"
                value={formFileSize}
                onChangeText={setFormFileSize}
              />

              <AppTextField
                label="Description & Syllabus Coverage"
                placeholder="Detail exam year, chapters covered, lecturer notes..."
                value={formDesc}
                onChangeText={setFormDesc}
                multiline
                numberOfLines={3}
              />
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
              <AppButton label="Cancel" variant="ghost" onPress={() => setEditModalOpen(false)} />
              <AppButton
                label={editingResource ? 'Save Changes' : 'Upload to Catalog'}
                loading={saving}
                disabled={!formTitle.trim() || !formCode.trim()}
                onPress={handleSave}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Document Inspector Modal */}
      <Modal visible={!!previewModalResource} transparent animationType="fade" onRequestClose={() => setPreviewModalResource(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <AppText variant="h3" weight="bold">
                Document Inspection
              </AppText>
              <Pressable onPress={() => setPreviewModalResource(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            {previewModalResource ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <AppText variant="body" weight="bold" style={{ marginBottom: 4 }}>
                  {previewModalResource.title}
                </AppText>
                <AppText tone="brand" variant="caption" weight="bold" style={{ marginBottom: spacing.md }}>
                  {previewModalResource.courseCode} &bull; {previewModalResource.department} &bull; {previewModalResource.fileType} ({previewModalResource.fileSize})
                </AppText>

                <View style={{ backgroundColor: colors.pastelPrimaryBg, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md }}>
                  <AppText variant="caption" weight="bold" tone="brand" style={{ marginBottom: 4 }}>
                    VERIFICATION CLEARANCES:
                  </AppText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Ionicons name="shield-checkmark" size={14} color={colors.success} />
                    <AppText variant="caption">Virus & Malware Scan: Clean</AppText>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="school" size={14} color={colors.brandPrimary} />
                    <AppText variant="caption">Syllabus Match: University of Ibadan Department Archive</AppText>
                  </View>
                </View>

                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 4 }}>
                  SUMMARY & CHAPTERS:
                </AppText>
                <AppText tone="primary" variant="bodySmall" style={{ lineHeight: 20 }}>
                  {previewModalResource.description}
                </AppText>
              </ScrollView>
            ) : null}

            <View style={{ marginTop: spacing.md }}>
              <AppButton label="Close Inspection" onPress={() => setPreviewModalResource(null)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
