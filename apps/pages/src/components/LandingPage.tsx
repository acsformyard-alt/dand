import React from 'react';
import type { AuthResponse } from '../types';
import AuthPanel from './AuthPanel';
import TorchLogo from './TorchLogo';

interface LandingPageProps {
  theme: 'light' | 'dark';
  setTheme: React.Dispatch<React.SetStateAction<'light' | 'dark'>>;
  onAuthenticate: (response: AuthResponse) => Promise<void> | void;
}

const features = [
  {
    title: 'Torchlit reveals',
    description: 'Guide your players with gentle, painterly fades that feel like candlelight washing over parchment.',
    icon: '🕯️',
  },
  {
    title: 'Campaign satchel',
    description: 'Keep maps, lore and regions bundled by adventure so everything you prep is within arm’s reach.',
    icon: '🎒',
  },
  {
    title: 'Instant invitations',
    description: 'Share a single key and let the party step into your revealed view from any device at the table.',
    icon: '📜',
  },
  {
    title: 'Session embers',
    description: 'Save the state of every reveal so you can rekindle the exact moment you paused the story.',
    icon: '💾',
  },
];

const LandingPage: React.FC<LandingPageProps> = ({ theme, setTheme, onAuthenticate }) => {
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  const handleThemeToggle = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const parchmentTexture = React.useMemo(
    () => new URL('../../../../textures/parchment-bg.jpg', import.meta.url).href,
    []
  );

  const backgroundStyle = React.useMemo<React.CSSProperties>(
    () => ({
      backgroundColor: theme === 'dark' ? '#1a1510' : '#f5ebd3',
      backgroundImage:
        theme === 'dark'
          ? `linear-gradient(rgba(12, 10, 7, 0.8), rgba(12, 10, 7, 0.85)), url(${parchmentTexture})`
          : `url(${parchmentTexture})`,
      backgroundSize: 'cover',
      backgroundAttachment: 'fixed',
      backgroundPosition: 'center',
    }),
    [parchmentTexture, theme]
  );

  return (
    <div
      className="relative min-h-screen overflow-hidden text-stone-900 transition-colors dark:text-amber-100"
      style={backgroundStyle}
    >
      <div className="relative bg-gradient-to-b from-white/70 via-white/40 to-transparent px-6 py-10 backdrop-blur-sm dark:from-black/40 dark:via-black/30 dark:to-transparent">
        <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6">
          <TorchLogo theme={theme} />
          <button
            type="button"
            onClick={handleThemeToggle}
            aria-pressed={theme === 'dark'}
            className="inline-flex items-center gap-2 rounded-full border border-amber-900/20 bg-amber-100/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-amber-900 shadow-sm transition hover:bg-amber-200/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-100"
          >
            <span className="text-base" aria-hidden>
              {theme === 'dark' ? '🌙' : '🌞'}
            </span>
            {themeLabel}
          </button>
        </header>
        <main className="mx-auto grid max-w-6xl gap-16 pb-24 pt-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)] lg:items-start">
          <section className="space-y-10">
            <div className="space-y-6">
              <span className="inline-flex items-center rounded-full border border-amber-900/20 bg-amber-100/70 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                TableTorch keeps the table glowing
              </span>
              <h1 className="text-4xl font-black tracking-tight text-stone-900 sm:text-5xl dark:text-amber-100">
                Illuminate every reveal with tools crafted for storytellers.
              </h1>
              <p className="max-w-xl text-lg text-stone-700 dark:text-amber-200/80">
                TableTorch is your digital tabletop companion—blend regions smoothly, manage campaigns without rummaging through folders, and keep your party immersed in the glow of discovery.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="#auth-panel"
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-3 text-xs font-semibold uppercase tracking-[0.45em] text-amber-50 shadow-lg shadow-amber-700/30 transition hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
                >
                  Launch TableTorch
                </a>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-900/30 bg-amber-50/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-amber-900 transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-100"
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
                  className="group relative overflow-hidden rounded-3xl border border-amber-900/20 bg-amber-50/70 p-6 shadow-lg shadow-amber-900/10 transition hover:-translate-y-1 hover:shadow-2xl dark:border-amber-500/40 dark:bg-amber-900/30 dark:shadow-black/40"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-2xl">
                    <span aria-hidden>{feature.icon}</span>
                    <span className="sr-only">{feature.title} icon</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-stone-900 dark:text-amber-100">{feature.title}</h3>
                  <p className="mt-2 text-sm text-stone-700 dark:text-amber-200/80">{feature.description}</p>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 translate-y-full bg-gradient-to-t from-amber-500/15 to-transparent transition duration-500 group-hover:translate-y-0"
                  />
                </article>
              ))}
            </section>
          </section>
          <aside className="relative">
            <div aria-hidden className="absolute inset-0 -translate-y-6 rounded-[2.75rem] bg-amber-100/70 blur-3xl dark:bg-amber-900/40" />
            <div className="relative rounded-[2.5rem] border border-amber-900/20 bg-amber-50/70 p-1 shadow-2xl shadow-amber-900/30 backdrop-blur-xl dark:border-amber-500/40 dark:bg-amber-950/40">
              <div className="absolute -top-16 right-10 h-24 w-24 rounded-full bg-gradient-to-br from-amber-400/40 to-rose-400/20 blur-3xl dark:from-amber-500/25 dark:to-rose-500/15 animate-gradient" aria-hidden />
              <div className="absolute bottom-10 left-10 h-20 w-20 rounded-full bg-amber-400/20 blur-2xl dark:bg-amber-500/20 animate-float-slow" aria-hidden />
              <AuthPanel
                variant="wide"
                className="border-transparent bg-amber-50/80 shadow-none ring-1 ring-amber-900/10 dark:bg-amber-950/60 dark:ring-amber-500/30"
                onAuthenticate={onAuthenticate}
              />
            </div>
            <p id="auth-panel" className="mt-6 text-center text-xs text-stone-600 dark:text-amber-200/70">
              No spam, no credit card – just a guided tour of the TableTorch command desk.
            </p>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default LandingPage;
