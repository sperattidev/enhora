import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onSessionExpired, refreshSession, setAccessToken } from './api';
import type { Account } from './types';

type AuthState = { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; account: Account };

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<Account>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const loadAccount = useCallback(async () => {
    const account = await api<Account>('/auth/me');
    setState({ status: 'authenticated', account });
    return account;
  }, []);

  // On first load, the refresh cookie (if any) silently restores the session.
  useEffect(() => {
    void (async () => {
      if (await refreshSession()) {
        await loadAccount().catch(() => setState({ status: 'anonymous' }));
      } else {
        setState({ status: 'anonymous' });
      }
    })();
    return onSessionExpired(() => {
      setAccessToken(null);
      setState({ status: 'anonymous' });
    });
  }, [loadAccount]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      setAccessToken(res.accessToken);
      return loadAccount();
    },
    [loadAccount],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', auth: false }).catch(() => undefined);
    setAccessToken(null);
    setState({ status: 'anonymous' });
  }, []);

  const reload = useCallback(async () => {
    await loadAccount();
  }, [loadAccount]);

  const value = useMemo(() => ({ state, login, logout, reload }), [state, login, logout, reload]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The logged-in account; only valid under a route guarded by <RequireMerchant>. */
export function useAccount() {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('useAccount needs an authenticated session');
  return state.account;
}
