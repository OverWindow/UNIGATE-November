"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getSession, signIn, signOut, signUp, type AuthUser, type SignupInput } from "@/lib/auth/auth-api";
import { creditsRequest, type CreditBalance } from "@/lib/writing/writing-api";
import type { Language } from "@/lib/landing-content";

interface AppContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  user: AuthUser | null;
  status: "loading" | "anonymous" | "authenticated" | "error";
  refreshSession: () => Promise<void>;
  creditBalance: CreditBalance | null;
  refreshCredits: (signal: AbortSignal) => Promise<CreditBalance>;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);
const languageStorageKey = "topiq-language";

export default function Providers({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ko");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AppContextValue["status"]>("loading");
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const generation = useRef(0);
  const creditRequest = useRef(0);

  useEffect(() => {
    // Restore after hydration so the initial render matches the server.
    try {
      const saved = localStorage.getItem(languageStorageKey);
      if (saved === "ko" || saved === "en" || saved === "id") setLanguageState(saved);
    } catch { /* Storage may be unavailable. */ }
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try { localStorage.setItem(languageStorageKey, next); } catch { /* Keep the in-memory selection. */ }
  }, []);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  const refreshCredits = useCallback(async (signal: AbortSignal) => {
    const session = generation.current;
    const request = ++creditRequest.current;
    const balance = await creditsRequest<CreditBalance>("", signal);
    // Ignore responses from an older session or an earlier balance request.
    if (!signal.aborted && session === generation.current && request === creditRequest.current) setCreditBalance(balance);
    return balance;
  }, []);

  const refreshSession = useCallback(async () => {
    const current = ++generation.current;
    setCreditBalance(null);
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
    if (current === generation.current) { setCreditBalance(null); setUser(next); setStatus("authenticated"); }
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    const current = ++generation.current;
    const next = await signUp(input);
    if (current === generation.current) { setCreditBalance(null); setUser(next); setStatus("authenticated"); }
  }, []);

  const logout = useCallback(async () => {
    ++generation.current;
    await signOut();
    setCreditBalance(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(() => ({ language, setLanguage, user, status, refreshSession, creditBalance, refreshCredits, login, signup, logout }),
    [language, setLanguage, user, status, refreshSession, creditBalance, refreshCredits, login, signup, logout]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp requires Providers");
  return value;
}
