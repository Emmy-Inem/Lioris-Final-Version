import React, { createContext, useContext, useEffect, useMemo, useState } from'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import * as authApi from'@/api/auth';
import { UserRole } from'@/api/types';
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
import { resetToDefaultCampusScope, persistCampus } from '@/hooks/useViewScope';

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

interface SessionUser {
 id: string;
 fullName: string;
 email?: string;
 /** The role currently being displayed/routed on - see switchRole below. */
 role: UserRole;
 /** The real, database-verified role. Never changed by switchRole - this is what gates who can use the Role Switcher. */
 actualRole: UserRole;
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
 const userEmail = session.user.email ?? '';
 const { data: profile } = await supabase
 .from('profiles')
 .select('*')
 .eq('id', session.user.id)
 .maybeSingle();

 const role = (profile?.role || 'student') as UserRole;
 const fullName =
 profile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || userEmail.split('@')[0] || 'Campus Member';

 return {
 id: session.user.id,
 fullName,
 email: userEmail,
 role,
 actualRole: role,
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

function defaultSessionUser(userEmail: string, role: UserRole, fullName: string): SessionUser {
  return {
    id: generateUUID(),
    fullName,
    email: userEmail,
    role,
    actualRole: role,
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
          const initialUser = {
            ...stored,
            role: stored.role as UserRole,
            actualRole: (stored.actualRole ?? stored.role) as UserRole,
            onboardingComplete: isComplete,
            onboardingStep: isComplete ? undefined : (stored.onboardingStep || firstOnboardingStep(stored.role as UserRole)),
            mfaVerified: stored.mfaVerified ?? !roleRequiresMfa(stored.role as UserRole),
          } as SessionUser;
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
          const userEmail = session.user.email ?? '';

          // Securely query verified database profile for role with 3s timeout
          const profilePromise = supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
          const profileTimeout = new Promise<{ data: null }>((resolve) =>
            setTimeout(() => resolve({ data: null }), 3000)
          );
          const { data: profile } = await Promise.race([profilePromise, profileTimeout]);

          // Authorization role must come from `profiles.role` only -
          // `user_metadata` is client-writable via supabase.auth.updateUser()
          // and must never be trusted for authorization. Default to the
          // lowest-privilege role when the profile lookup is missing.
          const role = (profile?.role || 'student') as UserRole;
          const fullName = profile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || userEmail.split('@')[0] || 'Campus Member';
          
          const storedUser = await getSessionUser();
          const activeRole =
            (userRef.current?.actualRole === 'admin' && userRef.current?.role) ||
            (storedUser?.actualRole === 'admin' && storedUser?.role)
              ? ((userRef.current?.role || storedUser?.role) as UserRole)
              : role;
          // `profiles.onboarding_complete` is the real, server-side signal
          // (added after discovering onboarding-complete was previously
          // inferred client-side only, from Boolean(department) backstopped
          // by localStorage - broken for anyone on a fresh device/browser).
          // Local flags and the department heuristic stay as fallbacks for
          // the brief window before every row is backfilled.
          const isOnboarded =
            profile?.onboarding_complete === true ||
            (profile?.onboarding_complete !== false && Boolean(profile?.department)) ||
            role === 'admin' ||
            role === 'staff';

          const nextUser: SessionUser = {
            id: session.user.id,
            fullName,
            email: userEmail,
            role: activeRole,
            actualRole: role,
            onboardingComplete: isOnboarded,
            mfaVerified: !roleRequiresMfa(activeRole),
          };
          await persist(nextUser);
          await setTokens(session.access_token, session.refresh_token ?? session.access_token);
          userRef.current = nextUser;
          setUser(nextUser);
          loadBlockedUserIds().catch(() => {});
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
        // Only log out if user explicitly clicked the logout button
        if (isExplicitLogout.current) {
          userRef.current = null;
          setUser(null);
        }
        return;
      }

      if (session?.user && mounted) {
        const userEmail = session.user.email ?? '';

        // Securely query database profile for role
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
        if (!mounted) return;

        // Authorization role must come from `profiles.role` only
        const role = (profile?.role || 'student') as UserRole;
        const fullName = profile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || userEmail.split('@')[0] || 'Campus Member';

        const storedUser = await getSessionUser();
        const activeRole =
          (userRef.current?.actualRole === 'admin' && userRef.current?.role) ||
          (storedUser?.actualRole === 'admin' && storedUser?.role)
            ? ((userRef.current?.role || storedUser?.role) as UserRole)
            : role;
        const isOnboarded =
          profile?.onboarding_complete === true ||
          (profile?.onboarding_complete !== false && Boolean(profile?.department)) ||
          role === 'admin' ||
          role === 'staff';

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

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      async login(email, password, captchaToken) {
        isExplicitLogout.current = false;
        const session = await authApi.login({ email, password, captchaToken });
        await setTokens(session.accessToken, session.refreshToken);

        const { data: prof } = await supabase
          .from('profiles')
          .select('department, is_suspended, onboarding_complete')
          .eq('id', session.user.id)
          .maybeSingle();

        if (prof?.is_suspended) {
          isExplicitLogout.current = true;
          await clearTokens();
          await setSessionUser(null as any);
          await supabase.auth.signOut();
          setUser(null);
          throw new Error('Your campus account has been suspended by administration. Access to this workspace has been revoked.');
        }

        const isOnboarded =
          prof?.onboarding_complete === true ||
          (prof?.onboarding_complete !== false && Boolean(prof?.department)) ||
          session.user.role === 'admin' ||
          session.user.role === 'staff';

        const nextUser: SessionUser = {
          ...session.user,
          actualRole: session.user.role,
          onboardingComplete: isOnboarded,
          onboardingStep: isOnboarded ? undefined : firstOnboardingStep(session.user.role),
          mfaVerified: !roleRequiresMfa(session.user.role),
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
        try {
          queryClient.clear();
        } catch {
          // Non-blocking
        }
      },
      async setOnboardingStep(path) {
        setUser((prev) => {
          if (!prev) return prev;
          const next = { ...prev, onboardingStep: path };
          persist(next);
          return next;
        });
      },
      async completeOnboarding() {
        const currentUserId = userRef.current?.id;
        setUser((prev) => {
          if (!prev) return prev;
          const next = { ...prev, onboardingComplete: true, onboardingStep: undefined };
          persist(next);
          return next;
        });
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
        setUser((prev) => {
          if (!prev) return prev;
          const next = { ...prev, mfaVerified: true };
          persist(next);
          return next;
        });
      },
      async switchRole(newRole: UserRole) {
        // Gated on actualRole (the real, database-verified identity), not
        // the currently-displayed role - so a Root Admin previewing as
        // Student can still switch straight back to Admin, and nobody who
        // isn't really an admin can ever reach any role through this at
        // all, in any build. See the SessionUser.actualRole comment above.
        if (!user || user.actualRole !== 'admin') {
          throw new Error('Role switching is only available to Root Admins.');
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
        if (!user || user.actualRole !== 'admin') {
          throw new Error('Impersonation is only available to Root Admins.');
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
