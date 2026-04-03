import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  AuthError,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Human-readable Firebase error messages ───────────────────────────────────
function getAuthErrorMessage(error: AuthError): string {
  switch (error.code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password.';
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Please allow popups and try again.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled.';
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/invalid-api-key':
      return 'Firebase is not configured. Check your .env.local file.';
    default:
      return error.message ?? 'Authentication failed. Please try again.';
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setLoading(false);
      },
      (error) => {
        console.error('[AuthContext] onAuthStateChanged error:', error);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  // ── Google OAuth ──
  const signInWithGoogle = async (): Promise<void> => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg = getAuthErrorMessage(error as AuthError);
      throw new Error(msg); // re-throw with friendly message for AuthPage to catch
    }
  };

  // ── Email / Password sign-in ──
  const signInWithEmail = async (email: string, password: string): Promise<void> => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      const msg = getAuthErrorMessage(error as AuthError);
      throw new Error(msg);
    }
  };

  // ── Email / Password sign-up ──
  const signUpWithEmail = async (
    email: string,
    password: string,
    name?: string
  ): Promise<void> => {
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (name?.trim()) {
        await updateProfile(credential.user, { displayName: name.trim() });
        // Force-refresh the user so displayName is immediately available
        setUser({ ...credential.user, displayName: name.trim() } as User);
      }
    } catch (error) {
      const msg = getAuthErrorMessage(error as AuthError);
      throw new Error(msg);
    }
  };

  // ── Logout ──
  const logout = async (): Promise<void> => {
    try {
      await signOut(auth);
    } catch (error) {
      const msg = getAuthErrorMessage(error as AuthError);
      throw new Error(msg);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, logout }}
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
