import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  listRolePermissions,
  updateRolePermission,
  resetRolePermissions,
  SystemRole,
  PermissionKey,
  RolePermissionRecord,
} from '@/api/rolePermissions';

export interface RolePermissionsContextValue {
  records: RolePermissionRecord[];
  isLoading: boolean;
  hasPermission: (key: PermissionKey) => boolean;
  can: (role: SystemRole, key: PermissionKey) => boolean;
  togglePermission: (role: SystemRole, key: PermissionKey) => Promise<void>;
  setPermission: (role: SystemRole, key: PermissionKey, enabled: boolean) => Promise<void>;
  resetToDefaults: (role?: SystemRole) => Promise<void>;
  refresh: () => Promise<void>;
}

const DEFAULT_CONTEXT: RolePermissionsContextValue = {
  records: [],
  isLoading: false,
  hasPermission: () => true,
  can: () => true,
  togglePermission: async () => {},
  setPermission: async () => {},
  resetToDefaults: async () => {},
  refresh: async () => {},
};

const RolePermissionsContext = createContext<RolePermissionsContextValue>(DEFAULT_CONTEXT);

export function RolePermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [records, setRecords] = useState<RolePermissionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    try {
      const data = await listRolePermissions();
      if (data && data.length > 0) {
        setRecords(data);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Lookup map: role -> permissionKey -> boolean
  const permissionsMap = useMemo(() => {
    const map: Partial<Record<SystemRole, Partial<Record<PermissionKey, boolean>>>> = {};
    for (const r of records) {
      if (!map[r.role]) map[r.role] = {};
      map[r.role]![r.permissionKey] = r.enabled;
    }
    return map;
  }, [records]);

  // Determine current active system role
  const currentSystemRole: SystemRole = useMemo(() => {
    if (user?.actualRole === 'admin' && user?.isSuperAdmin) return 'super_admin';
    if (user?.isCampusAdmin) return 'campus_admin';
    if (user?.role === 'staff') return 'staff';
    if (user?.role === 'alumni') return 'alumni';
    return 'student';
  }, [user]);

  const can = useCallback(
    (role: SystemRole, key: PermissionKey): boolean => {
      // Super admin can always perform everything unless explicitly disabled in DB
      if (role === 'super_admin' && permissionsMap['super_admin']?.[key] !== false) {
        return true;
      }
      return permissionsMap[role]?.[key] ?? true;
    },
    [permissionsMap],
  );

  const hasPermission = useCallback(
    (key: PermissionKey): boolean => {
      return can(currentSystemRole, key);
    },
    [can, currentSystemRole],
  );

  const setPermission = useCallback(
    async (role: SystemRole, key: PermissionKey, enabled: boolean) => {
      // Optimistic update
      setRecords((prev) =>
        prev.map((r) => (r.role === role && r.permissionKey === key ? { ...r, enabled } : r)),
      );

      try {
        const updated = await updateRolePermission(role, key, enabled);
        setRecords((prev) =>
          prev.map((r) => (r.role === role && r.permissionKey === key ? updated : r)),
        );
      } catch (err) {
        // Rollback
        await fetchPermissions();
        throw err;
      }
    },
    [fetchPermissions],
  );

  const togglePermission = useCallback(
    async (role: SystemRole, key: PermissionKey) => {
      const current = can(role, key);
      await setPermission(role, key, !current);
    },
    [can, setPermission],
  );

  const resetToDefaults = useCallback(
    async (role?: SystemRole) => {
      await resetRolePermissions(role);
      await fetchPermissions();
    },
    [fetchPermissions],
  );

  return (
    <RolePermissionsContext.Provider
      value={{
        records,
        isLoading,
        hasPermission,
        can,
        togglePermission,
        setPermission,
        resetToDefaults,
        refresh: fetchPermissions,
      }}
    >
      {children}
    </RolePermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(RolePermissionsContext);
}
