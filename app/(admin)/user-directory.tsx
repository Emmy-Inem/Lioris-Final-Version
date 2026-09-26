import React, { useState } from'react';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { useAdminBadges } from '@/components/admin/useAdminBadges';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, View } from'react-native';
import { router } from 'expo-router';
import { Ionicons } from'@expo/vector-icons';
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
import { ActionSheetModal } from'@/components/ActionSheetModal';
import { EmptyState } from'@/components/EmptyState';
import { ShimmerCardList } from'@/components/ShimmerSkeleton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { recordAuditLogEntry, listAuditLogEntries } from '@/api/auditLog';
import { grantVerification } from '@/api/profile';
import {
 adminTriggerPasswordReset,
 adminUpdateUserProfile,
 IMPERSONATION_REASON_MIN_LENGTH,
 MFA_REQUIRED_CODE,
 readEdgeFunctionError,
 verifyMfaCode,
} from '@/api/auth';
import { LAUNCH_INSTITUTIONS } from '@/api/institutions';
import { usePullRefreshHandler } from '@/components/PullToRefresh';
import { adminDirectVerifyUser } from '@/api/verification';
import { useToast } from '@/context/ToastContext';
import { AuditLogEntry } from '@/api/types';
import { haptics } from '@/utils/haptics';
import { useAuth } from '@/auth/AuthContext';

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

/**
 * Cryptographically random one-time password (never shown to anyone - the user
 * sets their own via the invitation / password-reset email).
 */
function generateSecureTempPassword(): string {
 const cryptoObj = (globalThis as any).crypto as Crypto | undefined;
 if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
 throw new Error('A secure random number generator is not available on this device, so an account cannot be provisioned safely.');
 }
 const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
 const lower = 'abcdefghijkmnopqrstuvwxyz';
 const digits = '23456789';
 const special = '!@#$%^&*-_=+?';
 const all = upper + lower + digits + special;
 const pick = (set: string, n: number) => {
 // Rejection sampling to avoid modulo bias.
 const out: string[] = [];
 const limit = 256 - (256 % set.length);
 while (out.length < n) {
 const buf = cryptoObj.getRandomValues(new Uint8Array(n * 2));
 for (let i = 0; i < buf.length && out.length < n; i++) {
 if (buf[i] < limit) out.push(set[buf[i] % set.length]);
 }
 }
 return out;
 };
 const chars = [...pick(upper, 2), ...pick(lower, 2), ...pick(digits, 2), ...pick(special, 2), ...pick(all, 16)];
 // Fisher-Yates shuffle with secure randomness.
 for (let i = chars.length - 1; i > 0; i--) {
 const limit = 256 - (256 % (i + 1));
 let r = 0;
 do {
 r = cryptoObj.getRandomValues(new Uint8Array(1))[0];
 } while (r >= limit);
 const j = r % (i + 1);
 [chars[i], chars[j]] = [chars[j], chars[i]];
 }
 return chars.join('');
}

const ROLE_FILTERS = ['All Roles', 'Student', 'Alumni', 'Staff', 'Admin'];
const ALL_CAMPUSES = 'All Campuses';

export default function UserDirectoryScreen() {
  const adminBadges = useAdminBadges();
 const { colors, spacing, radius } = useTheme();
 const { isDesktop } = useResponsive();
 const { user: currentUser, beginImpersonation } = useAuth();
 const [isImpersonating, setIsImpersonating] = useState(false);
 const [query, setQuery] = useState('');
 const [role, setRole] = useState('All Roles');
 const [campus, setCampus] = useState(ALL_CAMPUSES);
 const [users, setUsers] = useState<DirectoryUser[]>([]);
 const [loading, setLoading] = useState(true);
 const [loadError, setLoadError] = useState<string | null>(null);

 const loadProfiles = React.useCallback(async () => {
 setLoading(true);
 setLoadError(null);
 try {
 const { supabase } = await import('@/api/supabase');
 const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
 if (error) throw error;
 if (data) {
 const mapped: DirectoryUser[] = data.map((p: any) => ({
 id: p.id,
 fullName: p.full_name || 'Campus Member',
 username: p.username || (p.email ? p.email.split('@')[0] : 'member'),
 email: p.email || '',
 role: (p.role ? p.role.charAt(0).toUpperCase() + p.role.slice(1) : 'Student') as any,
 campus: p.campus_code || 'GLOBAL',
 department: p.department || 'General Studies',
 matricNo: p.student_id_number || 'Not Assigned',
 suspended: p.is_suspended ?? false,
 isVerified: p.verification_status === 'verified',
 trustScore: p.trust_score ? Math.round(Number(p.trust_score)) : 85,
 joinedDate: p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '2024',
 }));
 setUsers(mapped);
 }
 } catch (err: any) {
 console.warn('[UserDirectory] Supabase profiles load error:', err);
 setLoadError(err?.message || 'Could not load the user directory.');
 } finally {
 setLoading(false);
 }
 }, []);

 React.useEffect(() => {
 loadProfiles();
 }, [loadProfiles]);

 // Drag-down-to-refresh on the installed web app reloads this list instead of the whole page.
 usePullRefreshHandler(loadProfiles);

 // Every campus that exists (launch list) plus any code a profile actually carries.
 const campusFilters = React.useMemo(() => {
 const codes = new Set<string>(LAUNCH_INSTITUTIONS.map((i) => i.code));
 users.forEach((u) => codes.add(u.campus));
 return [ALL_CAMPUSES, ...Array.from(codes)];
 }, [users]);

 // Selected User Actions & Details Drawer
 const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null);
 const [detailModalUser, setDetailModalUser] = useState<DirectoryUser | null>(null);
 const [userAuditEntries, setUserAuditEntries] = useState<AuditLogEntry[]>([]);
 const [userAuditLoading, setUserAuditLoading] = useState(false);

 React.useEffect(() => {
 if (!detailModalUser) {
 setUserAuditEntries([]);
 return;
 }
 let cancelled = false;
 setUserAuditLoading(true);
 listAuditLogEntries({ involvingUserId: detailModalUser.id })
 .then((entries) => {
 if (!cancelled) setUserAuditEntries(entries.slice(0, 5));
 })
 .catch((err) => {
 console.warn('[UserDirectory] Audit trail load error:', err);
 if (!cancelled) setUserAuditEntries([]);
 })
 .finally(() => {
 if (!cancelled) setUserAuditLoading(false);
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
 const [newCampus, setNewCampus] = useState('UI');
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

  // Edit User Modal State
  const toast = useToast();
  const [editModalUser, setEditModalUser] = useState<DirectoryUser | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editMatric, setEditMatric] = useState('');
  const [editCampus, setEditCampus] = useState('UI');
  const [editDepartment, setEditDepartment] = useState('');
  const [editRole, setEditRole] = useState<'Student' | 'Alumni' | 'Staff' | 'Admin'>('Student');
  const [editVerified, setEditVerified] = useState(false);
  const [editSuspended, setEditSuspended] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  function openEditModal(target: DirectoryUser) {
    setEditModalUser(target);
    setEditFullName(target.fullName);
    setEditMatric(target.matricNo === 'Not Assigned' ? '' : target.matricNo);
    setEditCampus(target.campus || 'UI');
    setEditDepartment(target.department);
    setEditRole(target.role);
    setEditVerified(target.isVerified);
    setEditSuspended(target.suspended);
  }

  async function handleSaveEditedUser() {
    if (!editModalUser) return;
    if (!editFullName.trim()) {
      Alert.alert('Validation Error', 'Full Name cannot be empty.');
      return;
    }
    haptics.medium();
    setEditSaving(true);
    try {
      const res = await adminUpdateUserProfile(editModalUser.id, {
        full_name: editFullName.trim(),
        student_id_number: editMatric.trim() || null,
        campus_code: editCampus,
        department: editDepartment.trim() || 'General Studies',
        role: editRole.toLowerCase(),
        is_suspended: editSuspended,
        verification_status: editVerified ? 'verified' : 'unverified',
      });

      if (res.success) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === editModalUser.id
              ? {
                  ...u,
                  fullName: editFullName.trim(),
                  matricNo: editMatric.trim() || 'Not Assigned',
                  campus: editCampus,
                  department: editDepartment.trim() || 'General Studies',
                  role: editRole,
                  isVerified: editVerified,
                  suspended: editSuspended,
                }
              : u,
          ),
        );
        toast.success(`Profile updated for ${editFullName.trim()}.`);
        setEditModalUser(null);
      } else {
        toast.error(res.error || 'Failed to update user profile.');
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
 const matchesRole = role === 'All Roles' || u.role === role;
 const matchesCampus = campus === ALL_CAMPUSES || u.campus === campus;
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
 if (isProvisioning) return;
 setIsProvisioning(true);
 const email = newEmail.trim();
 let userId: string | null = null;

 try {
 const tempPassword = generateSecureTempPassword();
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
 email,
 password: tempPassword,
 options: {
 data: {
 full_name: newFullName.trim(),
 username,
 role: newRole.toLowerCase(),
 campus_code: newCampus,
 department: newDepartment.trim() || 'General Studies',
 },
 },
 });

 if (error || !data?.user?.id) {
 throw new Error(error?.message || 'The account could not be created.');
 }
 userId = data.user.id;

 // Admins have full profile access under RLS; a failure here means the
 // account exists but its profile fields are incomplete - say so.
 const { error: profileError } = await supabase.from('profiles').upsert({
 id: userId,
 email,
 full_name: newFullName.trim(),
 username,
 role: newRole.toLowerCase(),
 campus_code: newCampus,
 department: newDepartment.trim() || 'General Studies',
 student_id_number: matricNo,
 verification_status: 'verified',
 is_suspended: false,
 });
 if (profileError) {
 throw new Error(`The login was created but its profile could not be completed (${profileError.message}). Review it in the directory.`);
 }

 // The temporary password is never displayed: the user receives a
 // password-reset / invitation email and chooses their own.
 const invite = await adminTriggerPasswordReset(email);

 const newUser: DirectoryUser = {
 id: userId,
 fullName: newFullName.trim(),
 username,
 email,
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
 // below and the bulk suspend flow, so both go through Supabase the same
 // way (RPC first, direct column update as a fallback).
 async function setSuspendedCore(target: DirectoryUser, nextSuspended: boolean) {
 const { supabase } = await import('@/api/supabase');
 if (nextSuspended) {
 const { error } = await supabase.rpc('suspend_user_account', {
 p_target_user_id: target.id,
 p_reason: 'Administrative security suspension from User Directory',
 });
 if (error) {
 const { error: fallbackError } = await supabase.from('profiles').update({ is_suspended: true }).eq('id', target.id);
 if (fallbackError) throw fallbackError;
 }
 } else {
 const { error } = await supabase.from('profiles').update({ is_suspended: false }).eq('id', target.id);
 if (error) throw error;
 }
 }

 // Core verify mutation - there was no existing single-item "verify" action
 // in this screen (only suspend/role-change/wipe), so this is the shared
 // primitive both the new single-item and bulk verify actions call.
 async function verifyUserCore(target: DirectoryUser) {
 const { supabase } = await import('@/api/supabase');
 const { error } = await supabase.from('profiles').update({ verification_status: 'verified' }).eq('id', target.id);
 if (error) throw error;
 grantVerification(target.id);
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

 recordAuditLogEntry({
 action: nextSuspended ? 'user_suspended' : 'user_unsuspended',
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

 recordAuditLogEntry({
 action: 'verification_approved',
 summary: `Granted verified badge to @${target.username} (${target.fullName}) from User Directory`,
 targetType: 'user',
 targetId: target.id,
 institutionCode: target.campus,
 reason: 'Administrative verification grant',
 });

 setSelectedUser(null);
 Alert.alert('User Verified', `${target.fullName}'s verified badge has been activated.`);
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

 function getSelectedUsers(): DirectoryUser[] {
 return users.filter((u) => selectedUserIds.has(u.id));
 }

 async function handleBulkSuspend() {
 // Only acts on currently-unsuspended selected users - re-suspending an
 // already-suspended account is a no-op that would just muddy the count.
 const targets = getSelectedUsers().filter((u) => !u.suspended);
 if (targets.length === 0 || bulkProcessing) {
 if (targets.length === 0) Alert.alert('Nothing to Suspend', 'All selected users are already suspended.');
 return;
 }
 haptics.medium();
 setBulkProcessing(true);

 let succeeded = 0;
 let failed = 0;
 for (const target of targets) {
 try {
 await setSuspendedCore(target, true);
 setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, suspended: true } : u)));
 recordAuditLogEntry({
 action: 'user_suspended',
 summary: `Suspended user account @${target.username} (${target.fullName}) via bulk action`,
 targetType: 'user',
 targetId: target.id,
 institutionCode: target.campus,
 reason: 'Policy enforcement suspension (bulk)',
 });
 succeeded += 1;
 } catch (err) {
 console.warn('[UserDirectory] Bulk suspend error for', target.id, err);
 failed += 1;
 }
 }

 setBulkProcessing(false);
 clearUserSelection();
 if (failed > 0) haptics.error();
 else haptics.success();

 Alert.alert(
 'Bulk Suspend Complete',
 failed > 0 ? `${succeeded} suspended, ${failed} failed. Retry the failed ones individually.` : `${succeeded} user${succeeded === 1 ? '' : 's'} suspended.`,
 );
 }

 async function handleBulkVerify() {
 const targets = getSelectedUsers().filter((u) => !u.isVerified);
 if (targets.length === 0 || bulkProcessing) {
 if (targets.length === 0) Alert.alert('Nothing to Verify', 'All selected users are already verified.');
 return;
 }
 haptics.medium();
 setBulkProcessing(true);

 let succeeded = 0;
 let failed = 0;
 for (const target of targets) {
 try {
 await verifyUserCore(target);
 setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, isVerified: true } : u)));
 recordAuditLogEntry({
 action: 'verification_approved',
 summary: `Granted verified badge to @${target.username} (${target.fullName}) via bulk action`,
 targetType: 'user',
 targetId: target.id,
 institutionCode: target.campus,
 reason: 'Administrative verification grant (bulk)',
 });
 succeeded += 1;
 } catch (err) {
 console.warn('[UserDirectory] Bulk verify error for', target.id, err);
 failed += 1;
 }
 }

 setBulkProcessing(false);
 clearUserSelection();
 if (failed > 0) haptics.error();
 else haptics.success();

 Alert.alert(
 'Bulk Verify Complete',
 failed > 0 ? `${succeeded} verified, ${failed} failed. Retry the failed ones individually.` : `${succeeded} user${succeeded === 1 ? '' : 's'} verified.`,
 );
 }

 function handleMutateRole(target: DirectoryUser, targetRole: DirectoryUser['role']) {
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
 haptics.medium();
 try {
 const result = await adminUpdateUserProfile(target.id, { role: targetRole.toLowerCase() });
 if (!result.success) throw new Error(result.error || 'The role change was not saved.');

 setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, role: targetRole } : u)));

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
 haptics.error();
 Alert.alert(
 'Permanently Delete Account?',
 `This will PERMANENTLY delete ${target.fullName}'s (@${target.username}) login credentials and all profile data (name, matric record, department, trust score, etc.).\n\n` +
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
          <AppText tone="secondary" variant="caption">Manage identities, matric records & role privileges</AppText>
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
              <AppText weight="bold" variant="bodySmall">{selectedUserIds.size} selected</AppText>
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
        <SolidCard radius={16} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: `${colors.critical}55` }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.critical} />
            <View style={{ flex: 1, minWidth: 160 }}>
              <AppText weight="bold" variant="bodySmall">Could not load the directory</AppText>
              <AppText tone="secondary" variant="caption">{loadError}</AppText>
            </View>
            <AppButton label="Retry" size="sm" variant="secondary" onPress={loadProfiles} />
          </View>
        </SolidCard>
      ) : null}

      {loading && users.length === 0 ? (
        <ShimmerCardList count={isDesktop ? 6 : 4} />
      ) : isDesktop ? (
        <View style={{ flexDirection: 'row', gap: 24, flex: 1, minHeight: 0, alignItems: 'stretch' }}>
          {/* Left Column: Search & Filters Rail */}
          <View style={{ width: 280, gap: spacing.md }}>
            <SolidCard radius={20} style={{ padding: spacing.md, gap: spacing.sm }}>
              <AppText variant="bodySmall" weight="bold">
                Search Members
              </AppText>
              <AppTextField
                label=""
                placeholder="Name, @handle, matric..."
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
                <Badge label={`${filtered.length} Users`} tone="neutral" />
              </View>
              <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                Live synchronized with multi-campus profiles table.
              </AppText>
            </SolidCard>
          </View>

          {/* Right Column: User Cards Grid */}
          <View style={{ flex: 1, minHeight: 0 }}>
            <FlatList
              style={{ flex: 1, minHeight: 0 }}
              data={filtered}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={{ gap: spacing.md }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 100, gap: spacing.sm }}
              renderItem={({ item }) => (
                <View style={{ flex: 1, minWidth: 0, marginBottom: spacing.xs }}>
                  <SolidCard radius={18} style={{ borderWidth: 1, borderColor: item.suspended ? `${colors.critical}50` : colors.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Pressable
                        onPress={() => toggleUserSelected(item.id)}
                        hitSlop={8}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selectedUserIds.has(item.id) }}
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
                            {item.isVerified && (
                              <VerifiedBadge size={14} role={item.role.toLowerCase() as any} name={item.fullName} />
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
              ListEmptyComponent={<EmptyState title="No matching campus users" description="Try clearing your filters or search terms." />}
            />
          </View>
        </View>
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
                        {item.isVerified && (
                          <VerifiedBadge size={14} role={item.role.toLowerCase() as any} name={item.fullName} />
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
            ListEmptyComponent={<EmptyState title="No matching campus users" description="Try clearing your filters or search terms." />}
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

            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
              onPress={() => {
                openEditModal(selectedUser);
                setSelectedUser(null);
              }}
            >
              <Ionicons name="create-outline" size={18} color={colors.textPrimary} />
              <AppText weight="bold">Edit Profile & Credentials (Matric, Role, Campus)</AppText>
            </Pressable>

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

            {selectedUser.id !== currentUser?.id && selectedUser.role !== 'Alumni' && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
                onPress={() => handleMutateRole(selectedUser, 'Alumni')}
              >
                <Ionicons name="school-outline" size={18} color={colors.textPrimary} />
                <AppText>Promote / Mutate role to Alumni</AppText>
              </Pressable>
            )}

            {selectedUser.id !== currentUser?.id && selectedUser.role !== 'Staff' && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
                onPress={() => handleMutateRole(selectedUser, 'Staff')}
              >
                <Ionicons name="briefcase-outline" size={18} color={colors.textPrimary} />
                <AppText>Promote to Faculty Staff / Advisor</AppText>
              </Pressable>
            )}

            {selectedUser.id !== currentUser?.id && (
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

            {!selectedUser.isVerified && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
                onPress={() => handleVerifyUser(selectedUser)}
              >
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.textPrimary} />
                <AppText weight="bold">Grant Verified Badge</AppText>
              </Pressable>
            )}

            {selectedUser.role !== 'Admin' && selectedUser.id !== currentUser?.id && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: spacing.sm }}
                onPress={() => handleImpersonate(selectedUser)}
              >
                <Ionicons name="eye-outline" size={18} color={colors.textPrimary} />
                <AppText weight="bold">View As (Support Mode)</AppText>
              </Pressable>
            )}

            {selectedUser.id !== currentUser?.id && (
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
            <SolidCard radius={24} style={{ width: '100%', maxWidth: 440 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, gap: spacing.sm }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant={isDesktop ? 'h2' : 'h3'} weight="bold">
                    Identity Record
                  </AppText>
                </View>
 <Pressable onPress={() => setDetailModalUser(null)} hitSlop={8} style={{ flexShrink: 0 }}>
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
 <Badge label={`Trust ${detailModalUser.trustScore}/100`} tone="neutral" />
 </View>
 </View>

 <View style={{ backgroundColor: colors.divider, padding: spacing.md, borderRadius: 16, marginBottom: spacing.md }}>
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
 <AppText weight="bold"variant="caption">{LAUNCH_INSTITUTIONS.find((i) => i.code === detailModalUser.campus)?.name ?? detailModalUser.campus}</AppText>
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

 <View style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
 <AppText variant="bodySmall" weight="bold">Recent Activity & Audit Trail</AppText>
 <Pressable onPress={() => { setDetailModalUser(null); router.push('/(admin)/audit-logs'); }}>
 <AppText variant="caption" tone="brand" weight="bold">View Full Log</AppText>
 </Pressable>
 </View>
 {userAuditLoading ? (
 <AppText tone="secondary" variant="caption">Loading activity...</AppText>
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

                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Edit Profile"
                      onPress={() => {
                        openEditModal(detailModalUser);
                        setDetailModalUser(null);
                      }}
                    />
                  </View>
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
 onChangeText={(v) => setMfaCode(v.replace(/D/g, '').slice(0, 6))}
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
 <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '90%' }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
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

 <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, width: '100%',  marginBottom: spacing.md }}>
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

 <DepartmentPicker
 label="Department / Faculty"value={newDepartment || null}
 onChange={setNewDepartment}
 />

 {/* Role Selection */}
 <AppText variant="caption"weight="bold"tone="secondary"style={{ marginBottom: spacing.xs, marginTop: spacing.sm }}>
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
 backgroundColor: newRole === r ? colors.brandPrimary : colors.divider,
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
 <AppText variant="caption"weight="bold"tone="secondary"style={{ marginBottom: spacing.xs }}>
 TARGET UNIVERSITY CAMPUS NODE
 </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.lg }}>
                  {['UI', 'UNILAG', 'OAU', 'FUNAAB', 'CU', 'GLOBAL'].map((c) => (
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

 <AppButton
 label={isProvisioning ? 'Provisioning...' : 'Provision & Send Invitation'}onPress={handleCreateUser}
 disabled={isProvisioning}
 fullWidth
 />
 </ScrollView>
 </View>
 </View>
        </Modal>

        {/* Edit User Profile & Credentials Modal */}
        <Modal visible={!!editModalUser} transparent animationType="slide" onRequestClose={() => setEditModalUser(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <Pressable style={{ flex: 1 }} onPress={() => setEditModalUser(null)} />
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '90%' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
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

              <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%', marginBottom: spacing.md }}>
                <AppTextField
                  label="Full Legal Name"
                  placeholder="Full Name"
                  value={editFullName}
                  onChangeText={setEditFullName}
                />

                <AppTextField
                  label="Matriculation / Student ID"
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
                  {(['Student', 'Alumni', 'Staff', 'Admin'] as const).map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => setEditRole(r)}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        borderRadius: radius.md,
                        backgroundColor: editRole === r ? colors.brandPrimary : colors.divider,
                        alignItems: 'center',
                      }}
                    >
                      <AppText weight="bold" tone={editRole === r ? 'inverse' : 'brand'} style={{ fontSize: 12 }}>
                        {r}
                      </AppText>
                    </Pressable>
                  ))}
                </View>

                {/* Campus Instance Selection */}
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: spacing.xs }}>
                  CAMPUS NODE
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md }}>
                  {['UI', 'UNILAG', 'OAU', 'FUNAAB', 'CU', 'GLOBAL'].map((c) => (
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

                <AppButton
                  label="Save & Commit Profile Changes"
                  onPress={handleSaveEditedUser}
                  loading={editSaving}
                  fullWidth
                />
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScreenContainer>
 );
}
