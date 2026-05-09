import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/local-db';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Human-readable Supabase error messages ───────────────────────────────────
function getAuthErrorMessage(error: any): string {
  const message = error.message || '';
  if (message.includes('Invalid login credentials')) return 'Invalid email or password.';
  if (message.includes('User already registered')) return 'An account with this email already exists.';
  if (message.includes('Password should be')) return 'Password must be at least 6 characters.';
  if (message.includes('Too many requests')) return 'Too many attempts. Please try again later.';
  return message || 'Authentication failed. Please try again.';
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 2. Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Redirect Logic ──
  const getRedirectURL = () => {
    // Priority: 1. Explicit env var, 2. Current origin
    const base = import.meta.env.VITE_SITE_URL || window.location.origin;
    return `${base.replace(/\/$/, '')}/dashboard`;
  };

  // ── Google OAuth ──
  const signInWithGoogle = async (): Promise<void> => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getRedirectURL(),
        }
      });
      if (error) throw error;
    } catch (error) {
      throw new Error(getAuthErrorMessage(error));
    }
  };

  // ── Email / Password sign-in ──
  const signInWithEmail = async (email: string, password: string): Promise<void> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error) {
      throw new Error(getAuthErrorMessage(error));
    }
  };

  // ── Email / Password sign-up ──
  const signUpWithEmail = async (
    email: string,
    password: string,
    name?: string
  ): Promise<void> => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name?.trim() },
          emailRedirectTo: getRedirectURL(),
        }
      });
      if (error) throw error;
    } catch (error) {
      throw new Error(getAuthErrorMessage(error));
    }
  };

  // ── Logout ──
  const logout = async (): Promise<void> => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      throw new Error(getAuthErrorMessage(error));
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

