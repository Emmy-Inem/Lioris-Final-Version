import React, { createContext, useContext, useEffect, useMemo, useState } from'react';
import { Alert, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import * as authApi from'@/api/auth';
import { UserRole, AdminRoleType } from'@/api/types';
import {
 setTokens,
 clearTokens,
 getAccessToken,
 setSessionUser,
 getSessionUser,
 StoredSessionUser,
} from'./tokenStorage';
import { firstOnboardingStep } from'./onboardingSteps';
import { roleRequiresMfa } from'./mfaPolicy';
import { registerForPushNotificationsAsync } from'@/notifications/push';

import { supabase } from '@/api/supabase';
import { queryClient } from '@/api/queryClient';
import { loadBlockedUserIds } from '@/api/connections';
import { clearLocalNotificationsCache } from '@/api/notifications';
import { resetToDefaultCampusScope, persistCampus } from '@/hooks/useViewScope';
import { clearSavedItemsMemoryCache } from '@/api/bookmarks';
import { clearPortalVisitsMemoryCache } from '@/utils/portalVisits';

// ---------------------------------------------------------------------------
// Admin "View As / Support Mode" impersonation - session backup helpers.
//
// Mirrors src/auth/tokenStorage.ts's own SecureStore pattern (same guard, same
// fallback rationale), but under a distinct key so
// it can never collide with or be clobbered by the normal token lifecycle -
// this key only ever holds the *admin's* own tokens, backed up for the
// duration of an impersonation session so `endImpersonation` can restore them.
// On web it lives in sessionStorage (NOT localStorage) so the admin's tokens do
// not survive closing the tab; native uses SecureStore.
// ---------------------------------------------------------------------------
const IMPERSONATION_ADMIN_BACKUP_KEY = 'lioris_impersonation_admin_backup';
const isWebPlatform = Platform.OS === 'web';

interface ImpersonationBackup {
 accessToken: string;
 refreshToken: string;
}

async function setImpersonationAdminBackup(accessToken: string, refreshToken: string): Promise<void> {
 const value = JSON.stringify({ accessToken, refreshToken });
 if (isWebPlatform) {
 try {
 if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(IMPERSONATION_ADMIN_BACKUP_KEY, value);
 } catch {
 // no-op - best effort only, matches tokenStorage.ts's web fallback
 }
 return;
 }
 await SecureStore.setItemAsync(IMPERSONATION_ADMIN_BACKUP_KEY, value);
}

async function getImpersonationAdminBackup(): Promise<ImpersonationBackup | null> {
 const raw = isWebPlatform
 ? (() => {
 try {
 return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(IMPERSONATION_ADMIN_BACKUP_KEY) : null;
 } catch {
 return null;
 }
 })()
 : await SecureStore.getItemAsync(IMPERSONATION_ADMIN_BACKUP_KEY);
 if (!raw) return null;
 try {
 return JSON.parse(raw);
 } catch {
 return null;
 }
}

async function clearImpersonationAdminBackup(): Promise<void> {
 if (isWebPlatform) {
 try {
 if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(IMPERSONATION_ADMIN_BACKUP_KEY);
 // Also purge any copy an older build left in localStorage.
 if (typeof localStorage !== 'undefined') localStorage.removeItem(IMPERSONATION_ADMIN_BACKUP_KEY);
 } catch {
 // no-op
 }
 return;
 }
 await SecureStore.deleteItemAsync(IMPERSONATION_ADMIN_BACKUP_KEY);
}

/** Mirrors platform-config's own `/(role)/dashboard` convention (see the Preview Workspace switcher in SettingsScreenBase.tsx) - admin has a dedicated landing screen instead of a generic dashboard route. */
function dashboardPathForRole(role: UserRole): string {
 return role === 'admin' ? '/(admin)/dashboard' : `/(${role})/dashboard`;
}

export interface SessionUser {
 id: string;
 fullName: string;
 email?: string;
 /** The role currently being displayed/routed on - see switchRole below. */
 role: UserRole;
 /** The real, database-verified role. Never changed by switchRole - this is what gates who can use the Role Switcher. */
 actualRole: UserRole;
 adminRole?: AdminRoleType | null;
 campusCode?: string | null;
 isSuperAdmin: boolean;
 isCampusAdmin: boolean;
 onboardingComplete: boolean;
 onboardingStep?: string;
 /** See src/auth/mfaPolicy.ts - only meaningful when the role requires MFA. */
 mfaVerified: boolean;
}

export interface ImpersonationState {
 active: boolean;
 targetUserId: string | null;
 targetName: string | null;
 /** ISO timestamp - when the impersonation grant auto-expires. */
 expiresAt: string | null;
}

const DEFAULT_IMPERSONATION: ImpersonationState = {
 active: false,
 targetUserId: null,
 targetName: null,
 expiresAt: null,
};

interface AuthContextValue {
 user: SessionUser | null;
 isLoading: boolean;
 login: (email: string, password: string, captchaToken?: string) => Promise<void>;
 register: (payload: authApi.RegisterPayload) => Promise<SessionUser>;
 logout: () => Promise<void>;
 /** Called by each onboarding screen after it completes, so a reload resumes at the right step. */
 setOnboardingStep: (path: string) => Promise<void>;
 /** Called by the final onboarding screen once the whole chain is done. */
 completeOnboarding: () => Promise<void>;
 /** Called by the MFA challenge screen once the code checks out. No-op if the current role doesn't require MFA. */
 verifyMfa: (code: string) => Promise<void>;
 /**
  * Lets a real Root Admin preview the app as another role, for testing.
  * Only ever changes `user.role` (what's displayed/routed) - `user.id`,
  * `email`, and `actualRole` (the real, authenticated identity) never
  * change, so the admin's own Supabase session and database row stay
  * intact and switching back to Admin is instant. Throws if the caller
  * isn't really an admin (checked against `actualRole`, which this
  * function itself can never have altered).
  */
 switchRole: (role: UserRole) => Promise<void>;
 /** Current "View As / Support Mode" impersonation status - see beginImpersonation/endImpersonation below. */
 impersonation: ImpersonationState;
 /**
  * Root-Admin-only: backs up the admin's own live session, then swaps the
  * active Supabase session to `targetUserId` via the admin-impersonate-user
  * Edge Function, so the admin can view the app exactly as that user for
  * support purposes. Time-boxed (auto-ends at the grant's expiresAt) and
  * fully audit-logged server-side (a reason of 10+ characters is required). Throws on failure without changing the live session.
  */
 beginImpersonation: (targetUserId: string, reason: string) => Promise<void>;
 /**
  * Restores the backed-up admin session and ends impersonation. Designed to
  * never throw and never leave the app half-authenticated: if the backup is
  * missing or corrupt, or restoring it fails, this signs the user out
  * entirely and redirects to login rather than leaving them stuck as the
  * impersonated user.
  */
 endImpersonation: () => Promise<void>;
 isPasswordRecovery: boolean;
 clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function persist(user: SessionUser) {
 const stored: StoredSessionUser = {
 id: user.id,
 fullName: user.fullName,
 email: user.email,
 role: user.role,
 actualRole: user.actualRole,
 adminRole: user.adminRole,
 campusCode: user.campusCode,
 onboardingComplete: user.onboardingComplete,
 onboardingStep: user.onboardingStep,
 mfaVerified: user.mfaVerified,
 };
 await setSessionUser(stored);
}

// Shared with beginImpersonation/endImpersonation below - resolves the
// verified `profiles.role` for a given Supabase session the same way
// initAuth/onAuthStateChange do above, but always resolves `role` straight
// from the profile (no "preview role" branch) since an impersonated or
// restored-admin session should always reflect who is *actually* signed in
// right now, never a stale previewed role left over from before the swap.
async function fetchSessionUserForSession(session: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>): Promise<SessionUser> {
  const userEmail = (session.user.email ?? '').toLowerCase().trim();
  const isMasterAdminEmail = userEmail === 'inememmanuel@gmail.com';

  let profile: any = null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, full_name, admin_role, campus_code')
      .eq('id', session.user.id)
      .maybeSingle();
    if (!error && data) {
      profile = data;
    } else if (error) {
      const { data: fallbackData } = await supabase
        .from('profiles')
        .select('role, full_name, campus_code')
        .eq('id', session.user.id)
        .maybeSingle();
      if (fallbackData) profile = fallbackData;
    }
  } catch (err) {
    console.warn('[AuthContext] fetchSessionUserForSession profile query failed:', err);
  }

  const role = isMasterAdminEmail ? 'admin' : ((profile?.role || 'student') as UserRole);
  const adminRole = isMasterAdminEmail ? 'super_admin' : (profile?.admin_role as AdminRoleType | null | undefined);
  const isSuperAdmin = isMasterAdminEmail || (role === 'admin' && (adminRole === 'super_admin' || (!adminRole && (profile?.campus_code === 'GLOBAL' || userEmail === 'inememmanuel@gmail.com'))));
  const isCampusAdmin = role === 'admin' && !isSuperAdmin;
  const campusCode = isMasterAdminEmail ? 'GLOBAL' : (profile?.campus_code || null);
  const fullName =
    profile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || userEmail.split('@')[0] || 'Campus Member';

  return {
    id: session.user.id,
    fullName,
    email: userEmail,
    role,
    actualRole: isMasterAdminEmail ? 'admin' : role,
    adminRole: isSuperAdmin ? 'super_admin' : isCampusAdmin ? 'campus_admin' : null,
    campusCode,
    isSuperAdmin,
    isCampusAdmin,
    onboardingComplete: true,
    mfaVerified: !roleRequiresMfa(role),
  };
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function defaultSessionUser(userEmail: string, role: UserRole, fullName: string, adminRole?: AdminRoleType | null, campusCode?: string | null): SessionUser {
  const isSuperAdmin = role === 'admin' && (adminRole === 'super_admin' || (!adminRole && (campusCode === 'GLOBAL' || userEmail === 'inememmanuel@gmail.com')));
  const isCampusAdmin = role === 'admin' && !isSuperAdmin;
  return {
    id: generateUUID(),
    fullName,
    email: userEmail,
    role,
    actualRole: role,
    adminRole: isSuperAdmin ? 'super_admin' : isCampusAdmin ? 'campus_admin' : null,
    campusCode: campusCode || (isSuperAdmin ? 'GLOBAL' : null),
    isSuperAdmin,
    isCampusAdmin,
    onboardingComplete: false,
    mfaVerified: !roleRequiresMfa(role),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [impersonation, setImpersonation] = useState<ImpersonationState>(DEFAULT_IMPERSONATION);
  const userRef = React.useRef<SessionUser | null>(null);
  userRef.current = user;
  const isExplicitLogout = React.useRef(false);
  // True while beginImpersonation/endImpersonation swap the live Supabase session. The auth
  // listener must ignore the SIGNED_IN those swaps emit - it would otherwise write the previous
  // account's role onto the account that was just switched to.
  const isSwappingSession = React.useRef(false);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      // 1. Check local session tokens
      const token = await getAccessToken();
      if (token) {
        const stored = await getSessionUser();
        if (mounted && stored) {
          const isComplete = Boolean(stored.onboardingComplete);
          const role = stored.role as UserRole;
          const actualRole = (stored.actualRole ?? stored.role) as UserRole;
          const adminRole = stored.adminRole as AdminRoleType | null | undefined;
          const isSuperAdmin = actualRole === 'admin' && (adminRole === 'super_admin' || (!adminRole && (stored.campusCode === 'GLOBAL' || stored.email === 'inememmanuel@gmail.com')));
          const isCampusAdmin = actualRole === 'admin' && !isSuperAdmin;
          const initialUser: SessionUser = {
            ...stored,
            role,
            actualRole,
            adminRole: isSuperAdmin ? 'super_admin' : isCampusAdmin ? 'campus_admin' : null,
            campusCode: stored.campusCode || (isSuperAdmin ? 'GLOBAL' : null),
            isSuperAdmin,
            isCampusAdmin,
            onboardingComplete: isComplete,
            onboardingStep: isComplete ? undefined : (stored.onboardingStep || firstOnboardingStep(role)),
            mfaVerified: stored.mfaVerified ?? !roleRequiresMfa(role),
          };
          userRef.current = initialUser;
          setUser(initialUser);
          loadBlockedUserIds().catch(() => {});
        }
      }

      // 2. Check active Supabase OAuth session with failsafe timeout
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 4000)
        );
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
        if (session?.user && mounted) {
          // Securely query verified database profile for role with 3s timeout
          const userEmail = (session.user.email ?? '').toLowerCase().trim();
          const isMasterAdminEmail = userEmail === 'inememmanuel@gmail.com';

          let profile: any = null;
          try {
            const profilePromise = supabase
              .from('profiles')
              .select('role, full_name, onboarding_complete, department, admin_role, campus_code')
              .eq('id', session.user.id)
              .maybeSingle();
            const profileTimeout = new Promise<{ data: null; error?: any }>((resolve) =>
              setTimeout(() => resolve({ data: null }), 3000)
            );
            const { data, error } = await Promise.race([profilePromise, profileTimeout]);
            if (!error && data) {
              profile = data;
            } else if (error) {
              const { data: fallbackData } = await supabase
                .from('profiles')
                .select('role, full_name, onboarding_complete, department, campus_code')
                .eq('id', session.user.id)
                .maybeSingle();
              if (fallbackData) profile = fallbackData;
            }
          } catch {}

          const storedUser = await getSessionUser();
          const fallbackRole = (storedUser?.actualRole || userRef.current?.actualRole || 'student') as UserRole;
          const role = isMasterAdminEmail ? 'admin' : ((profile?.role || fallbackRole) as UserRole);
          const adminRole = isMasterAdminEmail ? 'super_admin' : ((profile?.admin_role || storedUser?.adminRole) as AdminRoleType | null | undefined);
          const campusCode = isMasterAdminEmail ? 'GLOBAL' : (profile?.campus_code || storedUser?.campusCode || null);
          const isSuperAdmin = isMasterAdminEmail || (role === 'admin' && (adminRole === 'super_admin' || (!adminRole && (campusCode === 'GLOBAL' || userEmail === 'inememmanuel@gmail.com'))));
          const isCampusAdmin = role === 'admin' && !isSuperAdmin;
          const fullName = profile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || storedUser?.fullName || userRef.current?.fullName || userEmail.split('@')[0] || 'Campus Member';
          
          const activeRole =
            (userRef.current?.actualRole === 'admin' && userRef.current?.role) ||
            (storedUser?.actualRole === 'admin' && storedUser?.role)
              ? ((userRef.current?.role || storedUser?.role) as UserRole)
              : role;

          const cachedOnboarding = userRef.current?.onboardingComplete ?? storedUser?.onboardingComplete;
          const isOnboarded = profile
            ? (profile.onboarding_complete === true ||
               role === 'admin' ||
               role === 'staff' ||
               isMasterAdminEmail)
            : (cachedOnboarding ?? (role === 'admin' || role === 'staff'));
          const sameAccount =
            userRef.current?.id === session.user.id || storedUser?.id === session.user.id;

          const nextUser: SessionUser = {
            id: session.user.id,
            fullName,
            email: userEmail,
            role: activeRole,
            actualRole: role,
            adminRole: isSuperAdmin ? 'super_admin' : isCampusAdmin ? 'campus_admin' : null,
            campusCode,
            isSuperAdmin,
            isCampusAdmin,
            onboardingComplete: isOnboarded,
            onboardingStep: isOnboarded
              ? undefined
              : userRef.current?.onboardingStep || storedUser?.onboardingStep || firstOnboardingStep(role),
            // MFA verification belongs to this still-valid local session. A
            // full logout clears the stored projection, while a reload must
            // not force staff/admin through the challenge again.
            mfaVerified: sameAccount
              ? (userRef.current?.mfaVerified ?? storedUser?.mfaVerified ?? !roleRequiresMfa(activeRole))
              : !roleRequiresMfa(activeRole),
          };
          await persist(nextUser);
          await setTokens(session.access_token, session.refresh_token ?? session.access_token);
          userRef.current = nextUser;
          setUser(nextUser);
          loadBlockedUserIds().catch(() => {});
        } else if (mounted) {
          // No active Supabase session (expired/invalid refresh token, or the
          // failsafe timeout above lost the race) - don't leave the user
          // optimistically restored from local cache above stuck "logged in".
          userRef.current = null;
          setUser(null);
        }
      } catch {
        // OAuth check fallback
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initAuth();

    // 3. Supabase Auth State Change Listener
    // supabase-js runs its listener while it holds its internal auth lock, and it
    // emits SIGNED_IN every time a minimized tab/PWA returns to the foreground.
    // Awaiting another supabase call inside the listener (the profiles fetch) waits
    // for that same lock and deadlocks: every later request hangs and the app comes
    // back frozen/blank. So the listener stays synchronous and the real work runs
    // once it has returned.
    const handleAuthChange = async (
      event: string,
      session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'],
    ) => {
      // Handle password recovery flow (e.g. magic link clicked or OTP recovery session initiated)
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        if (session) {
          await setTokens(session.access_token, session.refresh_token ?? session.access_token);
        }
        router.replace('/(auth)/reset-password' as any);
        return;
      }

      if (isSwappingSession.current) return;

      // Crucial: on screen unlock or background token refresh, DO NOT overwrite active role or profile!
      if (event === 'TOKEN_REFRESHED' && session) {
        await setTokens(session.access_token, session.refresh_token ?? session.access_token);
        return;
      }
      if (event === 'SIGNED_OUT') {
        // Clear local state for the explicit-logout case too (logout() also does this
        // itself, so this is a no-op there) and for any other SIGNED_OUT we weren't
        // expecting - an invalidated/expired/revoked session (e.g. "Sign Out All Other
        // Active Sessions" from another device) must not leave the app looking signed in.
        // isSwappingSession is already checked above, so an impersonation begin/end swap
        // never reaches here.
        userRef.current = null;
        setUser(null);
        // A device/session that signs a second account in without a full
        // reload (notably on web) must never see the previous user's
        // just-created notifications merged back into their list.
        clearLocalNotificationsCache();
        clearSavedItemsMemoryCache();
        clearPortalVisitsMemoryCache();
        if (!isExplicitLogout.current) {
          router.replace('/(auth)/login');
        }
        return;
      }

      if (session?.user && mounted) {
        // Securely query database profile for role with 3s timeout failsafe
        const userEmail = (session.user.email ?? '').toLowerCase().trim();
        const isMasterAdminEmail = userEmail === 'inememmanuel@gmail.com';

        let profile: any = null;
        try {
          const profileFetch = supabase
            .from('profiles')
            .select('role, full_name, admin_role, campus_code')
            .eq('id', session.user.id)
            .maybeSingle();
          const timeout = new Promise<any>((_, reject) =>
            setTimeout(() => reject(new Error('Profile query timeout on resume')), 3000)
          );
          const result = await Promise.race([profileFetch, timeout]);
          if (!result?.error && result?.data) {
            profile = result.data;
          } else if (result?.error) {
            const { data: fallbackData } = await supabase
              .from('profiles')
              .select('role, full_name, campus_code')
              .eq('id', session.user.id)
              .maybeSingle();
            if (fallbackData) profile = fallbackData;
          }
        } catch (fetchErr) {
          console.warn('[AuthContext] Profile query timed out or failed on resume, using cached session metadata:', fetchErr);
        }
        if (!mounted) return;

        const storedUser = await getSessionUser();
        const fallbackRole = (userRef.current?.actualRole || storedUser?.actualRole || 'student') as UserRole;
        const role = isMasterAdminEmail ? 'admin' : ((profile?.role || fallbackRole) as UserRole);
        const adminRole = isMasterAdminEmail ? 'super_admin' : ((profile?.admin_role || storedUser?.adminRole) as AdminRoleType | null | undefined);
        const campusCode = isMasterAdminEmail ? 'GLOBAL' : (profile?.campus_code || storedUser?.campusCode || null);
        const isSuperAdmin = isMasterAdminEmail || (role === 'admin' && (adminRole === 'super_admin' || (!adminRole && (campusCode === 'GLOBAL' || userEmail === 'inememmanuel@gmail.com'))));
        const isCampusAdmin = role === 'admin' && !isSuperAdmin;
        const fullName = profile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || userRef.current?.fullName || storedUser?.fullName || userEmail.split('@')[0] || 'Campus Member';

        const activeRole =
          (userRef.current?.actualRole === 'admin' && userRef.current?.role) ||
          (storedUser?.actualRole === 'admin' && storedUser?.role)
            ? ((userRef.current?.role || storedUser?.role) as UserRole)
            : role;

        const cachedOnboarding = userRef.current?.onboardingComplete ?? storedUser?.onboardingComplete;
        const isOnboarded = profile
          ? (profile.onboarding_complete === true ||
             role === 'admin' ||
             role === 'staff' ||
             isMasterAdminEmail)
          : (cachedOnboarding ?? (role === 'admin' || role === 'staff'));

        // Returning to the app re-emits SIGNED_IN for the account that is already
        // open. Keep that account's in-memory MFA/onboarding progress and skip the
        // state update when nothing changed, so a resume doesn't re-render (or
        // re-lock) the whole tree.
        const current = userRef.current;
        const sameAccount = current?.id === session.user.id;
        const nextUser: SessionUser = {
          id: session.user.id,
          fullName,
          email: userEmail,
          role: activeRole,
          actualRole: role,
          adminRole: isSuperAdmin ? 'super_admin' : isCampusAdmin ? 'campus_admin' : null,
          campusCode,
          isSuperAdmin,
          isCampusAdmin,
          onboardingComplete: isOnboarded,
          onboardingStep: sameAccount && !isOnboarded ? current?.onboardingStep : undefined,
          mfaVerified:
            sameAccount && current?.role === activeRole ? current.mfaVerified : !roleRequiresMfa(activeRole),
        };
        if (
          sameAccount &&
          current &&
          current.fullName === nextUser.fullName &&
          current.email === nextUser.email &&
          current.role === nextUser.role &&
          current.actualRole === nextUser.actualRole &&
          current.adminRole === nextUser.adminRole &&
          current.campusCode === nextUser.campusCode &&
          current.onboardingComplete === nextUser.onboardingComplete &&
          current.mfaVerified === nextUser.mfaVerified
        ) {
          await setTokens(session.access_token, session.refresh_token ?? session.access_token);
          return;
        }
        await persist(nextUser);
        await setTokens(session.access_token, session.refresh_token ?? session.access_token);
        userRef.current = nextUser;
        setUser(nextUser);
        loadBlockedUserIds().catch(() => {});
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setTimeout(() => {
        handleAuthChange(event, session).catch(() => {
          // A failed refresh of the cached profile must never take the session down.
        });
      }, 0);
    });

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Realtime enforcement of suspension/deletion on an already-open session.
  //
  // login() (src/api/auth.ts) only checks profiles.is_suspended once, at
  // sign-in time, and handleAuthChange above deliberately skips re-reading the
  // profile on TOKEN_REFRESHED ("DO NOT overwrite active role or profile").
  // Nothing watched the signed-in user's OWN profile row after that, so an
  // admin flipping is_suspended = true (or hard-deleting the account) on an
  // already-open session had no visible effect until some individual
  // RLS-gated write happened to start failing - the UI itself kept working.
  //
  // This subscribes to a realtime channel scoped to the signed-in user's own
  // profile row only (filter: id=eq.<own id>, the same scoping shape
  // src/hooks/useLiveRefresh.ts uses) and is torn down whenever that id
  // changes (sign-out, switching which account is live, or unmount) - one
  // channel per signed-in account, same lifecycle convention as
  // useLiveRefresh. It is a best-effort fast path on top of the server-side
  // RLS checks that already enforce suspension on every write, so a failure
  // to connect is harmless.
  useEffect(() => {
    const watchedUserId = user?.id;
    if (!watchedUserId) return undefined;

    // Scoped to this one subscription's lifetime, so a stale/duplicate event
    // delivered after the sign-out has already been kicked off can never
    // trigger a second Alert + signOut for the same account.
    let handledRevocation = false;

    const forceSignOutForRevokedAccess = (reason: 'suspended' | 'deleted') => {
      if (handledRevocation) return;
      handledRevocation = true;
      try {
        // Same user-facing copy login() shows for a suspended sign-in
        // attempt (src/api/auth.ts), so the message is consistent whether
        // suspension is discovered at login or mid-session.
        Alert.alert(
          'Account Access Revoked',
          reason === 'suspended'
            ? 'Your campus account has been suspended by administration. Access to this campus network has been revoked.'
            : 'Your account no longer exists on this campus network. Access has been revoked.',
        );
      } catch {
        // Alert is best-effort only - never block the sign-out on it.
      }
      // onAuthStateChange's SIGNED_OUT branch above does the rest (clears
      // user state, clears the notifications cache, and - since this is not
      // an explicit logout - redirects to login) once this resolves.
      supabase.auth.signOut().catch(() => {});
    };

    const applyLiveRoleChange = (newRole: UserRole) => {
      const current = userRef.current;
      // Ignore a stale event for an account that is no longer the live
      // session (e.g. delivered just as the user signed out or an
      // impersonation swap moved the session to someone else), and ignore a
      // no-op re-delivery of a role that was already applied.
      if (!current || current.id !== watchedUserId || newRole === current.actualRole) return;
      // A real, database-verified role change always wins over a Root
      // Admin's local "View As" preview (see switchRole above) - collapsing
      // role to match rather than risk a preview going stale against a role
      // that just changed for real.
      const isSuperAdmin = (current.email?.toLowerCase().trim() === 'inememmanuel@gmail.com') || (newRole === 'admin' && (current.adminRole === 'super_admin' || (!current.adminRole && (current.campusCode === 'GLOBAL' || current.email === 'inememmanuel@gmail.com')))) || (current.actualRole === 'admin' && current.isSuperAdmin);
      const isCampusAdmin = newRole === 'admin' && !isSuperAdmin;
      const nextUser: SessionUser = {
        ...current,
        actualRole: newRole,
        role: newRole,
        adminRole: isSuperAdmin ? 'super_admin' : isCampusAdmin ? 'campus_admin' : null,
        isSuperAdmin,
        isCampusAdmin,
        mfaVerified: newRole === current.role ? current.mfaVerified : !roleRequiresMfa(newRole),
      };
      persist(nextUser).catch(() => {});
      userRef.current = nextUser;
      setUser(nextUser);
      try {
        queryClient.clear();
      } catch {
        // Non-blocking
      }
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`auth-profile-guard:${watchedUserId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${watchedUserId}` },
          (payload: any) => {
            const row = payload?.new;
            if (row?.is_suspended === true) {
              forceSignOutForRevokedAccess('suspended');
              return;
            }
            if (row?.role) {
              applyLiveRoleChange(row.role as UserRole);
            }
          },
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'profiles', filter: `id=eq.${watchedUserId}` },
          () => forceSignOutForRevokedAccess('deleted'),
        );
      channel.subscribe();
    } catch {
      // Realtime is a best-effort fast path - every RLS-gated write already
      // enforces suspension server-side even if this channel never connects.
    }

    return () => {
      if (channel) supabase.removeChannel(channel).catch(() => {});
    };
  }, [user?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      async login(email, password, captchaToken) {
        isExplicitLogout.current = false;
        const session = await authApi.login({ email, password, captchaToken });
        await setTokens(session.accessToken, session.refreshToken);

        const userEmail = (email || '').toLowerCase().trim();
        const isMasterAdminEmail = userEmail === 'inememmanuel@gmail.com';

        let prof: any = null;
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('department, is_suspended, deactivated_at, onboarding_complete, admin_role, campus_code')
            .eq('id', session.user.id)
            .maybeSingle();
          if (!error && data) {
            prof = data;
          } else if (error) {
            const { data: fallbackProf } = await supabase
              .from('profiles')
              .select('department, is_suspended, deactivated_at, onboarding_complete, campus_code')
              .eq('id', session.user.id)
              .maybeSingle();
            if (fallbackProf) prof = fallbackProf;
          }
        } catch {}

        if (prof?.is_suspended && !isMasterAdminEmail) {
          isExplicitLogout.current = true;
          await clearTokens();
          await setSessionUser(null as any);
          await supabase.auth.signOut();
          setUser(null);
          throw new Error('Your campus account has been suspended by administration. Access to this campus network has been revoked.');
        }

        if (prof?.deactivated_at) {
          try {
            await supabase.rpc('reactivate_my_account');
          } catch {}
        }

        const isOnboarded =
          prof?.onboarding_complete === true ||
          session.user.role === 'admin' ||
          session.user.role === 'staff' ||
          isMasterAdminEmail;

        const userRole = isMasterAdminEmail ? 'admin' : session.user.role;
        const adminRole = isMasterAdminEmail ? 'super_admin' : (prof?.admin_role as AdminRoleType | null | undefined);
        const campusCode = isMasterAdminEmail ? 'GLOBAL' : (prof?.campus_code || null);
        const isSuperAdmin = isMasterAdminEmail || (userRole === 'admin' && (adminRole === 'super_admin' || (!adminRole && (campusCode === 'GLOBAL' || userEmail === 'inememmanuel@gmail.com'))));
        const isCampusAdmin = userRole === 'admin' && !isSuperAdmin;

        const nextUser: SessionUser = {
          ...session.user,
          role: userRole,
          actualRole: userRole,
          adminRole: isSuperAdmin ? 'super_admin' : isCampusAdmin ? 'campus_admin' : null,
          campusCode,
          isSuperAdmin,
          isCampusAdmin,
          onboardingComplete: isOnboarded,
          onboardingStep: isOnboarded ? undefined : firstOnboardingStep(userRole),
          mfaVerified: !roleRequiresMfa(userRole),
        };
        await persist(nextUser);
        setUser(nextUser);
        if (session.user.role === 'student') {
          resetToDefaultCampusScope();
        }
        loadBlockedUserIds().catch(() => {});
        registerForPushNotificationsAsync().catch(() => {});
      },
      async register(payload) {
        isExplicitLogout.current = false;
        if (payload.campusCode) {
          persistCampus(payload.campusCode);
        }
        const session = await authApi.register(payload);
        await setTokens(session.accessToken, session.refreshToken);
        const nextUser: SessionUser = {
          ...session.user,
          actualRole: session.user.role,
          adminRole: null,
          campusCode: payload.campusCode || null,
          isSuperAdmin: false,
          isCampusAdmin: false,
          onboardingComplete: false,
          onboardingStep: firstOnboardingStep(session.user.role),
          mfaVerified: !roleRequiresMfa(session.user.role),
        };
        await persist(nextUser);
        setUser(nextUser);
        if (session.user.role === 'student') {
          resetToDefaultCampusScope();
        }
        return nextUser;
      },
      async logout() {
        isExplicitLogout.current = true;
        await authApi.logout();
        await clearTokens();
        await setSessionUser(null as any);
        // Never leave a backed-up admin session behind after signing out.
        await clearImpersonationAdminBackup().catch(() => {});
        setImpersonation(DEFAULT_IMPERSONATION);
        userRef.current = null;
        setUser(null);
        persistCampus(undefined);
        resetToDefaultCampusScope();
        clearLocalNotificationsCache();
        clearSavedItemsMemoryCache();
        clearPortalVisitsMemoryCache();
        try {
          queryClient.clear();
        } catch {
          // Non-blocking
        }
      },
      async setOnboardingStep(path) {
        const current = userRef.current;
        if (!current) return;
        const next = { ...current, onboardingStep: path };
        // Persist before navigating. The old state-callback fire-and-forgot
        // this write, so a fast reload could reopen the previous step.
        await persist(next);
        userRef.current = next;
        setUser(next);
      },
      async completeOnboarding() {
        const currentUserId = userRef.current?.id;
        const current = userRef.current;
        if (!current) return;
        const next = { ...current, onboardingComplete: true, onboardingStep: undefined };
        await persist(next);
        userRef.current = next;
        setUser(next);
        // Best-effort server sync so "has onboarded" survives a cleared
        // browser/new device, not just this session's local storage.
        if (currentUserId) {
          supabase
            .from('profiles')
            .update({ onboarding_complete: true })
            .eq('id', currentUserId)
            .then(({ error }) => {
              if (error) console.warn('[Auth] Failed to persist onboarding_complete:', error.message);
            });
        }
        registerForPushNotificationsAsync().catch(() => {});
      },
      async verifyMfa(code) {
        await authApi.verifyMfaCode(code.trim());
        const current = userRef.current;
        if (!current) return;
        const next = { ...current, mfaVerified: true };
        await persist(next);
        userRef.current = next;
        setUser(next);
      },
      async switchRole(newRole: UserRole) {
        // Gated on actualRole (the real, database-verified identity), not
        // the currently-displayed role - so a Root Admin previewing as
        // Student can still switch straight back to Admin, and nobody who
        // isn't really an admin can ever reach any role through this at
        // all, in any build. See the SessionUser.actualRole comment above.
        if (!user || user.actualRole !== 'admin' || !user.isSuperAdmin) {
          throw new Error('Role switching is only available to Super Administrators.');
        }

        // Only the *displayed* role changes - id/email/fullName/actualRole
        // (the real signed-in identity) stay exactly as they are, so the
        // admin's own Supabase session and database row keep working
        // normally underneath the preview. Previously this fabricated an
        // entirely new local-only identity (id: `user-${newRole}`, a fake
        // email, etc.), which silently broke every query scoped to the
        // real user id and was a big source of "seeing mock/fallback data"
        // reports whenever the switcher had been used.
        const nextUser: SessionUser = {
          ...user,
          role: newRole,
        };
        await persist(nextUser);
        setUser(nextUser);
        if (newRole === 'student') {
          resetToDefaultCampusScope();
        }
        try {
          queryClient.clear();
        } catch {
          // Non-blocking
        }
      },
      impersonation,
      async beginImpersonation(targetUserId: string, reason: string) {
        isSwappingSession.current = true;
        try {
          await runBeginImpersonation(targetUserId, reason);
        } finally {
          setTimeout(() => {
            isSwappingSession.current = false;
          }, 800);
        }
      },
      async endImpersonation() {
        isSwappingSession.current = true;
        try {
          await runEndImpersonation();
        } finally {
          setTimeout(() => {
            isSwappingSession.current = false;
          }, 800);
        }
      },
      isPasswordRecovery,
      clearPasswordRecovery() {
        setIsPasswordRecovery(false);
      },
    }),
    [user, isLoading, impersonation, isPasswordRecovery],
  );

  // The actual session swaps. Kept out of the memoised value (see the wrappers above) so the
  // isSwappingSession flag brackets the whole operation.
  async function runBeginImpersonation(targetUserId: string, reason: string) {
        // Gated on actualRole, same rationale as switchRole above - never
        // trust the currently-*displayed* role for a privileged action.
        if (!user || user.actualRole !== 'admin' || !user.isSuperAdmin) {
          throw new Error('Impersonation is only available to Super Administrators.');
        }

        const { data: { session: adminSession } } = await supabase.auth.getSession();
        if (!adminSession?.access_token || !adminSession?.refresh_token) {
          throw new Error('No active admin session found. Please sign in again.');
        }

        // Back up the admin's own session BEFORE anything below can swap it
        // out, so endImpersonation (or the fail-safe paths further down) can
        // always get back to a real admin session.
        await setImpersonationAdminBackup(adminSession.access_token, adminSession.refresh_token);

        let result: Awaited<ReturnType<typeof authApi.startImpersonation>>;
        try {
          result = await authApi.startImpersonation(targetUserId, reason);
        } catch (err) {
          await clearImpersonationAdminBackup();
          throw err;
        }

        const { targetSession, targetName, expiresAt } = result;
        if (!targetSession?.access_token || !targetSession?.refresh_token) {
          await clearImpersonationAdminBackup();
          throw new Error('Impersonation session could not be established.');
        }

        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: targetSession.access_token,
          refresh_token: targetSession.refresh_token,
        });
        if (setSessionError) {
          await clearImpersonationAdminBackup();
          throw new Error(setSessionError.message || 'Could not switch to the target user session.');
        }

        // Re-run the same profile-fetch logic that normally runs on auth
        // state change, so `user`/`role` in context correctly reflect the
        // impersonated user (never the admin's previously-previewed role).
        const nextUser = await fetchSessionUserForSession(targetSession);
        await persist(nextUser);
        await setTokens(targetSession.access_token, targetSession.refresh_token);
        setUser(nextUser);

        setImpersonation({
          active: true,
          targetUserId,
          targetName: targetName || nextUser.fullName,
          expiresAt,
        });

        try {
          queryClient.clear();
        } catch {
          // Non-blocking
        }

        router.replace(dashboardPathForRole(nextUser.role) as any);
  }

  async function runEndImpersonation() {
        const backup = await getImpersonationAdminBackup();

        if (!backup?.accessToken || !backup?.refreshToken) {
          // Fail-safe: backup missing or corrupt - never leave the app
          // stuck half-authenticated as the impersonated user. Sign out
          // entirely and send them to login with a clear state.
          await clearImpersonationAdminBackup();
          await clearTokens();
          await supabase.auth.signOut().catch(() => {});
          setUser(null);
          setImpersonation(DEFAULT_IMPERSONATION);
          try {
            queryClient.clear();
          } catch {
            // Non-blocking
          }
          router.replace('/(auth)/login');
          return;
        }

        const endedTargetId = impersonation.targetUserId;

        try {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: backup.accessToken,
            refresh_token: backup.refreshToken,
          });
          if (setSessionError) throw setSessionError;

          const { data: { session: adminSession } } = await supabase.auth.getSession();
          if (!adminSession) throw new Error('Could not restore admin session.');

          const restoredUser = await fetchSessionUserForSession(adminSession);
          await persist(restoredUser);
          await setTokens(adminSession.access_token, adminSession.refresh_token ?? adminSession.access_token);
          setUser(restoredUser);

          await clearImpersonationAdminBackup();
          setImpersonation(DEFAULT_IMPERSONATION);

          // The live session is now restored to the real admin, so ask the
          // edge function to write the authoritative `impersonation_ended`
          // audit entry. Best effort and non-blocking - an audit hiccup must
          // never trap the admin mid-restore.
          if (endedTargetId) {
            void authApi.endImpersonationAudit(endedTargetId);
          }

          try {
            queryClient.clear();
          } catch {
            // Non-blocking
          }

          router.replace(dashboardPathForRole(restoredUser.role) as any);
        } catch {
          // Fail-safe: restoring the admin session failed for some reason -
          // never leave the app silently authenticated as the impersonated
          // user. Sign out entirely rather than guess.
          await clearImpersonationAdminBackup();
          await clearTokens();
          await supabase.auth.signOut().catch(() => {});
          setUser(null);
          setImpersonation(DEFAULT_IMPERSONATION);
          try {
            queryClient.clear();
          } catch {
            // Non-blocking
          }
          router.replace('/(auth)/login');
        }
  }

  // Auto-expiry: while impersonating, end the session automatically once
  // expiresAt is reached, so a forgotten "View As" session can't run
  // indefinitely. Cleaned up whenever impersonation state changes/unmounts.
  useEffect(() => {
    if (!impersonation.active || !impersonation.expiresAt) return undefined;
    const msRemaining = new Date(impersonation.expiresAt).getTime() - Date.now();
    if (msRemaining <= 0) {
      value.endImpersonation().catch(() => {});
      return undefined;
    }
    const timer = setTimeout(() => {
      value.endImpersonation().catch(() => {});
    }, msRemaining);
    return () => clearTimeout(timer);
  }, [impersonation.active, impersonation.expiresAt]);

 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
 const ctx = useContext(AuthContext);
 if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
 return ctx;
}
