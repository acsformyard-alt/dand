import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface RevealTorchAnimationHandle {
  startDim: () => void;
  stopDim: () => void;
  startBurn: () => void;
  stopBurn: () => void;
}

interface RevealTorchAnimationProps {
  className?: string;
}

const RevealTorchAnimation = forwardRef<RevealTorchAnimationHandle, RevealTorchAnimationProps>(
  ({ className }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [isReady, setIsReady] = useState(false);

    const combinedClassName = useMemo(() => {
      const base =
        'relative flex h-52 w-full max-w-[360px] overflow-hidden rounded-3xl border border-amber-400/50 bg-slate-950/40 shadow-[0_0_60px_rgba(251,191,36,0.25)]';
      return className ? `${base} ${className}` : base;
    }, [className]);

    const postMessage = useCallback(
      (type: 'dim-start' | 'dim-stop' | 'burn-start' | 'burn-stop' | 'cleanup') => {
        const targetWindow = iframeRef.current?.contentWindow;
        if (!targetWindow || !isReady) return;
        try {
          targetWindow.postMessage({ type }, window.location.origin);
        } catch (error) {
          console.error('Failed to communicate with reveal torch animation.', error);
        }
      },
      [isReady],
    );

    useImperativeHandle(
      ref,
      () => ({
        startDim: () => postMessage('dim-start'),
        stopDim: () => postMessage('dim-stop'),
        startBurn: () => postMessage('burn-start'),
        stopBurn: () => postMessage('burn-stop'),
      }),
      [postMessage],
    );

    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
        if (event.origin !== window.location.origin) return;
        if (event.data && event.data.type === 'reveal-torch-ready') {
          setIsReady(true);
        }
      };

      window.addEventListener('message', handleMessage);
      return () => {
        window.removeEventListener('message', handleMessage);
      };
    }, []);

    useEffect(
      () => () => {
        postMessage('cleanup');
      },
      [postMessage],
    );

    return (
      <div className={combinedClassName}>
        <iframe
          ref={iframeRef}
          title="Reveal confirmation torch"
          src="/dm-reveal-flame.html"
          className="h-full w-full border-0"
          allow="accelerometer; autoplay; fullscreen"
        />
        {!isReady && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/60 text-[10px] uppercase tracking-[0.4em] text-amber-200">
            Loading Flame…
          </div>
        )}
      </div>
    );
  },
);

RevealTorchAnimation.displayName = 'RevealTorchAnimation';

export default RevealTorchAnimation;
