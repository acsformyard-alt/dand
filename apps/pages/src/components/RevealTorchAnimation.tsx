import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface RevealTorchHandle {
  dimStart: () => void;
  dimStop: () => void;
  burnStart: () => void;
  burnStop: () => void;
}

type StageControls = RevealTorchHandle & { destroy: () => void };

const CDN_SOURCES = {
  pixi: [
    'https://cdnjs.cloudflare.com/ajax/libs/pixi.js/4.8.9/pixi.min.js',
    'https://unpkg.com/pixi.js@4.8.9/dist/pixi.min.js',
    'https://cdn.jsdelivr.net/npm/pixi.js@4.8.9/dist/pixi.min.js',
  ],
  filters: [
    'https://cdnjs.cloudflare.com/ajax/libs/pixi-filters/1.0.8/filters.min.js',
    'https://unpkg.com/pixi-filters@1.0.8/dist/pixi-filters.min.js',
    'https://cdn.jsdelivr.net/npm/pixi-filters@1.0.8/dist/pixi-filters.min.js',
  ],
  gsap: [
    'https://cdnjs.cloudflare.com/ajax/libs/gsap/2.1.3/TweenMax.min.js',
    'https://unpkg.com/gsap@2.1.3/TweenMax.min.js',
    'https://cdn.jsdelivr.net/npm/gsap@2.1.3/TweenMax.min.js',
  ],
  gsapPixi: [
    'https://cdnjs.cloudflare.com/ajax/libs/gsap/2.1.3/plugins/PixiPlugin.min.js',
    'https://unpkg.com/gsap@2.1.3/src/minified/plugins/PixiPlugin.min.js',
    'https://cdn.jsdelivr.net/npm/gsap@2.1.3/src/minified/plugins/PixiPlugin.min.js',
  ],
  gsapEase: [
    'https://cdnjs.cloudflare.com/ajax/libs/gsap/2.1.3/easing/EasePack.min.js',
    'https://unpkg.com/gsap@2.1.3/src/minified/easing/EasePack.min.js',
    'https://cdn.jsdelivr.net/npm/gsap@2.1.3/src/minified/easing/EasePack.min.js',
  ],
};

let loadPromise: Promise<void> | null = null;

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      if ((existing as HTMLScriptElement).dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)));
      return;
    }

    const script = document.createElement('script');
    script.src = url;
    script.async = false;
    script.dataset.loaded = 'false';
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)));
    document.head.appendChild(script);
  });
}

async function loadFromList(urls: string[]): Promise<void> {
  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      await loadScript(url);
      return;
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError ?? new Error('Failed to load script');
}

async function ensureExternalLibrariesLoaded(): Promise<void> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    await loadFromList(CDN_SOURCES.pixi);
    await loadFromList(CDN_SOURCES.filters);
    await loadFromList(CDN_SOURCES.gsap);
    await loadFromList(CDN_SOURCES.gsapPixi);
    await loadFromList(CDN_SOURCES.gsapEase);
  })();

  return loadPromise;
}

function createTorchStage(canvasContainer: HTMLElement): StageControls {
  const PIXI = (window as any).PIXI;
  const TweenMax = (window as any).TweenMax;
  const TimelineMax = (window as any).TimelineMax;
  const Power0 = (window as any).Power0;
  const Power1 = (window as any).Power1;
  const Power2 = (window as any).Power2;
  const Bounce = (window as any).Bounce;

  if (!PIXI || !TweenMax || !TimelineMax || !Power1 || !Power2) {
    throw new Error('Required animation libraries are not available');
  }

  class Ember {
    private emberBlobs: any[] = [];
    public embers: any;
    private interval: ReturnType<typeof setInterval> | null = null;

    constructor(colors: number[], app: any) {
      this.embers = new PIXI.Container();
      colors.forEach((color) => {
        const circle = new PIXI.Graphics();
        circle.lineStyle(0);
        circle.beginFill(color, 1);
        circle.drawCircle(0, 0, 10);
        circle.endFill();
        this.emberBlobs.push(app.renderer.generateTexture(circle));
      });
      this.interval = setInterval(() => this.addEmber(), 300);
    }

    private makeBlob() {
      const texture = this.emberBlobs[Math.floor(Math.random() * this.emberBlobs.length)];
      const blob = new PIXI.Sprite(texture);
      blob.anchor.set(0.5);
      const scaleScale = Math.random();
      blob.scale.set(0.4 * scaleScale, 0.5 * scaleScale);
      return blob;
    }

    private get time() {
      return 2 + Math.random() * 1.5;
    }

    public addEmber() {
      const time = this.time * (0.3 + Math.random() * 0.6);
      let blob = this.makeBlob();
      this.embers.addChild(blob);
      const bezier = [
        { x: Math.random() * 100 - 50, y: -100 },
        { x: Math.random() * 200 - 100, y: -120 + Math.random() * -20 },
        { x: Math.random() * 200 - 100, y: -150 + Math.random() * -50 },
        { x: Math.random() * 300 - 150, y: -220 + Math.random() * -80 },
      ];
      TweenMax.to(blob, time / 2, { delay: time / 2, ease: Power1.easeOut, alpha: 0 });
      TweenMax.to(blob.position, time, {
        ease: Power1.easeOut,
        bezier,
        onComplete: () => {
          if (blob && blob.parent) blob.parent.removeChild(blob);
          blob = null;
        },
      });
    }

    public burst(amount: number) {
      for (let i = 0; i < amount; i += 1) {
        this.addEmber();
      }
    }

    public destroy() {
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
      this.embers.removeChildren();
    }
  }

  class Smoke {
    public container: any;
    private texture: any;
    private app: any;
    private interval: ReturnType<typeof setInterval> | null = null;

    constructor(app: any) {
      this.app = app;
      this.container = new PIXI.Container();
      const g = new PIXI.Graphics();
      g.beginFill(0xffffff, 0.18);
      g.drawCircle(0, 0, 20);
      g.endFill();
      this.texture = app.renderer.generateTexture(g);
    }

    private addWisp() {
      const sprite = new PIXI.Sprite(this.texture);
      sprite.anchor.set(0.5);
      sprite.tint = 0xcfcfcf;
      sprite.alpha = 0;
      sprite.scale.set(0.6 + Math.random() * 0.6);
      sprite.position.set(Math.random() * 60 - 30, -30 + (Math.random() * 20 - 10));
      this.container.addChild(sprite);
      const rise = 160 + Math.random() * 120;
      const drift = Math.random() * 80 - 40;
      const rotation = Math.random() * 0.6 - 0.3;
      const duration = 2.6 + Math.random() * 1.2;
      TweenMax.to(sprite, 0.35, { alpha: 0.35, ease: Power1.easeOut });
      TweenMax.to(sprite, duration, {
        pixi: {
          x: sprite.x + drift,
          y: sprite.y - rise,
          rotation,
          scaleX: sprite.scale.x * 1.3,
          scaleY: sprite.scale.y * 1.3,
        },
        ease: Power1.easeOut,
        onComplete: () => {
          if (sprite && sprite.parent) sprite.parent.removeChild(sprite);
        },
      });
      TweenMax.to(sprite, 0.8, { delay: duration - 0.8, alpha: 0, ease: Power1.easeIn });
    }

    public puff(count: number) {
      for (let i = 0; i < count; i += 1) {
        this.addWisp();
      }
    }

    public start() {
      if (this.interval) return;
      this.interval = setInterval(() => this.puff(2 + Math.floor(Math.random() * 2)), 250);
    }

    public stop() {
      if (!this.interval) return;
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  class Fire {
    public flame: any;
    private fire: any;
    private cutout: any;
    private fireBlob: any;
    private cutoutBlob: any;
    private interval: ReturnType<typeof setInterval> | null = null;

    constructor(color: number, app: any) {
      this.flame = new PIXI.Container();
      this.fire = new PIXI.Container();
      this.cutout = new PIXI.Container();
      this.flame.addChild(this.fire);
      this.flame.addChild(this.cutout);
      this.fire.alpha = 0.7;

      const fireCircle = new PIXI.Graphics();
      fireCircle.lineStyle(0);
      fireCircle.beginFill(color, 1);
      fireCircle.drawCircle(0, 0, 35);
      fireCircle.endFill();
      this.fireBlob = app.renderer.generateTexture(fireCircle);

      const cutoutCircle = new PIXI.Graphics();
      cutoutCircle.lineStyle(0);
      cutoutCircle.beginFill(0x000000, 1);
      cutoutCircle.drawCircle(0, 0, 40);
      cutoutCircle.endFill();
      this.cutoutBlob = app.renderer.generateTexture(cutoutCircle);

      const filters = PIXI.filters ?? {};
      const hasAdvancedBloom = Boolean(filters.AdvancedBloomFilter);
      const hasBloom = Boolean(filters.BloomFilter);
      const createVoidFilter = () => {
        try {
          if (filters.VoidFilter) return new filters.VoidFilter();
          return new PIXI.Filter(undefined, undefined);
        } catch (_error) {
          return null;
        }
      };

      const bloom = hasAdvancedBloom
        ? new PIXI.filters.AdvancedBloomFilter(0.45, 0.5, 0.5)
        : hasBloom
        ? new PIXI.filters.BloomFilter()
        : null;
      const pixel = createVoidFilter();
      const voidFilter = createVoidFilter();
      this.flame.filters = [bloom, pixel, voidFilter].filter(Boolean);
      try {
        if (this.flame.filters && this.flame.filters.length) {
          this.flame.filters[this.flame.filters.length - 1].blendMode = PIXI.BLEND_MODES.SCREEN;
        }
      } catch (error) {
        console.warn('Failed to set blend mode', error);
      }

      this.interval = setInterval(() => {
        this.addFlame();
        this.addCutout(Math.random() > 0.5);
      }, 50);
    }

    private makeBlob(texture: any) {
      const blob = new PIXI.Sprite(texture);
      blob.anchor.set(0.5);
      return blob;
    }

    private get time() {
      return 1.8 + Math.random() * 0.8;
    }

    private addCutout(left: boolean) {
      const time = this.time * (0.7 + Math.random() * 0.2);
      let blob = this.makeBlob(this.cutoutBlob);
      this.cutout.addChild(blob);
      const scale = [1, 0.75 + Math.random() * 1];
      blob.position.x = (120 + Math.random() * 40) * (left ? -1 : 1);
      const targetX = (5 + Math.random() * 60) * (left ? -1 : 1);
      blob.scale.set(scale[0]);
      TweenMax.to(blob, time, {
        ease: Power1.easeIn,
        pixi: { x: targetX, y: -260, scaleX: scale[1], scaleY: scale[1] },
        onComplete: () => {
          if (blob && blob.parent) blob.parent.removeChild(blob);
          blob = null;
        },
      });
    }

    private addFlame() {
      const time = this.time;
      let blob = this.makeBlob(this.fireBlob);
      this.fire.addChild(blob);
      const scale = [1.2 + Math.random(), 0.5 + Math.random()];
      const bezier = [
        { x: 0, y: 0 },
        { x: Math.random() * 100 - 50, y: Math.random() * -20 },
        { x: Math.random() * 100 - 50, y: -50 + Math.random() * -50 },
        { x: 0, y: -150 + Math.random() * -100 },
      ];
      blob.scale.set(scale[0]);
      TweenMax.to(blob, time, { ease: Power1.easeIn, bezier });
      TweenMax.to(blob, time, {
        pixi: { scaleX: scale[1], scaleY: scale[1] },
        ease: Power0.easeOut,
        onComplete: () => {
          if (blob && blob.parent) blob.parent.removeChild(blob);
          blob = null;
        },
      });
    }

    public destroy() {
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
      this.flame.destroy({ children: true });
    }
  }

  class Torch {
    public container: any;

    constructor(app: any) {
      this.container = new PIXI.Container();

      const wood = new PIXI.Graphics();
      wood.beginFill(0x6b3e1e, 1);
      const cone = new PIXI.Polygon([-36, 0, 36, 0, 20, 220, -20, 220]);
      wood.drawPolygon(cone);
      wood.endFill();

      const band = new PIXI.Graphics();
      band.beginFill(0x3b2314, 1);
      band.drawRoundedRect(-44, 6, 88, 18, 6);
      band.endFill();

      const head = new PIXI.Graphics();
      head.beginFill(0x2b1b12, 1);
      head.drawRoundedRect(-44, -10, 88, 20, 6);
      head.endFill();

      const grain = new PIXI.Graphics();
      const streakColor = 0x4f2b14;
      const streaks = 8 + Math.floor(Math.random() * 4);
      for (let i = 0; i < streaks; i += 1) {
        const x = -28 + Math.random() * 56;
        const y0 = 8 + Math.random() * 12;
        const y1 = 210 + Math.random() * 6;
        const cx1 = x + (Math.random() * 10 - 5);
        const cx2 = x + (Math.random() * 10 - 5);
        grain.lineStyle(2, streakColor, 0.22);
        grain.moveTo(x, y0);
        grain.bezierCurveTo(cx1, (y0 + y1) / 2 - 40, cx2, (y0 + y1) / 2 + 40, x, y1);
        if (Math.random() < 0.35) {
          const knotX = x + (Math.random() * 8 - 4);
          const knotY = y0 + Math.random() * (y1 - y0 - 40) + 20;
          grain.lineStyle(0);
          grain.beginFill(streakColor, 0.18);
          grain.drawCircle(knotX, knotY, 3 + Math.random() * 2);
          grain.endFill();
        }
      }

      const emberDots = new PIXI.Container();
      const emberColors = [0x7a1a10, 0xa8320c, 0xcc5500, 0x8a2c12];
      const dotGraphic = new PIXI.Graphics();
      dotGraphic.beginFill(0xffffff, 1);
      dotGraphic.drawCircle(0, 0, 2);
      dotGraphic.endFill();
      const dotTexture = app.renderer.generateTexture(dotGraphic);
      const count = 16 + Math.floor(Math.random() * 6);
      for (let i = 0; i < count; i += 1) {
        const sprite = new PIXI.Sprite(dotTexture);
        sprite.anchor.set(0.5);
        sprite.tint = emberColors[Math.floor(Math.random() * emberColors.length)];
        sprite.alpha = 0.45 + Math.random() * 0.25;
        sprite.x = Math.random() * 72 - 36;
        sprite.y = -6 + (Math.random() * 8 - 4);
        emberDots.addChild(sprite);
      }

      this.container.addChild(wood, band, head, grain, emberDots);
    }
  }

  class Stage {
    public app: any;
    public flames: Fire[] = [];
    public stage: any;
    public flamesContainer: any;
    public _flameNodes: any[] = [];
    public _origScales: { x: number; y: number }[] = [];
    public _ember: Ember;
    public _smoke: Smoke;
    public _burnInterval: ReturnType<typeof setInterval> | null = null;
    private resizeObserver?: ResizeObserver;
    private stokeAnimation: any;
    private handleCanvasClick: () => void;

    constructor(container: HTMLElement) {
      const width = container.clientWidth || 320;
      const height = container.clientHeight || 320;
      this.app = new PIXI.Application({
        width,
        height,
        antialias: true,
        backgroundAlpha: 0,
      });
      container.innerHTML = '';
      container.appendChild(this.app.view);
      this.app.view.style.width = '100%';
      this.app.view.style.height = '100%';

      this.stage = new PIXI.Container();
      this.flamesContainer = new PIXI.Container();
      this.app.stage.addChild(this.stage);
      this.stage.addChild(this.flamesContainer);
      this.flamesContainer.scale.set(0.5);

      const torch = new Torch(this.app);
      torch.container.position.set(0, 36);
      this.flamesContainer.addChild(torch.container);

      this._ember = new Ember([0xfe9c00, 0xfea600, 0xe27100], this.app);
      this.flamesContainer.addChild(this._ember.embers);

      this._smoke = new Smoke(this.app);
      this.flamesContainer.addChild(this._smoke.container);

      const flamesConfig = [
        { color: 0xe23b00, scale: 1, offset: -30 },
        { color: 0xfe8200, scale: 1, offset: -10 },
        { color: 0xfbe416, scale: 0.9, offset: 10 },
        { color: 0xfdfdb4, scale: 0.7, offset: 30 },
      ];

      const BASE_SCALE = 0.5;

      flamesConfig.forEach((settings) => {
        const fire = new Fire(settings.color, this.app);
        this.flames.push(fire);
        fire.flame.position.y = settings.offset;
        fire.flame.scale.set(settings.scale * BASE_SCALE);
        fire.flame.pivot.set(0, 10);
        this.flamesContainer.addChild(fire.flame);
      });

      const edgeMask = new PIXI.Graphics();
      edgeMask.beginFill(0xffffff, 1);
      edgeMask.drawRoundedRect(-460, -780, 920, 1280, 140);
      edgeMask.endFill();
      this.flamesContainer.addChild(edgeMask);
      this.flamesContainer.mask = edgeMask;

      this._flameNodes = this.flames.map((fire) => fire.flame);
      this._origScales = this._flameNodes.map((node: any) => ({ x: node.scale.x, y: node.scale.y }));

      const timelineTargets = this._flameNodes.slice(0, -1);
      this.stokeAnimation = new TimelineMax({ paused: true });
      this.stokeAnimation.to(timelineTargets, 0.3, {
        ease: Power2.easeOut,
        pixi: { scaleY: 1.2, scaleX: 1.15 },
      });
      this.stokeAnimation.to(timelineTargets, 1.4, {
        ease: Bounce.easeOut,
        pixi: { scaleY: 1, scaleX: 1 },
      });

      this.handleCanvasClick = () => {
        this._ember.burst(20);
        this.stokeAnimation.restart();
      };
      this.app.view.addEventListener('click', this.handleCanvasClick);

      this.handleResize(width, height);

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (entry.target === container) {
              const rect = entry.contentRect;
              this.handleResize(rect.width, rect.height);
            }
          }
        });
        this.resizeObserver.observe(container);
      }
    }

    private handleResize(width: number, height: number) {
      this.app.renderer.resize(width || 320, height || 320);
      this.stage.position.set((width || 320) / 2, (height || 320) - 20);
    }

    public tweenFlames(multiplier: number, alpha: number, duration: number) {
      this._flameNodes.forEach((node, index) => {
        const original = this._origScales[index];
        TweenMax.to(node.scale, duration, {
          ease: Power1.easeOut,
          x: original.x * multiplier,
          y: original.y * multiplier,
        });
        TweenMax.to(node, duration, { ease: Power1.easeOut, alpha });
      });
    }

    public dimStart() {
      this.tweenFlames(0.01, 0, 0.18);
      this._smoke.puff(6);
      this._smoke.start();
    }

    public dimStop() {
      this.tweenFlames(1, 1, 0.25);
      this._smoke.stop();
      this._smoke.puff(3);
    }

    public burnStart() {
      this._flameNodes.forEach((node, index) => {
        const original = this._origScales[index];
        TweenMax.to(node.scale, 0.28, {
          ease: Power1.easeOut,
          x: original.x * 2.3,
          y: original.y * 2.3,
        });
        TweenMax.to(node, 0.18, { ease: Power1.easeOut, alpha: 1 });
        TweenMax.to(node.scale, 0.6, {
          delay: 0.28,
          ease: Power2.easeOut,
          x: original.x * 2.5,
          y: original.y * 2.5,
        });
      });
      this._ember.burst(50);
      if (!this._burnInterval) {
        this._burnInterval = setInterval(() => this._ember.burst(12), 200);
      }
    }

    public burnStop() {
      if (this._burnInterval) {
        clearInterval(this._burnInterval);
        this._burnInterval = null;
      }
      this.tweenFlames(1, 1, 0.25);
    }

    public destroy() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = undefined;
      }
      if (this.handleCanvasClick) {
        this.app.view.removeEventListener('click', this.handleCanvasClick);
      }
      if (this.stokeAnimation) {
        this.stokeAnimation.kill();
        this.stokeAnimation = null;
      }
      if (this._burnInterval) {
        clearInterval(this._burnInterval);
        this._burnInterval = null;
      }
      this._ember.destroy();
      this._smoke.stop();
      this.flames.forEach((fire) => fire.destroy());
      this.app.destroy(true);
    }
  }

  const stage = new Stage(canvasContainer);

  return {
    dimStart: () => stage.dimStart(),
    dimStop: () => stage.dimStop(),
    burnStart: () => stage.burnStart(),
    burnStop: () => stage.burnStop(),
    destroy: () => stage.destroy(),
  };
}

export const RevealTorchAnimation = forwardRef<RevealTorchHandle>((_props, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<StageControls | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function boot() {
      try {
        await ensureExternalLibrariesLoaded();
        if (!isMounted) return;
        const container = containerRef.current;
        if (!container) return;
        stageRef.current = createTorchStage(container);
      } catch (error) {
        console.error('Failed to initialise reveal animation', error);
      }
    }

    boot();

    return () => {
      isMounted = false;
      stageRef.current?.destroy();
      stageRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      dimStart: () => stageRef.current?.dimStart(),
      dimStop: () => stageRef.current?.dimStop(),
      burnStart: () => stageRef.current?.burnStart(),
      burnStop: () => stageRef.current?.burnStop(),
    }),
  );

  return (
    <div
      ref={containerRef}
      className="relative h-48 w-full overflow-hidden rounded-2xl"
      aria-hidden="true"
    />
  );
});

RevealTorchAnimation.displayName = 'RevealTorchAnimation';

