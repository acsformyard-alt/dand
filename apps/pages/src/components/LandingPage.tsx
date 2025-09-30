import React from 'react';
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
    description: 'Blend torchlight fades and manual masking to unveil each region exactly when the story demands it.',
    icon: '🔥',
  },
  {
    title: 'Campaign codex',
    description: 'Keep maps, notes and initiative trackers glowing in one organised library for every adventure.',
    icon: '📜',
  },
  {
    title: 'Table-ready sharing',
    description: 'Send players a simple join code so they can follow the light from any device—no spoilers required.',
    icon: '🪔',
  },
  {
    title: 'Session embers',
    description: 'Save the state of your encounters and rekindle the same ambience when your party returns.',
    icon: '✨',
  },
];

const LandingPage: React.FC<LandingPageProps> = ({ theme, setTheme, onAuthenticate }) => {
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  const handleThemeToggle = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="bg-landing relative min-h-screen overflow-hidden text-stone-900 transition-colors dark:text-amber-100">
      <div aria-hidden className="absolute inset-0 bg-grid-mask opacity-70 mix-blend-soft-light dark:opacity-50" />
      <div aria-hidden className="pointer-events-none absolute -top-32 right-12 h-72 w-72 rounded-full bg-amber-300/40 blur-3xl dark:bg-amber-500/30 animate-float-slow" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-10rem] left-[-6rem] h-96 w-96 rounded-full bg-orange-400/20 blur-[140px] dark:bg-orange-500/20 animate-float-slow" />
      <div className="relative isolate">
        <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 sm:py-10">
          <div className="flex items-center gap-4">
            <div className="torch-logo">
              <span aria-hidden>🔥</span>
              <span className="sr-only">TableTorch logo placeholder</span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.45em] text-amber-700 dark:text-amber-300">TableTorch</p>
              <p className="text-lg font-semibold text-stone-900 dark:text-amber-100">Light your tabletop with living maps</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleThemeToggle}
            aria-pressed={theme === 'dark'}
            className="inline-flex items-center gap-2 rounded-full border border-amber-600/30 bg-amber-50/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-800 shadow-sm transition hover:border-amber-500/70 hover:text-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-amber-300/40 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:border-amber-200/60 dark:hover:text-amber-200"
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
              <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-100/70 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-amber-800 shadow-sm dark:border-amber-400/50 dark:bg-amber-900/40 dark:text-amber-200">
                Illuminate your adventures
              </span>
              <h1 className="text-4xl font-black tracking-tight text-stone-900 dark:text-amber-100 sm:text-5xl">
                Guide your party through unforgettable encounters with torchlit map reveals.
              </h1>
              <p className="max-w-xl text-lg text-stone-700 dark:text-amber-200/80">
                TableTorch keeps your battlemap prep organised and ready. Cue warm lighting, reveal regions in real time, and manage campaigns without dimming the table’s immersion.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="#auth-panel"
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-3 text-xs font-semibold uppercase tracking-[0.45em] text-white shadow-lg shadow-amber-500/40 transition hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
                >
                  Light the demo
                </a>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-600/30 bg-amber-50/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-amber-800 transition hover:border-amber-500/60 hover:text-amber-700 dark:border-amber-200/40 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:border-amber-100/50 dark:hover:text-amber-100"
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
                  className="group relative overflow-hidden rounded-3xl border border-amber-800/10 bg-amber-50/80 p-6 shadow-lg shadow-amber-900/10 transition hover:-translate-y-1 hover:shadow-2xl dark:border-amber-200/20 dark:bg-amber-950/40 dark:shadow-amber-900/40"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/30 via-orange-500/20 to-rose-500/20 text-2xl">
                    <span aria-hidden>{feature.icon}</span>
                    <span className="sr-only">{feature.title} icon</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-stone-900 dark:text-amber-100">{feature.title}</h3>
                  <p className="mt-2 text-sm text-stone-700 dark:text-amber-200/80">{feature.description}</p>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 translate-y-full bg-gradient-to-t from-orange-500/20 to-transparent transition duration-500 group-hover:translate-y-0"
                  />
                </article>
              ))}
            </section>
          </section>
          <aside className="relative">
            <div aria-hidden className="absolute inset-0 -translate-y-6 rounded-[2.75rem] bg-amber-100/70 blur-3xl dark:bg-amber-900/40" />
            <div className="relative rounded-[2.5rem] border border-amber-800/20 bg-amber-50/80 p-1 shadow-2xl shadow-amber-900/20 backdrop-blur-xl dark:border-amber-300/20 dark:bg-amber-950/50">
              <div className="absolute -top-16 right-10 h-24 w-24 rounded-full bg-gradient-to-br from-amber-300/40 via-orange-400/30 to-rose-500/20 blur-3xl dark:from-amber-500/30 dark:via-orange-500/30 dark:to-rose-500/30 animate-gradient" aria-hidden />
              <div className="absolute bottom-10 left-10 h-20 w-20 rounded-full bg-orange-300/30 blur-2xl dark:bg-orange-500/20 animate-float-slow" aria-hidden />
              <AuthPanel
                variant="wide"
                className="border-transparent bg-amber-50/90 shadow-none ring-1 ring-amber-200/50 dark:bg-amber-950/60 dark:ring-amber-300/20"
                onAuthenticate={onAuthenticate}
              />
            </div>
            <p id="auth-panel" className="mt-6 text-center text-xs text-stone-600 dark:text-amber-200/80">
              No spam, no credit card – just a guided tour of the TableTorch command console.
            </p>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default LandingPage;
