import React from 'react';

interface TorchLogoProps {
  theme: 'light' | 'dark';
  label?: string;
  className?: string;
  showTagline?: boolean;
  tagline?: string;
}

const combineClasses = (...classes: Array<string | undefined | false | null>) =>
  classes.filter(Boolean).join(' ');

const TorchLogo: React.FC<TorchLogoProps> = ({
  theme,
  label = 'TableTorch',
  className,
  showTagline = true,
  tagline = 'Ignite every tabletop reveal.',
}) => {
  const haloStyles: React.CSSProperties | undefined =
    theme === 'dark'
      ? {
          background: 'radial-gradient(circle, rgba(253, 230, 138, 0.55) 0%, rgba(253, 230, 138, 0) 70%)',
        }
      : undefined;

  return (
    <div className={combineClasses('relative flex items-center gap-4', className)}>
      <div className="relative">
        {theme === 'dark' && (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-3 rounded-full opacity-80"
            style={haloStyles}
          />
        )}
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-amber-200/80 text-2xl shadow-inner shadow-amber-900/30 ring-2 ring-amber-900/20 dark:bg-amber-300/30 dark:text-amber-100 dark:shadow-amber-900/70 dark:ring-amber-500/30">
          <span aria-hidden role="img">
            🔥
          </span>
          <span className="sr-only">{label}</span>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.45em] text-amber-800/80 dark:text-amber-200/70">{label}</p>
        {showTagline && <p className="text-lg font-semibold text-stone-900 dark:text-amber-100">{tagline}</p>}
      </div>
    </div>
  );
};

export default TorchLogo;
