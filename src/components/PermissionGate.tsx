import React from 'react';
import { usePermissions } from '@/context/RolePermissionsContext';
import type { PermissionKey } from '@/api/rolePermissions';

/**
 * Renders its children only while the signed-in person's role has `permission` switched on in the Super Admin's
 * Role Permissions matrix. The database refuses the write regardless; this keeps the control out of sight instead
 * of letting people tap it and hit a refusal. While the matrix is still loading everything stays visible.
 */
export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: PermissionKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { hasPermission } = usePermissions();
  return <>{hasPermission(permission) ? children : fallback}</>;
}
