import React, { useState } from'react';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { useAdminBadges } from '@/components/admin/useAdminBadges';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from'@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { AppText } from'@/components/AppText';
import { AppTextField } from'@/components/AppTextField';
import { AppButton } from'@/components/AppButton';
import { ChipSelect } from'@/components/ChipSelect';
import { DepartmentPicker } from'@/components/DepartmentPicker';
import { SolidCard } from'@/components/SolidCard';
import { Badge } from'@/components/Badge';
import { Avatar } from'@/components/Avatar';
import { UserTypeBadge } from'@/components/UserTypeBadge';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { AmbassadorBadge } from '@/components/AmbassadorBadge';
import { ActionSheetModal } from'@/components/ActionSheetModal';
import { EmptyState } from'@/components/EmptyState';
import { ErrorStateView } from '@/components/ErrorStateView';
import { ShimmerCardList } from'@/components/ShimmerSkeleton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { recordAuditLogEntry, listAuditLogEntries } from '@/api/auditLog';
import { setCampusAmbassadorStatus } from '@/api/profile';
import { adminVerifyUser } from '@/api/verification';
import {
 adminTriggerPasswordReset,
 adminUpdateUserProfile,
 IMPERSONATION_REASON_MIN_LENGTH,
 MFA_REQUIRED_CODE,
 readEdgeFunctionError,
 verifyMfaCode,
} from '@/api/auth';
import { listCampuses } from '@/api/institutions';
import { usePullRefreshHandler } from '@/components/PullToRefresh';
import { getUserDiagnostics, UserDiagnostics } from '@/api/adminDiagnostics';
import { useToast } from '@/context/ToastContext';
import { AuditLogEntry } from '@/api/types';
import { getReportCountForUser, suspendUserAccount, unsuspendUserAccount } from '@/api/moderation';
import { haptics } from '@/utils/haptics';
import { useAuth } from '@/auth/AuthContext';


function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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
 isCampusAmbassador?: boolean;
 trustScore: number;
 joinedDate: string;
  lastActiveAt?: string | null;
  lastLoginAt?: string | null;
  isBot?: boolean;
  adminRole?: 'super_admin' | 'campus_admin' | null;
}

const ROLE_FILTERS = ['All Roles', 'Ambassadors', 'Student', 'Alumni', 'Staff', 'Admin'];
const ALL_CAMPUSES = 'All Campuses';

export default function UserDirectoryScreen() {
  const adminBadges = useAdminBadges();
 const { colors, spacing, radius } = useTheme();
 const { isDesktop } = useResponsive();
 const { user: currentUser, beginImpersonation } = useAuth();
 const params = useLocalSearchParams<{ q?: string }>();
 const [isImpersonating, setIsImpersonating] = useState(false);
 const [query, setQuery] = useState(() => (typeof params.q === 'string' ? params.q : ''));
 React.useEffect(() => {
   if (typeof params.q === 'string' && params.q.trim()) {
     setQuery(params.q.trim());
   }
 }, [params.q]);
 const [role, setRole] = useState('All Roles');
  const [campus, setCampus] = useState(currentUser?.isCampusAdmin && currentUser?.campusCode ? currentUser.campusCode : ALL_CAMPUSES);
  const [botFilter, setBotFilter] = useState<'all' | 'real_only' | 'bots_only'>('all');
 const [users, setUsers] = useState<DirectoryUser[]>([]);
 const [loading, setLoading] = useState(true);
 const [loadError, setLoadError] = useState<unknown>(null);
 const { data: institutions = [] } = useQuery({ queryKey: ['campuses'], queryFn: listCampuses });
 const activeInstitutions = React.useMemo(
   () => institutions.filter((institution) => institution.isActive !== false),
   [institutions],
 );

 const loadProfiles = React.useCallback(async () => {
 setLoading(true);
 setLoadError(null);
 try {
 const { supabase } = await import('@/api/supabase');
 // profiles has no direct table-level SELECT grant for authenticated users any more
 // (20260929000000_close_open_security_findings.sql); this admin-only SECURITY
 // DEFINER RPC is the sanctioned way to read every column, admins included.
  const targetCampus = currentUser?.isCampusAdmin && currentUser?.campusCode ? currentUser.campusCode : null;
  const { data, error } = await supabase.rpc('admin_get_user_profiles', { p_campus_code: targetCampus, p_limit: 5000 });
 if (error) throw error;
 if (data) {
 const mapped: DirectoryUser[] = data.map((p: any) => ({
 id: p.id,
 fullName: p.full_name || 'Campus Member',
 username: p.username || (p.email ? p.email.split('@')[0] : 'member'),
 email: p.email || '',
 // Ambassadors are campus administrators in the database, but remain
 // student representatives in the directory and retain a Student Portal.
 role: (p.is_campus_ambassador ? 'Student' : p.role ? p.role.charAt(0).toUpperCase() + p.role.slice(1) : 'Student') as any,
 campus: p.campus_code || 'GLOBAL',
 department: p.department || 'General Studies',
 matricNo: p.student_id_number || 'Not Assigned',
 suspended: p.is_suspended ?? false,
 isVerified: p.verification_status === 'verified',
 isCampusAmbassador: !!p.is_campus_ambassador,
 trustScore: p.trust_score ? Math.round(Number(p.trust_score)) : 85,
 joinedDate: p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '2024',
 lastActiveAt: p.last_active_at,
 lastLoginAt: p.last_login_at,
  isBot: !!p.is_bot,
  adminRole: p.admin_role || null,
 }));
 setUsers(mapped);
 }
 } catch (err: any) {
 console.warn('[UserDirectory] Supabase profiles load error:', err);
 setLoadError(err ?? new Error('Could not load the user directory.'));
 } finally {
 setLoading(false);
 }
  }, [currentUser?.isCampusAdmin, currentUser?.campusCode]);

  React.useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  React.useEffect(() => {
    if (currentUser?.isCampusAdmin && currentUser?.campusCode) {
      setCampus(currentUser.campusCode);
    }
  }, [currentUser?.isCampusAdmin, currentUser?.campusCode]);

  React.useEffect(() => {
    const preferred = currentUser?.isCampusAdmin && currentUser.campusCode
      ? currentUser.campusCode
      : activeInstitutions.find((institution) => institution.code !== 'GLOBAL')?.code;
    if (preferred) setNewCampus((current) => current || preferred);
  }, [activeInstitutions, currentUser?.isCampusAdmin, currentUser?.campusCode]);

  // Drag-down-to-refresh on the installed web app reloads this list instead of the whole page.
  usePullRefreshHandler(loadProfiles);

  // Every campus from the live registry plus any legacy code a profile still carries.
  const campusFilters = React.useMemo(() => {
    if (currentUser?.isCampusAdmin && currentUser?.campusCode) {
      return [currentUser.campusCode];
    }
    const codes = new Set<string>(activeInstitutions.map((i) => i.code));
    users.forEach((u) => codes.add(u.campus));
    return [ALL_CAMPUSES, ...Array.from(codes)];
  }, [users, currentUser?.isCampusAdmin, currentUser?.campusCode, activeInstitutions]);

 // Selected User Actions & Details Drawer
 const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
 const [detailModalUser, setDetailModalUser] = useState<DirectoryUser | null>(null);
 const [userAuditEntries, setUserAuditEntries] = useState<AuditLogEntry[]>([]);
 const [userAuditLoading, setUserAuditLoading] = useState(false);
 // Repeat-offender visibility: how many OTHER reports (any content type)
 // target something this person authored - lets an admin spot a pattern
 // instead of reviewing this identity in isolation. Best-effort; see
 // getReportCountForUser (src/api/moderation.ts).
 const [userReportCount, setUserReportCount] = useState(0);
 // True when the report-history or audit-trail lookup failed (so "none" is never shown for a failed load).
 const [userReportCountFailed, setUserReportCountFailed] = useState(false);
 const [userAuditFailed, setUserAuditFailed] = useState(false);

 React.useEffect(() => {
 if (!detailModalUser) {
 setUserAuditEntries([]);
 setUserReportCount(0);
 setUserReportCountFailed(false);
 setUserAuditFailed(false);
 return;
 }
 let cancelled = false;
 setUserAuditLoading(true);
 setUserAuditFailed(false);
 setUserReportCountFailed(false);
 listAuditLogEntries({ involvingUserId: detailModalUser.id })
 .then((entries) => {
 if (!cancelled) setUserAuditEntries(entries.slice(0, 5));
 })
 .catch((err) => {
 console.warn('[UserDirectory] Audit trail load error:', err);
 if (!cancelled) {
 setUserAuditEntries([]);
 setUserAuditFailed(true);
 }
 })
 .finally(() => {
 if (!cancelled) setUserAuditLoading(false);
 });
 getReportCountForUser(detailModalUser.id)
 .then((count) => {
 if (!cancelled) setUserReportCount(count);
 })
 .catch(() => {
 if (!cancelled) {
 setUserReportCount(0);
 setUserReportCountFailed(true);
 }
 });
 return () => {
 cancelled = true;
 };
 }, [detailModalUser]);

 // Create User Modal State
 const [createModalOpen, setCreateModalOpen] = useState(false);
 const [newFullName, setNewFullName] = useState('');
 const [newEmail, setNewEmail] = useState('');
 const [newMatric, setNewMatric] = useState('');
 const [newDepartment, setNewDepartment] = useState('Computer Science');
 const [newRole, setNewRole] = useState<'Student' | 'Alumni' | 'Staff' | 'Admin'>('Student');
 const [newCampus, setNewCampus] = useState('');
 const [newAdminRole, setNewAdminRole] = useState<'super_admin' | 'campus_admin'>('campus_admin');
 const [isProvisioning, setIsProvisioning] = useState(false);

 // Impersonation reason prompt (Alert.prompt is iOS-only, so use an inline modal)
 const [impersonateTarget, setImpersonateTarget] = useState<DirectoryUser | null>(null);
 const [impersonateReason, setImpersonateReason] = useState('');

 // Admin actions that the server gates behind two-factor (an admin who enrolled an authenticator
 // is asked for the 6-digit code, then the action is retried automatically).
 const [mfaPrompt, setMfaPrompt] = useState<{ title: string; retry: () => Promise<void> } | null>(null);
 const [mfaCode, setMfaCode] = useState('');
 const [mfaError, setMfaError] = useState<string | null>(null);
 const [mfaChecking, setMfaChecking] = useState(false);

 // Account-deletion reason prompt: admin-delete-user requires a recorded reason (>= 10 chars).
 const [deleteTarget, setDeleteTarget] = useState<DirectoryUser | null>(null);
 const [deleteReason, setDeleteReason] = useState('');
 const [isDeleting, setIsDeleting] = useState(false);

 // Force-sign-out: revokes a user's refresh tokens everywhere via admin-force-signout.
 // Tracks which user id is in flight so only that row's menu item shows a loading state.
 const [forceSigningOutId, setForceSigningOutId] = useState<string | null>(null);

  // Edit User Modal State
  const toast = useToast();
  const [editModalUser, setEditModalUser] = useState<DirectoryUser | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editMatric, setEditMatric] = useState('');
  const [editCampus, setEditCampus] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editRole, setEditRole] = useState<'Student' | 'Alumni' | 'Staff' | 'Admin'>('Student');
  const [editAdminRole, setEditAdminRole] = useState<'super_admin' | 'campus_admin'>('campus_admin');
  const [editVerified, setEditVerified] = useState(false);
  const [editSuspended, setEditSuspended] = useState(false);
  const [editIsAmbassador, setEditIsAmbassador] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Diagnostics (user_mutes / job_alerts / notification_preferences summary)
  // - collapsible, lazy-loaded section inside the Edit modal. Lets an admin
  // or staff member handling a complaint ("still seeing someone I muted",
  // "not getting job alert notifications") inspect that state without the
  // SQL editor.
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState<UserDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);

  function toggleDiagnostics() {
    const next = !diagnosticsExpanded;
    setDiagnosticsExpanded(next);
    if (next && !diagnosticsData && !diagnosticsLoading && editModalUser) {
      setDiagnosticsLoading(true);
      setDiagnosticsError(null);
      getUserDiagnostics(editModalUser.id)
        .then(setDiagnosticsData)
        .catch((err: any) => setDiagnosticsError(err?.message || 'Could not load diagnostics for this user.'))
        .finally(() => setDiagnosticsLoading(false));
    }
  }

  function openEditModal(target: DirectoryUser) {
    if (currentUser?.isCampusAdmin && target.role === 'Admin') {
      Alert.alert('Permission Denied', 'Campus Admins cannot edit administrator accounts. Only a Super Admin can manage admin profiles.');
      return;
    }
    setEditModalUser(target);
    setEditFullName(target.fullName);
    setEditMatric(target.matricNo === 'Not Assigned' ? '' : target.matricNo);
    setEditCampus(target.campus || activeInstitutions[0]?.code || '');
    setEditDepartment(target.department);
    setEditRole(target.role);
    setEditAdminRole(target.adminRole || 'campus_admin');
    setEditVerified(target.isVerified);
    setEditSuspended(target.suspended);
    setEditIsAmbassador(!!target.isCampusAmbassador);
    setDiagnosticsExpanded(false);
    setDiagnosticsData(null);
    setDiagnosticsError(null);
  }

  async function handleSaveEditedUser() {
    if (!editModalUser) return;
    if (!editFullName.trim()) {
      Alert.alert('Validation Error', 'Full Name cannot be empty.');
      return;
    }
    if (editRole === 'Admin' && editModalUser.role !== 'Admin' && !currentUser?.isSuperAdmin) {
      Alert.alert('Permission Denied', 'Only a Super Admin can promote a user to an Admin role.');
      return;
    }
    haptics.medium();
    setEditSaving(true);
    try {
      const orig = editModalUser;
      const targetCampus = currentUser?.isCampusAdmin ? orig.campus : editCampus;
      // Send ONLY what this admin actually changed. Re-sending the whole form from a (possibly stale)
      // directory list could silently undo a suspension or verification another admin made meanwhile.
      const updates: Record<string, any> = {};
      if (editFullName.trim() !== orig.fullName) updates.full_name = editFullName.trim();
      const nextMatric = editMatric.trim() || null;
      if ((nextMatric ?? 'Not Assigned') !== orig.matricNo) updates.student_id_number = nextMatric;
      if (targetCampus !== orig.campus) updates.campus_code = targetCampus;
      const nextDepartment = editDepartment.trim() || 'General Studies';
      if (nextDepartment !== orig.department) updates.department = nextDepartment;
      if (editRole !== orig.role) updates.role = editRole.toLowerCase();
      if (currentUser?.isSuperAdmin) {
        const nextAdminRole = editRole === 'Admin' ? editAdminRole : null;
        if (nextAdminRole !== (orig.adminRole ?? null)) updates.admin_role = nextAdminRole;
      }
      const suspensionChanged = editSuspended !== orig.suspended;
      const verificationChanged = editVerified !== orig.isVerified;
      // Revoking verification has no dedicated RPC; granting it goes through admin_verify_user() below.
      if (verificationChanged && !editVerified) updates.verification_status = 'unverified';
      if (editIsAmbassador !== !!editModalUser.isCampusAmbassador) {
        if (editIsAmbassador && editRole !== 'Student') {
          Alert.alert('Invalid Role', 'Only students can be appointed as Campus Ambassadors.');
          setEditSaving(false);
          return;
        }
        if (editIsAmbassador && editSuspended) {
          Alert.alert('Account Suspended', 'Cannot appoint a suspended student as Campus Ambassador.');
          setEditSaving(false);
          return;
        }
        await setCampusAmbassadorStatus(editModalUser.id, editIsAmbassador);
      }
      let res: { success: boolean; error?: string; notApplied?: string[] } = { success: true };
      if (Object.keys(updates).length > 0) res = await adminUpdateUserProfile(orig.id, updates);

      // Suspension and verification go through their RPCs (campus scope, hierarchy and audit in the database).
      let statusError: string | null = null;
      if (res.success && suspensionChanged) {
        try {
          if (editSuspended) await suspendUserAccount(orig.id, 'Suspended from the profile editor');
          else await unsuspendUserAccount(orig.id, 'Restored from the profile editor');
        } catch (err: any) {
          statusError = err?.message || 'The suspension change was not saved.';
        }
      }
      if (res.success && !statusError && verificationChanged && editVerified) {
        try {
          await adminVerifyUser(orig.id, 'Verified from the profile editor');
        } catch (err: any) {
          statusError = err?.message || 'The verification change was not saved.';
        }
      }

      if (res.success && !statusError) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === editModalUser.id
              ? {
                  ...u,
                  fullName: editFullName.trim(),
                  matricNo: editMatric.trim() || 'Not Assigned',
                  campus: targetCampus,
                  department: editDepartment.trim() || 'General Studies',
                  role: editRole,
                  isVerified: editVerified,
                  suspended: editSuspended,
                  adminRole: editRole === 'Admin' ? (currentUser?.isSuperAdmin ? editAdminRole : u.adminRole) : null,
                  isCampusAmbassador: editRole === 'Student' ? editIsAmbassador : false,
                }
              : u,
          ),
        );
        toast.success(Object.keys(updates).length === 0 && !suspensionChanged && !verificationChanged
          ? 'No changes to save.'
          : `Profile updated for ${editFullName.trim()}.`);
        setEditModalUser(null);
      } else {
        toast.error(statusError || res.error || 'Failed to update user profile.');
        // Part of the change may have been stored: reload so the list shows what the database really holds.
        void loadProfiles();
      }
    } finally {
      setEditSaving(false);
    }
  }

  async function handleSendPasswordResetFromModal() {
    if (!editModalUser?.email) {
      toast.error('No email address linked to this user account.');
      return;
    }
    haptics.medium();
    setEditSaving(true);
    try {
      const res = await adminTriggerPasswordReset(editModalUser.email);
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setEditSaving(false);
    }
  }

 const filtered = users.filter((u) => {
 const matchesRole = role === 'All Roles' ? true : role === 'Ambassadors' ? !!u.isCampusAmbassador : u.role === role;
 const matchesCampus = campus === ALL_CAMPUSES || u.campus === campus;
 const matchesQuery =
 u.fullName.toLowerCase().includes(query.toLowerCase()) ||
 u.username.toLowerCase().includes(query.toLowerCase()) ||
 u.email.toLowerCase().includes(query.toLowerCase()) ||
 u.matricNo.toLowerCase().includes(query.toLowerCase()) ||
 u.department.toLowerCase().includes(query.toLowerCase());
 const matchesBot = botFilter === 'all' ? true : botFilter === 'real_only' ? !u.isBot : u.isBot;
  return matchesRole && matchesCampus && matchesBot && matchesQuery;
 });

  async function handleCreateUser() {
  if (!newFullName.trim() || !newEmail.trim()) {
  Alert.alert('Validation Error', 'Full Name and University Email are required.');
  return;
  }
  if (newRole === 'Admin' && !currentUser?.isSuperAdmin) {
    Alert.alert('Permission Denied', 'Only a Super Admin can provision Admin accounts.');
    return;
  }
  haptics.medium();

  const targetCampus = currentUser?.isCampusAdmin && currentUser?.campusCode ? currentUser.campusCode : newCampus;
  const username = newEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  // Never invent a student number: the old fallback stored a random "CAMPUS/2026/1234" as if it were the
  // person's real matric number, and it then showed up on their profile and in exports.
  const matricNo = newMatric.trim();
  if (isProvisioning) return;
  setIsProvisioning(true);
  const email = newEmail.trim();
  let userId: string | null = null;

 try {
  // Accounts are created on the SERVER (admin-create-user edge function): it checks that a Campus Admin can
  // only create members of their own campus, creates the login with the service role (no CAPTCHA / public
  // sign-up limits on an admin's request), completes the profile and sends the invitation e-mail.
  const { supabase } = await import('@/api/supabase');
  const { readEdgeFunctionError } = await import('@/api/auth');
  const { data: created, error: createError } = await supabase.functions.invoke('admin-create-user', {
    body: {
      email,
      fullName: newFullName.trim(),
      role: newRole.toLowerCase(),
      campusCode: targetCampus,
      department: newDepartment.trim() || undefined,
      matricNo: matricNo || undefined,
      adminRole: currentUser?.isSuperAdmin && newRole === 'Admin' ? newAdminRole : undefined,
    },
  });
  if (createError) {
    throw await readEdgeFunctionError(createError, 'The account could not be created. Please try again.');
  }
  userId = (created as { userId?: string } | null)?.userId ?? null;
  if (!userId) throw new Error('The account could not be created. Please try again.');
  const invite = {
    success: (created as { inviteSent?: boolean }).inviteSent === true,
    message: 'the invitation e-mail could not be sent',
  };

  const newUser: DirectoryUser = {
  id: userId,
  fullName: newFullName.trim(),
  username,
  email,
  role: newRole,
  campus: targetCampus,
  department: newDepartment.trim() || 'General Studies',
  matricNo,
  suspended: false,
  isVerified: true,
  isCampusAmbassador: false,
  trustScore: 85,
  joinedDate: 'Just now',
  adminRole: newRole === 'Admin' ? (currentUser?.isSuperAdmin ? newAdminRole : null) : null,
  };
  setUsers((prev) => [newUser, ...prev]);

  // The edge function already wrote the audit entry (actor, role, campus).

 setCreateModalOpen(false);
 setNewFullName('');
 setNewEmail('');
 setNewMatric('');

 if (invite.success) {
 Alert.alert(
 'User Provisioned',
 `${newUser.fullName} has been registered with ID ${userId.slice(0, 8)}...\n\nAn invitation email was sent to ${email} so they can set their own password.`,
 );
 } else {
 Alert.alert(
 'User Provisioned - Invitation Not Sent',
 `${newUser.fullName} was registered, but the invitation email could not be sent (${invite.message}). Use the password reset option when editing the user to retry.`,
 );
 }
 } catch (err: any) {
 console.warn('[UserDirectory] Auth provision exception:', err);
 Alert.alert('Could Not Provision User', err?.message || 'The account could not be created. Please try again.');
 } finally {
 setIsProvisioning(false);
 }
 }

 // Core suspend/restore mutation - shared between the single-item toggle
 // below and the bulk suspend flow. Both go through the database RPCs only
 // (suspend_user_account / unsuspend_user_account): they enforce campus scope and the
 // admin hierarchy and write the audit entry, so there is deliberately NO raw
 // profiles update fallback - a refused suspension must surface as an error.
  async function setSuspendedCore(target: DirectoryUser, nextSuspended: boolean, reason?: string) {
    if (currentUser?.isCampusAdmin && (target.role === 'Admin' || (currentUser.campusCode && target.campus !== currentUser.campusCode))) {
      throw new Error('Campus Admins cannot suspend administrators or users outside their registered campus.');
    }
    if ((target as any).adminRole === 'super_admin' || target.email?.toLowerCase().trim() === 'inememmanuel@gmail.com') {
      throw new Error('Super Administrators cannot be suspended.');
    }
 if (nextSuspended) {
 await suspendUserAccount(target.id, reason?.trim() || 'Administrative security suspension from User Directory');
 } else {
 await unsuspendUserAccount(target.id, reason?.trim() || 'Suspension appeal granted');
 }
 }

 // Core verify mutation - there was no existing single-item "verify" action
 // in this screen (only suspend/role-change/wipe), so this is the shared
 // primitive both the new single-item and bulk verify actions call.
  async function verifyUserCore(target: DirectoryUser, note?: string) {
    if (currentUser?.isCampusAdmin && currentUser.campusCode && target.campus !== currentUser.campusCode) {
      throw new Error('Campus Admins cannot verify users outside their registered campus.');
    }
 // admin_verify_user(): campus scope + the verify permission + closing a pending request + audit, in one transaction.
 await adminVerifyUser(target.id, note || 'Administrative verification grant from User Directory');
 }

 async function handleToggleSuspend(target: DirectoryUser) {
 haptics.medium();
 const nextSuspended = !target.suspended;
 setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, suspended: nextSuspended } : u)));

 try {
 await setSuspendedCore(target, nextSuspended);
 } catch (err: any) {
 console.warn('[UserDirectory] Supabase suspend error:', err);
 // The change did not save - put the card back and say so instead of claiming success.
 setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, suspended: target.suspended } : u)));
 haptics.error();
 toast.error(err?.message || `Could not ${nextSuspended ? 'suspend' : 'restore'} ${target.fullName}. Please try again.`);
 return;
 }

 // The database function already wrote the audit entry.
 setSelectedUser(null);
 Alert.alert(
 nextSuspended ? 'Account Suspended' : 'Account Restored',
 `${target.fullName}'s login privileges have been ${nextSuspended ? 'revoked' : 'reactivated'}.`,
 );
 }

 async function handleVerifyUser(target: DirectoryUser) {
 haptics.medium();
 setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, isVerified: true } : u)));

 try {
 await verifyUserCore(target);
 } catch (err: any) {
 console.warn('[UserDirectory] Supabase verify error:', err);
 setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, isVerified: target.isVerified } : u)));
 haptics.error();
 toast.error(err?.message || `Could not verify ${target.fullName}. Please try again.`);
 return;
 }

 // The database function already wrote the audit entry.
 setSelectedUser(null);
 Alert.alert('User Verified', `${target.fullName}'s verified badge has been activated.`);
 }

 async function handleToggleAmbassador(target: DirectoryUser) {
   if (currentUser?.isCampusAdmin && (target.role === 'Admin' || (currentUser.campusCode && target.campus !== currentUser.campusCode))) {
     Alert.alert('Permission Denied', 'Campus Admins cannot assign ambassadors outside their campus or to administrators.');
     return;
   }
   haptics.medium();
   const nextStatus = !target.isCampusAmbassador;
   try {
     await setCampusAmbassadorStatus(target.id, nextStatus);
     setUsers((prev) =>
       prev.map((u) => (u.id === target.id ? { ...u, isCampusAmbassador: nextStatus } : u))
     );
     if (selectedUser?.id === target.id) {
       setSelectedUser((prev) => (prev ? { ...prev, isCampusAmbassador: nextStatus } : null));
     }
     if (detailModalUser?.id === target.id) {
       setDetailModalUser((prev) => (prev ? { ...prev, isCampusAmbassador: nextStatus } : null));
     }
     recordAuditLogEntry({
       action: 'campus_ambassador_updated',
       summary: `${nextStatus ? 'Appointed' : 'Revoked'} @${target.username} (${target.fullName}) as Campus Ambassador for ${target.campus}`,
       targetType: 'user',
       targetId: target.id,
       institutionCode: target.campus,
       reason: 'Administrative ambassador assignment',
     });
     if (nextStatus) {
       toast.success(`${target.fullName} is now a Campus Ambassador.`);
     } else {
       toast.success(`Campus Ambassador status revoked for ${target.fullName}.`);
     }
   } catch (err: any) {
     haptics.error();
     toast.error(err?.message || 'Could not update ambassador status.');
   }
 }

 // Bulk selection state - lets an admin suspend or verify many directory
 // users at once instead of one at a time. Role changes and permanent
 // deletion are deliberately NOT bulk-enabled here - those stay single-item
 // with their existing confirmation friction since they're higher risk
 // (account termination, admin-role grants).
 const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
 const [bulkProcessing, setBulkProcessing] = useState(false);

 function toggleUserSelected(id: string) {
 haptics.light();
 setSelectedUserIds((prev) => {
 const next = new Set(prev);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 return next;
 });
 }

 function clearUserSelection() {
 setSelectedUserIds(new Set());
 }

 // The selection is always intersected with the rows currently VISIBLE (`filtered`): a user who was
 // ticked and then filtered out of view must never be suspended or verified by a bulk action the
 // admin cannot see the target list of.
 function getSelectedUsers(): DirectoryUser[] {
 return filtered.filter((u) => selectedUserIds.has(u.id));
 }

 // Bulk confirmation: shows the count and requires a recorded reason before anything is changed.
 const BULK_ACTION_CAP = 50;
 const BULK_REASON_MIN = 5;
 const [bulkConfirm, setBulkConfirm] = useState<{ kind: 'suspend' | 'verify'; targets: DirectoryUser[] } | null>(null);
 const [bulkReason, setBulkReason] = useState('');

 function startBulkAction(kind: 'suspend' | 'verify') {
 if (bulkProcessing) return;
 const visibleSelected = getSelectedUsers();
 // Only acts on rows where the action is not already in effect - re-suspending an
 // already-suspended account is a no-op that would just muddy the count.
 const targets = visibleSelected.filter((u) => (kind === 'suspend' ? !u.suspended : !u.isVerified));
 if (targets.length === 0) {
 Alert.alert(
 kind === 'suspend' ? 'Nothing to Suspend' : 'Nothing to Verify',
 visibleSelected.length === 0
 ? 'None of the selected users are visible in the current list. Adjust the filters or select users again.'
 : kind === 'suspend' ? 'All selected users are already suspended.' : 'All selected users are already verified.',
 );
 return;
 }
 if (targets.length > BULK_ACTION_CAP) {
 Alert.alert('Too Many Users', `A bulk action is limited to ${BULK_ACTION_CAP} users at a time. You have ${targets.length} selected - deselect some and try again.`);
 return;
 }
 haptics.medium();
 setBulkReason('');
 setBulkConfirm({ kind, targets });
 }

 async function runBulkAction() {
 if (!bulkConfirm || bulkProcessing) return;
 const { kind, targets } = bulkConfirm;
 const reason = bulkReason.trim();
 if (reason.length < BULK_REASON_MIN) return;
 setBulkConfirm(null);
 haptics.medium();
 setBulkProcessing(true);

 let succeeded = 0;
 const failures: string[] = [];
 for (const target of targets) {
 try {
 if (kind === 'suspend') {
 await setSuspendedCore(target, true, `${reason} (bulk action)`);
 setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, suspended: true } : u)));
 } else {
 await verifyUserCore(target, `${reason} (bulk action)`);
 setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, isVerified: true } : u)));
 }
 succeeded += 1;
 } catch (err: any) {
 console.warn(`[UserDirectory] Bulk ${kind} error for`, target.id, err);
 failures.push(`${target.fullName}: ${err?.message || 'failed'}`);
 }
 }

 setBulkProcessing(false);
 clearUserSelection();
 if (failures.length > 0) haptics.error();
 else haptics.success();

 const done = kind === 'suspend' ? 'suspended' : 'verified';
 Alert.alert(
 kind === 'suspend' ? 'Bulk Suspend Complete' : 'Bulk Verify Complete',
 failures.length > 0
 ? `${succeeded} ${done}, ${failures.length} failed.\n\n${failures.slice(0, 5).join('\n')}${failures.length > 5 ? `\n...and ${failures.length - 5} more` : ''}`
 : `${succeeded} user${succeeded === 1 ? '' : 's'} ${done}.`,
 );
 }

 function handleBulkSuspend() {
 startBulkAction('suspend');
 }

 function handleBulkVerify() {
 startBulkAction('verify');
 }

  function handleMutateRole(target: DirectoryUser, targetRole: DirectoryUser['role']) {
    if (currentUser?.isCampusAdmin && target.role === 'Admin') {
      Alert.alert('Permission Denied', 'Campus Admins cannot modify administrator accounts.');
      return;
    }
    if (targetRole === 'Admin' && !currentUser?.isSuperAdmin) {
      Alert.alert('Permission Denied', 'Only a Super Admin can promote a member to an Admin role.');
      return;
    }
 const isGrantingAdmin = targetRole === 'Admin';
 Alert.alert(
 isGrantingAdmin ? 'Grant FULL Admin Access?' : `Change Role to ${targetRole}?`,
 isGrantingAdmin
 ? `Grant FULL ADMIN access to ${target.fullName}? This gives them complete platform control, including the ability to modify other users, moderate content, and change platform-wide settings.`
 : `Change ${target.fullName}'s role from ${target.role} to ${targetRole}? This immediately changes their permissions on the platform.`,
 [
 { text: 'Cancel', style: 'cancel' },
 {
 text: isGrantingAdmin ? 'Grant Admin Access' : 'Confirm Change',
 style: isGrantingAdmin ? 'destructive' : 'default',
 onPress: () => performRoleMutation(target, targetRole),
 },
 ],
 );
 }

  async function performRoleMutation(target: DirectoryUser, targetRole: DirectoryUser['role']) {
    if (currentUser?.isCampusAdmin && target.role === 'Admin') {
      Alert.alert('Permission Denied', 'Campus Admins cannot modify administrator accounts.');
      return;
    }
    if (targetRole === 'Admin' && !currentUser?.isSuperAdmin) {
      Alert.alert('Permission Denied', 'Only a Super Admin can promote a member to an Admin role.');
      return;
    }
    haptics.medium();
    try {
      const updates: Record<string, any> = { role: targetRole.toLowerCase() };
      if (currentUser?.isSuperAdmin) {
        updates.admin_role = targetRole === 'Admin' ? 'campus_admin' : null;
      }
      const result = await adminUpdateUserProfile(target.id, updates);
      if (!result.success) throw new Error(result.error || 'The role change was not saved.');

      setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, role: targetRole, adminRole: targetRole === 'Admin' ? 'campus_admin' : null } : u)));

 await recordAuditLogEntry({
 action: 'user_role_changed',
 summary: `Mutated role of ${target.fullName} from ${target.role} to ${targetRole}`,
 targetType: 'user',
 targetId: target.id,
 institutionCode: target.campus,
 reason: 'Administrative role promotion',
 });

 setSelectedUser(null);
 haptics.success();
 Alert.alert('Role Mutated', `${target.fullName} is now assigned the ${targetRole} role.`);
 } catch (err: any) {
 haptics.error();
 toast.error(err?.message || 'The role change was not saved. Please try again.');
 }
 }

 function handleImpersonate(target: DirectoryUser) {
 haptics.medium();
 Alert.alert(
 'View As (Support Mode)?',
 `This will temporarily switch your session to view the app as ${target.fullName} (@${target.username}) for support purposes.\n\n` +
 `You will see exactly what they see, including their private data. This is time-boxed and automatically ends in 15 minutes, ` +
 `and is fully audit-logged - both starting and ending this session are recorded against your admin account.\n\n` +
 `You will be asked for a reason next.`,
 [
 { text: 'Cancel', style: 'cancel' },
 {
 text: 'Continue',
 style: 'destructive',
 onPress: () => {
 setImpersonateReason('');
 setImpersonateTarget(target);
 },
 },
 ],
 );
 }

 async function confirmImpersonate(target: DirectoryUser, reason: string) {
 if (isImpersonating) return;
 if (reason.trim().length < IMPERSONATION_REASON_MIN_LENGTH) {
 Alert.alert('Reason Required', `Please describe why you need to view as this user (at least ${IMPERSONATION_REASON_MIN_LENGTH} characters).`);
 return;
 }
 setIsImpersonating(true);
 try {
 setSelectedUser(null);
 setImpersonateTarget(null);
 await beginImpersonation(target.id, reason.trim());
 } catch (err: any) {
 console.warn('[UserDirectory] beginImpersonation error:', err);
 if (err?.code === MFA_REQUIRED_CODE) {
 promptForMfa('Verify to Start Support Mode', () => confirmImpersonate(target, reason));
 } else {
 haptics.error();
 Alert.alert('Could Not Start Support Mode', err?.message || 'Unable to start impersonation. Please try again.');
 }
 } finally {
 setIsImpersonating(false);
 }
 }

 function promptForMfa(title: string, retry: () => Promise<void>) {
 setMfaCode('');
 setMfaError(null);
 setMfaPrompt({ title, retry });
 }

 async function submitMfaCode() {
 if (!mfaPrompt || mfaChecking) return;
 setMfaChecking(true);
 setMfaError(null);
 try {
 await verifyMfaCode(mfaCode);
 } catch (err: any) {
 haptics.error();
 const message: string = err?.message || 'That code was not accepted. Please try again.';
 setMfaError(
 /not set up/i.test(message)
 ? 'This action needs two-factor authentication, but it is not turned on for your account. Turn it on in Settings → Security, then try again.'
 : message,
 );
 setMfaChecking(false);
 return;
 }
 const retry = mfaPrompt.retry;
 setMfaPrompt(null);
 setMfaCode('');
 setMfaChecking(false);
 await retry();
 }

  async function handleWipeAccount(target: DirectoryUser) {
    if (!currentUser?.isSuperAdmin) {
      Alert.alert('Permission Denied', 'Only Super Administrators can permanently delete user accounts.');
      return;
    }
 haptics.error();
 Alert.alert(
 'Permanently Delete Account?',
 `This will PERMANENTLY delete ${target.fullName}'s (@${target.username}) login credentials and all profile data (name, student ID record, department, trust score, etc.).\n\n` +
 `${target.fullName} will be immediately signed out and will NO LONGER be able to log in - this action cannot be undone and cannot be reversed by re-provisioning a profile.\n\n` +
 `To confirm you understand this is irreversible, tap "Delete Forever" below.`,
 [
 { text: 'Cancel', style: 'cancel' },
 {
 text: 'Delete Forever',
 style: 'destructive',
 onPress: () => {
 // Collect the audit reason in an inline modal (Alert.prompt is iOS-only).
 setDeleteReason('');
 setDeleteTarget(target);
 },
 },
 ],
 );
 }

 async function confirmWipeAccount(target: DirectoryUser, reason: string) {
 if (reason.trim().length < IMPERSONATION_REASON_MIN_LENGTH) {
 Alert.alert('Reason Required', `Please record why this account is being deleted (at least ${IMPERSONATION_REASON_MIN_LENGTH} characters).`);
 return;
 }
 setIsDeleting(true);
 try {
 const { supabase } = await import('@/api/supabase');
 const { data, error } = await supabase.functions.invoke('admin-delete-user', {
 body: { targetUserId: target.id, reason: reason.trim() },
 });

 if (error || (data && data.error)) {
 const failure = error
 ? await readEdgeFunctionError(error, 'Unknown error')
 : { code: undefined, message: (data && data.error) || 'Unknown error' };
 console.warn('[UserDirectory] admin-delete-user error:', failure.message);
 if (failure.code === MFA_REQUIRED_CODE) {
 setIsDeleting(false);
 promptForMfa('Verify to Delete Account', () => confirmWipeAccount(target, reason));
 return;
 }
 Alert.alert('Deletion Failed', `Could not fully delete ${target.fullName}'s account: ${failure.message}`);
 return;
 }

 setDeleteTarget(null);
 setUsers((prev) => prev.filter((u) => u.id !== target.id));
 setSelectedUser(null);
 Alert.alert(
 'Account Permanently Deleted',
 `${target.fullName}'s login credentials, profile data and uploaded files have been permanently removed.`,
 );
 } catch (err: any) {
 console.warn('[UserDirectory] admin-delete-user invoke error:', err);
 Alert.alert('Deletion Failed', `Could not reach the deletion service: ${err?.message || 'Unknown error'}`);
 } finally {
 setIsDeleting(false);
 }
 }

 // Kills a (possibly compromised) user's session everywhere right now, short of
 // suspending the account: admin-force-signout revokes their refresh tokens via
 // the Supabase Admin API, so every device currently signed in is forced to log
 // back in. This is disruptive for the target, hence the confirmation first.
 function handleForceSignOut(target: DirectoryUser) {
 if (currentUser?.isCampusAdmin && (target.role === 'Admin' || (currentUser.campusCode && target.campus !== currentUser.campusCode))) {
   Alert.alert('Permission Denied', 'Campus Admins cannot sign out administrators or users outside their registered campus.');
   return;
 }
 if ((target as any).adminRole === 'super_admin' || target.email?.toLowerCase().trim() === 'inememmanuel@gmail.com') {
   if (!currentUser?.isSuperAdmin) {
     Alert.alert('Permission Denied', 'Super Administrators cannot be forced to sign out by campus admins.');
     return;
   }
 }
 haptics.medium();
 Alert.alert(
 'Force Sign Out?',
 `This immediately ends ${target.fullName}'s (@${target.username}) session everywhere - every phone, browser and tab currently signed in will be signed out and need to log back in.\n\n` +
 `Their account is not suspended and they can sign back in right away. Use this if you suspect their session (not their password) is compromised.`,
 [
 { text: 'Cancel', style: 'cancel' },
 {
 text: 'Sign Out Everywhere',
 style: 'destructive',
 onPress: () => confirmForceSignOut(target),
 },
 ],
 );
 }

 async function confirmForceSignOut(target: DirectoryUser) {
 if (currentUser?.isCampusAdmin && (target.role === 'Admin' || (currentUser.campusCode && target.campus !== currentUser.campusCode))) {
   Alert.alert('Permission Denied', 'Campus Admins cannot sign out administrators or users outside their registered campus.');
   return;
 }
 if ((target as any).adminRole === 'super_admin' || target.email?.toLowerCase().trim() === 'inememmanuel@gmail.com') {
   if (!currentUser?.isSuperAdmin) {
     Alert.alert('Permission Denied', 'Super Administrators cannot be forced to sign out by campus admins.');
     return;
   }
 }
 if (forceSigningOutId) return;
 setForceSigningOutId(target.id);
 try {
 const { supabase } = await import('@/api/supabase');
 const { data, error } = await supabase.functions.invoke('admin-force-signout', {
 body: { targetUserId: target.id },
 });

 if (error || (data && (data as any).error)) {
 const failure = error
 ? await readEdgeFunctionError(error, 'Unknown error')
 : { code: undefined, message: (data && (data as any).error) || 'Unknown error' };
 console.warn('[UserDirectory] admin-force-signout error:', failure.message);
 if (failure.code === MFA_REQUIRED_CODE) {
 setForceSigningOutId(null);
 promptForMfa('Verify to Force Sign Out', () => confirmForceSignOut(target));
 return;
 }
 Alert.alert('Could Not Sign Out', `Could not end ${target.fullName}'s session: ${failure.message}`);
 return;
 }

 setSelectedUser(null);
 toast.success(`${target.fullName} has been signed out everywhere.`);
 } catch (err: any) {
 console.warn('[UserDirectory] admin-force-signout invoke error:', err);
 Alert.alert('Could Not Sign Out', `Could not reach the sign-out service: ${err?.message || 'Unknown error'}`);
 } finally {
 setForceSigningOutId(null);
 }
 }

  return (
    <ScreenContainer glow={true}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: isDesktop ? 4 : 8 }}>
        <AdminSectionTabs group="people" badges={{ verification: adminBadges.verification, support: adminBadges.support }} />
      </View>

      {/* Header & Quick Action Row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', rowGap: spacing.sm, marginTop: isDesktop ? spacing.xs : spacing.md, marginBottom: spacing.md, gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold">
            User Directory
          </AppText>
          <AppText tone="secondary" variant="caption">Manage identities, student ID records & role privileges</AppText>
        </View>
        <View style={{ flexShrink: 0 }}>
          <AppButton
            label={isDesktop ? '+ Provision User' : '+ Provision'}
            size="sm"
            onPress={() => setCreateModalOpen(true)}
          />
        </View>
      </View>

      {/* Bulk Action Bar - only appears once the admin has checked at least one user */}
      {selectedUserIds.size > 0 && (
        <SolidCard radius={16} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.pastelPrimaryBg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 120 }}>
              <AppText weight="bold" variant="bodySmall">
                {getSelectedUsers().length} selected
                {getSelectedUsers().length !== selectedUserIds.size ? ` (${selectedUserIds.size - getSelectedUsers().length} hidden by filters)` : ''}
              </AppText>
            </View>
            <View style={{ flexShrink: 0 }}>
              <AppButton label="Clear" variant="ghost" size="sm" onPress={clearUserSelection} disabled={bulkProcessing} />
            </View>
            <View style={{ flexShrink: 0, minWidth: 130 }}>
              <AppButton label="Bulk Suspend" variant="secondary" size="sm" loading={bulkProcessing} onPress={handleBulkSuspend} />
            </View>
            <View style={{ flexShrink: 0, minWidth: 120 }}>
              <AppButton label="Bulk Verify" size="sm" loading={bulkProcessing} onPress={handleBulkVerify} />
            </View>
          </View>
        </SolidCard>
      )}

      {loadError && !loading ? (
        <ErrorStateView
          compact={users.length > 0}
          subject="the user directory"
          title={users.length > 0 ? "Couldn't refresh the directory" : undefined}
          error={loadError}
          onRetry={loadProfiles}
          style={{ marginBottom: spacing.md }}
        />
      ) : null}

      {loading && users.length === 0 ? (
        <ShimmerCardList count={isDesktop ? 6 : 4} />
      ) : isDesktop ? (
        <ScrollView
          style={{ flex: 1, minHeight: 0, width: '100%' }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 100 }}
        >
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
          {/* Left Column: Search & Filters Rail */}
          <View style={{ width: 280, flexShrink: 0, gap: spacing.md }}>
            <SolidCard radius={20} style={{ padding: spacing.md, gap: spacing.sm }}>
              <AppText variant="bodySmall" weight="bold">
                Search Members
              </AppText>
              <AppTextField
                label=""
                placeholder="Name, @handle, ID..."
                value={query}
                onChangeText={setQuery}
              />

              <AppText variant="caption" tone="secondary" weight="bold" style={{ textTransform: 'uppercase', marginTop: spacing.xs, fontSize: 10 }}>
                Filter by Role
              </AppText>
              <View style={{ gap: 4 }}>
                {ROLE_FILTERS.map((r) => {
                  const selected = role === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => setRole(r)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: radius.md,
                        backgroundColor: selected ? colors.brandPrimary : colors.surface,
                        borderWidth: 1,
                        borderColor: selected ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <AppText variant="bodySmall" weight={selected ? 'bold' : 'medium'} tone={selected ? 'inverse' : 'primary'}>
                        {r}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              <AppText variant="caption" tone="secondary" weight="bold" style={{ textTransform: 'uppercase', marginTop: spacing.xs, fontSize: 10 }}>
                Campus Node
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {campusFilters.map((c) => {
                  const selected = campus === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setCampus(c)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: radius.pill,
                        backgroundColor: selected ? colors.brandPrimary : colors.surface,
                        borderWidth: 1,
                        borderColor: selected ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <AppText variant="caption" weight={selected ? 'bold' : 'medium'} tone={selected ? 'inverse' : 'secondary'}>
                        {c}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </SolidCard>

            <SolidCard radius={20} style={{ padding: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <AppText variant="caption" tone="secondary">Total Filtered</AppText>
                {loadError && users.length === 0 ? <Badge label="- Users" tone="neutral" /> : <Badge label={`${filtered.length} Users`} tone="neutral" />}
              </View>
              <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                Live synchronized with multi-campus profiles table.
              </AppText>
            </SolidCard>
          </View>

          {/* Right Column: User Cards Grid */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <FlatList
              scrollEnabled={false}
              data={filtered}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={{ gap: spacing.md }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.sm }}
              renderItem={({ item }) => (
                <View style={{ flex: 1, minWidth: 0, marginBottom: spacing.xs }}>
                  <SolidCard radius={18} style={{ borderWidth: 1, borderColor: item.suspended ? `${colors.critical}50` : colors.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Pressable
                        onPress={() => toggleUserSelected(item.id)}
                        hitSlop={8}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selectedUserIds.has(item.id) }}
                        aria-checked={selectedUserIds.has(item.id)}
                        accessibilityLabel={`Select ${item.fullName}`}
                        style={{ flexShrink: 0, marginRight: spacing.xs }}
                      >
                        <Ionicons
                          name={selectedUserIds.has(item.id) ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={selectedUserIds.has(item.id) ? colors.brandPrimary : colors.textSecondary}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => setDetailModalUser(item)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}
                      >
                        <Avatar name={item.fullName} size={44} role={item.role.toLowerCase() as any} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <AppText weight="bold" variant="bodySmall" style={{ flexShrink: 1 }}>
                              {item.fullName}
                            </AppText>
                            <UserTypeBadge role={item.role.toLowerCase() as any} />
                            {item.role === 'Admin' && item.adminRole ? (
                              <Badge
                                label={item.adminRole === 'super_admin' ? 'Super Admin' : 'Campus Admin'}
                                tone={item.adminRole === 'super_admin' ? 'critical' : 'brand'}
                              />
                            ) : null}
                            {item.isVerified && (
                              <VerifiedBadge size={14} role={item.role.toLowerCase() as any} name={item.fullName} showModalOnPress={false} />
                            )}
                            {item.isCampusAmbassador && (
                              <Badge label="Ambassador" tone="brand" />
                            )}
                          </View>
                          <AppText tone="secondary" variant="caption">
                            @{item.username} • {item.matricNo}
                          </AppText>
                          <AppText tone="secondary" variant="caption">
                            {item.campus} • {item.department}
                          </AppText>
                          {item.suspended && (
                            <View style={{ marginTop: 4 }}>
                              <Badge label="Suspended" tone="critical" />
                            </View>
                          )}
                        </View>
                      </Pressable>

                      <Pressable
                        onPress={() => setSelectedUser(item)}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={`Manage ${item.fullName}`}
                        style={{ padding: spacing.xs, backgroundColor: colors.divider, borderRadius: radius.pill }}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                  </SolidCard>
                </View>
              )}
              ListEmptyComponent={loadError && users.length === 0 ? null : <EmptyState title="No matching campus users" description="Try clearing your filters or search terms." />}
            />
          </View>
        </View>
        </ScrollView>
      ) : (
        /* Mobile Layout */
        <>
          <AppTextField
            label=""
            placeholder="Search people"
            value={query}
            onChangeText={setQuery}
          />

          <View style={{ marginBottom: spacing.xs }}>
            <ChipSelect options={ROLE_FILTERS} selected={[role]} onToggle={setRole} scroll />
          </View>
          <View style={{ marginBottom: spacing.md }}>
            <ChipSelect options={campusFilters} selected={[campus]} onToggle={setCampus} scroll />
          </View>

          <FlatList
            style={{ flex: 1, minHeight: 0 }}
            data={filtered}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 150 }}
            renderItem={({ item }) => (
              <SolidCard radius={18} style={{ marginBottom: spacing.sm, borderWidth: 1, borderColor: item.suspended ? `${colors.critical}50` : colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Pressable
                    onPress={() => toggleUserSelected(item.id)}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selectedUserIds.has(item.id) }}
                    aria-checked={selectedUserIds.has(item.id)}
                    accessibilityLabel={`Select ${item.fullName}`}
                    style={{ flexShrink: 0, marginRight: spacing.xs }}
                  >
                    <Ionicons
                      name={selectedUserIds.has(item.id) ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={selectedUserIds.has(item.id) ? colors.brandPrimary : colors.textSecondary}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => setDetailModalUser(item)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}
                  >
                    <Avatar name={item.fullName} size={44} role={item.role.toLowerCase() as any} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <AppText weight="bold" variant="bodySmall" style={{ flexShrink: 1 }}>
                          {item.fullName}
                        </AppText>
                        <UserTypeBadge role={item.role.toLowerCase() as any} />
                        {item.role === 'Admin' && item.adminRole ? (
                          <Badge
                            label={item.adminRole === 'super_admin' ? 'Super Admin' : 'Campus Admin'}
                            tone={item.adminRole === 'super_admin' ? 'critical' : 'brand'}
                          />
                        ) : null}
                        {item.isVerified && (
                          <VerifiedBadge size={14} role={item.role.toLowerCase() as any} name={item.fullName} showModalOnPress={false} />
                        )}
                        {item.isCampusAmbassador && (
                          <Badge label="Ambassador" tone="brand" />
                        )}
                      </View>
                      <AppText tone="secondary" variant="caption">
                        @{item.username} • {item.matricNo}
                      </AppText>
                      <AppText tone="secondary" variant="caption">
                        {item.campus} • {item.department}
                      </AppText>
                      {item.suspended && (
                        <View style={{ marginTop: 4 }}>
                          <Badge label="Suspended" tone="critical" />
                        </View>
                      )}
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={() => setSelectedUser(item)}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={`Manage ${item.fullName}`}
                    style={{
                      width: 38,
                      height: 38,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.divider,
                      borderRadius: 19,
                    }}
                  >
                    <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </SolidCard>
            )}
            ListEmptyComponent={loadError && users.length === 0 ? null : <EmptyState title="No matching campus users" description="Try clearing your filters or search terms." />}
          />
        </>
      )}

      {/* User Actions Sheet Modal */}
      <ActionSheetModal visible={!!selectedUser} onClose={() => setSelectedUser(null)}>
        {selectedUser && (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingBottom: spacing.sm }}>
              <Avatar name={selectedUser.fullName} size={40} role={selectedUser.role.toLowerCase() as any} />
              <View>
                <AppText weight="bold">{selectedUser.fullName}</AppText>
                <AppText tone="secondary" variant="caption">
                  {selectedUser.matricNo} • {selectedUser.email}
                </AppText>
              </View>
            </View>

            {!(currentUser?.isCampusAdmin && selectedUser.role === 'Admin') && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
                onPress={() => {
                  openEditModal(selectedUser);
                  setSelectedUser(null);
                }}
              >
                <Ionicons name="create-outline" size={18} color={colors.textPrimary} />
                <AppText weight="bold">Edit Profile & Credentials (Student ID, Role, Campus)</AppText>
              </Pressable>
            )}

            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
              onPress={() => {
                setDetailModalUser(selectedUser);
                setSelectedUser(null);
              }}
            >
              <Ionicons name="information-circle-outline" size={18} color={colors.textPrimary} />
              <AppText weight="bold">View Full Profile & Identity Record</AppText>
            </Pressable>

            {currentUser?.isCampusAdmin && selectedUser.role === 'Admin' && (
              <View style={{ padding: spacing.sm, backgroundColor: colors.divider, borderRadius: radius.md, marginVertical: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="lock-closed" size={14} color={colors.textSecondary} />
                <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                  Administrator accounts can only be edited, suspended, or managed by a Super Admin.
                </AppText>
              </View>
            )}

            {!(currentUser?.isCampusAdmin && selectedUser.role === 'Admin') && selectedUser.id !== currentUser?.id && selectedUser.role !== 'Alumni' && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
                onPress={() => handleMutateRole(selectedUser, 'Alumni')}
              >
                <Ionicons name="school-outline" size={18} color={colors.textPrimary} />
                <AppText>Promote / Mutate role to Alumni</AppText>
              </Pressable>
            )}

            {!(currentUser?.isCampusAdmin && selectedUser.role === 'Admin') && selectedUser.id !== currentUser?.id && selectedUser.role !== 'Staff' && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
                onPress={() => handleMutateRole(selectedUser, 'Staff')}
              >
                <Ionicons name="briefcase-outline" size={18} color={colors.textPrimary} />
                <AppText>Promote to Faculty Staff / Advisor</AppText>
              </Pressable>
            )}

            {!(currentUser?.isCampusAdmin && selectedUser.role === 'Admin') && selectedUser.id !== currentUser?.id && (
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
              onPress={() => handleToggleSuspend(selectedUser)}
            >
              <Ionicons name={selectedUser.suspended ? 'checkmark-circle-outline' : 'ban-outline'} size={18} color={selectedUser.suspended ? colors.success : colors.critical} />
              <AppText style={{ color: selectedUser.suspended ? colors.success : colors.critical }}>
                {selectedUser.suspended ? 'Revoke Suspension & Reactivate' : 'Shadow-Ban / Suspend User'}
              </AppText>
            </Pressable>
            )}

            {!(currentUser?.isCampusAdmin && (selectedUser.role === 'Admin' || (currentUser.campusCode && selectedUser.campus !== currentUser.campusCode))) && selectedUser.id !== currentUser?.id && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
                disabled={forceSigningOutId === selectedUser.id}
                onPress={() => handleForceSignOut(selectedUser)}
              >
                <Ionicons name="log-out-outline" size={18} color={colors.critical} />
                <AppText tone="critical">
                  {forceSigningOutId === selectedUser.id ? 'Signing out everywhere…' : 'Force Sign Out (All Devices)'}
                </AppText>
              </Pressable>
            )}

            {!(currentUser?.isCampusAdmin && (selectedUser.role === 'Admin' || (currentUser.campusCode && selectedUser.campus !== currentUser.campusCode))) && !selectedUser.isVerified && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
                onPress={() => handleVerifyUser(selectedUser)}
              >
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.textPrimary} />
                <AppText weight="bold">Grant Verified Badge</AppText>
              </Pressable>
            )}

            {!(currentUser?.isCampusAdmin && (selectedUser.role === 'Admin' || (currentUser.campusCode && selectedUser.campus !== currentUser.campusCode))) && selectedUser.id !== currentUser?.id && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
                onPress={() => handleToggleAmbassador(selectedUser)}
              >
                <Ionicons name={selectedUser.isCampusAmbassador ? 'star' : 'star-outline'} size={18} color="#D97706" />
                <AppText weight="bold" style={{ color: '#D97706' }}>
                  {selectedUser.isCampusAmbassador ? 'Revoke Campus Ambassador' : 'Appoint Campus Ambassador'}
                </AppText>
              </Pressable>
            )}

            {currentUser?.isSuperAdmin && selectedUser.role !== 'Admin' && selectedUser.id !== currentUser?.id && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
                onPress={() => handleImpersonate(selectedUser)}
              >
                <Ionicons name="eye-outline" size={18} color={colors.textPrimary} />
                <AppText weight="bold">View As (Support Mode)</AppText>
              </Pressable>
            )}

            {currentUser?.isSuperAdmin && selectedUser.id !== currentUser?.id && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
                onPress={() => handleWipeAccount(selectedUser)}
              >
                <Ionicons name="trash-outline" size={18} color={colors.critical} />
                <AppText tone="critical">Permanently Delete Account & Data</AppText>
              </Pressable>
            )}
          </View>
        )}
      </ActionSheetModal>

      {/* User Inspect Details Modal */}
      <Modal visible={!!detailModalUser} transparent animationType="fade" onRequestClose={() => setDetailModalUser(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
          {detailModalUser && (
            <SolidCard radius={24} style={{ width: '100%', maxWidth: 440, maxHeight: '90%', overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, gap: spacing.sm, flexShrink: 0 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant={isDesktop ? 'h2' : 'h3'} weight="bold">
                    Identity Record
                  </AppText>
                </View>
 <Pressable onPress={() => setDetailModalUser(null)} hitSlop={8} style={{ flexShrink: 0 }}>
 <Ionicons name="close"size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 <ScrollView style={{ flexGrow: 0, flexShrink: 1, minHeight: 0, width: '100%' }} showsVerticalScrollIndicator={false}>
 <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
 <Avatar name={detailModalUser.fullName} size={72} role={detailModalUser.role.toLowerCase() as any} />
 <AppText variant="h3"weight="bold"style={{ marginTop: spacing.xs }}>
 {detailModalUser.fullName}
 </AppText>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
  <UserTypeBadge role={detailModalUser.role.toLowerCase() as any} />
  {detailModalUser.role === 'Admin' && detailModalUser.adminRole ? (
    <Badge
      label={detailModalUser.adminRole === 'super_admin' ? 'Super Admin' : 'Campus Admin'}
      tone={detailModalUser.adminRole === 'super_admin' ? 'critical' : 'brand'}
    />
  ) : null}
 <Badge label={`Trust ${detailModalUser.trustScore}/100`} tone="neutral" />
 {detailModalUser.isCampusAmbassador ? (
   <Badge label="Campus Ambassador" tone="brand" />
 ) : null}
 {userReportCount > 0 ? (
 <Badge
 label={`⚠ ${userReportCount} other report${userReportCount === 1 ? '' : 's'} against this user`}
 tone="warning"
 />
 ) : userReportCountFailed ? (
 <Badge label="Report history unavailable" tone="neutral" />
 ) : null}
 </View>
 </View>

 <View style={{ backgroundColor: colors.divider, padding: spacing.md, borderRadius: 16, marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
 <AppText tone="secondary"variant="caption">Student / Staff ID</AppText>
 <AppText weight="bold"variant="caption">{detailModalUser.matricNo}</AppText>
 </View>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
 <AppText tone="secondary"variant="caption">Institutional Email</AppText>
 <AppText weight="bold"variant="caption">{detailModalUser.email}</AppText>
 </View>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
 <AppText tone="secondary"variant="caption">Campus Node</AppText>
 <AppText weight="bold"variant="caption">{institutions.find((i) => i.code === detailModalUser.campus)?.name ?? detailModalUser.campus}</AppText>
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

 <View style={{ marginBottom: spacing.sm }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
 <AppText variant="bodySmall" weight="bold">Recent Activity & Audit Trail</AppText>
 <Pressable onPress={() => { setDetailModalUser(null); router.push('/(admin)/audit-logs'); }}>
 <AppText variant="caption" tone="brand" weight="bold">View Full Log</AppText>
 </Pressable>
 </View>
 {userAuditLoading ? (
 <AppText tone="secondary" variant="caption">Loading activity...</AppText>
 ) : userAuditFailed ? (
 <AppText tone="secondary" variant="caption">Could not load this user's activity. Close and reopen this profile to try again.</AppText>
 ) : userAuditEntries.length === 0 ? (
 <AppText tone="secondary" variant="caption">No audit log entries involving this user yet.</AppText>
 ) : (
 <View style={{ gap: spacing.xs }}>
 {userAuditEntries.map((entry) => (
 <View
 key={entry.id}
 style={{
 backgroundColor: colors.divider,
 padding: spacing.sm,
 borderRadius: 12,
 }}
 >
 <AppText variant="caption" weight="bold">
 {entry.summary}
 </AppText>
 <AppText tone="secondary" variant="caption" style={{ fontSize: 11, marginTop: 2 }}>
 {entry.actorName} • {new Date(entry.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
 </AppText>
 </View>
 ))}
 </View>
 )}
 </View>
 </ScrollView>

                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexShrink: 0 }}>
                  {!(currentUser?.isCampusAdmin && detailModalUser.role === 'Admin') && (
                    <View style={{ flex: 1 }}>
                      <AppButton
                        label="Edit Profile"
                        onPress={() => {
                          openEditModal(detailModalUser);
                          setDetailModalUser(null);
                        }}
                      />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Close Record"
                      variant="secondary"
                      onPress={() => setDetailModalUser(null)}
                    />
                  </View>
                </View>
 </SolidCard>
 )}
 </View>
 </Modal>

 {/* Bulk action confirmation: count + mandatory reason (Alert.prompt is iOS-only) */}
 <Modal visible={!!bulkConfirm} transparent animationType="fade" onRequestClose={() => setBulkConfirm(null)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg }}>
 <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: spacing.lg, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
 <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
 {bulkConfirm?.kind === 'suspend' ? 'Suspend' : 'Verify'} {bulkConfirm?.targets.length ?? 0} user{bulkConfirm?.targets.length === 1 ? '' : 's'}?
 </AppText>
 <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
 {bulkConfirm?.kind === 'suspend'
 ? 'Each account is signed out of the app and loses access immediately. The reason is recorded in the audit log.'
 : 'Each account gets the verified badge and any pending verification request is closed. The reason is recorded in the audit log.'}
 </AppText>
 <AppText variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
 {(bulkConfirm?.targets ?? []).slice(0, 5).map((u) => u.fullName).join(', ')}
 {(bulkConfirm?.targets.length ?? 0) > 5 ? ` and ${(bulkConfirm?.targets.length ?? 0) - 5} more` : ''}
 </AppText>
 <AppTextField
 label={`Reason (min. ${BULK_REASON_MIN} characters)`}
 value={bulkReason}
 onChangeText={setBulkReason}
 placeholder={bulkConfirm?.kind === 'suspend' ? 'e.g. Spam accounts reported in ticket #123' : 'e.g. IDs checked in person at registry'}
 multiline
 numberOfLines={3}
 />
 <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
 <View style={{ flex: 1 }}>
 <AppButton label="Cancel" variant="secondary" onPress={() => setBulkConfirm(null)} fullWidth />
 </View>
 <View style={{ flex: 1 }}>
 <AppButton
 label={bulkConfirm?.kind === 'suspend' ? 'Suspend' : 'Verify'}
 onPress={runBulkAction}
 disabled={bulkReason.trim().length < BULK_REASON_MIN}
 fullWidth
 />
 </View>
 </View>
 </View>
 </View>
 </Modal>

 {/* Impersonation reason prompt */}
 <Modal visible={!!impersonateTarget} transparent animationType="fade" onRequestClose={() => setImpersonateTarget(null)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg }}>
 <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: spacing.lg, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
 <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
 Reason for Support Mode
 </AppText>
 <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
 {impersonateTarget ? `Viewing as ${impersonateTarget.fullName}. ` : ''}This reason is recorded in the audit log.
 </AppText>
 <AppTextField
 label="Reason (min. 10 characters)"
 value={impersonateReason}
 onChangeText={setImpersonateReason}
 placeholder="e.g. Support ticket #123 - cannot see enrolled courses"
 multiline
 numberOfLines={3}
 />
 <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
 <View style={{ flex: 1 }}>
 <AppButton label="Cancel" variant="secondary" onPress={() => setImpersonateTarget(null)} fullWidth />
 </View>
 <View style={{ flex: 1 }}>
 <AppButton
 label={isImpersonating ? 'Starting...' : 'View As User'}
 onPress={() => impersonateTarget && confirmImpersonate(impersonateTarget, impersonateReason)}
 disabled={isImpersonating || impersonateReason.trim().length < IMPERSONATION_REASON_MIN_LENGTH}
 fullWidth
 />
 </View>
 </View>
 </View>
 </View>
 </Modal>

 {/* Two-factor step-up: shown when the server asks an enrolled admin to prove their authenticator code */}
 <Modal visible={!!mfaPrompt} transparent animationType="fade" onRequestClose={() => setMfaPrompt(null)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg }}>
 <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: spacing.lg, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
 <Ionicons name="shield-checkmark-outline" size={20} color={colors.brandPrimary} />
 <AppText variant="h3" weight="bold">{mfaPrompt?.title ?? 'Two-Factor Verification'}</AppText>
 </View>
 <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
 Enter the 6-digit code from your authenticator app to confirm it is really you. The action continues as soon as the code is accepted.
 </AppText>
 <AppTextField
 label="6-digit code"
 value={mfaCode}
 onChangeText={(v) => setMfaCode(v.replace(/\D/g, '').slice(0, 6))}
 placeholder="123456"
 keyboardType="number-pad"
 maxLength={6}
 autoFocus
 onSubmitEditing={submitMfaCode}
 error={mfaError ?? undefined}
 />
 <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
 <View style={{ flex: 1 }}>
 <AppButton label="Cancel" variant="secondary" onPress={() => setMfaPrompt(null)} fullWidth />
 </View>
 <View style={{ flex: 1 }}>
 <AppButton label="Verify" onPress={submitMfaCode} loading={mfaChecking} disabled={mfaCode.length !== 6} fullWidth />
 </View>
 </View>
 </View>
 </View>
 </Modal>

 {/* Account deletion reason prompt */}
 <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg }}>
 <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: spacing.lg, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
 <AppText variant="h3" weight="bold" style={{ marginBottom: spacing.xs }}>
 Reason for Deletion
 </AppText>
 <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
 {deleteTarget ? `Permanently deleting ${deleteTarget.fullName}. ` : ''}This reason is recorded in the audit log.
 </AppText>
 <AppTextField
 label="Reason (min. 10 characters)"
 value={deleteReason}
 onChangeText={setDeleteReason}
 placeholder="e.g. Verified erasure request received by email"
 multiline
 numberOfLines={3}
 />
 <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
 <View style={{ flex: 1 }}>
 <AppButton label="Cancel" variant="secondary" onPress={() => setDeleteTarget(null)} fullWidth />
 </View>
 <View style={{ flex: 1 }}>
 <AppButton
 label={isDeleting ? 'Deleting...' : 'Delete Forever'}
 onPress={() => deleteTarget && confirmWipeAccount(deleteTarget, deleteReason)}
 disabled={isDeleting || deleteReason.trim().length < IMPERSONATION_REASON_MIN_LENGTH}
 fullWidth
 />
 </View>
 </View>
 </View>
 </View>
 </Modal>

 {/* Provision New User Modal */}
 <Modal visible={createModalOpen} transparent animationType="slide"onRequestClose={() => setCreateModalOpen(false)}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
 <Pressable style={{ flex: 1 }} onPress={() => setCreateModalOpen(false)} />
 <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '90%', width: '100%', maxWidth: 560, alignSelf: 'center', overflow: 'hidden' }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, flexShrink: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="person-add" size={20} color={colors.brandPrimary} />
                <AppText variant="h2" weight="bold">
                  Provision New Campus User
                </AppText>
              </View>
 <Pressable onPress={() => setCreateModalOpen(false)} hitSlop={8}>
 <Ionicons name="close"size={22} color={colors.textSecondary} />
 </Pressable>
 </View>

 <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1, minHeight: 0, width: '100%' }}>
 <AppTextField
 label="Full Legal Name"placeholder="e.g. Samuel Adeyinka"value={newFullName}
 onChangeText={setNewFullName}
 />

 <AppTextField
 label="Official University Email"placeholder="e.g. s.adeyinka@ui.edu.ng"value={newEmail}
 onChangeText={setNewEmail}
 />

 <AppTextField
 label="Student / Staff ID (Optional)"placeholder="e.g. UI/2024/8892"value={newMatric}
 onChangeText={setNewMatric}
 />

 <DepartmentPicker
 label="Department / Faculty"value={newDepartment || null}
 onChange={setNewDepartment}
 />

 {/* Role Selection */}
 <AppText variant="caption"weight="bold"tone="secondary"style={{ marginBottom: spacing.xs, marginTop: spacing.sm }}>
 ASSIGN USER ROLE
 </AppText>
 <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
 {(['Student', 'Alumni', 'Staff', 'Admin'] as const).map((r) => {
   const isAdminChoice = r === 'Admin';
   const isAllowed = currentUser?.isSuperAdmin || !isAdminChoice;
   return (
 <Pressable
 key={r}
 disabled={!isAllowed}
 onPress={() => isAllowed && setNewRole(r)}
 style={{
 flex: 1,
 paddingVertical: 10,
 borderRadius: radius.md,
 backgroundColor: newRole === r ? colors.brandPrimary : colors.divider,
 opacity: isAllowed ? 1 : 0.4,
 alignItems: 'center',
 }}
 >
 <AppText weight="bold" tone={newRole === r ? 'inverse' : 'brand'} style={{ fontSize: 12 }}>
 {r}
 </AppText>
 </Pressable>
 );
 })}
 </View>
 {!currentUser?.isSuperAdmin && (
   <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm, paddingHorizontal: 4 }}>
     <Ionicons name="lock-closed" size={13} color={colors.textSecondary} />
     <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
       Only a Super Admin can promote members to Admin roles.
     </AppText>
   </View>
 )}
 {currentUser?.isSuperAdmin && newRole === 'Admin' && (
   <View style={{ marginBottom: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.divider }}>
     <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: spacing.xs }}>
       ADMIN PRIVILEGE TIER
     </AppText>
     <View style={{ flexDirection: 'row', gap: spacing.xs }}>
       {(['campus_admin', 'super_admin'] as const).map((tier) => (
         <Pressable
           key={tier}
           onPress={() => setNewAdminRole(tier)}
           style={{
             flex: 1,
             paddingVertical: 8,
             borderRadius: radius.sm,
             backgroundColor: newAdminRole === tier ? colors.brandPrimary : colors.surface,
             alignItems: 'center',
           }}
         >
           <AppText weight="bold" tone={newAdminRole === tier ? 'inverse' : 'primary'} style={{ fontSize: 11 }}>
             {tier === 'super_admin' ? 'Super Admin (Global)' : 'Campus Admin'}
           </AppText>
         </Pressable>
       ))}
     </View>
   </View>
 )}

 {/* Campus Instance Selection */}
 <AppText variant="caption"weight="bold"tone="secondary"style={{ marginBottom: spacing.xs }}>
 TARGET UNIVERSITY CAMPUS NODE
 </AppText>
                {currentUser?.isCampusAdmin ? (
                  <View style={{ padding: spacing.sm, backgroundColor: colors.divider, borderRadius: radius.md, marginBottom: spacing.sm }}>
                    <AppText weight="bold">{newCampus}</AppText>
                    <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                      Locked to your assigned university campus.
                    </AppText>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm }}>
                    {activeInstitutions.map((institution) => institution.code).map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => setNewCampus(c)}
                        style={{
                          width: '31%',
                          paddingVertical: 10,
                          borderRadius: radius.md,
                          backgroundColor: newCampus === c ? colors.brandPrimary : colors.divider,
                          alignItems: 'center',
                        }}
                      >
                        <AppText weight="bold" tone={newCampus === c ? 'inverse' : 'brand'} style={{ fontSize: 12 }}>
                          {c}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                )}
 </ScrollView>

 <View style={{ marginTop: spacing.md, flexShrink: 0 }}>
 <AppButton
 label={isProvisioning ? 'Provisioning...' : 'Provision & Send Invitation'}onPress={handleCreateUser}
 disabled={isProvisioning}
 fullWidth
 />
 </View>
 </View>
 </View>
        </Modal>

        {/* Edit User Profile & Credentials Modal */}
        <Modal visible={!!editModalUser} transparent animationType="slide" onRequestClose={() => setEditModalUser(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <Pressable style={{ flex: 1 }} onPress={() => setEditModalUser(null)} />
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '90%', width: '100%', maxWidth: 560, alignSelf: 'center', overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, flexShrink: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Ionicons name="create-outline" size={20} color={colors.brandPrimary} />
                  <AppText variant="h2" weight="bold">
                    Edit User Profile & Credentials
                  </AppText>
                </View>
                <Pressable onPress={() => setEditModalUser(null)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 1, minHeight: 0, width: '100%' }}>
                <AppTextField
                  label="Full Legal Name"
                  placeholder="Full Name"
                  value={editFullName}
                  onChangeText={setEditFullName}
                />

                <AppTextField
                  label="Student ID"
                  placeholder="e.g. UI/2024/001"
                  value={editMatric}
                  onChangeText={setEditMatric}
                />

                <DepartmentPicker
                  label="Department & Faculty"
                  value={editDepartment || null}
                  onChange={setEditDepartment}
                />

                {/* Role Selection */}
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: spacing.xs, marginTop: spacing.sm }}>
                  ASSIGNED ROLE & PERMISSIONS
                </AppText>
                <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
                  {(['Student', 'Alumni', 'Staff', 'Admin'] as const).map((r) => {
                    const isAdminChoice = r === 'Admin';
                    const isAllowed = currentUser?.isSuperAdmin || !isAdminChoice;
                    return (
                      <Pressable
                        key={r}
                        disabled={!isAllowed}
                        onPress={() => isAllowed && setEditRole(r)}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: radius.md,
                          backgroundColor: editRole === r ? colors.brandPrimary : colors.divider,
                          opacity: isAllowed ? 1 : 0.4,
                          alignItems: 'center',
                        }}
                      >
                        <AppText weight="bold" tone={editRole === r ? 'inverse' : 'brand'} style={{ fontSize: 12 }}>
                          {r}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                {!currentUser?.isSuperAdmin && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm, paddingHorizontal: 4 }}>
                    <Ionicons name="lock-closed" size={13} color={colors.textSecondary} />
                    <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                      Only a Super Admin can promote members to Admin roles.
                    </AppText>
                  </View>
                )}
                {currentUser?.isSuperAdmin && editRole === 'Admin' && (
                  <View style={{ marginBottom: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.divider }}>
                    <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: spacing.xs }}>
                      ADMIN PRIVILEGE TIER
                    </AppText>
                    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                      {(['campus_admin', 'super_admin'] as const).map((tier) => (
                        <Pressable
                          key={tier}
                          onPress={() => setEditAdminRole(tier)}
                          style={{
                            flex: 1,
                            paddingVertical: 8,
                            borderRadius: radius.sm,
                            backgroundColor: editAdminRole === tier ? colors.brandPrimary : colors.surface,
                            alignItems: 'center',
                          }}
                        >
                          <AppText weight="bold" tone={editAdminRole === tier ? 'inverse' : 'primary'} style={{ fontSize: 11 }}>
                            {tier === 'super_admin' ? 'Super Admin (Global)' : 'Campus Admin'}
                          </AppText>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {/* Campus Instance Selection */}
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: spacing.xs }}>
                  CAMPUS NODE
                </AppText>
                {currentUser?.isCampusAdmin ? (
                  <View style={{ padding: spacing.sm, backgroundColor: colors.divider, borderRadius: radius.md, marginBottom: spacing.md }}>
                    <AppText weight="bold">{editCampus}</AppText>
                    <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                      Campus Admins cannot reassign a user's campus node.
                    </AppText>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md }}>
                    {activeInstitutions.map((institution) => institution.code).map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => setEditCampus(c)}
                        style={{
                          width: '31%',
                          paddingVertical: 8,
                          borderRadius: radius.md,
                          backgroundColor: editCampus === c ? colors.brandPrimary : colors.divider,
                          alignItems: 'center',
                        }}
                      >
                        <AppText weight="bold" tone={editCampus === c ? 'inverse' : 'brand'} style={{ fontSize: 11 }}>
                          {c}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Verification Badge Toggle & Password Reset */}
                <View style={{ padding: spacing.md, backgroundColor: colors.divider, borderRadius: radius.md, marginBottom: spacing.md, gap: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <AppText weight="bold">Official Verification Badge</AppText>
                      <AppText tone="secondary" variant="caption">Shows social-proof verification tick</AppText>
                    </View>
                    <Pressable
                      onPress={() => setEditVerified(!editVerified)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: radius.pill,
                        backgroundColor: editVerified ? colors.brandPrimary : colors.surface,
                        borderWidth: 1,
                        borderColor: editVerified ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <AppText weight="bold" style={{ color: editVerified ? '#FFF' : colors.textSecondary, fontSize: 12 }}>
                        {editVerified ? 'VERIFIED' : 'UNVERIFIED'}
                      </AppText>
                    </Pressable>
                  </View>

                  {editRole === 'Student' && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View>
                        <AppText weight="bold">Campus Ambassador</AppText>
                        <AppText tone="secondary" variant="caption">Grants ambassador badge & event/space privileges</AppText>
                      </View>
                      <Pressable
                        onPress={() => setEditIsAmbassador(!editIsAmbassador)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: radius.pill,
                          backgroundColor: editIsAmbassador ? colors.brandPrimary : colors.surface,
                          borderWidth: 1,
                          borderColor: editIsAmbassador ? colors.brandPrimary : colors.border,
                        }}
                      >
                        <AppText weight="bold" style={{ color: editIsAmbassador ? '#FFF' : colors.textSecondary, fontSize: 12 }}>
                          {editIsAmbassador ? 'AMBASSADOR' : 'STANDARD'}
                        </AppText>
                      </Pressable>
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <AppText weight="bold">Account Access Status</AppText>
                      <AppText tone="secondary" variant="caption">Controls login suspension</AppText>
                    </View>
                    <Pressable
                      onPress={() => setEditSuspended(!editSuspended)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: radius.pill,
                        backgroundColor: editSuspended ? colors.critical : colors.surface,
                        borderWidth: 1,
                        borderColor: editSuspended ? colors.critical : colors.border,
                      }}
                    >
                      <AppText weight="bold" style={{ color: editSuspended ? '#FFF' : colors.textSecondary, fontSize: 12 }}>
                        {editSuspended ? 'SUSPENDED' : 'ACTIVE'}
                      </AppText>
                    </Pressable>
                  </View>

                  <AppButton
                    label="Dispatch Password Reset Email"
                    variant="secondary"
                    size="sm"
                    onPress={handleSendPasswordResetFromModal}
                    loading={editSaving}
                  />
                </View>

                {/* Diagnostics: mute activity / job alerts / notification preferences -
                    read-only, for handling complaints ("still seeing someone I muted",
                    "not getting job alert notifications") without the SQL editor. */}
                <View style={{ backgroundColor: colors.divider, borderRadius: radius.md, marginBottom: spacing.xs, overflow: 'hidden' }}>
                  <Pressable
                    onPress={toggleDiagnostics}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md }}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: diagnosticsExpanded }}
                    aria-expanded={diagnosticsExpanded}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="pulse-outline" size={16} color={colors.brandPrimary} />
                      <AppText weight="bold">Diagnostics</AppText>
                      <AppText tone="secondary" variant="caption">(mutes, job alerts, notifications)</AppText>
                    </View>
                    <Ionicons name={diagnosticsExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
                  </Pressable>

                  {diagnosticsExpanded && (
                    <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm }}>
                      {diagnosticsLoading ? (
                        <AppText tone="secondary" variant="caption">Loading diagnostics...</AppText>
                      ) : diagnosticsError ? (
                        <AppText style={{ color: colors.critical }} variant="caption">{diagnosticsError}</AppText>
                      ) : diagnosticsData ? (
                        <>
                          {/* Mutes */}
                          <View>
                            <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 4 }}>MUTES</AppText>
                            <AppText variant="bodySmall">
                              Has muted <AppText weight="bold">{diagnosticsData.mutes.mutedCount}</AppText> user{diagnosticsData.mutes.mutedCount === 1 ? '' : 's'} • Muted by <AppText weight="bold">{diagnosticsData.mutes.mutedByCount}</AppText> user{diagnosticsData.mutes.mutedByCount === 1 ? '' : 's'}
                            </AppText>
                            {diagnosticsData.mutes.recentMuted.length > 0 && (
                              <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                                Recently muted: {diagnosticsData.mutes.recentMuted.map((m) => m.fullName).join(', ')}
                              </AppText>
                            )}
                            {diagnosticsData.mutes.recentMutedBy.length > 0 && (
                              <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                                Recently muted by: {diagnosticsData.mutes.recentMutedBy.map((m) => m.fullName).join(', ')}
                              </AppText>
                            )}
                          </View>

                          {/* Job Alerts */}
                          <View>
                            <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 4 }}>JOB ALERTS</AppText>
                            <AppText variant="bodySmall">
                              <AppText weight="bold">{diagnosticsData.jobAlerts.activeCount}</AppText> active of <AppText weight="bold">{diagnosticsData.jobAlerts.totalCount}</AppText> total
                            </AppText>
                            {diagnosticsData.jobAlerts.alerts.length === 0 ? (
                              <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>No saved job alerts.</AppText>
                            ) : (
                              <View style={{ marginTop: 4, gap: 4 }}>
                                {diagnosticsData.jobAlerts.alerts.map((a) => (
                                  <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Badge label={a.isActive ? 'ACTIVE' : 'PAUSED'} tone={a.isActive ? 'success' : 'neutral'} />
                                    <AppText variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                                      {[a.keywords, a.jobType, a.remoteOnly ? 'Remote only' : null, a.campusCode].filter(Boolean).join(' • ') || 'Any job'}
                                    </AppText>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>

                          {/* Notification Preferences */}
                          <View>
                            <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 4 }}>
                              NOTIFICATION PREFERENCES{diagnosticsData.notificationPreferences.hasCustomRow ? '' : ' (defaults - never saved)'}
                            </AppText>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                              <Badge label={`Push ${diagnosticsData.notificationPreferences.pushEnabled ? 'ON' : 'OFF'}`} tone={diagnosticsData.notificationPreferences.pushEnabled ? 'success' : 'critical'} />
                              <Badge label={`Announcements ${diagnosticsData.notificationPreferences.announcementsEnabled ? 'ON' : 'OFF'}`} tone={diagnosticsData.notificationPreferences.announcementsEnabled ? 'success' : 'critical'} />
                              <Badge label={`Events ${diagnosticsData.notificationPreferences.eventsEnabled ? 'ON' : 'OFF'}`} tone={diagnosticsData.notificationPreferences.eventsEnabled ? 'success' : 'critical'} />
                              <Badge label={`Digest ${diagnosticsData.notificationPreferences.digestEnabled ? 'ON' : 'OFF'}`} tone={diagnosticsData.notificationPreferences.digestEnabled ? 'success' : 'critical'} />
                            </View>
                          </View>
                        </>
                      ) : null}
                    </View>
                  )}
                </View>
              </ScrollView>

              <View style={{ marginTop: spacing.md, flexShrink: 0 }}>
                <AppButton
                  label="Save & Commit Profile Changes"
                  onPress={handleSaveEditedUser}
                  loading={editSaving}
                  fullWidth
                />
              </View>
            </View>
          </View>
        </Modal>
      </ScreenContainer>
 );
}
