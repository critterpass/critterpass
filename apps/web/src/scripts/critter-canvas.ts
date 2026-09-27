/* eslint-disable lingui/no-unlocalized-strings -- HTML attribute values/DOM plumbing, not JSX/UI copy. */
/**
 * `<cp-critter>`: a lazy, device-pixel-ratio-aware canvas that draws one `@cp/critter-art` critter.
 * Renders a single static frame (draw-on progress `p = 1`) once the element scrolls into view —
 * this page never needs the package's progressive line-draw, only a finished sticker/illustration —
 * so `prefers-reduced-motion` needs no special case here: the canvas itself never animates, only the
 * CSS wrapping it (float/wiggle/hop) does, and the page controller already gates that globally.
 */
import { build, DEFAULT_INK, frame, layout } from '@cp/critter-art';
import { renderToCanvas, viewportFor } from '@cp/critter-art/canvas2d';
import type { CanvasFactory, CanvasLike } from '@cp/critter-art/canvas2d';
import type { Pose, RenderSpec, Variant } from '@cp/critter-art';

const canvasFactory: CanvasFactory = (width, height): CanvasLike => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas as unknown as CanvasLike;
};

const VALID_POSES: ReadonlySet<string> = new Set(['wave', 'cheer', 'point', 'tilt', 'hop']);
const VALID_VARIANTS: ReadonlySet<string> = new Set(['color', 'mask', 'mono', 'stamp']);

export class CpCritter extends HTMLElement {
  static readonly observedAttributes = [
    'kind',
    'seed',
    'size',
    'pose',
    'sticker',
    'variant',
    'mask-color',
  ];

  #observer: IntersectionObserver | null = null;
  #rendered = false;

  connectedCallback(): void {
    const sizePt = this.sizePt;
    this.style.display = 'inline-block';
    this.style.lineHeight = '0';
    this.style.width = `${sizePt}px`;
    this.style.height = `${sizePt}px`;

    if (typeof IntersectionObserver === 'undefined') {
      this.render();
      return;
    }
    this.#observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) this.render();
      },
      { rootMargin: '200px' },
    );
    this.#observer.observe(this);
  }

  disconnectedCallback(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#rendered = false;
    this.replaceChildren();
  }

  attributeChangedCallback(): void {
    if (!this.#rendered) return;
    this.#rendered = false;
    this.replaceChildren();
    this.render();
  }

  private get sizePt(): number {
    const raw = Number.parseFloat(this.getAttribute('size') ?? '');
    return Number.isFinite(raw) && raw > 0 ? raw : 64;
  }

  private get pose(): Pose | undefined {
    const raw = this.getAttribute('pose');
    return raw !== null && VALID_POSES.has(raw) ? (raw as Pose) : undefined;
  }

  private get variant(): Variant | undefined {
    const raw = this.getAttribute('variant');
    return raw !== null && VALID_VARIANTS.has(raw) ? (raw as Variant) : undefined;
  }

  private render(): void {
    if (this.#rendered) return;
    this.#observer?.disconnect();
    this.#rendered = true;

    const kind = this.getAttribute('kind');
    if (!kind) return;
    const seed = Number.parseInt(this.getAttribute('seed') ?? '1', 10);
    const sticker = this.getAttribute('sticker');
    const maskColor = this.getAttribute('mask-color');
    const closedEyes = this.hasAttribute('closed-eyes');

    const spec: RenderSpec = {
      kind,
      seed: Number.isFinite(seed) ? seed : 1,
      ...(this.pose ? { pose: this.pose } : {}),
      ...(this.variant ? { variant: this.variant } : {}),
      ...(maskColor ? { maskColor } : {}),
      ...(sticker ? { sticker: { color: sticker } } : {}),
      ...(closedEyes ? { closedEyes: true } : {}),
    };

    try {
      const sizePt = this.sizePt;
      const model = build(spec, sizePt);
      const boxLayout = layout(spec, sizePt);
      const deviceScale = Math.min(2, window.devicePixelRatio || 1);
      const viewport = viewportFor(boxLayout, deviceScale);
      const canvas = renderToCanvas(
        frame(model, 1),
        viewport,
        canvasFactory,
      ) as unknown as HTMLCanvasElement;
      canvas.style.width = `${viewport.widthPx / viewport.deviceScale}px`;
      canvas.style.height = `${viewport.heightPx / viewport.deviceScale}px`;
      canvas.setAttribute('role', 'img');
      const label = this.getAttribute('label');
      if (label) canvas.setAttribute('aria-label', label);
      else canvas.setAttribute('aria-hidden', 'true');
      this.replaceChildren(canvas);
    } catch (error) {
      // A rendering failure (unknown kind, bad seed) shouldn't break the page around it — an empty,
      // ink-coloured placeholder is a visible-but-quiet degradation instead of a thrown error.
      console.error(`cp-critter: failed to render kind "${kind}"`, error);
      const placeholder = document.createElement('span');
      placeholder.style.display = 'inline-block';
      placeholder.style.width = `${this.sizePt}px`;
      placeholder.style.height = `${this.sizePt}px`;
      placeholder.style.background = DEFAULT_INK;
      placeholder.style.borderRadius = '50%';
      placeholder.setAttribute('aria-hidden', 'true');
      this.replaceChildren(placeholder);
    }
  }
}

export function registerCritterCanvas(): void {
  if (!customElements.get('cp-critter')) {
    customElements.define('cp-critter', CpCritter);
  }
}
