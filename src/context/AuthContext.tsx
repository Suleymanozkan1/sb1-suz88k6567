import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { KEYS, read, remove, write } from '../lib/storage';
import {
  DEMO_CREDENTIALS,
  findUserByEmail,
  getBusinesses,
  getUser,
  logSms,
  makeReferralCode,
  seedIfEmpty,
  uid,
  upsertBusiness,
  upsertUser,
} from '../lib/db';
import { addDays, todayIso } from '../lib/format';
import { OWNER_PERMISSIONS, REFERRAL_BONUS_DAYS, TRIAL_DAYS } from '../data/constants';
import type { Permission, User } from '../types';

export interface RegisterInput {
  companyName: string;
  fullName: string;
  mobile: string;
  capacity: number;
  facebook?: string;
  instagram?: string;
  referredBy?: string;
  email: string;
  password: string;
  currency: User['currency'];
  category: string;
  city: string;
  district: string;
  heardFrom?: string;
  address?: string;
  phone?: string;
}

interface PendingLogin {
  userId: string;
  code: string;
}

interface AuthValue {
  user: User | null;
  loading: boolean;
  pendingLogin: PendingLogin | null;
  login: (email: string, password: string) => { ok: boolean; error?: string; needsSms?: boolean };
  verifySms: (code: string) => { ok: boolean; error?: string };
  cancelPendingLogin: () => void;
  register: (input: RegisterInput) => { ok: boolean; error?: string };
  logout: () => void;
  refresh: () => void;
  updateUser: (patch: Partial<User>) => void;
  setActiveBusiness: (businessId: string) => void;
  can: (permission: Permission) => boolean;
  daysRemaining: number;
  isExpired: boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Demo ortamında SMS gönderilemediği için kod ekranda gösterilir. */
function generateSmsCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingLogin, setPendingLogin] = useState<PendingLogin | null>(null);

  useEffect(() => {
    seedIfEmpty();
    const sessionId = read<string | null>(KEYS.session, null);
    if (sessionId) {
      const found = getUser(sessionId);
      setUser(found ?? null);
      if (!found) remove(KEYS.session);
    }
    setLoading(false);
  }, []);

  const refresh = useCallback(() => {
    const sessionId = read<string | null>(KEYS.session, null);
    setUser(sessionId ? getUser(sessionId) ?? null : null);
  }, []);

  const login = useCallback<AuthValue['login']>((email, password) => {
    const found = findUserByEmail(email);
    if (!found) return { ok: false, error: 'Bu e-posta adresi ile kayıtlı üyelik bulunamadı.' };
    if (found.password !== password) return { ok: false, error: 'Şifreniz hatalı. Lütfen tekrar deneyiniz.' };

    // Haberlerde duyurulan zorunlu SMS doğrulaması
    const code = generateSmsCode();
    logSms({
      businessId: found.activeBusinessId,
      to: found.mobile,
      body: `duguntakip.com giris dogrulama kodunuz: ${code}`,
      kind: 'Doğrulama',
    });
    setPendingLogin({ userId: found.id, code });
    return { ok: true, needsSms: true };
  }, []);

  const verifySms = useCallback<AuthValue['verifySms']>(
    (code) => {
      if (!pendingLogin) return { ok: false, error: 'Doğrulama oturumu bulunamadı, tekrar giriş yapınız.' };
      if (code.trim() !== pendingLogin.code) return { ok: false, error: 'Doğrulama kodu hatalı.' };
      write(KEYS.session, pendingLogin.userId);
      setUser(getUser(pendingLogin.userId) ?? null);
      setPendingLogin(null);
      return { ok: true };
    },
    [pendingLogin],
  );

  const cancelPendingLogin = useCallback(() => setPendingLogin(null), []);

  const register = useCallback<AuthValue['register']>((input) => {
    if (findUserByEmail(input.email)) {
      return { ok: false, error: 'Bu e-posta adresi ile daha önce üyelik oluşturulmuş.' };
    }
    const now = new Date().toISOString();
    const userId = uid('user');
    const businessId = uid('biz');

    const newUser: User = {
      id: userId,
      companyName: input.companyName,
      fullName: input.fullName,
      email: input.email.trim(),
      password: input.password,
      mobile: input.mobile,
      role: 'owner',
      permissions: OWNER_PERMISSIONS,
      city: input.city,
      district: input.district,
      category: input.category,
      capacity: input.capacity,
      currency: input.currency,
      facebook: input.facebook,
      instagram: input.instagram,
      referredBy: input.referredBy,
      referralCode: makeReferralCode(input.companyName),
      heardFrom: input.heardFrom,
      trialEndsAt: addDays(todayIso(), TRIAL_DAYS),
      subscriptionEndsAt: addDays(todayIso(), TRIAL_DAYS),
      createdAt: now,
      activeBusinessId: businessId,
    };
    upsertUser(newUser);

    upsertBusiness({
      id: businessId,
      ownerId: userId,
      name: input.companyName,
      category: input.category,
      city: input.city,
      district: input.district,
      phone: input.phone || input.mobile,
      capacity: input.capacity,
      currency: input.currency,
      address: input.address,
      facebook: input.facebook,
      instagram: input.instagram,
      createdAt: now,
    });

    // Tavsiye Et Kazan: tavsiye eden üyenin süresi +1 ay uzar
    if (input.referredBy) {
      const referrer = findUserByEmail(input.referredBy) ??
        (function byCode() {
          const code = input.referredBy!.trim().toUpperCase();
          return (read<User[]>(KEYS.users, [])).find((u) => u.referralCode === code);
        })();
      if (referrer && referrer.id !== userId) {
        upsertUser({
          ...referrer,
          subscriptionEndsAt: addDays(referrer.subscriptionEndsAt, REFERRAL_BONUS_DAYS),
        });
      }
    }

    logSms({
      businessId,
      to: input.mobile,
      body: `duguntakip.com uyeliginiz olusturuldu. ${TRIAL_DAYS} gun ucretsiz kullanabilirsiniz.`,
      kind: 'Bilgilendirme',
    });

    write(KEYS.session, userId);
    setUser(newUser);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    remove(KEYS.session);
    setUser(null);
    setPendingLogin(null);
  }, []);

  const updateUser = useCallback<AuthValue['updateUser']>(
    (patch) => {
      setUser((current) => {
        if (!current) return current;
        const next = { ...current, ...patch };
        upsertUser(next);
        return next;
      });
    },
    [],
  );

  const setActiveBusiness = useCallback(
    (businessId: string) => {
      const owned = getBusinesses(user?.role === 'staff' ? user.ownerId : user?.id);
      if (!owned.some((b) => b.id === businessId)) return;
      updateUser({ activeBusinessId: businessId });
    },
    [updateUser, user],
  );

  const can = useCallback<AuthValue['can']>(
    (permission) => (user ? user.permissions.includes(permission) : false),
    [user],
  );

  const daysRemaining = useMemo(() => {
    if (!user) return 0;
    const end = user.subscriptionEndsAt;
    const today = todayIso();
    const diff = Math.round((new Date(end).getTime() - new Date(today).getTime()) / 86400000);
    return diff;
  }, [user]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      pendingLogin,
      login,
      verifySms,
      cancelPendingLogin,
      register,
      logout,
      refresh,
      updateUser,
      setActiveBusiness,
      can,
      daysRemaining,
      isExpired: Boolean(user) && daysRemaining < 0,
    }),
    [user, loading, pendingLogin, login, verifySms, cancelPendingLogin, register, logout, refresh, updateUser, setActiveBusiness, can, daysRemaining],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth yalnızca AuthProvider içinde kullanılabilir.');
  return ctx;
}

export { DEMO_CREDENTIALS };
