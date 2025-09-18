import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiClient, ApiUser } from "../api/client";

type AuthState = {
  user: ApiUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

const TOKEN_KEY = "dnd-map-reveal/token";
const USER_KEY = "dnd-map-reveal/user";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    if (storedToken && storedUser) {
      try {
        const parsed = JSON.parse(storedUser) as ApiUser;
        setUser(parsed);
        setToken(storedToken);
        apiClient.setToken(storedToken);
      } catch (err) {
        console.warn("Failed to parse stored user", err);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    setLoading(false);
  }, []);

  const saveAuth = useCallback((nextUser: ApiUser, nextToken: string) => {
    setUser(nextUser);
    setToken(nextToken);
    apiClient.setToken(nextToken);
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    setToken(null);
    apiClient.setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: loggedInUser, token: authToken } = await apiClient.login(email, password);
    saveAuth(loggedInUser, authToken);
  }, [saveAuth]);

  const signup = useCallback(async (email: string, password: string, displayName: string) => {
    const { user: newUser, token: authToken } = await apiClient.signup(email, password, displayName);
    saveAuth(newUser, authToken);
  }, [saveAuth]);

  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  const value = useMemo(() => ({ user, token, loading, login, signup, logout }), [user, token, loading, login, signup, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};
