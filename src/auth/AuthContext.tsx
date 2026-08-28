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

import { supabase } from '@/api/supabase';
import { queryClient } from '@/api/queryClient';
import { loadBlockedUserIds } from '@/api/connections';

interface SessionUser {
 id: string;
 fullName: string;
 email?: string;
 role: UserRole;
 onboardingComplete: boolean;
 onboardingStep?: string;
 /** See src/auth/mfaPolicy.ts - only meaningful when the role requires MFA. */
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

 useEffect(() => {
 let mounted = true;

 async function initAuth() {
 // 1. Check local session tokens
 const token = await getAccessToken();
 if (token) {
 const stored = await getSessionUser();
 if (mounted && stored) {
 const isOnboarding = stored.onboardingComplete === false && Boolean(stored.onboardingStep);
 setUser({
 ...stored,
 onboardingComplete: !isOnboarding,
 mfaVerified: stored.mfaVerified ?? !roleRequiresMfa(stored.role as UserRole),
 } as SessionUser);
 loadBlockedUserIds().catch(() => {});
 }
 }

      // 2. Check active Supabase OAuth session
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && mounted) {
          const userEmail = session.user.email ?? '';
          const cleanEmail = userEmail.toLowerCase().trim();
          const demoMatch = authApi.DEMO_ACCOUNTS[cleanEmail];

          // Securely query verified database profile for role
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          const role = (demoMatch?.role || profile?.role || session.user.user_metadata?.role || 'student') as UserRole;
          const fullName = demoMatch?.fullName || profile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || userEmail.split('@')[0] || 'Campus Member';
          
          const storedUser = await getSessionUser();
          const isOnboarded =
            storedUser?.onboardingComplete ??
            (Boolean(profile?.department) || role === 'admin' || role === 'staff');

          const nextUser: SessionUser = {
            id: session.user.id,
            fullName,
            email: userEmail,
            role,
            onboardingComplete: isOnboarded,
            mfaVerified: !roleRequiresMfa(role),
          };
          await persist(nextUser);
          await setTokens(session.access_token, session.refresh_token ?? session.access_token);
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

    // 3. Supabase Auth State Change Listener for Google OAuth callbacks
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && mounted) {
        const userEmail = session.user.email ?? '';
        const cleanEmail = userEmail.toLowerCase().trim();
        const demoMatch = authApi.DEMO_ACCOUNTS[cleanEmail];

        // Securely query database profile for role
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        const role = (demoMatch?.role || profile?.role || session.user.user_metadata?.role || 'student') as UserRole;
        const fullName = demoMatch?.fullName || profile?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || userEmail.split('@')[0] || 'Campus Member';
        
        const storedUser = await getSessionUser();
        const isOnboarded =
          storedUser?.onboardingComplete ??
          (Boolean(profile?.department) || role === 'admin' || role === 'staff');

        const nextUser: SessionUser = {
          id: session.user.id,
          fullName,
          email: userEmail,
          role,
          onboardingComplete: isOnboarded,
          mfaVerified: !roleRequiresMfa(role),
        };
        await persist(nextUser);
        await setTokens(session.access_token, session.refresh_token ?? session.access_token);
        setUser(nextUser);
        loadBlockedUserIds().catch(() => {});
      }
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
      async login(email, password) {
        const session = await authApi.login({ email, password });
        await setTokens(session.accessToken, session.refreshToken);

        const { data: prof } = await supabase
          .from('profiles')
          .select('department, is_suspended')
          .eq('id', session.user.id)
          .maybeSingle();

        if (prof?.is_suspended) {
          await clearTokens();
          await setSessionUser(null as any);
          await supabase.auth.signOut();
          setUser(null);
          throw new Error('Your campus account has been suspended by administration. Access to this workspace has been revoked.');
        }

        const isOnboarded = Boolean(prof?.department) || session.user.role === 'admin' || session.user.role === 'staff';

        const nextUser: SessionUser = {
          ...session.user,
          onboardingComplete: isOnboarded,
          onboardingStep: isOnboarded ? undefined : firstOnboardingStep(session.user.role),
          mfaVerified: !roleRequiresMfa(session.user.role),
        };
        await persist(nextUser);
        setUser(nextUser);
        loadBlockedUserIds().catch(() => {});
        registerForPushNotificationsAsync().catch(() => {});
      },
      async register(payload) {
        const session = await authApi.register(payload);
        await setTokens(session.accessToken, session.refreshToken);
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
        const demo = Object.values(authApi.DEMO_ACCOUNTS).find((d) => d.role === newRole);
        const demoEmail = Object.keys(authApi.DEMO_ACCOUNTS).find((e) => authApi.DEMO_ACCOUNTS[e].role === newRole) ?? `${newRole}@ui.edu.ng`;
        const fullName = demo?.fullName ?? (newRole === 'student' ? 'Diana Prince' : newRole === 'alumni' ? 'Adeola Adeleke' : newRole === 'staff' ? 'Dr. Adeyemi Alabi' : 'Super Admin UI');

        const nextUser: SessionUser = {
          id: `user-${newRole}`,
          fullName,
          email: demoEmail,
          role: newRole,
          onboardingComplete: true,
          mfaVerified: true,
        };
        await persist(nextUser);
        setUser(nextUser);
        try {
          queryClient.clear();
        } catch {
          // Non-blocking
        }
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
