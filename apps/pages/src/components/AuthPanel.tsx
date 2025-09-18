import React, { useState } from 'react';
import type { AuthResponse } from '../types';

interface AuthPanelProps {
  onAuthenticate: (response: AuthResponse) => Promise<void> | void;
}

const AuthPanel: React.FC<AuthPanelProps> = ({ onAuthenticate }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('demo@dandmaps.example');
  const [password, setPassword] = useState('demo-password');
  const [displayName, setDisplayName] = useState('Demo DM');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await (mode === 'login'
        ? import('../api/client').then(({ apiClient }) =>
            apiClient.login({ email, password })
          )
        : import('../api/client').then(({ apiClient }) =>
            apiClient.signup({ email, password, displayName })
          ));
      await onAuthenticate(response);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-slate-300 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
          {mode === 'login' ? 'Log in' : 'Create account'}
        </h1>
        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          className="text-sm text-primary hover:underline"
        >
          {mode === 'login' ? 'Need an account?' : 'Already have an account?'}
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            required
          />
        </div>
        {mode === 'signup' && (
          <div>
            <label className="mb-1 block text-sm font-medium">Display name</label>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              required
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">Password</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            required
          />
        </div>
        {error && <p className="text-sm text-rose-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center rounded bg-primary px-4 py-2 text-sm font-medium text-white shadow hover:bg-primary-dark disabled:cursor-wait disabled:opacity-70"
        >
          {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>
      </form>
    </div>
  );
};

export default AuthPanel;
