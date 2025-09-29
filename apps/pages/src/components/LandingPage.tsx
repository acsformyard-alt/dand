import React, { useId } from 'react';
import type { AuthResponse } from '../types';
import AuthPanel from './AuthPanel';

interface LandingPageProps {
  theme: 'light' | 'dark';
  setTheme: React.Dispatch<React.SetStateAction<'light' | 'dark'>>;
  onAuthenticate: (response: AuthResponse) => Promise<void> | void;
}

const features = [
  {
    title: 'Ignite every reveal',
    description: 'Sweep warm light across your battlemaps with precision tools that let you script every gasp around the table.',
    icon: '🔥',
  },
  {
    title: 'Campaign vault',
    description: 'File battlemaps, lore, and initiative notes by campaign so your prep is ready the moment the torch is lit.',
    icon: '📜',
  },
  {
    title: 'Share the spark',
    description: 'Invite players with join codes and let them watch your reveals unfold from any device in real time.',
    icon: '📡',
  },
  {
    title: 'Preserve the embers',
    description: 'Archive every session and resume right where the light last fell without losing the mood you built.',
    icon: '💾',
  },
];

const TorchIcon: React.FC = () => {
  const flameId = useId();
  return (
    <svg viewBox="0 0 64 64" role="img" aria-hidden className="h-9 w-9">
      <title>TableTorch placeholder logo</title>
      <defs>
        <linearGradient id={`${flameId}-flame`} x1="32" y1="6" x2="32" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="45%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id={`${flameId}-handle`} x1="32" y1="40" x2="32" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#78350f" />
          <stop offset="100%" stopColor="#451a03" />
        </linearGradient>
      </defs>
      <path
        d="M32 6c-7.8 4.8-12.5 13.2-7.6 20.9 3.2 5 9.4 5.4 12.4 0.5 2.5-4.1 0.4-9.5-3.2-12.8 2.3 4.8 0.7 7.9-1.2 9.9-3-2.2-3.2-6.3 1.2-11.7C32.9 11.4 30 9 32 6Z"
        fill={`url(#${flameId}-flame)`}
      />
      <path d="M27 33c0-2.8 2.2-5 5-5s5 2.2 5 5c0 6-4 11-5 11s-5-5-5-11Z" fill="#ea580c" opacity="0.65" />
      <path d="M27 40h10v14a5 5 0 0 1-5 5 5 5 0 0 1-5-5V40Z" fill={`url(#${flameId}-handle)`} />
      <rect x="24" y="38" width="16" height="4" rx="1.5" fill="#7c2d12" />
    </svg>
  );
};

const LandingPage: React.FC<LandingPageProps> = ({ theme, setTheme, onAuthenticate }) => {
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  const handleThemeToggle = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="bg-landing relative min-h-screen overflow-hidden text-slate-900 transition-colors dark:text-slate-100">
      <div aria-hidden className="absolute inset-0 bg-grid-mask opacity-60 mix-blend-soft-light dark:opacity-40" />
      <div aria-hidden className="pointer-events-none absolute -top-32 right-12 h-72 w-72 rounded-full bg-amber-300/30 blur-3xl dark:bg-amber-500/20 animate-float-slow" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-10rem] left-[-6rem] h-96 w-96 rounded-full bg-orange-200/25 blur-[120px] dark:bg-amber-500/20 animate-float-slow" />
      <div className="relative isolate">
        <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 sm:py-10">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-4 rounded-[26px] bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.55),rgba(251,191,36,0))] opacity-0 transition-opacity duration-700 dark:opacity-100"
              />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/50 bg-amber-200/90 text-2xl font-black text-amber-900 shadow-xl shadow-amber-500/30 ring-2 ring-amber-100/70 backdrop-blur-sm dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-100 dark:ring-amber-500/30">
                <TorchIcon />
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.45em] text-amber-700 dark:text-amber-300">TableTorch</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Lighting control for unforgettable tabletop moments</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleThemeToggle}
            aria-pressed={theme === 'dark'}
            className="inline-flex items-center gap-2 rounded-full border border-amber-500/60 bg-white/50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-700 shadow-sm transition hover:border-amber-500 hover:text-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-amber-400/60 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:border-amber-300 dark:hover:text-amber-100"
          >
            <span className="text-base" aria-hidden>
              {theme === 'dark' ? '🌙' : '🌞'}
            </span>
            {themeLabel}
          </button>
        </header>
        <main className="mx-auto grid max-w-7xl gap-16 px-6 pb-24 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)] lg:items-center">
          <section className="space-y-10">
            <div className="space-y-6">
              <span className="inline-flex items-center rounded-full border border-amber-500/60 bg-amber-100/70 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-amber-700 shadow-sm dark:border-amber-400/60 dark:bg-amber-500/10 dark:text-amber-200">
                Your table's guiding light
              </span>
              <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl dark:text-white">
                Guide your party through unforgettable encounters with cinematic light reveals.
              </h1>
              <p className="max-w-xl text-lg text-slate-600 dark:text-slate-300">
                TableTorch keeps your battlemap prep organised and ready. Cue dramatic lighting, reveal regions in real time, and manage campaigns without breaking the table’s immersion.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="#auth-panel"
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-3 text-xs font-semibold uppercase tracking-[0.45em] text-white shadow-lg shadow-amber-500/30 transition hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
                >
                  Launch the demo
                </a>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-500/50 bg-white/60 px-6 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-amber-700 transition hover:border-amber-500 hover:text-amber-800 dark:border-amber-400/60 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:border-amber-300 dark:hover:text-amber-100"
                >
                  Explore features
                  <span aria-hidden>→</span>
                </a>
              </div>
            </div>
            <section id="features" className="grid gap-6 sm:grid-cols-2">
              {features.map((feature) => (
                <article
                  key={feature.title}
                  className="group relative overflow-hidden rounded-3xl border border-amber-500/30 bg-amber-50/80 p-6 shadow-lg shadow-amber-200/50 transition hover:-translate-y-1 hover:shadow-2xl dark:border-amber-400/30 dark:bg-slate-900/70 dark:shadow-black/40"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-2xl">
                    <span aria-hidden>{feature.icon}</span>
                    <span className="sr-only">{feature.title} icon</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{feature.description}</p>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 translate-y-full bg-gradient-to-t from-amber-500/10 to-transparent transition duration-500 group-hover:translate-y-0"
                  />
                </article>
              ))}
            </section>
          </section>
          <aside className="relative">
            <div aria-hidden className="absolute inset-0 -translate-y-6 rounded-[2.75rem] bg-white/50 blur-3xl dark:bg-slate-900/50" />
            <div className="relative rounded-[2.5rem] border border-amber-500/30 bg-white/70 p-1 shadow-2xl shadow-amber-500/20 backdrop-blur-xl dark:border-amber-400/40 dark:bg-slate-950/70">
              <div className="absolute -top-16 right-10 h-24 w-24 rounded-full bg-gradient-to-br from-amber-300/50 to-orange-500/20 blur-3xl dark:from-amber-500/40 dark:to-orange-500/25 animate-gradient" aria-hidden />
              <div className="absolute bottom-10 left-10 h-20 w-20 rounded-full bg-amber-300/25 blur-2xl dark:bg-amber-500/25 animate-float-slow" aria-hidden />
              <AuthPanel
                variant="wide"
                className="border-transparent bg-white/80 shadow-none ring-1 ring-amber-200/60 dark:bg-slate-950/70 dark:ring-amber-400/20"
                onAuthenticate={onAuthenticate}
              />
            </div>
            <p id="auth-panel" className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No spam, no credit card – just a guided tour of the TableTorch command deck.
            </p>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default LandingPage;
