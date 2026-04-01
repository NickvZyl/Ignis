'use client';

import { useState } from 'react';
import { useAuthStore } from '@web/stores/auth-store';

export default function AuthForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { signIn, loading } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) return;
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-5xl font-bold text-center text-emotion-warm">Ignis</h1>
        <p className="text-text-secondary text-center text-lg mb-8">Welcome back</p>

        {error && (
          <div className="bg-error/20 border border-error text-error text-sm px-4 py-2 rounded-lg">
            {error}
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
          autoComplete="current-password"
          className="w-full bg-surface-light rounded-xl px-4 py-3.5 text-text placeholder:text-text-secondary outline-none"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-user-bubble text-white rounded-xl py-3.5 font-semibold hover:brightness-110 disabled:opacity-60 transition"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
