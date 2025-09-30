import React, { useId, useState } from 'react';
import type { AuthResponse } from '../types';

type AuthPanelVariant = 'default' | 'wide';

interface AuthPanelProps {
  onAuthenticate: (response: AuthResponse) => Promise<void> | void;
  className?: string;
  variant?: AuthPanelVariant;
}

const classNames = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

const AuthPanel: React.FC<AuthPanelProps> = ({ onAuthenticate, className, variant = 'default' }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('demo@dandmaps.example');
  const [password, setPassword] = useState('demo-password');
  const [displayName, setDisplayName] = useState('Demo DM');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formId = useId();
  const emailId = `${formId}-email`;
  const passwordId = `${formId}-password`;
  const displayNameId = `${formId}-display-name`;
  const errorId = `${formId}-error`;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await (mode === 'login'
        ? import('../api/client').then(({ apiClient }) => apiClient.login({ email, password }))
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

  const containerClasses = classNames(
    'relative w-full overflow-hidden rounded-3xl border border-amber-200/70 bg-white/80 p-8 shadow-xl shadow-amber-200/50 backdrop-blur-sm transition-colors dark:border-amber-500/30 dark:bg-slate-900/80 dark:shadow-[0_20px_45px_rgba(15,23,42,0.75)] sm:p-10',
    variant === 'default' ? 'mx-auto max-w-md' : '',
    className
  );

  const badgeText = mode === 'login' ? 'Return to the light' : 'Spark a new lantern';
  const headingText = mode === 'login' ? 'Sign in to TableTorch' : 'Join the TableTorch beta';
  const submitLabel = loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up';
  const toggleLabel = mode === 'login' ? 'Need an account?' : 'Already have an account?';
  const toggleHelper = mode === 'login' ? 'Create one instead' : 'Use your existing login';

  return (
    <section className={containerClasses} aria-labelledby={`${formId}-title`}>
      <span
        aria-hidden
        className="pointer-events-none absolute -top-28 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-amber-300/25 blur-3xl dark:bg-amber-500/15"
      />
      <div className="relative space-y-8">
        <header className="space-y-3">
          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-100/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-800 shadow-sm dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200">
            {badgeText}
          </span>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <h2 id={`${formId}-title`} className="text-2xl font-semibold text-slate-900 dark:text-white">
                {headingText}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Use the pre-filled demo credentials or sign up with your own details to explore the TableTorch console.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMode((current) => (current === 'login' ? 'signup' : 'login'))}
              className="inline-flex items-center rounded-full border border-amber-700/30 bg-white/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-700 transition hover:border-amber-500/60 hover:text-amber-600 dark:border-amber-500/40 dark:bg-slate-900/60 dark:text-amber-200 dark:hover:border-amber-400/50 dark:hover:text-amber-100"
              aria-pressed={mode === 'signup'}
            >
              {toggleLabel}
            </button>
          </div>
          <p className="text-xs uppercase tracking-[0.35em] text-amber-700/70 dark:text-amber-300/80">{toggleHelper}</p>
        </header>
        <form
          id={formId}
          onSubmit={handleSubmit}
          aria-describedby={error ? errorId : undefined}
          aria-busy={loading}
          className="space-y-5"
          noValidate
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor={emailId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Email
              </label>
              <input
                id={emailId}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="w-full rounded-2xl border border-amber-200/70 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60 dark:border-amber-500/30 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-amber-400"
                required
              />
            </div>
            {mode === 'signup' && (
              <div className="space-y-2">
                <label htmlFor={displayNameId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Display name
                </label>
                <input
                  id={displayNameId}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                  className="w-full rounded-2xl border border-amber-200/70 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60 dark:border-amber-500/30 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-amber-400"
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor={passwordId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Password
              </label>
              <input
                id={passwordId}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full rounded-2xl border border-amber-200/70 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60 dark:border-amber-500/30 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-amber-400"
                required
              />
            </div>
          </div>
          {error && (
            <p id={errorId} role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.4em] text-white shadow-lg shadow-amber-500/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-500 disabled:cursor-wait disabled:opacity-80"
          >
            {submitLabel}
          </button>
        </form>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          We respect your table: credentials are only used to authenticate with the demo API and never stored by this client.
        </p>
      </div>
    </section>
  );
};

export default AuthPanel;
