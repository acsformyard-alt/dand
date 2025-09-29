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
    title: 'Ignite your reveals',
    description:
      'Sweep light across battlemaps with layered masks and brush tools that feel like guiding a real torch.',
    icon: '🔥',
  },
  {
    title: 'Curate every campaign',
    description: 'Sort maps, notes and tokens by world so your stories stay organised between adventures.',
    icon: '🗂️',
  },
  {
    title: 'Share the glow',
    description: 'Send players a join code and let them follow the light from any device without extra installs.',
    icon: '✨',
  },
  {
    title: 'Preserve the embers',
    description: 'Save session states so you can rekindle encounters exactly where the party left off.',
    icon: '🕯️',
  },
];

const parchmentTexture = new URL('../../../../textures/parchment-bg.jpg', import.meta.url).href;

const TorchLogo: React.FC = () => (
  <div className="relative">
    <div
      aria-hidden
      className="absolute -inset-5 rounded-full bg-amber-300/0 blur-2xl transition dark:bg-amber-200/20"
    />
    <div className="relative flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-200 via-amber-100 to-amber-300 shadow-lg shadow-amber-500/30 ring-2 ring-amber-900/10 dark:from-amber-500/20 dark:via-amber-500/10 dark:to-amber-400/20 dark:shadow-amber-500/40 dark:ring-amber-300/30">
      <svg
        aria-hidden
        viewBox="0 0 64 64"
        className="h-10 w-10 drop-shadow-[0_0_6px_rgba(251,191,36,0.45)] text-amber-700 dark:text-amber-200"
      >
        <path
          d="M28 6c5 4 10 7 11 13 1 6-3 11-7 14h10c0 5-3 14-10 19-7-5-10-14-10-19h8c-5-5-7-13-2-22z"
          fill="currentColor"
        />
        <path
          d="M26 37h12l-2 16h-8z"
          fill="url(#flame-handle)"
        />
        <defs>
          <linearGradient id="flame-handle" x1="26" y1="37" x2="38" y2="53" gradientUnits="userSpaceOnUse">
            <stop stopColor="#78350f" />
            <stop offset="1" stopColor="#451a03" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  </div>
);

const LandingPage: React.FC<LandingPageProps> = ({ theme, setTheme, onAuthenticate }) => {
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  const handleThemeToggle = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const backgroundStyle = {
    ['--parchment-texture' as const]: `url(${parchmentTexture})`,
  } as React.CSSProperties;

  return (
    <div
      className="bg-landing relative min-h-screen overflow-hidden text-slate-900 transition-colors dark:text-amber-50"
      style={backgroundStyle}
    >
      <div aria-hidden className="absolute inset-0 bg-grid-mask opacity-60 mix-blend-multiply dark:mix-blend-normal dark:opacity-50" />
      <div aria-hidden className="pointer-events-none absolute -top-32 right-12 h-72 w-72 rounded-full bg-amber-300/40 blur-3xl dark:bg-amber-500/20 animate-float-slow" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-10rem] left-[-6rem] h-96 w-96 rounded-full bg-orange-200/30 blur-[140px] dark:bg-orange-500/20 animate-float-slow" />
      <div className="relative isolate">
        <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 sm:py-10">
          <div className="flex items-center gap-4">
            <TorchLogo />
            <div>
              <p className="text-xs uppercase tracking-[0.45em] text-amber-700 dark:text-amber-200">TableTorch</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-amber-50">Light every encounter with warm, cinematic reveals</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleThemeToggle}
            aria-pressed={theme === 'dark'}
            className="inline-flex items-center gap-2 rounded-full border border-amber-900/20 bg-amber-50/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-800 shadow-sm transition hover:border-amber-500/60 hover:text-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-amber-300/40 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:border-amber-200/60 dark:hover:text-amber-200"
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
              <span className="inline-flex items-center rounded-full border border-amber-900/30 bg-amber-100/70 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-amber-800 shadow-sm dark:border-amber-200/40 dark:bg-amber-500/20 dark:text-amber-100">
                Illuminate every session
              </span>
              <h1 className="text-4xl font-black tracking-tight text-slate-900 sm:text-5xl dark:text-amber-50">
                Guide your party with the glow of TableTorch.
              </h1>
              <p className="max-w-xl text-lg text-slate-700 dark:text-amber-200/80">
                TableTorch keeps your battlemap prep organised and ready. Douse the table in warm light, reveal regions in real time, and keep the suspense alive without breaking immersion.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="#auth-panel"
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-3 text-xs font-semibold uppercase tracking-[0.45em] text-white shadow-lg shadow-amber-500/30 transition hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                >
                  Light the demo
                </a>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-900/30 bg-amber-50/70 px-6 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-amber-800 transition hover:border-amber-500/60 hover:text-amber-600 dark:border-amber-200/40 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:border-amber-200/60 dark:hover:text-amber-200"
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
                  className="group relative overflow-hidden rounded-3xl border border-amber-900/20 bg-amber-50/70 p-6 shadow-lg shadow-amber-900/10 transition hover:-translate-y-1 hover:shadow-2xl dark:border-amber-200/30 dark:bg-slate-950/60 dark:shadow-black/50"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/30 to-orange-500/20 text-2xl text-white shadow-inner shadow-amber-900/20">
                    <span aria-hidden>{feature.icon}</span>
                    <span className="sr-only">{feature.title} icon</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-amber-50">{feature.title}</h3>
                  <p className="mt-2 text-sm text-slate-700 dark:text-amber-200/80">{feature.description}</p>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 translate-y-full bg-gradient-to-t from-amber-500/10 via-orange-500/5 to-transparent transition duration-500 group-hover:translate-y-0"
                  />
                </article>
              ))}
            </section>
          </section>
          <aside className="relative">
            <div aria-hidden className="absolute inset-0 -translate-y-6 rounded-[2.75rem] bg-amber-100/70 blur-3xl dark:bg-amber-900/40" />
            <div className="relative rounded-[2.5rem] border border-amber-900/20 bg-amber-50/70 p-1 shadow-2xl shadow-amber-900/20 backdrop-blur-xl dark:border-amber-200/20 dark:bg-slate-950/60">
              <div className="absolute -top-16 right-10 h-24 w-24 rounded-full bg-gradient-to-br from-amber-400/50 to-orange-500/20 blur-3xl dark:from-amber-500/30 dark:to-orange-500/20 animate-gradient" aria-hidden />
              <div className="absolute bottom-10 left-10 h-20 w-20 rounded-full bg-orange-400/20 blur-2xl dark:bg-amber-500/20 animate-float-slow" aria-hidden />
              <AuthPanel
                variant="wide"
                className="border-transparent bg-amber-50/70 shadow-none ring-1 ring-amber-900/10 dark:bg-slate-950/70 dark:ring-amber-200/30"
                onAuthenticate={onAuthenticate}
              />
            </div>
            <p id="auth-panel" className="mt-6 text-center text-xs text-slate-600 dark:text-amber-200/70">
              No spam, no credit card – just a guided tour of the TableTorch command lantern.
            </p>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default LandingPage;
