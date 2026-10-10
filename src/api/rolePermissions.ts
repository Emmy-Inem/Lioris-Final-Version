import { supabase } from './supabase';
import { recordAuditLogEntry } from './auditLog';

export type SystemRole = 'student' | 'alumni' | 'staff' | 'campus_admin' | 'super_admin';

export type PermissionKey =
  | 'can_post_forum'
  | 'can_comment_forum'
  | 'can_create_spaces'
  | 'can_upload_resources'
  | 'can_download_resources'
  | 'can_review_resources'
  | 'can_create_events'
  | 'can_rsvp_events'
  | 'can_access_marketplace'
  | 'can_list_marketplace'
  | 'can_access_jobs'
  | 'can_post_jobs'
  | 'can_join_study_pods'
  | 'can_create_study_pods'
  | 'can_access_mentorship'
  | 'can_offer_mentorship'
  | 'can_send_messages'
  | 'can_moderate_campus'
  | 'can_verify_students'
  | 'can_broadcast_announcements'
  | 'can_manage_roles'
  | 'can_configure_platform';

export interface RolePermissionRecord {
  id: string;
  role: SystemRole;
  permissionKey: PermissionKey;
  category: string;
  label: string;
  description: string;
  enabled: boolean;
  isCritical: boolean;
  updatedAt: string;
}

function mapRow(row: any): RolePermissionRecord {
  return {
    id: row.id,
    role: row.role as SystemRole,
    permissionKey: row.permission_key as PermissionKey,
    category: row.category || 'General',
    label: row.label || row.permission_key,
    description: row.description || '',
    enabled: !!row.enabled,
    isCritical: !!row.is_critical,
    updatedAt: row.updated_at,
  };
}

/**
 * Lists all permissions configured across all roles from the database.
 */
export async function listRolePermissions(): Promise<RolePermissionRecord[]> {
  try {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('*')
      .order('category', { ascending: true })
      .order('label', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(mapRow);
  } catch (err: any) {
    console.warn('[RolePermissions] Failed to list permissions from DB:', err?.message || err);
    return [];
  }
}

/**
 * Super Admin: Updates a specific permission toggle for a given role.
 */
export async function updateRolePermission(
  role: SystemRole,
  permissionKey: PermissionKey,
  enabled: boolean,
): Promise<RolePermissionRecord> {
  const { data, error } = await supabase.rpc('admin_set_role_permission', {
    p_role: role,
    p_permission_key: permissionKey,
    p_enabled: enabled,
  });

  if (error) {
    throw new Error(error.message?.replace(/^Access denied:\s*/, '') || 'Failed to update permission.');
  }

  await recordAuditLogEntry({
    action: 'feature_flag_toggled',
    summary: `Super Admin ${enabled ? 'enabled' : 'disabled'} permission "${permissionKey}" for role "${role}"`,
    targetType: 'platform_config',
    targetId: `${role}:${permissionKey}`,
    reason: `Role permission modification (${role} -> ${permissionKey}: ${enabled})`,
  });

  return mapRow(data);
}

/**
 * Super Admin: Resets permissions to default baseline.
 */
export async function resetRolePermissions(role?: SystemRole): Promise<void> {
  const { error } = await supabase.rpc('admin_reset_role_permissions', {
    p_role: role || null,
  });

  if (error) {
    throw new Error(error.message || 'Failed to reset role permissions.');
  }

  await recordAuditLogEntry({
    action: 'feature_flag_toggled',
    summary: `Super Admin reset role permissions to defaults${role ? ` for ${role}` : ' for all roles'}`,
    targetType: 'platform_config',
    targetId: role || 'all_roles',
    reason: 'Role permissions factory reset',
  });
}
