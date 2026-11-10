import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { LoginResponse, UserDto } from './api';
import { api, hasToken, setToken, setUnauthorizedHandler } from './client';

interface AuthValue {
  user: UserDto | null;
  ready: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [ready, setReady] = useState(!hasToken());

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    if (hasToken()) {
      api.get<UserDto>('/api/auth/me')
        .then(setUser)
        .catch(() => setToken(null))
        .finally(() => setReady(true));
    }
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const session = await api.post<LoginResponse>('/api/auth/login', { username, password });
    setToken(session.token);
    setUser(session.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, ready, isAdmin: user?.role === 'ADMIN', login, logout }),
    [user, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être appelé sous AuthProvider');
  return value;
}

/** Redirige vers la connexion tant qu'aucune session n'est ouverte. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="empty">Chargement de la session…</div>;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}
