import React, { useEffect, useRef, useState } from 'react';

interface RevealConfirmationAnimationProps {
  keepHiddenButton?: HTMLButtonElement | null;
  revealButton?: HTMLButtonElement | null;
}

type Nullable<T> = T | null | undefined;

type TorchStage = {
  destroy: () => void;
  flameNodes: any[];
  originalScales: Array<{ x: number; y: number }>;
  ember: any;
  smoke: any;
  dimHandlers: { enter: () => void; leave: () => void };
  burnHandlers: { enter: () => void; leave: () => void };
};

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

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.async = false;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });

const loadFromList = async (sources: string[]) => {
  let lastError: Nullable<Error> = null;
  for (const source of sources) {
    try {
      await loadScript(source);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown script load error');
    }
  }
  throw lastError ?? new Error('Unable to load script');
};

let torchDependencyPromise: Promise<void> | null = null;

const ensureTorchDependencies = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window is not available'));
  }

  if (!torchDependencyPromise) {
    torchDependencyPromise = (async () => {
      const global = window as any;
      if (!global.PIXI) {
        await loadFromList(CDN_SOURCES.pixi);
      }
      if (!global.PIXI?.filters) {
        await loadFromList(CDN_SOURCES.filters);
      }
      if (!global.TweenMax) {
        await loadFromList(CDN_SOURCES.gsap);
      }
      if (!global.PixiPlugin) {
        await loadFromList(CDN_SOURCES.gsapPixi);
      }
      if (!global.Power0) {
        await loadFromList(CDN_SOURCES.gsapEase);
      }
    })();
  }

  return torchDependencyPromise;
};

const DEFAULT_BACKGROUND_COLOR = 0x11111d;

type RGBAColor = { r: number; g: number; b: number; a: number };

const clamp255 = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const parseCssColor = (value: Nullable<string>): RGBAColor | null => {
  if (!value) return null;
  const color = value.trim();
  if (!color || color === 'transparent' || color === 'none') return null;
  const hexMatch = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((char) => char + char)
        .join('');
    }
    const int = Number.parseInt(hex, 16);
    return {
      r: (int >> 16) & 0xff,
      g: (int >> 8) & 0xff,
      b: int & 0xff,
      a: 1,
    };
  }
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
  if (rgbMatch) {
    const r = clamp255(Number.parseInt(rgbMatch[1], 10));
    const g = clamp255(Number.parseInt(rgbMatch[2], 10));
    const b = clamp255(Number.parseInt(rgbMatch[3], 10));
    const alphaRaw = rgbMatch[4] !== undefined ? Number.parseFloat(rgbMatch[4]) : 1;
    const a = Math.max(0, Math.min(1, Number.isFinite(alphaRaw) ? alphaRaw : 1));
    if (a <= 0) {
      return null;
    }
    return { r, g, b, a };
  }

  const modernRgbMatch = color.match(/rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)/i);
  if (modernRgbMatch) {
    const r = clamp255(Number.parseInt(modernRgbMatch[1], 10));
    const g = clamp255(Number.parseInt(modernRgbMatch[2], 10));
    const b = clamp255(Number.parseInt(modernRgbMatch[3], 10));
    const alphaRaw = modernRgbMatch[4] !== undefined ? Number.parseFloat(modernRgbMatch[4]) : 1;
    const a = Math.max(0, Math.min(1, Number.isFinite(alphaRaw) ? alphaRaw : 1));
    if (a <= 0) {
      return null;
    }
    return { r, g, b, a };
  }
  return null;
};

const compositeOver = (top: RGBAColor, bottom: RGBAColor): RGBAColor => {
  const a = top.a + bottom.a * (1 - top.a);
  if (a <= 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const r = (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a;
  const g = (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a;
  const b = (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a;
  return { r, g, b, a };
};

const rgbaToNumber = (value: RGBAColor) =>
  (clamp255(value.r) << 16) + (clamp255(value.g) << 8) + clamp255(value.b);

const numberToCssColor = (value: number) => `#${value.toString(16).padStart(6, '0')}`;

const createTorchStage = (canvasHost: HTMLElement): TorchStage | null => {
  const global = window as any;
  const PIXI = global.PIXI;
  const TweenMax = global.TweenMax;
  const Power0 = global.Power0;
  const Power1 = global.Power1;
  const Power2 = global.Power2;
  if (!PIXI || !TweenMax || !Power0 || !Power1 || !Power2) {
    return null;
  }

  const resolveBackgroundColor = (element: Nullable<HTMLElement>): number => {
    const defaultColor: RGBAColor = {
      r: (DEFAULT_BACKGROUND_COLOR >> 16) & 0xff,
      g: (DEFAULT_BACKGROUND_COLOR >> 8) & 0xff,
      b: DEFAULT_BACKGROUND_COLOR & 0xff,
      a: 1,
    };

    let node: Nullable<HTMLElement> = element ?? null;
    const visited = new Set<HTMLElement>();
    let accumulated: RGBAColor = { r: 0, g: 0, b: 0, a: 0 };

    while (node && !visited.has(node)) {
      visited.add(node);
      const style = window.getComputedStyle(node);
      const parsed =
        parseCssColor(style?.backgroundColor) ??
        parseCssColor(style?.background);
      if (parsed) {
        if (accumulated.a <= 0) {
          accumulated = parsed;
        } else {
          accumulated = compositeOver(accumulated, parsed);
        }
        if (accumulated.a >= 0.999) {
          break;
        }
      }
      node = node.parentElement && node.parentElement !== node ? node.parentElement : null;
    }

    if (accumulated.a < 0.999) {
      accumulated =
        accumulated.a <= 0
          ? defaultColor
          : compositeOver(accumulated, defaultColor);
    }

    return rgbaToNumber(accumulated);
  };

  const backgroundColor = resolveBackgroundColor(canvasHost);

  const Filters = PIXI.filters || {};
  const HasAdvancedBloom = Boolean(Filters.AdvancedBloomFilter);
  const HasBloom = Boolean(Filters.BloomFilter);

  const createAlphaFilter = () => {
    try {
      if (Filters.AlphaFilter) return new Filters.AlphaFilter();
      if (Filters.VoidFilter) return new Filters.VoidFilter();
      return new PIXI.Filter(undefined, undefined);
    } catch (error) {
      return null;
    }
  };

  class Ember {
    private emberBlobs: any[] = [];
    public embers: any;
    private _interval: Nullable<number>;

    constructor(colors: number[], app: any, pixelate = false) {
      this.emberBlobs = [];
      this.embers = new PIXI.Container();
      if (pixelate && Filters.PixelateFilter) {
        this.embers.filters = [new Filters.PixelateFilter()];
      }
      colors.forEach((color) => {
        const circle = new PIXI.Graphics();
        circle.lineStyle(0);
        circle.beginFill(color, 1);
        circle.drawCircle(0, 0, 10);
        circle.endFill();
        this.emberBlobs.push(app.renderer.generateTexture(circle));
      });
      this._interval = window.setInterval(() => {
        this.addEmber();
      }, 300);
    }

    private get time() {
      return 2 + Math.random() * 1.5;
    }

    private makeBlob() {
      const texture = this.emberBlobs[Math.floor(Math.random() * this.emberBlobs.length)];
      const blob = new PIXI.Sprite(texture);
      blob.anchor.set(0.5);
      const scaleScale = Math.random();
      blob.scale.set(0.4 * scaleScale, 0.5 * scaleScale);
      return blob;
    }

    public addEmber() {
      const time = this.time * (0.3 + Math.random() * 0.6);
      let blob = this.makeBlob();
      this.embers.addChild(blob);
      const bezier = [
        { x: Math.random() * 100 - 50, y: -100 },
        { x: Math.random() * 200 - 100, y: -120 + Math.random() * -20 },
        { x: Math.random() * 200 - 100, y: -150 + Math.random() * -50 },
        { x: Math.random() * 200 - 100, y: -200 + Math.random() * -50 },
        { x: Math.random() * 300 - 150, y: -250 + Math.random() * -100 },
        { x: Math.random() * 500 - 250, y: -500 + Math.random() * -150 },
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

    public stoke() {
      const amount = 40 + Math.round(Math.random() * 20);
      for (let i = 0; i < amount; i += 1) {
        this.addEmber();
      }
    }

    public burst(n: number) {
      for (let i = 0; i < n; i += 1) {
        this.addEmber();
      }
    }

    public destroy() {
      if (this._interval) {
        window.clearInterval(this._interval);
        this._interval = null;
      }
    }

    set y(value: number) {
      this.flame.position.y = value;
    }

    set x(value: number) {
      this.flame.position.x = value;
    }

    set scale(value: number) {
      this.flame.scale.set(value);
    }
  }

  class Smoke {
    public container: any;
    private texture: any;
    private app: any;
    private _interval: Nullable<number> = null;

    constructor(app: any) {
      this.app = app;
      this.container = new PIXI.Container();
      const g = new PIXI.Graphics();
      g.beginFill(0xffffff, 0.18);
      g.drawCircle(0, 0, 20);
      g.endFill();
      this.texture = app.renderer.generateTexture(g);
    }

    public puff(n: number) {
      for (let i = 0; i < n; i += 1) {
        this.addWisp();
      }
    }

    public start() {
      if (this._interval) return;
      this._interval = window.setInterval(() => {
        this.puff(2 + Math.floor(Math.random() * 2));
      }, 250);
    }

    public stop() {
      if (this._interval) {
        window.clearInterval(this._interval);
        this._interval = null;
      }
    }

    private addWisp() {
      const s = new PIXI.Sprite(this.texture);
      s.anchor.set(0.5);
      s.tint = 0xcfcfcf;
      s.alpha = 0;
      s.scale.set(0.6 + Math.random() * 0.6);
      s.position.set(Math.random() * 60 - 30, -30 + (Math.random() * 20 - 10));
      this.container.addChild(s);
      const rise = 180 + Math.random() * 140;
      const drift = Math.random() * 80 - 40;
      const rot = Math.random() * 0.6 - 0.3;
      const t = 2.6 + Math.random() * 1.2;
      TweenMax.to(s, 0.35, { alpha: 0.35, ease: Power1.easeOut });
      TweenMax.to(s, t, {
        pixi: {
          x: s.x + drift,
          y: s.y - rise,
          rotation: rot,
          scaleX: s.scale.x * 1.3,
          scaleY: s.scale.y * 1.3,
        },
        ease: Power1.easeOut,
        onComplete: () => {
          if (s && s.parent) s.parent.removeChild(s);
        },
      });
      TweenMax.to(s, 0.8, { delay: t - 0.8, alpha: 0, ease: Power1.easeIn });
    }
  }

  class Fire {
    public flame: any;
    private cutout: any;
    private fire: any;
    private fireBlob: any;
    private cutoutBlob: any;
    private _interval: Nullable<number>;

    constructor(color: number, app: any, pixelate = false) {
      this.flame = new PIXI.Container();
      this.cutout = new PIXI.Container();
      this.fire = new PIXI.Container();
      this.flame.addChild(this.fire);
      this.flame.addChild(this.cutout);
      this.fire.alpha = 0.7;
      const circle = new PIXI.Graphics();
      circle.lineStyle(0);
      circle.beginFill(color, 1);
      circle.drawCircle(0, 0, 35);
      circle.endFill();
      this.fireBlob = app.renderer.generateTexture(circle);
      const cutoutCircle = new PIXI.Graphics();
      cutoutCircle.lineStyle(0);
      cutoutCircle.beginFill(backgroundColor, 1);
      cutoutCircle.drawCircle(0, 0, 40);
      cutoutCircle.endFill();
      this.cutoutBlob = app.renderer.generateTexture(cutoutCircle);
      const filters = {
        bloom: HasAdvancedBloom
          ? new PIXI.filters.AdvancedBloomFilter(0.45, 0.5, 0.5)
          : HasBloom
          ? new PIXI.filters.BloomFilter()
          : null,
        pixel: pixelate && PIXI.filters.PixelateFilter ? new PIXI.filters.PixelateFilter() : createAlphaFilter(),
        void: createAlphaFilter(),
      };
      this.flame.filters = [filters.bloom, filters.pixel, filters.void].filter(Boolean);
      try {
        if (this.flame.filters && this.flame.filters.length) {
          this.flame.filters[this.flame.filters.length - 1].blendMode = PIXI.BLEND_MODES.SCREEN;
        }
      } catch (error) {
        // ignore
      }
      this._interval = window.setInterval(() => {
        this.addFlame();
        this.addCutout(Math.random() > 0.5);
      }, 50);
    }

    private get time() {
      return 1.8 + Math.random() * 0.8;
    }

    private makeBlob(texture: any) {
      const blob = new PIXI.Sprite(texture);
      blob.anchor.set(0.5);
      return blob;
    }

    private addCutout(left: boolean) {
      const time = this.time * (0.7 + Math.random() * 0.2);
      let blob = this.makeBlob(this.cutoutBlob);
      blob.tint = backgroundColor;
      this.cutout.addChild(blob);
      const scale = [1, 0.75 + Math.random() * 1];
      blob.position.x = (130 + Math.random() * 50) * (left ? -1 : 1);
      const targetX = (5 + Math.random() * 60) * (left ? -1 : 1);
      blob.scale.set(scale[0]);
      TweenMax.to(blob, time, {
        ease: Power1.easeIn,
        pixi: { x: targetX, y: -270, scaleX: scale[1], scaleY: scale[1] },
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
        { x: Math.random() * 100 - 50, y: Math.random() * -50 - 50 },
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
      if (this._interval) {
        window.clearInterval(this._interval);
        this._interval = null;
      }
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
          const kx = x + (Math.random() * 8 - 4);
          const ky = y0 + Math.random() * (y1 - y0 - 40) + 20;
          grain.lineStyle(0);
          grain.beginFill(streakColor, 0.18);
          grain.drawCircle(kx, ky, 3 + Math.random() * 2);
          grain.endFill();
        }
      }

      const emberDots = new PIXI.Container();
      const emberColors = [0x7a1a10, 0xa8320c, 0xcc5500, 0x8a2c12];
      const dotG = new PIXI.Graphics();
      dotG.beginFill(0xffffff, 1);
      dotG.drawCircle(0, 0, 2);
      dotG.endFill();
      const dotTexture = app.renderer.generateTexture(dotG);
      const count = 16 + Math.floor(Math.random() * 6);
      for (let i = 0; i < count; i += 1) {
        const s = new PIXI.Sprite(dotTexture);
        s.anchor.set(0.5);
        s.tint = emberColors[Math.floor(Math.random() * emberColors.length)];
        s.alpha = 0.45 + Math.random() * 0.25;
        s.x = Math.random() * 72 - 36;
        s.y = -6 + (Math.random() * 8 - 4);
        emberDots.addChild(s);
      }

      this.container.addChild(wood, band, head, grain, emberDots);
      this.container.position.set(0, 36);
    }
  }

  class Stage {
    public app: any;
    public stage: any;
    public flamesContainer: any;
    public flames: Fire[] = [];
    public _flameNodes: any[] = [];
    public _origScales: Array<{ x: number; y: number }> = [];
    public _ember: Ember;
    public _smoke: Smoke;
    private host: HTMLElement;
    private resizeObserver: Nullable<ResizeObserver>;

    constructor(canvas: HTMLElement, pixelate = false) {
      this.host = canvas;
      const width = canvas.clientWidth || 320;
      const height = canvas.clientHeight || 320;
      this.app = new PIXI.Application(width, height, {
        antialias: true,
        transparent: false,
        backgroundColor,
      });
      canvas.appendChild(this.app.view);
      const backgroundCss = numberToCssColor(backgroundColor);
      this.app.renderer.backgroundColor = backgroundColor;
      this.app.view.style.backgroundColor = backgroundCss;
      this.host.style.backgroundColor = backgroundCss;
      this.stage = new PIXI.Container();
      this.flamesContainer = new PIXI.Container();
      this.app.stage.addChild(this.stage);
      this.stage.addChild(this.flamesContainer);
      this.flamesContainer.scale.set(0.5);

      const torch = new Torch(this.app);
      this.flamesContainer.addChild(torch.container);

      const ember = new Ember([0xfe9c00, 0xfea600, 0xe27100], this.app, pixelate);
      this.flamesContainer.addChild(ember.embers);
      this._ember = ember;

      const smoke = new Smoke(this.app);
      this.flamesContainer.addChild(smoke.container);
      this._smoke = smoke;

      const flameSettings = [
        { color: 0xe23b00, scale: 1, offset: -30 },
        { color: 0xfe8200, scale: 1, offset: -10 },
        { color: 0xfbe416, scale: 0.9, offset: 10 },
        { color: 0xfdfdb4, scale: 0.7, offset: 30 },
      ];

      const BASE_FLAME_SCALE_MULT = 0.5;

      flameSettings.forEach((settings) => {
        const fire = new Fire(settings.color, this.app, pixelate);
        this.flames.push(fire);
        fire.y = settings.offset;
        fire.scale = settings.scale * BASE_FLAME_SCALE_MULT;
        fire.flame.pivot.set(0, 10);
        this.flamesContainer.addChild(fire.flame);
      });

      const edgeMask = new PIXI.Graphics();
      edgeMask.beginFill(0xffffff, 1);
      edgeMask.drawRoundedRect(-460, -780, 920, 1280, 140);
      edgeMask.endFill();
      this.flamesContainer.addChild(edgeMask);
      this.flamesContainer.mask = edgeMask;

      const flameNodes = this.flames.map((fire) => fire.flame);
      this._flameNodes = flameNodes.slice();
      this._origScales = flameNodes.map((node: any) => ({ x: node.scale.x, y: node.scale.y }));

      this.stage.position.set(width / 2, height * 0.82);

      const baseScale = Math.max(0.35, Math.min(width, height) / 600);
      this.flamesContainer.scale.set(baseScale);

      this.resizeObserver = new ResizeObserver(() => {
        this.onResize();
      });
      this.resizeObserver.observe(canvas);
      this.onResize();
    }

    public onResize() {
      const width = this.host.clientWidth || 320;
      const height = this.host.clientHeight || 320;
      this.app.renderer.resize(width, height);
      this.stage.position.set(width / 2, height * 0.82);
      const baseScale = Math.max(0.35, Math.min(width, height) / 600);
      this.flamesContainer.scale.set(baseScale);
    }

    public destroy() {
      this.resizeObserver?.disconnect();
      this._ember?.destroy();
      this._smoke?.stop();
      this.flames.forEach((fire) => fire.destroy());
      if (this.app) {
        this.app.destroy(true, { children: true, texture: true, baseTexture: true });
      }
      while (this.host.firstChild) {
        this.host.removeChild(this.host.firstChild);
      }
    }
  }

  const stage = new Stage(canvasHost, false);
  const nodes = stage._flameNodes;
  const orig = stage._origScales;
  const ember = stage._ember;
  const smoke = stage._smoke;

  const tweenFlames = (mult: number, alpha: number, dur: number) => {
    nodes.forEach((node: any, index: number) => {
      const base = orig[index];
      TweenMax.to(node.scale, dur, { ease: Power1.easeOut, x: base.x * mult, y: base.y * mult });
      TweenMax.to(node, dur, { ease: Power1.easeOut, alpha });
    });
  };

  const dimHandlers = {
    enter: () => {
      tweenFlames(0.01, 0, 0.18);
      smoke.puff(6);
      smoke.start();
    },
    leave: () => {
      tweenFlames(1, 1, 0.25);
      smoke.stop();
      smoke.puff(3);
    },
  };

  const burnHandlers = {
    enter: () => {
      nodes.forEach((node: any, index: number) => {
        const base = orig[index];
        TweenMax.to(node.scale, 0.25, { ease: Power1.easeOut, x: base.x * 1.25, y: base.y * 1.25 });
        TweenMax.to(node, 0.18, { ease: Power1.easeOut, alpha: 1 });
      });
      ember.burst(50);
      if (!stage['_burnInterval']) {
        stage['_burnInterval'] = window.setInterval(() => {
          ember.burst(12);
        }, 200);
      }
    },
    leave: () => {
      if (stage['_burnInterval']) {
        window.clearInterval(stage['_burnInterval']);
        stage['_burnInterval'] = null;
      }
      tweenFlames(1, 1, 0.25);
    },
  };

  return {
    destroy: () => {
      if (stage['_burnInterval']) {
        window.clearInterval(stage['_burnInterval']);
        stage['_burnInterval'] = null;
      }
      stage.destroy();
    },
    flameNodes: nodes,
    originalScales: orig,
    ember,
    smoke,
    dimHandlers,
    burnHandlers,
  };
};

const RevealConfirmationAnimation: React.FC<RevealConfirmationAnimationProps> = ({
  keepHiddenButton,
  revealButton,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<TorchStage | null>(null);
  const [stageReady, setStageReady] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    let rafId: number | null = null;

    const createStage = () => {
      if (isCancelled) return;
      const host = containerRef.current;
      if (!host) return;

      if (stageRef.current) {
        stageRef.current.destroy();
        stageRef.current = null;
      }

      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (isCancelled) return;
        const nextHost = containerRef.current;
        if (!nextHost) return;
        const createdStage = createTorchStage(nextHost);
        if (!createdStage) return;
        stageRef.current = createdStage;
        setStageReady(true);
      });
    };

    ensureTorchDependencies()
      .then(() => {
        if (isCancelled) return;
        setStageReady(false);
        createStage();
      })
      .catch(() => {
        // Ignore loading errors; animation is purely decorative.
      });

    return () => {
      isCancelled = true;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (stageRef.current) {
        stageRef.current.destroy();
        stageRef.current = null;
      }
      setStageReady(false);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stageReady || !stage) return undefined;

    const keepHidden = keepHiddenButton;
    const reveal = revealButton;

    if (!keepHidden && !reveal) {
      return undefined;
    }

    if (keepHidden) {
      keepHidden.addEventListener('mouseenter', stage.dimHandlers.enter);
      keepHidden.addEventListener('mouseleave', stage.dimHandlers.leave);
    }

    if (reveal) {
      reveal.addEventListener('mouseenter', stage.burnHandlers.enter);
      reveal.addEventListener('mouseleave', stage.burnHandlers.leave);
    }

    return () => {
      if (keepHidden) {
        keepHidden.removeEventListener('mouseenter', stage.dimHandlers.enter);
        keepHidden.removeEventListener('mouseleave', stage.dimHandlers.leave);
      }
      if (reveal) {
        reveal.removeEventListener('mouseenter', stage.burnHandlers.enter);
        reveal.removeEventListener('mouseleave', stage.burnHandlers.leave);
      }
    };
  }, [keepHiddenButton, revealButton, stageReady]);

  return <div ref={containerRef} className="mx-auto h-40 w-40 sm:h-52 sm:w-52" aria-hidden="true" />;
};

export default RevealConfirmationAnimation;
