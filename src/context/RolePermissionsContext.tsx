import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { AppState } from 'react-native';
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
  /** True when the latest refresh failed; the last good matrix (if any) is still in use. */
  loadError: boolean;
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
  loadError: false,
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
  const [loadError, setLoadError] = useState(false);
  const userId = user?.id ?? null;
  const retryAttempt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPermissions = useCallback(async () => {
    // The matrix is for signed-in members (the database refuses signed-out reads), so there is nothing to fetch
    // before sign-in and nothing to keep after sign-out.
    if (!userId) {
      setRecords([]);
      setLoadError(false);
      setIsLoading(false);
      return;
    }
    try {
      const data = await listRolePermissions();
      // An empty matrix is a legitimate answer (every permission falls back to its default), so apply it too.
      setRecords(data);
      setLoadError(false);
      retryAttempt.current = 0;
    } catch (err: any) {
      // Keep the last good matrix; a failed refresh must not wipe or silently freeze it.
      console.warn('[RolePermissions] Failed to load permissions:', err?.message || err);
      setLoadError(true);
      // Retry sooner than the 5-minute refresh: 15s, 30s, 60s, then every 2 minutes.
      const delay = Math.min(120_000, 15_000 * 2 ** Math.min(retryAttempt.current, 3));
      retryAttempt.current += 1;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => {
        void fetchPermissions();
      }, delay);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Load when the account appears or changes (it used to load once, before sign-in, and never again), and keep
  // it current: an admin flipping a toggle must reach people who already have the app open.
  useEffect(() => {
    retryAttempt.current = 0;
    void fetchPermissions();
    if (!userId) return undefined;
    const timer = setInterval(fetchPermissions, 5 * 60 * 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void fetchPermissions();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [fetchPermissions, userId]);

  // Lookup map: role -> permissionKey -> boolean
  const permissionsMap = useMemo(() => {
    const map: Partial<Record<SystemRole, Partial<Record<PermissionKey, boolean>>>> = {};
    for (const r of records) {
      if (!map[r.role]) map[r.role] = {};
      map[r.role]![r.permissionKey] = r.enabled;
    }
    return map;
  }, [records]);

  // Determine current active system role (respecting role-switcher preview mode)
  const currentSystemRole: SystemRole = useMemo(() => {
    if (user?.role === 'staff') return 'staff';
    if (user?.role === 'alumni') return 'alumni';
    if (user?.role === 'student') return 'student';
    if (user?.actualRole === 'admin' && user?.isSuperAdmin) return 'super_admin';
    if (user?.isCampusAdmin || user?.role === 'admin') return 'campus_admin';
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
        loadError,
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
