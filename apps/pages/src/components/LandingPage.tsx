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
    title: 'Illuminate every scene',
    description: 'Warm torchlight sweeps across your battlemaps with smooth reveals tuned for live storytelling.',
    icon: '🕯️',
  },
  {
    title: 'Campaign control',
    description: 'Keep every map, note, and marker organised by adventure so your table is ready the moment players gather.',
    icon: '🎯',
  },
  {
    title: 'Share instantly',
    description: 'Invite players with quick join codes and let them follow the glow from any device in the room.',
    icon: '⚡',
  },
  {
    title: 'Save your progress',
    description: 'Bookmark every session to pick up right where the torchlight faded at the end of the night.',
    icon: '🛡️',
  },
];

const LandingPage: React.FC<LandingPageProps> = ({ theme, setTheme, onAuthenticate }) => {
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  const handleThemeToggle = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="bg-landing relative min-h-screen overflow-hidden text-slate-900 transition-colors dark:text-slate-100">
      <div aria-hidden className="absolute inset-0 bg-grid-mask opacity-60 mix-blend-soft-light dark:opacity-40" />
      <div aria-hidden className="pointer-events-none absolute -top-32 right-12 h-72 w-72 rounded-full bg-sky-400/30 blur-3xl dark:bg-sky-500/20 animate-float-slow" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-10rem] left-[-6rem] h-96 w-96 rounded-full bg-teal-400/20 blur-[120px] dark:bg-teal-500/20 animate-float-slow" />
      <div className="relative isolate">
        <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 sm:py-10">
          <div className="flex items-center gap-4">
            <div className="torch-logo">
              <span aria-hidden>🔥</span>
              <span className="sr-only">TableTorch logo placeholder</span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.45em] text-amber-700 dark:text-amber-300">TableTorch</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Torchlit encounters for unforgettable storytelling</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleThemeToggle}
            aria-pressed={theme === 'dark'}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 shadow-sm transition hover:border-teal-400/70 hover:text-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-teal-400/60 dark:hover:text-teal-200"
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
              <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-100/70 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-amber-800 shadow-sm dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
                Ignite your tabletop
              </span>
              <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl dark:text-white">
                Guide your party through unforgettable encounters with cinematic torchlight reveals.
              </h1>
              <p className="max-w-xl text-lg text-slate-600 dark:text-slate-300">
                TableTorch keeps your battlemap prep organised and ready. Cue dramatic lighting, unveil new territory in real time, and manage campaigns without breaking the table’s immersion.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="#auth-panel"
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-teal-500 via-sky-500 to-blue-500 px-6 py-3 text-xs font-semibold uppercase tracking-[0.45em] text-white shadow-lg shadow-teal-500/30 transition hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400"
                >
                  Launch the demo
                </a>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300/70 bg-white/60 px-6 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-slate-600 transition hover:border-teal-400/60 hover:text-teal-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-teal-400/60 dark:hover:text-teal-200"
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
                  className="group relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-slate-200/40 transition hover:-translate-y-1 hover:shadow-2xl dark:border-slate-800/70 dark:bg-slate-900/70 dark:shadow-black/40"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/10 text-2xl">
                    <span aria-hidden>{feature.icon}</span>
                    <span className="sr-only">{feature.title} icon</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{feature.description}</p>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 translate-y-full bg-gradient-to-t from-teal-500/10 to-transparent transition duration-500 group-hover:translate-y-0"
                  />
                </article>
              ))}
            </section>
          </section>
          <aside className="relative">
            <div aria-hidden className="absolute inset-0 -translate-y-6 rounded-[2.75rem] bg-white/50 blur-3xl dark:bg-slate-900/50" />
            <div className="relative rounded-[2.5rem] border border-white/40 bg-white/60 p-1 shadow-2xl shadow-teal-500/10 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-950/60">
              <div className="absolute -top-16 right-10 h-24 w-24 rounded-full bg-gradient-to-br from-teal-400/40 to-sky-500/20 blur-3xl dark:from-teal-500/30 dark:to-sky-500/20 animate-gradient" aria-hidden />
              <div className="absolute bottom-10 left-10 h-20 w-20 rounded-full bg-teal-400/20 blur-2xl dark:bg-teal-500/20 animate-float-slow" aria-hidden />
              <AuthPanel
                variant="wide"
                className="border-transparent bg-white/80 shadow-none ring-1 ring-white/60 dark:bg-slate-950/70 dark:ring-teal-500/20"
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
