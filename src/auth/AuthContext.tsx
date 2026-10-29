import React, { createContext, useContext, useEffect, useMemo, useState } from'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import * as authApi from'@/api/auth';
import { UserRole, AdminRoleType } from'@/api/types';
import {
 clearTokens,
 purgeLegacyTokenCopies,
 setSessionUser,
 getSessionUser,
 StoredSessionUser,
} from'./tokenStorage';
import { firstOnboardingStep } from'./onboardingSteps';
import { roleRequiresMfa } from'./mfaPolicy';
import { registerForPushNotificationsAsync } from'@/notifications/push';

import { supabase, OPENED_FROM_RECOVERY_LINK } from '@/api/supabase';
import { queryClient } from '@/api/queryClient';
import { cancelAllEventReminders } from '@/utils/eventReminders';
import { BIOMETRICS_ENABLED_KEY, removeStoredPref } from '@/utils/biometrics';
import { consumeAuthLink } from './emailLinks';
import { clearMessagingSessionCache } from '@/api/messaging';
import { clearPostsSessionCache } from '@/api/posts';
import { clearEventsSessionCache } from '@/api/events';
import { clearMarketplaceSessionCache } from '@/api/marketplace';

/** Everything held in memory for the account that is going away. */
function clearAccountSessionCaches(): void {
  // Tell the web service worker to drop runtime caches (see public/pwa-boot.js); harmless elsewhere.
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.dispatchEvent(new Event('lioris:sign-out'));
  } catch {
    // best effort
  }
  clearMessagingSessionCache();
  clearPostsSessionCache();
  clearEventsSessionCache();
  clearMarketplaceSessionCache();
  clearBlockedAndMuted();
}
import { loadBlockedUserIds, loadMutedUserIds, clearBlockedAndMuted } from '@/api/connections';
import { getOwnProfileRow, completeOnboardingOnServer } from '@/api/profile';
import { clearLocalNotificationsCache } from '@/api/notifications';
import { resetToDefaultCampusScope, persistCampus } from '@/hooks/useViewScope';
import { clearSavedItemsMemoryCache } from '@/api/bookmarks';
import { clearPortalVisitsMemoryCache } from '@/utils/portalVisits';
import { recordAuditLogEntry } from '@/api/auditLog';
import {
  clampImpersonationExpiry,
  decideStartupImpersonation,
  isImpersonationExpired,
  parsePersistedImpersonation,
  serializeImpersonation,
  type PersistedImpersonation,
} from '@/utils/impersonationState';

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

// The View As record itself (ids + expiry, no secrets). Native: secure storage. Web: sessionStorage, plus a
// copy in localStorage so that a NEW tab - which inherits the impersonated Supabase session from
// localStorage but not the admin's backup from sessionStorage - still knows it must show the banner,
// enforce the limit and end (sign out) instead of silently running as the member.
const IMPERSONATION_STATE_KEY = 'lioris_impersonation_state';

async function persistImpersonation(p: PersistedImpersonation): Promise<void> {
  const value = serializeImpersonation(p);
  if (isWebPlatform) {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(IMPERSONATION_STATE_KEY, value);
      if (typeof localStorage !== 'undefined') localStorage.setItem(IMPERSONATION_STATE_KEY, value);
    } catch {
      // best effort
    }
    return;
  }
  await SecureStore.setItemAsync(IMPERSONATION_STATE_KEY, value);
}

async function readPersistedImpersonation(): Promise<PersistedImpersonation | null> {
  if (isWebPlatform) {
    try {
      const raw =
        (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(IMPERSONATION_STATE_KEY) : null) ??
        (typeof localStorage !== 'undefined' ? localStorage.getItem(IMPERSONATION_STATE_KEY) : null);
      return parsePersistedImpersonation(raw);
    } catch {
      return null;
    }
  }
  try {
    return parsePersistedImpersonation(await SecureStore.getItemAsync(IMPERSONATION_STATE_KEY));
  } catch {
    return null;
  }
}

async function clearPersistedImpersonation(): Promise<void> {
  if (isWebPlatform) {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(IMPERSONATION_STATE_KEY);
      if (typeof localStorage !== 'undefined') localStorage.removeItem(IMPERSONATION_STATE_KEY);
    } catch {
      // no-op
    }
    return;
  }
  await SecureStore.deleteItemAsync(IMPERSONATION_STATE_KEY).catch(() => {});
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
 department?: string | null;
 avatarUrl?: string;
 coverUrl?: string;
 isSuperAdmin: boolean;
 isCampusAdmin: boolean;
 /** Campus Ambassador is an appointment layered on a real student account, never an admin role. */
 isCampusAmbassador: boolean;
 workspaceMode: 'default' | 'ambassador';
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
 /** The admin who started it (needed to verify the backed-up session on restore). */
 adminId?: string | null;
}

const DEFAULT_IMPERSONATION: ImpersonationState = {
 active: false,
 targetUserId: null,
 targetName: null,
 expiresAt: null,
};

export type EndImpersonationOptions = {
  reason?: 'manual' | 'expired' | 'expired_on_start' | 'begin_failed';
  targetId?: string | null;
  adminId?: string | null;
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
 /** Enter/leave the campus-scoped Ambassador Console without changing the authenticated role. */
 enterAmbassadorWorkspace: () => Promise<void>;
 exitAmbassadorWorkspace: () => Promise<void>;
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
 /** Update session user in-memory and in persistent storage. */
 updateUser: (patch: Partial<SessionUser>) => Promise<void>;
 /** Refresh session user from Supabase database profiles row. */
 refreshUser: () => Promise<SessionUser | null>;
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
 department: user.department,
 avatarUrl: user.avatarUrl,
 coverUrl: user.coverUrl,
 onboardingComplete: user.onboardingComplete,
 onboardingStep: user.onboardingStep,
 mfaVerified: user.mfaVerified,
 isCampusAmbassador: user.isCampusAmbassador,
 workspaceMode: user.workspaceMode,
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

  // Own row through get_my_profile() (the same read initAuth uses). The table's SELECT grant was narrowed to a
  // column list that omits onboarding_step, so a direct select failed and silently produced a 'student'.
  // For a View As swap this must be the TARGET's row (setSession has already run) and, on restore, the
  // admin's: if it cannot be read, fail instead of guessing a role.
  const profile: any = await fetchOwnProfile(session.user.id, 8000);
  if (!profile && !isMasterAdminEmail) {
    throw new Error('Could not load the account profile for this session.');
  }

  const role = isMasterAdminEmail ? 'admin' : ((profile?.role || 'student') as UserRole);
  const adminRole = isMasterAdminEmail ? 'super_admin' : (profile?.admin_role as AdminRoleType | null | undefined);
  const isSuperAdmin = isMasterAdminEmail || (role === 'admin' && adminRole === 'super_admin');
  const isCampusAdmin = role === 'admin' && !isSuperAdmin;
  const isCampusAmbassador = role === 'student' && profile?.is_campus_ambassador === true;
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
    department: profile?.department || null,
    avatarUrl: profile?.avatar_url || undefined,
    coverUrl: profile?.banner_url || undefined,
    isSuperAdmin,
    isCampusAdmin,
    isCampusAmbassador,
    workspaceMode: 'default',
    onboardingComplete: isMasterAdminEmail || role === 'admin' || role === 'staff' || profile?.onboarding_complete === true,
    onboardingStep: profile?.onboarding_step || undefined,
    mfaVerified: !roleRequiresMfa(role),
  };
}

/**
 * Loads the signed-in member's own profile row with a bounded wait and ONE retry.
 *
 * The old code gave the profile query 3 seconds, once, and on a miss silently fell back to the cached
 * (or default 'student') role and `onboarding_complete = false` - then PERSISTED that guess. A slow
 * Nigerian mobile connection was enough to send a finished account back through onboarding, or an
 * admin into the student portal. Returns null only if both attempts fail; callers must then keep what
 * they already know instead of overwriting it with defaults.
 */
async function fetchOwnProfile(userId: string, timeoutMs = 6000): Promise<any | null> {
  const attempt = () =>
    Promise.race([
      getOwnProfileRow(userId),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  const first = await attempt().catch(() => null);
  if (first) return first;
  await new Promise((resolve) => setTimeout(resolve, 800));
  return attempt().catch(() => null);
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function defaultSessionUser(userEmail: string, role: UserRole, fullName: string, adminRole?: AdminRoleType | null, campusCode?: string | null): SessionUser {
  const isSuperAdmin = userEmail.toLowerCase().trim() === 'inememmanuel@gmail.com' || (role === 'admin' && adminRole === 'super_admin');
  const isCampusAdmin = role === 'admin' && !isSuperAdmin;
  return {
    id: generateUUID(),
    fullName,
    email: userEmail,
    role,
    actualRole: role,
    adminRole: isSuperAdmin ? 'super_admin' : isCampusAdmin ? 'campus_admin' : null,
    campusCode: campusCode || (isSuperAdmin ? 'GLOBAL' : null),
    department: null,
    isSuperAdmin,
    isCampusAdmin,
    isCampusAmbassador: false,
    workspaceMode: 'default',
    onboardingComplete: false,
    mfaVerified: !roleRequiresMfa(role),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(OPENED_FROM_RECOVERY_LINK);
  const [impersonation, setImpersonation] = useState<ImpersonationState>(DEFAULT_IMPERSONATION);
  const userRef = React.useRef<SessionUser | null>(null);
  userRef.current = user;
  const isExplicitLogout = React.useRef(false);
  // Bumped whenever the person signs out (logout, revoked or expired session). A profile fetch that was
  // already in flight compares its epoch before it writes state, so it can never bring a signed-out
  // account back to life (the "ghost session" after a password reset / suspension / quick logout).
  const authEpoch = React.useRef(0);
  // True while beginImpersonation/endImpersonation swap the live Supabase session. The auth
  // listener must ignore the SIGNED_IN those swaps emit - it would otherwise write the previous
  // account's role onto the account that was just switched to.
  const isSwappingSession = React.useRef(false);
  // Mirrors the impersonation state for code that runs outside a render (start-up, timers).
  const impersonationRef = React.useRef<ImpersonationState>(DEFAULT_IMPERSONATION);
  const endingImpersonation = React.useRef(false);
  const endImpersonationRef = React.useRef<((opts?: EndImpersonationOptions) => Promise<void>) | null>(null);
  const applyImpersonationState = (next: ImpersonationState) => {
    impersonationRef.current = next;
    setImpersonation(next);
  };

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      const epoch = authEpoch.current;
      void purgeLegacyTokenCopies();
      // 1. Paint the cached account instantly. supabase.auth.getSession() below confirms it, or clears it
      //    when the session is gone (the raw tokens are no longer duplicated outside the Supabase client).
      {
        const stored = await getSessionUser();
        // A View As that survived a reload: show the banner immediately, before the network answers.
        const persistedImp = await readPersistedImpersonation();
        if (mounted && persistedImp && stored?.id === persistedImp.targetId && !isImpersonationExpired(persistedImp)) {
          applyImpersonationState({
            active: true,
            targetUserId: persistedImp.targetId,
            targetName: persistedImp.targetName ?? null,
            expiresAt: persistedImp.expiresAt,
            adminId: persistedImp.adminId,
          });
        }
        if (mounted && stored) {
          const isComplete = Boolean(stored.onboardingComplete);
          const role = stored.role as UserRole;
          const actualRole = (stored.actualRole ?? stored.role) as UserRole;
          const adminRole = stored.adminRole as AdminRoleType | null | undefined;
          const isSuperAdmin = stored.email?.toLowerCase().trim() === 'inememmanuel@gmail.com' || (actualRole === 'admin' && adminRole === 'super_admin');
          const isCampusAdmin = actualRole === 'admin' && !isSuperAdmin;
          const initialUser: SessionUser = {
            ...stored,
            // Web keeps the name out of persistent storage: a new tab shows a placeholder until the profile loads.
            fullName: stored.fullName || 'Campus Member',
            role,
            actualRole,
            adminRole: isSuperAdmin ? 'super_admin' : isCampusAdmin ? 'campus_admin' : null,
            campusCode: stored.campusCode || (isSuperAdmin ? 'GLOBAL' : null),
            department: stored.department || null,
            avatarUrl: stored.avatarUrl || undefined,
            coverUrl: stored.coverUrl || undefined,
            isSuperAdmin,
            isCampusAdmin,
            isCampusAmbassador: actualRole === 'student' && stored.isCampusAmbassador === true,
            workspaceMode:
              actualRole === 'student' && stored.isCampusAmbassador === true && stored.workspaceMode === 'ambassador'
                ? 'ambassador'
                : 'default',
            onboardingComplete: isComplete,
            onboardingStep: isComplete ? undefined : (stored.onboardingStep || firstOnboardingStep(role)),
            mfaVerified: stored.mfaVerified ?? !roleRequiresMfa(role),
          };
          userRef.current = initialUser;
          setUser(initialUser);
          loadBlockedUserIds().catch(() => {});
        }
      }

      // The cached account is already on screen: do not hold the app on a spinner while the network
      // re-validates it (on a slow connection that spinner was the whole startup).
      if (mounted && userRef.current) setIsLoading(false);

      // 2. Check the active Supabase session. A timeout is NOT "signed out": it only means the
      //    network is slow, and the auth listener below delivers the session as soon as it resolves.
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ timedOut: true }>((resolve) =>
          setTimeout(() => resolve({ timedOut: true }), 8000),
        );
        const outcome = await Promise.race([sessionPromise, timeoutPromise]);
        const timedOut = 'timedOut' in outcome;
        const session = timedOut ? null : outcome.data.session;
        if (session?.user && mounted) {
          // A persisted View As: resume it, end it (expired), or forget it (does not match the live session).
          const persistedImp = await readPersistedImpersonation();
          const impDecision = decideStartupImpersonation(persistedImp, session.user.id);
          if (impDecision === 'end' && persistedImp) {
            // Restores the admin session (or signs out cleanly) and writes the end audit entry.
            await endImpersonationRef.current?.({
              reason: 'expired_on_start',
              targetId: persistedImp.targetId,
              adminId: persistedImp.adminId,
            });
            return;
          }
          if (impDecision === 'discard') {
            await clearPersistedImpersonation();
            await clearImpersonationAdminBackup().catch(() => {});
            applyImpersonationState(DEFAULT_IMPERSONATION);
          } else if (impDecision === 'resume' && persistedImp) {
            applyImpersonationState({
              active: true,
              targetUserId: persistedImp.targetId,
              targetName: persistedImp.targetName ?? null,
              expiresAt: persistedImp.expiresAt,
              adminId: persistedImp.adminId,
            });
          }

          const userEmail = (session.user.email ?? '').toLowerCase().trim();
          const isMasterAdminEmail = userEmail === 'inememmanuel@gmail.com';

          const profile = await fetchOwnProfile(session.user.id);
          if (epoch !== authEpoch.current) return; // signed out while the profile was loading

          const storedUser = await getSessionUser();
          const fallbackRole = (storedUser?.actualRole || userRef.current?.actualRole || 'student') as UserRole;
          const role = isMasterAdminEmail ? 'admin' : ((profile?.role || fallbackRole) as UserRole);
          const adminRole = isMasterAdminEmail ? 'super_admin' : ((profile?.admin_role || storedUser?.adminRole) as AdminRoleType | null | undefined);
          const campusCode = isMasterAdminEmail ? 'GLOBAL' : (profile?.campus_code || storedUser?.campusCode || null);
          const isSuperAdmin = isMasterAdminEmail || (role === 'admin' && adminRole === 'super_admin');
          const isCampusAdmin = role === 'admin' && !isSuperAdmin;
          const isCampusAmbassador = role === 'student' && (profile?.is_campus_ambassador === true || (!profile && storedUser?.isCampusAmbassador === true));
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
            department: profile?.department || storedUser?.department || userRef.current?.department || null,
            avatarUrl: profile?.avatar_url || storedUser?.avatarUrl || userRef.current?.avatarUrl || undefined,
            coverUrl: profile?.banner_url || storedUser?.coverUrl || userRef.current?.coverUrl || undefined,
            isSuperAdmin,
            isCampusAdmin,
            isCampusAmbassador,
            workspaceMode:
              isCampusAmbassador && (userRef.current?.workspaceMode === 'ambassador' || storedUser?.workspaceMode === 'ambassador')
                ? 'ambassador'
                : 'default',
            onboardingComplete: isOnboarded,
            onboardingStep: isOnboarded
              ? undefined
              : profile?.onboarding_step || userRef.current?.onboardingStep || storedUser?.onboardingStep || firstOnboardingStep(role),
            // MFA verification belongs to this still-valid local session. A
            // full logout clears the stored projection, while a reload must
            // not force staff/admin through the challenge again.
            mfaVerified: sameAccount
              ? (userRef.current?.mfaVerified ?? storedUser?.mfaVerified ?? !roleRequiresMfa(activeRole))
              : !roleRequiresMfa(activeRole),
          };
          // A failed profile read must not overwrite a good cached projection with guesses.
          if (profile || !storedUser) await persist(nextUser);
          userRef.current = nextUser;
          setUser(nextUser);
          loadBlockedUserIds().catch(() => {});
        } else if (mounted && !timedOut) {
          // Supabase answered and there is no session (expired / revoked refresh token): don't leave the
          // optimistically restored cache pretending to be signed in.
          userRef.current = null;
          setUser(null);
          await clearTokens().catch(() => {});
          await setSessionUser(null as any).catch(() => {});
          // No session left also means no View As to resume.
          applyImpersonationState(DEFAULT_IMPERSONATION);
          await clearPersistedImpersonation();
          await clearImpersonationAdminBackup().catch(() => {});
        }
        // timedOut: keep whatever the cache restored; onAuthStateChange completes the picture.
      } catch {
        // OAuth check fallback
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initAuth();

    // 2b. E-mail links on a phone (confirm sign-up / reset password) carry the session in the URL fragment.
    //     supabase-js only reads it on the web, so do it here for iOS and Android.
    let linkSubscription: { remove: () => void } | null = null;
    if (Platform.OS !== 'web') {
      const onUrl = async (url: string | null) => {
        const result = await consumeAuthLink(url);
        if (!mounted || result.kind === 'none') return;
        if (result.kind === 'recovery') {
          setIsPasswordRecovery(true);
          router.replace('/(auth)/reset-password' as any);
        } else if (result.kind === 'error') {
          Alert.alert('Link problem', result.message);
        }
        // signed_in: the SIGNED_IN event below builds the account and the router sends them on.
      };
      Linking.getInitialURL().then(onUrl).catch(() => {});
      linkSubscription = Linking.addEventListener('url', (event) => {
        void onUrl(event.url);
      });
    }

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
        router.replace('/(auth)/reset-password' as any);
        return;
      }

      if (isSwappingSession.current) return;
      const epoch = authEpoch.current;
      // A sign-in we did not initiate through login() (e-mail code, recovery, another tab) is a new session.
      if (event === 'SIGNED_IN') isExplicitLogout.current = false;

      // Crucial: on screen unlock or background token refresh, DO NOT overwrite active role or profile!
      if (event === 'TOKEN_REFRESHED' && session) {
        return;
      }
      if (event === 'SIGNED_OUT') {
        // Guard against spurious SIGNED_OUT events fired by some mobile browsers
        // (Chrome/Safari on Android/iOS) when the user returns from an external
        // tab (e.g. a PDF opened via window.open). Re-confirm the session is
        // actually gone before clearing state and redirecting to login.
        if (!isExplicitLogout.current) {
          const { data: recheck } = await supabase.auth.getSession();
          if (recheck?.session) {
            // Session is still alive — this was a phantom SIGNED_OUT event.
            // Carry on without logging the user out.
            return;
          }
        }
        // Clear local state for the explicit-logout case too (logout() also does this
        // itself, so this is a no-op there) and for any other SIGNED_OUT we weren't
        // expecting - an invalidated/expired/revoked session (e.g. "Sign Out All Other
        // Active Sessions" from another device) must not leave the app looking signed in.
        // isSwappingSession is already checked above, so an impersonation begin/end swap
        // never reaches here.
        authEpoch.current += 1;
        userRef.current = null;
        setUser(null);
        // The identity must not outlive the session: the next cold start would flash the old student's
        // dashboard and the name/e-mail/avatar would stay on the device.
        await clearTokens().catch(() => {});
        await setSessionUser(null as any).catch(() => {});
        // A View As cannot outlive its session either.
        applyImpersonationState(DEFAULT_IMPERSONATION);
        await clearPersistedImpersonation();
        await clearImpersonationAdminBackup().catch(() => {});
        clearAccountSessionCaches();
        // A device/session that signs a second account in without a full
        // reload (notably on web) must never see the previous user's
        // just-created notifications merged back into their list.
        clearLocalNotificationsCache();
        clearSavedItemsMemoryCache();
        clearPortalVisitsMemoryCache();
        void cancelAllEventReminders();
        // An expired or revoked session used to leave the previous student's cached feed, saved items and
        // notifications in memory for the next sign-in on this tab/device.
        try {
          queryClient.clear();
        } catch {
          // Non-blocking
        }
        if (!isExplicitLogout.current) {
          router.replace('/(auth)/login');
        }
        return;
      }

      if (session?.user && mounted) {
        const userEmail = (session.user.email ?? '').toLowerCase().trim();
        const isMasterAdminEmail = userEmail === 'inememmanuel@gmail.com';

        // Own row via get_my_profile() with a bounded wait + retry (see fetchOwnProfile). A miss keeps the
        // cached projection instead of replacing it with defaults.
        const profile = await fetchOwnProfile(session.user.id, 5000);
        if (!mounted || epoch !== authEpoch.current) return;

        // The same suspension check login() makes: a suspended account must not be revived by the listener.
        if (profile?.is_suspended === true && !isMasterAdminEmail) {
          authEpoch.current += 1;
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          return;
        }

        const storedUser = await getSessionUser();
        if (epoch !== authEpoch.current) return;
        const fallbackRole = (userRef.current?.actualRole || storedUser?.actualRole || 'student') as UserRole;
        const role = isMasterAdminEmail ? 'admin' : ((profile?.role || fallbackRole) as UserRole);
        const adminRole = isMasterAdminEmail ? 'super_admin' : ((profile?.admin_role || storedUser?.adminRole) as AdminRoleType | null | undefined);
        const campusCode = isMasterAdminEmail ? 'GLOBAL' : (profile?.campus_code || storedUser?.campusCode || null);
        const isSuperAdmin = isMasterAdminEmail || (role === 'admin' && adminRole === 'super_admin');
        const isCampusAdmin = role === 'admin' && !isSuperAdmin;
        const isCampusAmbassador = role === 'student' && (profile?.is_campus_ambassador === true || (!profile && storedUser?.isCampusAmbassador === true));
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
          department: profile?.department || storedUser?.department || userRef.current?.department || null,
          avatarUrl: profile?.avatar_url || (sameAccount ? current?.avatarUrl : undefined) || storedUser?.avatarUrl || undefined,
          coverUrl: profile?.banner_url || (sameAccount ? current?.coverUrl : undefined) || storedUser?.coverUrl || undefined,
          isSuperAdmin,
          isCampusAdmin,
          isCampusAmbassador,
          workspaceMode:
            isCampusAmbassador && (current?.workspaceMode === 'ambassador' || storedUser?.workspaceMode === 'ambassador')
              ? 'ambassador'
              : 'default',
          onboardingComplete: isOnboarded,
          onboardingStep: isOnboarded ? undefined : ((sameAccount ? current?.onboardingStep : undefined) ?? profile?.onboarding_step ?? undefined),
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
          current.department === nextUser.department &&
          current.onboardingComplete === nextUser.onboardingComplete &&
          current.mfaVerified === nextUser.mfaVerified
          && current.isCampusAmbassador === nextUser.isCampusAmbassador
          && current.workspaceMode === nextUser.workspaceMode
        ) {
          return;
        }
        if (epoch !== authEpoch.current) return;
        if (current && current.id !== session.user.id) {
          // Another account signed in (other tab, or after a forced sign-out): nothing of the last one may show.
          try {
            queryClient.clear();
          } catch {
            // Non-blocking
          }
          clearAccountSessionCaches();
        }
        if (profile || !storedUser) await persist(nextUser);
        if (epoch !== authEpoch.current) return;
        userRef.current = nextUser;
        setUser(nextUser);
        loadBlockedUserIds().catch(() => {});
        loadMutedUserIds().catch(() => {});
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
      linkSubscription?.remove();
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

    // Last verification status seen on this channel. Used to refresh campus content the moment a reviewer
    // approves (or rejects) the member, instead of leaving empty cached feeds until the next app restart.
    let lastVerification: string | undefined;

    // Applies a change to the member's own profile row made elsewhere (a Super Admin changing their role or
    // admin tier, a campus transfer, a verification decision). Before this only `role` was followed, so a
    // Campus Admin promoted to Super Admin (or demoted) kept the old tier - and the old menu - until they
    // signed out and back in.
    const applyLiveProfileChange = (row: any) => {
      const current = userRef.current;
      // Ignore a stale event for an account that is no longer the live session.
      if (!current || current.id !== watchedUserId || !row) return;

      const isRoot = current.email?.toLowerCase().trim() === 'inememmanuel@gmail.com';
      const newRole = (row.role ?? current.actualRole) as UserRole;
      const newTier: AdminRoleType | null =
        newRole === 'admin' ? ((row.admin_role ?? current.adminRole ?? 'campus_admin') as AdminRoleType) : null;
      const isSuperAdmin = isRoot || (newRole === 'admin' && newTier === 'super_admin');
      const isCampusAdmin = newRole === 'admin' && !isSuperAdmin;
      const isCampusAmbassador = newRole === 'student' && row.is_campus_ambassador === true;
      const newCampus = isSuperAdmin ? 'GLOBAL' : ((row.campus_code ?? current.campusCode) as string | null);

      const roleChanged = newRole !== current.actualRole;
      const tierChanged = (isSuperAdmin ? 'super_admin' : isCampusAdmin ? 'campus_admin' : null) !== (current.adminRole ?? null);
      const campusChanged = (newCampus ?? null) !== (current.campusCode ?? null);
      const ambassadorChanged = isCampusAmbassador !== current.isCampusAmbassador;
      const verification = typeof row.verification_status === 'string' ? (row.verification_status as string) : undefined;
      // The first sighting only sets the baseline (see the initial checkNow below) - it is not a change.
      const verificationChanged = verification !== undefined && lastVerification !== undefined && verification !== lastVerification;
      lastVerification = verification ?? lastVerification;

      if (roleChanged || tierChanged || campusChanged || ambassadorChanged) {
        const nextUser: SessionUser = {
          ...current,
          actualRole: newRole,
          // A real, database-verified change always wins over a Super Admin's local "View As" preview.
          role: roleChanged ? newRole : current.role,
          adminRole: isSuperAdmin ? 'super_admin' : isCampusAdmin ? 'campus_admin' : null,
          isSuperAdmin,
          isCampusAdmin,
          isCampusAmbassador,
          workspaceMode: isCampusAmbassador ? current.workspaceMode : 'default',
          campusCode: newCampus,
          department: row.department ?? current.department,
          mfaVerified: roleChanged && newRole !== current.role ? !roleRequiresMfa(newRole) : current.mfaVerified,
        };
        persist(nextUser).catch(() => {});
        userRef.current = nextUser;
        setUser(nextUser);
        try {
          queryClient.removeQueries({
            predicate: (query) => {
              const root = String(query.queryKey[0] ?? '');
              return !['profile', 'view-scope', 'active-campus-code'].includes(root);
            },
          });
          queryClient.invalidateQueries({ queryKey: ['profile'] });
        } catch {
          // Non-blocking
        }
      } else if (verificationChanged) {
        try {
          // Campus feeds, resources and events are all gated on verification: refetch what is on screen.
          queryClient.invalidateQueries();
        } catch {
          // Non-blocking
        }
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
            applyLiveProfileChange(row);
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

    // Polling safety net. Realtime only delivers rows to roles holding TABLE-level SELECT on `profiles`;
    // since profile columns are privilege-controlled (email, student id ... are private), the channel can
    // stay silent and the suspension kick / live tier / verification refresh would never fire. A light
    // check once a minute and whenever the app returns to the foreground covers that, and also covers
    // networks that block websockets.
    let polling = false;
    const checkNow = async () => {
      if (polling) return;
      polling = true;
      try {
        const row = await getOwnProfileRow(watchedUserId);
        if (!row) return;
        if (row.is_suspended === true) {
          forceSignOutForRevokedAccess('suspended');
          return;
        }
        applyLiveProfileChange(row);
      } catch {
        // best effort
      } finally {
        polling = false;
      }
    };
    void checkNow(); // baseline for change detection
    const pollTimer = setInterval(checkNow, 60_000);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkNow();
    });

    return () => {
      clearInterval(pollTimer);
      appStateSub.remove();
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

        // `email` may be an @handle; the real address is the one on the session.
        const userEmail = (session.user.email || email || '').toLowerCase().trim();
        const isMasterAdminEmail = userEmail === 'inememmanuel@gmail.com';

        // Own row (private columns included) with a bounded wait + retry. If it still cannot be read the
        // role from authApi.login() is used, but a login must never invent "onboarding not complete".
        let prof: any = await fetchOwnProfile(session.user.id);
        // One more bounded attempt: persisting "onboarding not complete" because a read timed out would send a
        // finished student back through onboarding until the next app restart.
        if (!prof) prof = await fetchOwnProfile(session.user.id, 8000);

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

        const resolvedRole = (prof?.role || session.user.role) as UserRole;
        const cachedStored = await getSessionUser();
        const cachedForAccount = cachedStored?.id === session.user.id ? cachedStored : null;
        const isOnboarded = prof
          ? prof.onboarding_complete === true || resolvedRole === 'admin' || resolvedRole === 'staff' || isMasterAdminEmail
          : (cachedForAccount?.onboardingComplete ?? (resolvedRole === 'admin' || resolvedRole === 'staff' || isMasterAdminEmail));

        const userRole = isMasterAdminEmail ? 'admin' : resolvedRole;
        const adminRole = isMasterAdminEmail ? 'super_admin' : (prof?.admin_role as AdminRoleType | null | undefined);
        const campusCode = isMasterAdminEmail ? 'GLOBAL' : (prof?.campus_code || null);
        const isSuperAdmin = isMasterAdminEmail || (userRole === 'admin' && adminRole === 'super_admin');
        const isCampusAdmin = userRole === 'admin' && !isSuperAdmin;
        const isCampusAmbassador = userRole === 'student' && prof?.is_campus_ambassador === true;

        const nextUser: SessionUser = {
          ...session.user,
          role: userRole,
          actualRole: userRole,
          adminRole: isSuperAdmin ? 'super_admin' : isCampusAdmin ? 'campus_admin' : null,
          campusCode,
          department: prof?.department || cachedForAccount?.department || null,
          avatarUrl: prof?.avatar_url || undefined,
          coverUrl: prof?.banner_url || undefined,
          isSuperAdmin,
          isCampusAdmin,
          isCampusAmbassador,
          workspaceMode:
            isCampusAmbassador && cachedForAccount?.workspaceMode === 'ambassador' ? 'ambassador' : 'default',
          onboardingComplete: isOnboarded,
          onboardingStep: isOnboarded ? undefined : (prof?.onboarding_step || cachedForAccount?.onboardingStep || firstOnboardingStep(userRole)),
          mfaVerified: !roleRequiresMfa(userRole),
        };
        // Only remember what we actually read; a guess stays in memory and is corrected by the next poll.
        if (prof || cachedForAccount) await persist(nextUser);
        try {
          queryClient.clear();
        } catch {
          // Non-blocking
        }
        clearAccountSessionCaches();
        setIsPasswordRecovery(false);
        userRef.current = nextUser;
        setUser(nextUser);
        if (userRole === 'student') {
          resetToDefaultCampusScope();
        }
        loadBlockedUserIds().catch(() => {});
        loadMutedUserIds().catch(() => {});
        registerForPushNotificationsAsync().catch(() => {});
      },
      async register(payload) {
        isExplicitLogout.current = false;
        if (payload.campusCode) {
          persistCampus(payload.campusCode);
        }
        const session = await authApi.register(payload);
        const nextUser: SessionUser = {
          ...session.user,
          actualRole: session.user.role,
          adminRole: null,
          campusCode: payload.campusCode || null,
          department: (payload as any).department || null,
          isSuperAdmin: false,
          isCampusAdmin: false,
          isCampusAmbassador: false,
          workspaceMode: 'default',
          onboardingComplete: false,
          onboardingStep: firstOnboardingStep(session.user.role),
          mfaVerified: !roleRequiresMfa(session.user.role),
        };
        await persist(nextUser);
        userRef.current = nextUser;
        setUser(nextUser);
        if (session.user.role === 'student') {
          resetToDefaultCampusScope();
        }
        return nextUser;
      },
      async logout() {
        isExplicitLogout.current = true;
        authEpoch.current += 1;
        setIsPasswordRecovery(false);
        clearAccountSessionCaches();
        // The app-lock switch belongs to the person who set it up; the next account on this device starts unlocked.
        void removeStoredPref(BIOMETRICS_ENABLED_KEY);
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
        void cancelAllEventReminders();
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
        if (current.id) {
          supabase
            .from('profiles')
            .update({ onboarding_step: path })
            .eq('id', current.id)
            .then(({ error }) => {
              if (error) console.warn('[Auth] Failed to persist onboarding_step:', error.message);
            });
        }
      },
      async completeOnboarding() {
        const current = userRef.current;
        if (!current) return;

        // The SERVER decides. This used to flip the local flag first and then fire an UPDATE whose failure was
        // only logged: when it failed (a trigger refusal, a dropped connection) the app let the member in, and
        // the next sign-in - or a second device - found onboarding_complete = false and sent them through
        // onboarding again. Now nothing is marked complete until the database says it is.
        let result: Awaited<ReturnType<typeof completeOnboardingOnServer>>;
        try {
          result = await completeOnboardingOnServer();
        } catch (err: any) {
          if (err?.message === 'ACADEMIC_PROFILE_INCOMPLETE') throw err;
          // Database not migrated yet (no complete_my_onboarding function): legacy direct write, still checked.
          // Only PostgREST's "function not in the schema cache" signal counts: a runtime SQL error whose text
          // happens to say "does not exist" must NOT fall back to a direct write that skips the server check.
          if (!(err?.code === 'PGRST202' || /Could not find the function/i.test(String(err?.message ?? '')))) throw err;
          const payload: Record<string, any> = { onboarding_complete: true, onboarding_step: null };
          const { data: wrote, error } = await supabase.from('profiles').update(payload).eq('id', current.id).select('onboarding_complete');
          if (error || !wrote?.length || wrote[0]?.onboarding_complete !== true) {
            throw new Error('We could not finish setting up your account. Check your connection and try again.');
          }
          result = { onboardingComplete: true, campusCode: current.campusCode ?? null, department: current.department ?? null };
        }
        if (!result.onboardingComplete) {
          throw new Error('ACADEMIC_PROFILE_INCOMPLETE');
        }

        const next: SessionUser = {
          ...current,
          onboardingComplete: true,
          onboardingStep: undefined,
          campusCode: result.campusCode ?? current.campusCode,
          department: result.department ?? current.department,
        };
        await persist(next);
        userRef.current = next;
        setUser(next);
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
          workspaceMode: 'default',
        };
        await persist(nextUser);
        userRef.current = nextUser;
        setUser(nextUser);
        if (newRole === 'student') {
          resetToDefaultCampusScope(queryClient, true);
        }
        try {
          // Role previews share the real admin identity and profile. Keep the
          // profile and workspace selections mounted so the admin's avatar /
          // cover and selected campus do not disappear between portals, but
          // discard role-dependent content before the destination renders.
          queryClient.removeQueries({
            predicate: (query) => {
              const root = String(query.queryKey[0] ?? '');
              return !['profile', 'view-scope', 'active-campus-code'].includes(root);
            },
          });
        } catch {
          // Non-blocking
        }
      },
      async enterAmbassadorWorkspace() {
        const current = userRef.current;
        if (!current?.id || current.actualRole !== 'student') {
          throw new Error('The Ambassador Console is only available to appointed students.');
        }
        const profile = await getOwnProfileRow(current.id);
        if (profile?.is_campus_ambassador !== true) {
          const corrected: SessionUser = { ...current, isCampusAmbassador: false, workspaceMode: 'default' };
          await persist(corrected);
          userRef.current = corrected;
          setUser(corrected);
          throw new Error('Your Campus Ambassador appointment is not active. Ask your Campus Admin to review it.');
        }
        const next: SessionUser = { ...current, isCampusAmbassador: true, workspaceMode: 'ambassador' };
        await persist(next);
        userRef.current = next;
        setUser(next);
      },
      async exitAmbassadorWorkspace() {
        const current = userRef.current;
        if (!current) return;
        const next: SessionUser = { ...current, workspaceMode: 'default' };
        await persist(next);
        userRef.current = next;
        setUser(next);
      },
      impersonation,
      async beginImpersonation(targetUserId: string, reason: string) {
        if (endingImpersonation.current) throw new Error('Please wait a moment and try again.');
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
        await endImpersonationGuarded();
      },
      isPasswordRecovery,
      clearPasswordRecovery() {
        setIsPasswordRecovery(false);
      },
      async updateUser(patch: Partial<SessionUser>) {
        const current = userRef.current;
        if (!current) return;
        const next: SessionUser = { ...current, ...patch };
        await persist(next);
        userRef.current = next;
        setUser(next);
      },
      async refreshUser(): Promise<SessionUser | null> {
        const current = userRef.current;
        if (!current?.id) return null;
        try {
          // get_my_profile() (own row); a direct select of onboarding_step is no longer granted.
          const profile = await fetchOwnProfile(current.id);
          if (profile) {
            const isMaster = (current.email ?? '').toLowerCase().trim() === 'inememmanuel@gmail.com';
            const resolvedRole = isMaster ? 'admin' : ((profile.role || current.actualRole) as UserRole);
            const isSuper = isMaster || (resolvedRole === 'admin' && profile.admin_role === 'super_admin');
            const isCampus = resolvedRole === 'admin' && !isSuper;
            const isAmbassador = resolvedRole === 'student' && profile.is_campus_ambassador === true;
            const next: SessionUser = {
              ...current,
              fullName: profile.full_name || current.fullName,
              actualRole: resolvedRole,
              role: current.actualRole === 'admin' && current.isSuperAdmin ? current.role : resolvedRole,
              adminRole: isSuper ? 'super_admin' : isCampus ? 'campus_admin' : null,
              isSuperAdmin: isSuper,
              isCampusAdmin: isCampus,
              isCampusAmbassador: isAmbassador,
              workspaceMode: isAmbassador ? current.workspaceMode : 'default',
              campusCode: (isSuper && profile.campus_code === 'GLOBAL') ? 'GLOBAL' : (profile.campus_code || current.campusCode),
              department: profile.department || current.department,
              avatarUrl: profile.avatar_url || current.avatarUrl,
              coverUrl: profile.banner_url || current.coverUrl,
              onboardingComplete: isMaster || resolvedRole === 'admin' || resolvedRole === 'staff' || profile.onboarding_complete === true || current.onboardingComplete,
            };
            await persist(next);
            userRef.current = next;
            setUser(next);
            return next;
          }
        } catch {
          // Non-blocking
        }
        return current;
      },
    }),
    [user, isLoading, impersonation, isPasswordRecovery],
  );

  // ---------------------------------------------------------------------------
  // View As (impersonation) session swaps.
  //
  // The live state is persisted (see persistImpersonation) so a reload keeps the banner and the 15-minute
  // limit; every swap, in either direction, starts the new identity from a clean slate exactly like login().
  // ---------------------------------------------------------------------------
  /** Everything account-bound that must not leak from the identity being left to the one being entered. */
  function resetAccountScopeForSwap() {
    try {
      queryClient.clear();
    } catch {
      // Non-blocking
    }
    clearAccountSessionCaches();
    clearLocalNotificationsCache();
    clearSavedItemsMemoryCache();
    clearPortalVisitsMemoryCache();
    resetToDefaultCampusScope();
  }

  function reloadBlockLists() {
    loadBlockedUserIds().catch(() => {});
    loadMutedUserIds().catch(() => {});
  }

  // Brackets the whole swap so the auth listener ignores the SIGNED_IN / SIGNED_OUT events it emits.
  async function endImpersonationGuarded(opts?: EndImpersonationOptions) {
    if (endingImpersonation.current) return;
    endingImpersonation.current = true;
    isSwappingSession.current = true;
    try {
      await runEndImpersonation(opts);
    } finally {
      endingImpersonation.current = false;
      setTimeout(() => {
        isSwappingSession.current = false;
      }, 800);
    }
  }
  endImpersonationRef.current = endImpersonationGuarded;

  async function runBeginImpersonation(targetUserId: string, reason: string) {
        // Gated on actualRole, same rationale as switchRole above - never
        // trust the currently-*displayed* role for a privileged action.
        if (!user || user.actualRole !== 'admin' || !user.isSuperAdmin) {
          throw new Error('Impersonation is only available to Super Administrators.');
        }
        if (impersonationRef.current.active) {
          throw new Error('You are already viewing as another user. Return to admin first.');
        }
        const adminId = user.id;

        const { data: { session: adminSession } } = await supabase.auth.getSession();
        if (!adminSession?.access_token || !adminSession?.refresh_token) {
          throw new Error('No active admin session found. Please sign in again.');
        }

        // Back up the admin's own session BEFORE anything below can swap it
        // out, so endImpersonation (or the fail-safe paths further down) can
        // always get back to a real admin session.
        await setImpersonationAdminBackup(adminSession.access_token, adminSession.refresh_token);
        // Persist the intent before the swap (startImpersonation's verifyOtp replaces the live session), with a
        // provisional 15-minute expiry, so even a crash mid-swap leaves a record the next start can clean up.
        try {
          await persistImpersonation({
            targetId: targetUserId,
            adminId,
            expiresAt: clampImpersonationExpiry(null),
            targetName: null,
          });
        } catch {
          await clearImpersonationAdminBackup().catch(() => {});
          throw new Error('Could not start View As on this device. Please try again.');
        }

        const abortBegin = async () => {
          await clearImpersonationAdminBackup().catch(() => {});
          await clearPersistedImpersonation().catch(() => {});
        };

        let result: Awaited<ReturnType<typeof authApi.startImpersonation>>;
        try {
          result = await authApi.startImpersonation(targetUserId, reason);
        } catch (err) {
          await abortBegin();
          throw err;
        }

        const { targetSession, targetName, expiresAt } = result;
        if (!targetSession?.access_token || !targetSession?.refresh_token) {
          await abortBegin();
          throw new Error('Impersonation session could not be established.');
        }

        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: targetSession.access_token,
          refresh_token: targetSession.refresh_token,
        });
        if (setSessionError) {
          await abortBegin();
          throw new Error(setSessionError.message || 'Could not switch to the target user session.');
        }

        // Re-run the same profile-fetch logic that normally runs on auth state change, so `user`/`role` in
        // context reflect the impersonated user (never the admin's previously-previewed role). The row is
        // read through get_my_profile(), which now returns the TARGET's row.
        let nextUser: SessionUser;
        try {
          nextUser = await fetchSessionUserForSession(targetSession);
        } catch {
          // The swap already happened: go back to the admin rather than sit in a half-loaded identity.
          endingImpersonation.current = true;
          try {
            await runEndImpersonation({ reason: 'begin_failed', targetId: targetUserId, adminId });
          } finally {
            endingImpersonation.current = false;
          }
          throw new Error('Could not load that account. You are back in your own session.');
        }

        const expiresIso = clampImpersonationExpiry(expiresAt);
        const resolvedName = targetName || nextUser.fullName;
        await persistImpersonation({ targetId: targetUserId, adminId, expiresAt: expiresIso, targetName: resolvedName });

        resetAccountScopeForSwap();
        await persist(nextUser);
        userRef.current = nextUser;
        setUser(nextUser);
        applyImpersonationState({
          active: true,
          targetUserId,
          targetName: resolvedName,
          expiresAt: expiresIso,
          adminId,
        });
        reloadBlockLists();

        router.replace(dashboardPathForRole(nextUser.role) as any);
  }

  async function runEndImpersonation(opts?: EndImpersonationOptions) {
        const reason = opts?.reason ?? 'manual';
        const endedTargetId = opts?.targetId ?? impersonationRef.current.targetUserId;
        const expectedAdminId = opts?.adminId ?? impersonationRef.current.adminId ?? null;
        const backup = await getImpersonationAdminBackup();

        // Fail-safe: never leave the app authenticated as the impersonated user. Signs out THIS DEVICE only
        // ('local'): a global sign-out would revoke every real session the impersonated person has.
        const failSafeSignOut = async () => {
          await clearImpersonationAdminBackup().catch(() => {});
          await clearPersistedImpersonation().catch(() => {});
          await clearTokens().catch(() => {});
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          authEpoch.current += 1;
          userRef.current = null;
          setUser(null);
          applyImpersonationState(DEFAULT_IMPERSONATION);
          resetAccountScopeForSwap();
          try {
            router.replace('/(auth)/login');
          } catch {
            // Router not ready yet (start-up): the route guard sends a signed-out user to login.
          }
        };

        if (!backup?.accessToken || !backup?.refreshToken) {
          // Backup missing or corrupt (e.g. the tab that started this was closed).
          await failSafeSignOut();
          return;
        }

        try {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: backup.accessToken,
            refresh_token: backup.refreshToken,
          });
          if (setSessionError) throw setSessionError;

          const { data: { session: adminSession } } = await supabase.auth.getSession();
          if (!adminSession) throw new Error('Could not restore admin session.');
          if (expectedAdminId && adminSession.user.id !== expectedAdminId) {
            throw new Error('The backed-up session does not belong to the admin who started this.');
          }

          const restoredUser = await fetchSessionUserForSession(adminSession);

          await clearImpersonationAdminBackup();
          await clearPersistedImpersonation();
          resetAccountScopeForSwap();
          // Persist first: recordAuditLogEntry below reads the actor from the stored session user.
          await persist(restoredUser);
          userRef.current = restoredUser;
          setUser(restoredUser);
          applyImpersonationState(DEFAULT_IMPERSONATION);
          reloadBlockLists();

          // The live session is now restored to the real admin, so ask the
          // edge function to write the authoritative `impersonation_ended`
          // audit entry. Best effort and non-blocking - an audit hiccup must
          // never trap the admin mid-restore.
          if (endedTargetId) {
            void authApi.endImpersonationAudit(endedTargetId);
            if (reason !== 'manual') {
              // An automatic end (time limit, reload after expiry, aborted start) is recorded explicitly too.
              void recordAuditLogEntry({
                action: 'impersonation_ended',
                summary: `View As session ended automatically (${reason.replace(/_/g, ' ')}) for user ${endedTargetId}`,
                targetType: 'user',
                targetId: endedTargetId,
                reason,
              }).catch(() => {});
            }
          }

          try {
            router.replace(dashboardPathForRole(restoredUser.role) as any);
          } catch {
            // Router not ready yet (start-up): the role gate routes from the restored user.
          }
        } catch {
          await failSafeSignOut();
        }
  }

  // Auto-expiry: while impersonating, end the session automatically once expiresAt is reached, so a forgotten
  // "View As" session can't run indefinitely. Timers are suspended while the app is backgrounded, so the
  // limit is also re-checked whenever it returns to the foreground.
  useEffect(() => {
    if (!impersonation.active || !impersonation.expiresAt) return undefined;
    const expiresAtMs = new Date(impersonation.expiresAt).getTime();
    const endNow = () => {
      endImpersonationRef.current?.({ reason: 'expired' }).catch(() => {});
    };
    if (expiresAtMs - Date.now() <= 0) {
      endNow();
      return undefined;
    }
    const timer = setTimeout(endNow, expiresAtMs - Date.now());
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() >= expiresAtMs) endNow();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [impersonation.active, impersonation.expiresAt]);

 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
 const ctx = useContext(AuthContext);
 if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
 return ctx;
}
