import React, { createContext, useContext, useEffect, useMemo, useState } from'react';
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

interface SessionUser {
  id: string;
  fullName: string;
  email?: string;
  role: UserRole;
  onboardingComplete: boolean;
  onboardingStep?: string;
  /** See src/auth/mfaPolicy.ts — only meaningful when the role requires MFA. */
  mfaVerified: boolean;
}

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: authApi.RegisterPayload) => Promise<SessionUser>;
  logout: () => Promise<void>;
  /** Called by each onboarding screen after it completes, so a reload resumes at the right step. */
  setOnboardingStep: (path: string) => Promise<void>;
  /** Called by the final onboarding screen once the whole chain is done. */
  completeOnboarding: () => Promise<void>;
  /** Called by the MFA challenge screen once the code checks out. No-op if the current role doesn't require MFA. */
  verifyMfa: (code: string) => Promise<void>;
  /** Allows admins and testers to switch role view in settings. */
  switchRole: (role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function persist(user: SessionUser) {
  const stored: StoredSessionUser = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    onboardingComplete: user.onboardingComplete,
    onboardingStep: user.onboardingStep,
    mfaVerified: user.mfaVerified,
  };
  await setSessionUser(stored);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On cold start, restore both the token and the locally-cached user
  // shape (id/fullName/role/onboarding progress) so a reload neither
  // drops you back to login nor skips ahead of an unfinished onboarding
  // chain. Once a real backend exists, prefer decoding the JWT or
  // calling a /me endpoint instead of trusting this local copy.
  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (token) {
        const stored = await getSessionUser();
        // stored.mfaVerified may be undefined for sessions cached before
        // this field existed — default to false rather than trusting an
        // absence, so those sessions re-challenge instead of silently
        // skipping MFA.
        setUser(stored ? ({ ...stored, mfaVerified: stored.mfaVerified ?? false } as SessionUser) : null);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      async login(email, password) {
        const session = await authApi.login({ email, password });
        await setTokens(session.accessToken, session.refreshToken);
        // Login is for returning users — treat them as already onboarded.
        // Staff/admin still owe an MFA challenge every sign-in (PRD
        // Section 11) before the resolver/RoleGate will let them past
        // the (auth) group — see mfaPolicy.ts.
        const nextUser: SessionUser = {
          ...session.user,
          onboardingComplete: true,
          mfaVerified: !roleRequiresMfa(session.user.role),
        };
        await persist(nextUser);
        setUser(nextUser);
        // Built (permission request, Android channels, token
        // registration) but never actually called from anywhere before
        // this — its own comment said"call this after login rather
        // than on cold start."Fire-and-forget: idempotent if
        // permission was already granted/denied, and must never block
        // the sign-in flow itself.
        registerForPushNotificationsAsync().catch(() => {});
      },
      async register(payload) {
        const session = await authApi.register(payload);
        await setTokens(session.accessToken, session.refreshToken);
        // Registration is for new users — they still owe us the
        // onboarding chain from PRD Section 5 before reaching a dashboard.
        // Self-registration only ever produces student/alumni accounts
        // (staff/admin are invite-provisioned, see onboardingSteps.ts),
        // but this is computed rather than hardcoded true in case that
        // ever changes.
        const nextUser: SessionUser = {
          ...session.user,
          onboardingComplete: false,
          onboardingStep: firstOnboardingStep(session.user.role),
          mfaVerified: !roleRequiresMfa(session.user.role),
        };
        await persist(nextUser);
        setUser(nextUser);
        return nextUser;
      },
      async logout() {
        await authApi.logout();
        await clearTokens();
        setUser(null);
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
        setUser((prev) => {
          if (!prev) return prev;
          const next = { ...prev, onboardingComplete: true, onboardingStep: undefined };
          persist(next);
          return next;
        });
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
        setUser((prev) => {
          if (!prev) return prev;
          const next: SessionUser = {
            ...prev,
            role: newRole,
            onboardingComplete: true,
            mfaVerified: true,
          };
          persist(next);
          return next;
        });
      },
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
