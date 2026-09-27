import { renderToCanvas, viewportFor } from '../backends/canvas2d';
import type { CanvasFactory, CanvasLike, RasterViewport } from '../backends/canvas2d';
import { frame } from '../core/frame';
import { layout } from '../core/layout';
import { build } from '../core/model';
import type { Model, RenderSpec } from '../core/model';

// Design's draw-on timing (creatures 1500ms / icons 700ms, easeInOutQuad) — the app's version of
// this lives in its own shared motion runtime; the web element has no such runtime to depend on,
// so it carries its own small, self-contained copy.
const DRAW_ON_MS_CREATURE = 1500;
const DRAW_ON_MS_ICON = 700;
const ROOT_MARGIN = '150px';
const DEFAULT_SIZE_PX = 96;

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function domCanvasFactory(width: number, height: number): CanvasLike {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas as unknown as CanvasLike;
}

const CANVAS_FACTORY: CanvasFactory = domCanvasFactory;

/**
 * `<critter-sticker kind="gecko" pose="idle" size="96">` — the web runtime's sticker element:
 * static WebP fallback (`webp-src`, for no-JS/LCP), IO-lazy canvas allocation + draw-on (only
 * elements within `rootMargin: 150px` of the viewport ever allocate a canvas), `prefers-reduced-motion`
 * = static final frame, tap replay, and `disconnectedCallback` frees the canvas.
 */
export class CritterStickerElement extends HTMLElement {
  static readonly tagName = 'critter-sticker';

  #observer: IntersectionObserver | undefined;
  #canvas: HTMLCanvasElement | undefined;
  #img: HTMLImageElement | undefined;
  #rafId: number | undefined;
  #model: Model | undefined;
  #viewport: RasterViewport | undefined;

  connectedCallback(): void {
    const size = this.sizePx;
    if (!this.style.width) this.style.width = `${size}px`;
    if (!this.style.height) this.style.height = `${size}px`;
    if (!this.style.display) this.style.display = 'inline-block';

    const webpSrc = this.getAttribute('webp-src');
    if (webpSrc) {
      const img = document.createElement('img');
      img.src = webpSrc;
      img.alt = this.getAttribute('alt') ?? '';
      img.style.width = '100%';
      img.style.height = '100%';
      this.#img = img;
      this.appendChild(img);
    }

    this.addEventListener('click', this.#onTap);
    this.#observer = new IntersectionObserver(this.#onIntersect, { rootMargin: ROOT_MARGIN });
    this.#observer.observe(this);
  }

  disconnectedCallback(): void {
    this.#observer?.disconnect();
    this.#observer = undefined;
    this.removeEventListener('click', this.#onTap);
    this.#freeCanvas();
  }

  get sizePx(): number {
    return Number(this.getAttribute('size') ?? DEFAULT_SIZE_PX);
  }

  get renderSpec(): RenderSpec {
    const kind = this.getAttribute('kind');
    if (!kind) throw new Error('<critter-sticker> requires a "kind" attribute');
    const pose = this.getAttribute('pose');
    const variant = this.getAttribute('variant');
    const seed = Number(this.getAttribute('seed') ?? 7);
    return {
      kind,
      seed,
      ...(pose ? { pose: pose as NonNullable<RenderSpec['pose']> } : {}),
      ...(variant ? { variant: variant as NonNullable<RenderSpec['variant']> } : {}),
    };
  }

  /** Whether this element has allocated its canvas — visible for tests, not a public contract. */
  get hasCanvas(): boolean {
    return this.#canvas !== undefined;
  }

  #onIntersect = (entries: readonly IntersectionObserverEntry[]): void => {
    for (const entry of entries) {
      if (entry.isIntersecting) this.#activate();
    }
  };

  #activate(): void {
    if (this.#canvas) return;

    const sizePt = this.sizePx;
    this.#model = build(this.renderSpec, sizePt);
    const deviceScale = window.devicePixelRatio || 1;
    this.#viewport = viewportFor(layout(this.renderSpec, sizePt), deviceScale);

    const canvas = document.createElement('canvas');
    canvas.width = this.#viewport.widthPx;
    canvas.height = this.#viewport.heightPx;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('aria-hidden', 'true');
    this.#canvas = canvas;
    this.appendChild(canvas);
    if (this.#img) this.#img.style.display = 'none';

    if (prefersReducedMotion()) {
      this.#paint(1);
      return;
    }
    this.#playDrawOn();
  }

  #paint(p: number): void {
    if (!this.#canvas || !this.#model || !this.#viewport) return;
    const rendered = renderToCanvas(frame(this.#model, p), this.#viewport, CANVAS_FACTORY);
    const ctx = this.#canvas.getContext('2d');
    ctx?.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    ctx?.drawImage(rendered as unknown as CanvasImageSource, 0, 0);
  }

  #playDrawOn(): void {
    if (this.#rafId !== undefined) cancelAnimationFrame(this.#rafId);
    const durationMs = this.hasAttribute('icon') ? DRAW_ON_MS_ICON : DRAW_ON_MS_CREATURE;
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / durationMs);
      this.#paint(easeInOutQuad(t));
      this.#rafId = t < 1 ? requestAnimationFrame(step) : undefined;
    };
    this.#rafId = requestAnimationFrame(step);
  }

  #onTap = (): void => {
    if (!this.#canvas || prefersReducedMotion()) return;
    this.#playDrawOn();
  };

  #freeCanvas(): void {
    if (this.#rafId !== undefined) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = undefined;
    }
    if (this.#canvas) {
      this.#canvas.width = 0;
      this.#canvas.height = 0;
      this.#canvas.remove();
      this.#canvas = undefined;
    }
    this.#model = undefined;
    this.#viewport = undefined;
  }
}
