'use client';

import { useState } from 'react';
import { useAuthStore } from '@web/stores/auth-store';

export default function AuthForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { signIn, signUp, loading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim() || !password.trim()) return;

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
    }

    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
        setSuccess('Check your email to confirm your account');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-5xl font-bold text-center text-emotion-warm">Ignis</h1>
        <p className="text-text-secondary text-center text-lg mb-8">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </p>

        {error && (
          <div className="bg-error/20 border border-error text-error text-sm px-4 py-2 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-500/20 border border-green-500 text-green-400 text-sm px-4 py-2 rounded-lg">
            {success}
          </div>
        )}

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          className="w-full bg-surface-light rounded-xl px-4 py-3.5 text-text placeholder:text-text-secondary outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          className="w-full bg-surface-light rounded-xl px-4 py-3.5 text-text placeholder:text-text-secondary outline-none"
        />
        {mode === 'signup' && (
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm Password"
            autoComplete="new-password"
            className="w-full bg-surface-light rounded-xl px-4 py-3.5 text-text placeholder:text-text-secondary outline-none"
          />
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-user-bubble text-white rounded-xl py-3.5 font-semibold hover:brightness-110 disabled:opacity-60 transition"
        >
          {loading
            ? mode === 'signin' ? 'Signing in...' : 'Creating account...'
            : mode === 'signin' ? 'Sign In' : 'Sign Up'}
        </button>

        <button
          type="button"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setSuccess(''); }}
          className="w-full text-text-secondary text-sm text-center"
        >
          {mode === 'signin' ? (
            <>Don&apos;t have an account? <span className="text-text font-semibold">Sign Up</span></>
          ) : (
            <>Already have an account? <span className="text-text font-semibold">Sign In</span></>
          )}
        </button>
      </form>
    </div>
  );
}
