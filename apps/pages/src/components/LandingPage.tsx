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
    title: 'Ignite dramatic reveals',
    description:
      'Sweep TableTorch across the map to unveil hidden passages and keep every reveal glowing with suspense.',
    icon: '🔥',
  },
  {
    title: 'Campaign codex',
    description:
      'Curate battlemaps, lore and markers by campaign so your notes stay bound together like a DM’s grimoire.',
    icon: '📜',
  },
  {
    title: 'Instant invitations',
    description:
      'Share short join codes and let players follow the light from any device without missing a single clue.',
    icon: '🚪',
  },
  {
    title: 'Preserve the ember',
    description:
      'Archive sessions to resume the adventure exactly where the last sparks were left smouldering.',
    icon: '🕯️',
  },
];

const LandingPage: React.FC<LandingPageProps> = ({ theme, setTheme, onAuthenticate }) => {
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  const handleThemeToggle = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="bg-landing relative min-h-screen overflow-hidden text-stone-900 transition-colors dark:text-amber-100">
      <div aria-hidden className="absolute inset-0 bg-grid-mask opacity-70" />
      <div aria-hidden className="pointer-events-none absolute -top-40 right-6 h-80 w-80 rounded-full bg-amber-400/30 blur-3xl dark:bg-amber-500/20 animate-float-slow" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-12rem] left-[-8rem] h-[28rem] w-[28rem] rounded-full bg-orange-500/15 blur-[150px] dark:bg-orange-600/25 animate-float-slow" />
      <div className="relative isolate">
        <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 sm:py-10">
          <div className="flex items-center gap-4">
            <div className="halo-glow relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 via-amber-300 to-orange-300 text-3xl shadow-xl shadow-orange-500/40 ring-4 ring-amber-100/70 backdrop-blur-sm dark:bg-gradient-to-br dark:from-amber-500/20 dark:via-orange-500/20 dark:to-rose-500/20 dark:ring-amber-500/40">
              <span aria-hidden>🔥</span>
              <span className="sr-only">TableTorch logo placeholder</span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.45em] text-amber-700 dark:text-amber-300">TableTorch</p>
              <p className="text-lg font-semibold text-stone-900 dark:text-amber-100">Light the way for every tabletop tale</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleThemeToggle}
            aria-pressed={theme === 'dark'}
            className="inline-flex items-center gap-2 rounded-full border border-amber-700/30 bg-amber-100/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-800 shadow-sm transition hover:border-amber-500/60 hover:text-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-amber-400/40 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:border-amber-300/60 dark:hover:text-amber-100"
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
              <span className="inline-flex items-center rounded-full border border-amber-700/40 bg-amber-100/80 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-amber-700 shadow-sm dark:border-amber-400/50 dark:bg-amber-500/10 dark:text-amber-200">
                Illuminate your table
              </span>
              <h1 className="text-4xl font-black tracking-tight text-stone-900 sm:text-5xl dark:text-amber-50">
                Guide your party with luminous reveals crafted for immersive storytelling.
              </h1>
              <p className="max-w-xl text-lg text-stone-700 dark:text-amber-200/80">
                TableTorch gathers your battlemaps, notes, and reveals into one parchment-inspired command center. Cast light exactly where it matters and keep the mystery burning for every encounter.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="#auth-panel"
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-3 text-xs font-semibold uppercase tracking-[0.45em] text-white shadow-lg shadow-orange-500/30 transition hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
                >
                  Launch the demo
                </a>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-700/30 bg-amber-50/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-amber-700 transition hover:border-amber-500/60 hover:text-amber-600 dark:border-amber-400/40 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:border-amber-300/60 dark:hover:text-amber-100"
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
                  className="group relative overflow-hidden rounded-3xl border border-amber-900/10 bg-amber-50/80 p-6 shadow-lg shadow-amber-200/40 transition hover:-translate-y-1 hover:shadow-2xl dark:border-amber-500/30 dark:bg-amber-900/30 dark:shadow-black/40"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/30 to-orange-500/20 text-2xl">
                    <span aria-hidden>{feature.icon}</span>
                    <span className="sr-only">{feature.title} icon</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-stone-900 dark:text-amber-50">{feature.title}</h3>
                  <p className="mt-2 text-sm text-stone-600 dark:text-amber-200/90">{feature.description}</p>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 translate-y-full bg-gradient-to-t from-orange-500/20 to-transparent transition duration-500 group-hover:translate-y-0"
                  />
                </article>
              ))}
            </section>
          </section>
          <aside className="relative">
            <div aria-hidden className="absolute inset-0 -translate-y-6 rounded-[2.75rem] bg-amber-100/60 blur-3xl dark:bg-amber-900/60" />
            <div className="relative rounded-[2.5rem] border border-amber-900/10 bg-amber-50/80 p-1 shadow-2xl shadow-orange-500/10 backdrop-blur-xl dark:border-amber-500/30 dark:bg-amber-950/40">
              <div className="absolute -top-16 right-10 h-24 w-24 rounded-full bg-gradient-to-br from-amber-400/40 to-orange-500/30 blur-3xl dark:from-amber-500/40 dark:to-orange-600/30 animate-gradient" aria-hidden />
              <div className="absolute bottom-10 left-10 h-20 w-20 rounded-full bg-orange-400/20 blur-2xl dark:bg-orange-500/20 animate-float-slow" aria-hidden />
              <AuthPanel
                variant="wide"
                className="border-transparent bg-amber-50/90 shadow-none ring-1 ring-amber-900/10 dark:bg-amber-950/60 dark:ring-amber-500/30"
                onAuthenticate={onAuthenticate}
              />
            </div>
            <p id="auth-panel" className="mt-6 text-center text-xs text-stone-600 dark:text-amber-200/80">
              No spam, no credit card – just a guided tour of the TableTorch control room.
            </p>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default LandingPage;
