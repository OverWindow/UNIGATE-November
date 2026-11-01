"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getSession, signIn, signOut, signUp, type AuthUser, type SignupInput } from "@/lib/auth-api";
import type { Language } from "@/lib/landing-content";

interface AppContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  user: AuthUser | null;
  status: "loading" | "anonymous" | "authenticated" | "error";
  refreshSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export default function Providers({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("ko");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AppContextValue["status"]>("loading");
  const generation = useRef(0);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  const refreshSession = useCallback(async () => {
    const current = ++generation.current;
    setStatus("loading");
    try {
      const next = await getSession();
      if (current !== generation.current) return;
      setUser(next);
      setStatus(next ? "authenticated" : "anonymous");
    } catch {
      if (current === generation.current) setStatus("error");
    }
  }, []);

  useEffect(() => {
    void refreshSession();
    return () => { generation.current += 1; };
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string) => {
    const current = ++generation.current;
    const next = await signIn(email, password);
    if (current === generation.current) { setUser(next); setStatus("authenticated"); }
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    const current = ++generation.current;
    const next = await signUp(input);
    if (current === generation.current) { setUser(next); setStatus("authenticated"); }
  }, []);

  const logout = useCallback(async () => {
    ++generation.current;
    await signOut();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(() => ({ language, setLanguage, user, status, refreshSession, login, signup, logout }),
    [language, user, status, refreshSession, login, signup, logout]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp requires Providers");
  return value;
}
