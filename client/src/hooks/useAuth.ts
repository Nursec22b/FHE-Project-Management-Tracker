import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { User, LoginCredentials, RegisterData } from '../types';
import { auth as authApi, getToken, setToken, removeToken } from '../services/api';

// ------------------------------------------------------------------ //
//  Context shape                                                       //
// ------------------------------------------------------------------ //

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ------------------------------------------------------------------ //
//  Provider                                                            //
// ------------------------------------------------------------------ //

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // On mount, if a token exists attempt to load the user profile.
  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const storedToken = getToken();
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const me = await authApi.getMe();
        if (!cancelled) {
          setUser(me);
          setTokenState(storedToken);
        }
      } catch {
        // Token is invalid or expired -- clear it.
        if (!cancelled) {
          removeToken();
          setUser(null);
          setTokenState(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------- //
  //  Actions                                                         //
  // -------------------------------------------------------------- //

  const login = useCallback(async (credentials: LoginCredentials) => {
    const response = await authApi.login(credentials);
    setToken(response.token);
    setTokenState(response.token);
    setUser(response.user);
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    const response = await authApi.register(data);
    setToken(response.token);
    setTokenState(response.token);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    removeToken();
    setTokenState(null);
    setUser(null);
  }, []);

  // -------------------------------------------------------------- //
  //  Memoised context value                                          //
  // -------------------------------------------------------------- //

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: !!user && !!token,
      isLoading,
      login,
      register,
      logout,
    }),
    [user, token, isLoading, login, register, logout],
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

// ------------------------------------------------------------------ //
//  Hook                                                                //
// ------------------------------------------------------------------ //

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
