import React, { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Zap, Loader2, Mail, Lock, User, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

// ─── Auth Page ────────────────────────────────────────────────────────────────
export function AuthPage() {
  const navigate = useNavigate();
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, user, loading } = useAuth();

  const [isLogin, setIsLogin]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState<string>('');

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [name,     setName]     = useState('');

  // Redirect already-authenticated users straight to the dashboard
  useEffect(() => {
    if (!loading && user) {
      navigate({ to: '/dashboard' });
    }
  }, [user, loading, navigate]);

  // Clear inline errors when the form input changes
  const clearError = () => setFormError('');

  // ── Email form submit ──
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!email.trim() || !password.trim()) {
      setFormError('Email and password are required.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    if (!isLogin && !name.trim()) {
      setFormError('Please enter your name.');
      return;
    }

    setSubmitting(true);
    try {
      if (isLogin) {
        await signInWithEmail(email, password);
        toast.success('Welcome back!');
      } else {
        await signUpWithEmail(email, password, name);
        toast.success('Account created — welcome aboard!');
      }
      navigate({ to: '/dashboard' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed.';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Google OAuth ──
  const handleGoogleSignIn = async () => {
    setFormError('');
    setSubmitting(true);
    try {
      await signInWithGoogle();
      toast.success('Signed in with Google!');
      navigate({ to: '/dashboard' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed.';
      // Don't show cancelled errors as errors
      if (!message.includes('cancelled')) {
        setFormError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Show a minimal loading screen while Firebase resolves auth state on mount
  if (loading) {
    return (
      <div className="min-h-screen bg-[#020817] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020817] flex items-center justify-center p-4 selection:bg-indigo-500/30">

      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-600/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      </div>

      <div className="w-full max-w-md space-y-8 relative z-10 animate-in fade-in zoom-in-95 duration-500">

        {/* Logo + title */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl
            flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Zap className="text-white h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-100">SEO Growth Engine</h1>
            <p className="text-sm text-slate-400 mt-1">Enterprise-grade AI SEO platform</p>
          </div>
        </div>

        <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-semibold text-center text-slate-200">
              {isLogin ? 'Sign in to your account' : 'Create your account'}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-5">

            {/* Inline error banner */}
            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10
                  border border-red-500/20 text-red-400 text-sm"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>{formError}</p>
              </div>
            )}

            {/* Google button */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 border-slate-700 bg-slate-800/50 hover:bg-slate-700
                hover:text-white transition-colors gap-2"
              onClick={handleGoogleSignIn}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Continue with Google
            </Button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-900/60 px-2 text-slate-500 font-semibold tracking-wider">
                  Or continue with email
                </span>
              </div>
            </div>

            {/* Email / Password form */}
            <form onSubmit={handleEmailAuth} className="space-y-4" noValidate>

              {/* Name — sign-up only */}
              {!isLogin && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-slate-300">Full name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      id="name"
                      autoComplete="name"
                      placeholder="Jane Smith"
                      className="pl-10 bg-slate-950 border-slate-800 h-11"
                      value={name}
                      onChange={(e) => { setName(e.target.value); clearError(); }}
                    />
                  </div>
                </div>
              )}

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-slate-300">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@company.com"
                    className="pl-10 bg-slate-950 border-slate-800 h-11"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearError(); }}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-slate-300">Password</Label>
                  {isLogin && (
                    <button
                      type="button"
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    required
                    placeholder="••••••••"
                    className="pl-10 bg-slate-950 border-slate-800 h-11"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white
                  shadow-lg shadow-indigo-500/20 transition-all"
              >
                {submitting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : isLogin ? 'Sign In' : 'Create Account'
                }
              </Button>
            </form>

            {/* Toggle login / sign-up */}
            <p className="text-center text-sm text-slate-400">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button
                type="button"
                onClick={() => { setIsLogin(!isLogin); setFormError(''); }}
                className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>

          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-600">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

// ─── Google icon ──────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
