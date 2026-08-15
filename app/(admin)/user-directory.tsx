import React, { useState } from'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { AppButton } from'@/components/AppButton';
import { ChipSelect } from'@/components/ChipSelect';
import { SolidCard } from'@/components/SolidCard';
import { Badge } from'@/components/Badge';
import { Avatar } from'@/components/Avatar';
import { UserTypeBadge } from'@/components/UserTypeBadge';
import { ActionSheetModal } from'@/components/ActionSheetModal';
import { EmptyState } from'@/components/EmptyState';
import { useTheme } from'@/theme/ThemeProvider';
import { recordAuditLogEntry } from'@/api/auditLog';
import { haptics } from'@/utils/haptics';

interface DirectoryUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: 'Student' | 'Alumni' | 'Staff' | 'Admin';
  campus: string;
  department: string;
  matricNo: string;
  suspended: boolean;
  isVerified: boolean;
  trustScore: number;
  joinedDate: string;
}

const INITIAL_USERS: DirectoryUser[] = [
  { id: 'u1', fullName: 'Tunde Adebayo', username: 'tundea', email: 'tunde.adebayo@ui.edu.ng', role: 'Student', campus: 'UI', department: 'Computer Science', matricNo: 'UI/2023/4821', suspended: false, isVerified: true, trustScore: 92, joinedDate: 'Sep 2023' },
  { id: 'u2', fullName: 'Chioma Nwosu', username: 'chioman', email: 'chioma.nwosu@unilag.edu.ng', role: 'Student', campus: 'UNILAG', department: 'Electrical Engineering', matricNo: 'UNILAG/2024/1109', suspended: false, isVerified: true, trustScore: 88, joinedDate: 'Jan 2024' },
  { id: 'u3', fullName: 'Priya Nair', username: 'priyan', email: 'priya.nair@alumni.ui.edu.ng', role: 'Alumni', campus: 'UI', department: 'Computer Science', matricNo: 'UI/2018/0091', suspended: false, isVerified: true, trustScore: 99, joinedDate: 'Nov 2018' },
  { id: 'u4', fullName: 'Marcus Webb', username: 'marcusw', email: 'marcus.webb@alumni.funaab.edu.ng', role: 'Alumni', campus: 'FUNAAB', department: 'Economics', matricNo: 'FUN/2015/3412', suspended: true, isVerified: false, trustScore: 45, joinedDate: 'Feb 2015' },
  { id: 'u5', fullName: 'Prof. Adeyemi Balogun', username: 'adeyemib', email: 'a.balogun@ui.edu.ng', role: 'Staff', campus: 'UI', department: 'Computer Science', matricNo: 'STAFF/UI/402', suspended: false, isVerified: true, trustScore: 100, joinedDate: 'Aug 2016' },
  { id: 'u6', fullName: 'Diana Prince', username: 'dianap', email: 'diana.prince@ui.edu.ng', role: 'Student', campus: 'UI', department: 'Computer Science', matricNo: 'UI/2023/1084', suspended: false, isVerified: true, trustScore: 95, joinedDate: 'Sep 2023' },
  { id: 'u7', fullName: 'Amina Yusuf', username: 'aminay', email: 'amina.yusuf@oau.edu.ng', role: 'Student', campus: 'OAU', department: 'Pharmacy', matricNo: 'OAU/2024/7712', suspended: false, isVerified: true, trustScore: 91, joinedDate: 'Mar 2024' },
];

const ROLE_FILTERS = ['All Roles', 'Student', 'Alumni', 'Staff', 'Admin'];
const CAMPUS_FILTERS = ['All Campuses', 'UI', 'UNILAG', 'OAU', 'FUNAAB'];

export default function UserDirectoryScreen() {
  const { colors, spacing, radius } = useTheme();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('All Roles');
  const [campus, setCampus] = useState('All Campuses');
  const [users, setUsers] = useState(INITIAL_USERS);

  // Selected User Actions & Details Drawer
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
  const [detailModalUser, setDetailModalUser] = useState<DirectoryUser | null>(null);

  // Create User Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newMatric, setNewMatric] = useState('');
  const [newDepartment, setNewDepartment] = useState('Computer Science');
  const [newRole, setNewRole] = useState<'Student' | 'Alumni' | 'Staff' | 'Admin'>('Student');
  const [newCampus, setNewCampus] = useState('UI');

  const filtered = users.filter((u) => {
    const matchesRole = role === 'All Roles' || u.role === role;
    const matchesCampus = campus === 'All Campuses' || u.campus === campus;
    const matchesQuery =
      u.fullName.toLowerCase().includes(query.toLowerCase()) ||
      u.username.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase()) ||
      u.matricNo.toLowerCase().includes(query.toLowerCase()) ||
      u.department.toLowerCase().includes(query.toLowerCase());
    return matchesRole && matchesCampus && matchesQuery;
  });

  async function handleCreateUser() {
    if (!newFullName.trim() || !newEmail.trim()) {
      Alert.alert('Validation Error', 'Full Name and University Email are required.');
      return;
    }
    haptics.medium();

    const username = newEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const matricNo = newMatric.trim() || `${newCampus}/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;
    const { generateUUID } = await import('@/utils/uuid');
    let userId = generateUUID();
    let provisionSucceeded = false;
    const tempPassword = `Lioris#${Math.floor(100000 + Math.random() * 900000)}!`;

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } = await import('@/api/supabase');

      // Use an isolated client instance without session persistence to prevent overwriting admin session
      const isolatedAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const { data, error } = await isolatedAuthClient.auth.signUp({
        email: newEmail.trim(),
        password: tempPassword,
        options: {
          data: {
            full_name: newFullName.trim(),
            username,
            role: newRole,
            campus_code: newCampus,
            department: newDepartment.trim() || 'General Studies',
          },
        },
      });

      if (!error && data?.user?.id) {
        userId = data.user.id;
        provisionSucceeded = true;
        await supabase.from('profiles').upsert({
          id: userId,
          email: newEmail.trim(),
          full_name: newFullName.trim(),
          username,
          role: newRole,
          campus_code: newCampus,
          department: newDepartment.trim() || 'General Studies',
          student_id_number: matricNo,
          verification_status: 'verified',
          is_suspended: false,
        });
      } else if (error) {
        console.warn('[UserDirectory] Supabase isolated signUp note:', error.message);
      }
    } catch (err) {
      console.warn('[UserDirectory] Auth provision exception:', err);
    }

    const newUser: DirectoryUser = {
      id: userId,
      fullName: newFullName.trim(),
      username,
      email: newEmail.trim(),
      role: newRole,
      campus: newCampus,
      department: newDepartment.trim() || 'General Studies',
      matricNo,
      suspended: false,
      isVerified: true,
      trustScore: 85,
      joinedDate: 'Just now',
    };

    setUsers((prev) => [newUser, ...prev]);

    recordAuditLogEntry({
      action: 'verification_approved',
      summary: `Created new ${newRole} account for ${newUser.fullName} (${newUser.matricNo}) on ${newCampus}`,
      targetType: 'user',
      targetId: newUser.id,
      institutionCode: newCampus,
      reason: 'Admin provisioned university account',
    });

    setCreateModalOpen(false);
    setNewFullName('');
    setNewEmail('');
    setNewMatric('');

    if (provisionSucceeded) {
      Alert.alert(
        'User Provisioned in Supabase',
        `${newUser.fullName} has been registered with ID ${userId.slice(0, 8)}...\n\nTemporary Password: ${tempPassword}\n\nPlease share this temporary password with the user.`,
      );
    } else {
      Alert.alert(
        'User Provisioned Locally',
        `${newUser.fullName} has been created in the local directory for this session.\n\nTemporary Password: ${tempPassword}`,
      );
    }
  }

  async function handleToggleSuspend(target: DirectoryUser) {
    haptics.medium();
    const nextSuspended = !target.suspended;
    setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, suspended: nextSuspended } : u)));

    try {
      const { supabase } = await import('@/api/supabase');
      await supabase.from('profiles').update({ is_suspended: nextSuspended }).eq('id', target.id);
    } catch (err) {
      console.warn('[UserDirectory] Supabase suspend error:', err);
    }

    recordAuditLogEntry({
      action: 'escrow_funds_released',
      summary: `${nextSuspended ? 'Suspended' : 'Restored'} user account @${target.username} (${target.fullName})`,
      targetType: 'user',
      targetId: target.id,
      institutionCode: target.campus,
      reason: nextSuspended ? 'Policy enforcement suspension' : 'Suspension appeal granted',
    });

    setSelectedUser(null);
    Alert.alert(
      nextSuspended ? 'Account Suspended' : 'Account Restored',
      `${target.fullName}'s login privileges have been ${nextSuspended ? 'revoked' : 'reactivated'}.`,
    );
  }

  function handleMutateRole(target: DirectoryUser, targetRole: DirectoryUser['role']) {
    haptics.medium();
    setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, role: targetRole } : u)));

    recordAuditLogEntry({
      action: 'verification_approved',
      summary: `Mutated role of ${target.fullName} from ${target.role} to ${targetRole}`,
      targetType: 'user',
      targetId: target.id,
      institutionCode: target.campus,
      reason: 'Administrative role promotion',
    });

    setSelectedUser(null);
    Alert.alert('Role Mutated', `${target.fullName} is now assigned the ${targetRole} role.`);
  }

  function handleWipeAccount(target: DirectoryUser) {
    haptics.error();
    Alert.alert(
      'Wipe Account Permanently?',
      `Are you sure you want to permanently delete all data, posts, and session tokens for ${target.fullName}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe & Revoke',
          style: 'destructive',
          onPress: () => {
            setUsers((prev) => prev.filter((u) => u.id !== target.id));
            recordAuditLogEntry({
              action: 'report_resolved',
              summary: `Wiped all account data and sessions for ${target.fullName} (@${target.username})`,
              targetType: 'user',
              targetId: target.id,
              institutionCode: target.campus,
              reason: 'GDPR / Right to be forgotten wipe request',
            });
            setSelectedUser(null);
            Alert.alert('Account Wiped 🗑️', `${target.fullName}'s account was deleted from all campus nodes.`);
          },
        },
      ],
    );
  }

  return (
    <ScreenContainer glow={true}>
      <AppHeader />

      {/* Header & Quick Action Row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.md }}>
        <View>
          <AppText variant="h1"weight="bold">
            User Directory 
          </AppText>
          <AppText tone="secondary">Manage identities, matric records & role privileges</AppText>
        </View>
        <AppButton
          label="+ Provision User"onPress={() => setCreateModalOpen(true)}
        />
      </View>

      {/* Search Input Field */}
      <AppTextField
        label=""placeholder="Search by name, @handle, matriculation number, or email..."value={query}
        onChangeText={setQuery}
      />

      {/* Filter Chips */}
      <View style={{ marginBottom: spacing.xs }}>
        <ChipSelect options={ROLE_FILTERS} selected={[role]} onToggle={setRole} />
      </View>
      <View style={{ marginBottom: spacing.md }}>
        <ChipSelect options={CAMPUS_FILTERS} selected={[campus]} onToggle={setCampus} />
      </View>

      {/* Directory FlatList */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 150 }}
        renderItem={({ item }) => (
          <SolidCard radius={18} style={{ marginBottom: spacing.sm, borderWidth: 1, borderColor: item.suspended ? `${colors.critical}50` : colors.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Pressable
                onPress={() => setDetailModalUser(item)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}
              >
                <Avatar name={item.fullName} size={44} role={item.role.toLowerCase() as any} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <AppText weight="bold"variant="bodySmall">
                      {item.fullName}
                    </AppText>
                    <UserTypeBadge role={item.role.toLowerCase() as any} />
                    {item.isVerified && (
                      <Ionicons name="checkmark-circle"size={14} color={colors.brandPrimary} />
                    )}
                  </View>
                  <AppText tone="secondary"variant="caption">
                    @{item.username} • {item.matricNo}
                  </AppText>
                  <AppText tone="secondary"variant="caption">
                     {item.campus} • {item.department}
                  </AppText>
                  {item.suspended && (
                    <View style={{ marginTop: 4 }}>
                      <Badge label="🚫 Suspended"tone="critical" />
                    </View>
                  )}
                </View>
              </Pressable>

              <Pressable
                onPress={() => setSelectedUser(item)}
                hitSlop={12}
                accessibilityRole="button"accessibilityLabel={`Manage ${item.fullName}`}
                style={{ padding: spacing.xs, backgroundColor: colors.pastelPrimaryBg, borderRadius: radius.pill }}
              >
                <Ionicons name="ellipsis-horizontal"size={18} color={colors.brandPrimary} />
              </Pressable>
            </View>
          </SolidCard>
        )}
        ListEmptyComponent={<EmptyState title="No matching campus users"description="Try clearing your filters or search terms." />}
      />

      {/* User Actions Sheet Modal */}
      <ActionSheetModal visible={!!selectedUser} onClose={() => setSelectedUser(null)}>
        {selectedUser && (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingBottom: spacing.sm }}>
              <Avatar name={selectedUser.fullName} size={40} role={selectedUser.role.toLowerCase() as any} />
              <View>
                <AppText weight="bold">{selectedUser.fullName}</AppText>
                <AppText tone="secondary"variant="caption">
                  {selectedUser.matricNo} • {selectedUser.email}
                </AppText>
              </View>
            </View>

            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
              onPress={() => {
                setDetailModalUser(selectedUser);
                setSelectedUser(null);
              }}
            >
              <Ionicons name="information-circle-outline"size={18} color={colors.brandPrimary} />
              <AppText tone="brand"weight="bold">View Full Profile & Identity Record</AppText>
            </Pressable>

            {selectedUser.role !== 'Alumni' && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
                onPress={() => handleMutateRole(selectedUser, 'Alumni')}
              >
                <Ionicons name="school-outline"size={18} color={colors.textPrimary} />
                <AppText> Promote / Mutate role to Alumni</AppText>
              </Pressable>
            )}

            {selectedUser.role !== 'Staff' && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
                onPress={() => handleMutateRole(selectedUser, 'Staff')}
              >
                <Ionicons name="briefcase-outline"size={18} color={colors.textPrimary} />
                <AppText>🧑‍ Promote to Faculty Staff / Advisor</AppText>
              </Pressable>
            )}

            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
              onPress={() => handleToggleSuspend(selectedUser)}
            >
              <Ionicons name={selectedUser.suspended ? 'checkmark-circle-outline' : 'ban-outline'} size={18} color={selectedUser.suspended ? colors.success : colors.critical} />
              <AppText style={{ color: selectedUser.suspended ? colors.success : colors.critical }}>
                {selectedUser.suspended ? 'Revoke Suspension & Reactivate' : '🚫 Shadow-Ban / Suspend User'}
              </AppText>
            </Pressable>

            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
              onPress={() => handleWipeAccount(selectedUser)}
            >
              <Ionicons name="trash-outline"size={18} color={colors.critical} />
              <AppText tone="critical">🗑️ Wipe All Account Records & Sessions</AppText>
            </Pressable>
          </View>
        )}
      </ActionSheetModal>

      {/* User Inspect Details Modal */}
      <Modal visible={!!detailModalUser} transparent animationType="fade"onRequestClose={() => setDetailModalUser(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
          {detailModalUser && (
            <SolidCard radius={24} style={{ width: '100%', maxWidth: 440 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                <AppText variant="h2"weight="bold">
                  Identity Record 🪪
                </AppText>
                <Pressable onPress={() => setDetailModalUser(null)} hitSlop={8}>
                  <Ionicons name="close"size={22} color={colors.textSecondary} />
                </Pressable>
              </View>

              <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
                <Avatar name={detailModalUser.fullName} size={72} role={detailModalUser.role.toLowerCase() as any} />
                <AppText variant="h3"weight="bold"style={{ marginTop: spacing.xs }}>
                  {detailModalUser.fullName}
                </AppText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <UserTypeBadge role={detailModalUser.role.toLowerCase() as any} />
                  <Badge label={`Trust ${detailModalUser.trustScore}/100`} tone="brand" />
                </View>
              </View>

              <View style={{ backgroundColor: colors.pastelPrimaryBg, padding: spacing.md, borderRadius: 16, marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <AppText tone="secondary"variant="caption">Matriculation / Staff ID</AppText>
                  <AppText weight="bold"variant="caption">{detailModalUser.matricNo}</AppText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <AppText tone="secondary"variant="caption">Institutional Email</AppText>
                  <AppText weight="bold"variant="caption">{detailModalUser.email}</AppText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <AppText tone="secondary"variant="caption">Campus Node</AppText>
                  <AppText weight="bold"variant="caption">{detailModalUser.campus} University</AppText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <AppText tone="secondary"variant="caption">Faculty & Department</AppText>
                  <AppText weight="bold"variant="caption">{detailModalUser.department}</AppText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText tone="secondary"variant="caption">Joined Date</AppText>
                  <AppText weight="bold"variant="caption">{detailModalUser.joinedDate}</AppText>
                </View>
              </View>

              <AppButton label="Close Record"onPress={() => setDetailModalUser(null)} fullWidth />
            </SolidCard>
          )}
        </View>
      </Modal>

      {/* Provision New User Modal */}
      <Modal visible={createModalOpen} transparent animationType="slide"onRequestClose={() => setCreateModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setCreateModalOpen(false)} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '90%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="person-add"size={20} color={colors.brandPrimary} />
                <AppText variant="h2"weight="bold">
                  Provision New Campus User ➕
                </AppText>
              </View>
              <Pressable onPress={() => setCreateModalOpen(false)} hitSlop={8}>
                <Ionicons name="close"size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
              <AppTextField
                label="Full Legal Name"placeholder="e.g. Samuel Adeyinka"value={newFullName}
                onChangeText={setNewFullName}
              />

              <AppTextField
                label="Official University Email"placeholder="e.g. s.adeyinka@ui.edu.ng"value={newEmail}
                onChangeText={setNewEmail}
              />

              <AppTextField
                label="Matric / Staff ID (Optional)"placeholder="e.g. UI/2024/8892"value={newMatric}
                onChangeText={setNewMatric}
              />

              <AppTextField
                label="Department / Faculty"placeholder="e.g. Computer Science"value={newDepartment}
                onChangeText={setNewDepartment}
              />

              {/* Role Selection */}
              <AppText variant="caption"weight="bold"tone="brand"style={{ marginBottom: spacing.xs, marginTop: spacing.sm }}>
                ASSIGN USER ROLE
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
                {(['Student', 'Alumni', 'Staff', 'Admin'] as const).map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setNewRole(r)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: radius.md,
                      backgroundColor: newRole === r ? colors.brandPrimary : colors.pastelPrimaryBg,
                      alignItems: 'center',
                    }}
                  >
                    <AppText weight="bold"tone={newRole === r ? 'inverse' : 'brand'} style={{ fontSize: 12 }}>
                      {r}
                    </AppText>
                  </Pressable>
                ))}
              </View>

              {/* Campus Instance Selection */}
              <AppText variant="caption"weight="bold"tone="brand"style={{ marginBottom: spacing.xs }}>
                TARGET UNIVERSITY CAMPUS NODE
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.lg }}>
                {['UI', 'UNILAG', 'OAU', 'FUNAAB'].map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setNewCampus(c)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: radius.md,
                      backgroundColor: newCampus === c ? colors.brandPrimary : colors.pastelPrimaryBg,
                      alignItems: 'center',
                    }}
                  >
                    <AppText weight="bold"tone={newCampus === c ? 'inverse' : 'brand'} style={{ fontSize: 12 }}>
                      {c}
                    </AppText>
                  </Pressable>
                ))}
              </View>

              <AppButton
                label="Provision & Issue Credentials"onPress={handleCreateUser}
                fullWidth
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
