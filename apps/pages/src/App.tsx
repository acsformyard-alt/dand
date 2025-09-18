import React, { useEffect, useMemo, useState } from "react";
import BuildPage from "./pages/BuildPage";
import PlayPage from "./pages/PlayPage";
import { AuthProvider, useAuth } from "./context/AuthContext";

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
};

const AppShell: React.FC = () => {
  const { user, login, signup, logout, loading } = useAuth();
  const [mode, setMode] = useState<"play" | "build">("play");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  });
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "", displayName: "Dungeon Master" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("dnd-map-reveal/theme", theme);
  }, [theme]);

  useEffect(() => {
    const storedTheme = localStorage.getItem("dnd-map-reveal/theme");
    if (storedTheme === "dark" || storedTheme === "light") {
      setTheme(storedTheme);
    }
  }, []);

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (authMode === "login") {
        await login(authForm.email, authForm.password);
      } else {
        await signup(authForm.email, authForm.password, authForm.displayName);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const canAccessBuild = Boolean(user);

  const modeLabel = useMemo(() => (mode === "play" ? "Player View" : "DM Build"), [mode]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-light/90 text-slate-600 dark:bg-surface-dark/95 dark:text-slate-300">
        Loading account…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-light/90 pb-16 text-slate-900 transition-colors duration-300 dark:bg-surface-dark/95 dark:text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-wide">D&D Map Reveal</h1>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Cloudflare Pages + Workers</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-2 py-1 text-xs font-semibold shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => setMode("play")}
                className={`rounded-full px-3 py-1 ${mode === "play" ? "bg-indigo-600 text-white shadow" : "text-slate-600 dark:text-slate-300"}`}
              >
                Play Mode
              </button>
              <button
                type="button"
                onClick={() => setMode("build")}
                className={`rounded-full px-3 py-1 ${mode === "build" ? "bg-emerald-600 text-white shadow" : "text-slate-600 dark:text-slate-300"}`}
              >
                Build Mode
              </button>
            </div>
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
              className="rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {theme === "light" ? "☀️" : "🌙"}
            </button>
            {user ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full bg-slate-900/80 px-3 py-1 font-semibold text-white dark:bg-slate-100 dark:text-slate-900">{user.displayName}</span>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"
                >
                  Logout
                </button>
              </div>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400">Guest</span>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {modeLabel}: DM uploads maps to R2, stores metadata in D1, and orchestrates live reveals through Durable Objects-backed WebSockets.
        </p>
        {mode === "build" && !canAccessBuild ? (
          <section className="mx-auto w-full max-w-2xl rounded-xl border border-slate-200 bg-white/80 p-8 text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100">
            <h2 className="text-xl font-semibold">Sign in as Dungeon Master</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Create an account to manage campaigns and sessions.</p>
            <form onSubmit={handleAuthSubmit} className="mt-4 space-y-4">
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Email</span>
                <input
                  type="email"
                  required
                  value={authForm.email}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Password</span>
                <input
                  type="password"
                  required
                  value={authForm.password}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
                />
              </label>
              {authMode === "signup" && (
                <label className="block text-sm">
                  <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Display name</span>
                  <input
                    type="text"
                    required
                    value={authForm.displayName}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, displayName: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
                  />
                </label>
              )}
              {error && <div className="rounded-md border border-rose-400 bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</div>}
              <button
                type="submit"
                className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500"
              >
                {authMode === "login" ? "Login" : "Sign Up"}
              </button>
              <button
                type="button"
                onClick={() => setAuthMode((prev) => (prev === "login" ? "signup" : "login"))}
                className="w-full text-center text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
              >
                {authMode === "login" ? "Need an account? Sign up" : "Already have an account? Login"}
              </button>
            </form>
          </section>
        ) : mode === "build" ? (
          <BuildPage />
        ) : (
          <PlayPage />
        )}
      </main>
      <footer className="mt-16 border-t border-slate-200 bg-white/80 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
        Built for Cloudflare Pages & Workers — R2 for assets, D1 for metadata, Durable Objects for realtime reveals.
      </footer>
    </div>
  );
};

export default App;
