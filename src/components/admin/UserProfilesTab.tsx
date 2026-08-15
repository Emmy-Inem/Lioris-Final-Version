import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { UserProfile, UserRole } from '@/api/types';
import { recordAuditLogEntry } from '@/api/auditLog';
import { haptics } from '@/utils/haptics';

const INITIAL_USERS: UserProfile[] = [
  {
    id: 'user-inememmanuel',
    fullName: 'Inem Emmanuel',
    username: 'inememmanuel',
    email: 'inememmanuel@gmail.com',
    userType: 'admin',
    graduationYear: 2024,
    connectionsCount: 340,
    bio: 'Platform Root Administrator & Campus Architect. Managing multi-node workspaces & security policies.',
    department: 'Computer Science & AI',
    interests: ['Systems Architecture', 'Cloud Infrastructure', 'Cybersecurity'],
    institutionName: 'University of Ibadan',
    institutionCode: 'UI',
    avatarUrl: 'avatar_male_2',
    isVerified: true,
    verificationStatus: 'verified',
    xp: 3200,
    level: 10,
    reputationScore: 980,
    trustLevel: 10,
    streakDays: 28,
    postsCount: 16,
    resourcesCount: 24,
    eventsCount: 12,
    badgesCount: 8,
    followersCount: 340,
    followingCount: 120,
  },
  {
    id: 'user-chioma',
    fullName: 'Chioma Okonkwo',
    username: 'chioma.okonkwo',
    email: 'c.okonkwo@ui.edu.ng',
    userType: 'student',
    graduationYear: 2026,
    connectionsCount: 88,
    bio: 'Computer Science senior studying mobile distributed systems. Faculty peer tutor.',
    department: 'Computer Science & AI',
    interests: ['Mobile App Dev', 'React Native', 'Data Structures'],
    institutionName: 'University of Ibadan',
    institutionCode: 'UI',
    avatarUrl: 'avatar_female',
    isVerified: true,
    verificationStatus: 'verified',
    xp: 850,
    level: 4,
    reputationScore: 320,
    trustLevel: 8,
    streakDays: 14,
    postsCount: 6,
    resourcesCount: 12,
    eventsCount: 4,
    badgesCount: 3,
    followersCount: 112,
    followingCount: 80,
  },
  {
    id: 'user-adekunle',
    fullName: 'Adekunle Gold',
    username: 'adekunle.gold',
    email: 'a.gold@student.unilag.edu.ng',
    userType: 'student',
    graduationYear: 2025,
    connectionsCount: 142,
    bio: 'Electrical & Electronics Engineering student building embedded IoT systems.',
    department: 'Electrical Engineering',
    interests: ['Embedded Systems', 'IoT', 'Hardware'],
    institutionName: 'University of Lagos',
    institutionCode: 'UNILAG',
    avatarUrl: 'avatar_male',
    isVerified: false,
    verificationStatus: 'none',
    xp: 420,
    level: 2,
    reputationScore: 180,
    trustLevel: 6,
    streakDays: 5,
    postsCount: 3,
    resourcesCount: 4,
    eventsCount: 2,
    badgesCount: 1,
    followersCount: 64,
    followingCount: 42,
  },
  {
    id: 'user-lawal',
    fullName: 'Dr. Babatunde Lawal',
    username: 'babatunde.lawal',
    email: 'b.lawal@funaab.edu.ng',
    userType: 'staff',
    graduationYear: 2012,
    connectionsCount: 260,
    bio: 'Associate Professor & Faculty Coordinator. Researching agrarian distributed databases.',
    department: 'Agricultural Computing',
    interests: ['Distributed Databases', 'Agritech', 'Big Data'],
    institutionName: 'FUNAAB',
    institutionCode: 'FUNAAB',
    avatarUrl: 'avatar_mentor',
    isVerified: true,
    verificationStatus: 'verified',
    xp: 1800,
    level: 8,
    reputationScore: 750,
    trustLevel: 9,
    streakDays: 20,
    postsCount: 14,
    resourcesCount: 30,
    eventsCount: 8,
    badgesCount: 6,
    followersCount: 280,
    followingCount: 95,
  },
];

export function UserProfilesTab() {
  const { colors, spacing, radius, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [users, setUsers] = useState<UserProfile[]>(INITIAL_USERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('student');
  const [editDept, setEditDept] = useState('');
  const [editVerified, setEditVerified] = useState(false);
  const [editBio, setEditBio] = useState('');

  const filteredUsers = users.filter((u) => {
    const matchesRole = roleFilter === 'all' || u.userType === roleFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery.trim() ||
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.department?.toLowerCase().includes(q) ?? false) ||
      (u.institutionName?.toLowerCase().includes(q) ?? false);
    return matchesRole && matchesSearch;
  });

  function handleOpenEdit(user: UserProfile) {
    haptics.light();
    setSelectedUser(user);
    setEditName(user.fullName);
    setEditRole(user.userType);
    setEditDept(user.department ?? '');
    setEditVerified(user.isVerified);
    setEditBio(user.bio ?? '');
    setEditModalOpen(true);
  }

  function handleSaveUser() {
    if (!selectedUser) return;
    haptics.medium();
    const updated = users.map((u) => {
      if (u.id === selectedUser.id) {
        return {
          ...u,
          fullName: editName.trim() || u.fullName,
          userType: editRole,
          department: editDept.trim() || u.department,
          isVerified: editVerified,
          verificationStatus: editVerified ? ('verified' as const) : ('none' as const),
          bio: editBio.trim() || u.bio,
        };
      }
      return u;
    });

    setUsers(updated);
    recordAuditLogEntry({
      action: 'verification_approved',
      summary: `Updated profile governance & role credentials for ${editName} (${editRole.toUpperCase()})`,
      targetType: 'user',
      targetId: selectedUser.id,
      reason: 'Administrative user governance action',
    });

    setEditModalOpen(false);
    setSelectedUser(null);
    Alert.alert('Profile Updated', `Credentials and role permissions saved for ${editName}.`);
  }

  function handleToggleSuspend(user: UserProfile) {
    haptics.error();
    Alert.alert(
      'Account Security Action',
      `Suspend all session tokens and access for ${user.fullName} (${user.email})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suspend User',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Account Suspended', `${user.fullName}'s account has been restricted.`);
          },
        },
      ],
    );
  }

  return (
    <View>
      {/* Search and Role Filter Bar */}
      <View style={{ marginBottom: spacing.sm }}>
        <AppTextField
          label=""
          placeholder="Search by name, email, department, campus..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Role Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.md }}
      >
        {(['all', 'student', 'alumni', 'staff', 'admin'] as const).map((r) => {
          const selected = roleFilter === r;
          const label = r === 'all' ? 'All Roles' : r.charAt(0).toUpperCase() + r.slice(1);
          const count = r === 'all' ? users.length : users.filter((u) => u.userType === r).length;
          return (
            <Pressable
              key={r}
              onPress={() => {
                haptics.light();
                setRoleFilter(r);
              }}
              style={{
                paddingHorizontal: spacing.sm,
                paddingVertical: 5,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.brandPrimary : colors.divider,
              }}
            >
              <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                {label} ({count})
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* User Profiles List */}
      {filteredUsers.map((user) => {
        return (
          <SolidCard key={user.id} radius={18} frosted style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm }}>
              <Avatar name={user.fullName} size={50} role={user.userType} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AppText weight="bold" variant="body">
                    {user.fullName}
                  </AppText>
                  {user.isVerified ? (
                    <Ionicons name="checkmark-circle" size={16} color={colors.brandPrimary} />
                  ) : null}
                </View>
                <AppText tone="secondary" variant="caption">
                  {user.email}
                </AppText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Badge label={user.userType.toUpperCase()} tone={user.userType === 'admin' ? 'critical' : user.userType === 'staff' ? 'brand' : 'accent'} />
                  <AppText variant="caption" tone="secondary">
                    {user.institutionName ?? 'Campus Node'}
                  </AppText>
                </View>
              </View>
            </View>

            <AppText tone="secondary" variant="caption" style={{ marginBottom: spacing.sm }}>
              Dept: {user.department ?? 'General'} &bull; Trust Level: {user.trustLevel}/10 &bull; {user.postsCount} Posts &bull; {user.resourcesCount} Files
            </AppText>

            {/* Quick Action Buttons */}
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <AppButton
                  label="Edit Role & Status"
                  variant="secondary"
                  onPress={() => handleOpenEdit(user)}
                />
              </View>
              <Pressable
                onPress={() => handleToggleSuspend(user)}
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
                <Ionicons name="ban-outline" size={18} color={colors.critical} />
              </Pressable>
            </View>
          </SolidCard>
        );
      })}

      {filteredUsers.length === 0 ? (
        <EmptyState title="No users found" description="Try clearing your search query or role filter." />
      ) : null}

      {/* Edit User Modal */}
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
                <Ionicons name="person-circle-outline" size={22} color={colors.brandPrimary} />
                <AppText variant="h2" weight="bold">
                  User Governance Controls
                </AppText>
              </View>
              <Pressable onPress={() => setEditModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <AppTextField label="Full Name" value={editName} onChangeText={setEditName} />
              <AppTextField label="Academic Department" value={editDept} onChangeText={setEditDept} />

              {/* Role Picker */}
              <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 0.8, marginBottom: spacing.xs }}>
                ASSIGN ROLE & PRIVILEGES
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
                {(['student', 'alumni', 'staff', 'admin'] as UserRole[]).map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setEditRole(r)}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: 7,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: editRole === r ? colors.brandPrimary : colors.border,
                      backgroundColor: editRole === r ? colors.pastelPrimaryBg : colors.surface,
                    }}
                  >
                    <AppText variant="caption" weight="bold" tone={editRole === r ? 'brand' : 'secondary'}>
                      {r.toUpperCase()}
                    </AppText>
                  </Pressable>
                ))}
              </View>

              {/* Verified Badge Toggle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, marginBottom: spacing.sm }}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <AppText weight="bold" variant="bodySmall">
                    Verified Academic Badge
                  </AppText>
                  <AppText tone="secondary" variant="caption">
                    Grants blue checkmark and elevated trust scoring.
                  </AppText>
                </View>
                <Pressable
                  onPress={() => setEditVerified(!editVerified)}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: 6,
                    borderRadius: radius.pill,
                    backgroundColor: editVerified ? colors.pastelPrimaryBg : colors.divider,
                  }}
                >
                  <AppText variant="caption" weight="bold" tone={editVerified ? 'brand' : 'secondary'}>
                    {editVerified ? 'Verified ✓' : 'Unverified'}
                  </AppText>
                </Pressable>
              </View>

              {/* Trust Score Stepper */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, marginBottom: spacing.sm }}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <AppText weight="bold" variant="bodySmall">
                    Trust Rating Level ({selectedUser?.trustLevel ?? 8}/10)
                  </AppText>
                  <AppText tone="secondary" variant="caption">
                    Determines auto-flag exemptions and community clearance.
                  </AppText>
                </View>
                <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                  {[6, 7, 8, 9, 10].map((num) => (
                    <Pressable
                      key={num}
                      onPress={() => {
                        if (selectedUser) {
                          setSelectedUser({ ...selectedUser, trustLevel: num });
                        }
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: radius.sm,
                        backgroundColor: (selectedUser?.trustLevel ?? 8) === num ? colors.brandPrimary : colors.divider,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <AppText variant="caption" weight="bold" tone={(selectedUser?.trustLevel ?? 8) === num ? 'inverse' : 'secondary'}>
                        {num}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* MFA Reset Button */}
              <Pressable
                onPress={() => {
                  haptics.medium();
                  Alert.alert('MFA Reset', `Multi-Factor Authentication challenge reset for ${editName}. User will be prompted to re-bind on next login.`);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: spacing.sm,
                  marginBottom: spacing.md,
                }}
              >
                <Ionicons name="key-outline" size={16} color={colors.brandPrimary} />
                <AppText variant="caption" weight="bold" tone="brand">
                  Reset MFA Credentials & Sessions
                </AppText>
              </Pressable>

              <AppTextField
                label="Academic Bio / Moderator Note"
                value={editBio}
                onChangeText={setEditBio}
                multiline
                numberOfLines={3}
              />
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.md }}>
              <AppButton label="Cancel" variant="ghost" onPress={() => setEditModalOpen(false)} />
              <AppButton label="Save Changes" onPress={handleSaveUser} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
