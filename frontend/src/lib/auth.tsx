import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { get, onUnauthorized, post, setToken, getToken } from './api';
import type { Role, User } from './types';

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await get<User>('/me'));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // A 401 from anywhere in the app drops us back to the login screen.
    onUnauthorized.handler = () => setUser(null);
    void refresh();
    return () => { onUnauthorized.handler = null; };
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await post<{ token: string; user: User }>('/auth/login', { email, password });
    setToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export const STAFF_ROLES: Role[] = ['resolver', 'approver', 'admin'];

export function isStaff(user: User | null): boolean {
  return !!user && STAFF_ROLES.includes(user.role);
}

/** Gate for any authenticated route. Also forces a first-login password change
 *  before the rest of the application becomes reachable. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}

/** Gate for role-restricted routes. Renders a permission-denied state rather
 *  than redirecting, so the user understands what happened. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/denied" replace />;
  return <>{children}</>;
}

function FullPageLoader() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div className="stack" style={{ alignItems: 'center', gap: '1rem' }}>
        <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 12 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>טוען…</span>
      </div>
    </div>
  );
}
