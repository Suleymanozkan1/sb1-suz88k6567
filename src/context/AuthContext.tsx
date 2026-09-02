import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { isDemoMode, repo, RepoError } from '../lib/repo';
import { SIGNUP_ENABLED } from '../lib/authHelpers';
import type { SignUpInput } from '../lib/repo';
import type { Permission, User } from '../types';

interface AuthValue {
  user: User | null;
  loading: boolean;
  isDemoMode: boolean;
  signupEnabled: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<User>) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  setActiveBusiness: (businessId: string) => Promise<void>;
  can: (permission: Permission) => boolean;
  /** Verilerin sahibi olan yönetici kimliği (personel ise bağlı olduğu hesap) */
  ownerId: string;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    repo.getSession()
      .then((session) => { if (!cancelled) setUser(session); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback<AuthValue['signIn']>(async (email, password) => {
    const account = await repo.signIn(email, password);
    setUser(account);
    return account;
  }, []);

  const signUp = useCallback<AuthValue['signUp']>(async (input) => {
    if (!SIGNUP_ENABLED) {
      throw new RepoError('Yeni üyelik kaydı kapalıdır.');
    }
    setUser(await repo.signUp(input));
  }, []);

  const signOut = useCallback(async () => {
    await repo.signOut();
    setUser(null);
  }, []);

  const updateProfile = useCallback<AuthValue['updateProfile']>(async (patch) => {
    setUser(await repo.updateProfile(patch));
  }, []);

  const changePassword = useCallback<AuthValue['changePassword']>(async (current, next) => {
    await repo.changePassword(current, next);
  }, []);

  const requestPasswordReset = useCallback<AuthValue['requestPasswordReset']>(async (email) => {
    await repo.requestPasswordReset(email);
  }, []);

  const setActiveBusiness = useCallback<AuthValue['setActiveBusiness']>(async (businessId) => {
    setUser(await repo.updateProfile({ activeBusinessId: businessId }));
  }, []);

  const can = useCallback<AuthValue['can']>(
    (permission) => (user ? user.permissions.includes(permission) : false),
    [user],
  );

  const ownerId = user ? (user.role === 'staff' ? user.ownerId ?? user.id : user.id) : '';

  const value = useMemo<AuthValue>(() => ({
    user, loading, isDemoMode, signupEnabled: SIGNUP_ENABLED,
    signIn, signUp, signOut, updateProfile, changePassword, requestPasswordReset,
    setActiveBusiness, can, ownerId,
  }), [user, loading, signIn, signUp, signOut, updateProfile, changePassword,
       requestPasswordReset, setActiveBusiness, can, ownerId]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth yalnızca AuthProvider içinde kullanılabilir.');
  return ctx;
}
