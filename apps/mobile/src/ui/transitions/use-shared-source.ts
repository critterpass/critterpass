import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ComponentRef, ReactNode, RefObject } from 'react';
import type { View } from 'react-native';

import { tokens } from '@cp/design-tokens';

type ViewInstance = ComponentRef<typeof View>;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** docs/design-system.md §3.3 `zoom`: 560 grow (+200 hop pre-beat on stickers), unzoom 460. */
export const ZOOM_MS = tokens.motion.transition.zoom.enter?.durationMs ?? 560;
export const UNZOOM_MS = tokens.motion.transition.zoom.back?.durationMs ?? 460;
export const HOP_PRE_BEAT_MS = 200;
/** Radius grows from the card's own (22) to the detail sheet's (54); content fades in the first 35%. */
export const ZOOM_RADIUS_FROM = tokens.radius.cardBig;
export const ZOOM_RADIUS_TO = 54;
export const ZOOM_FADE_SHARE = 0.35;

export interface ZoomPlan {
  readonly delayMs: number;
  readonly durationMs: number;
  readonly totalMs: number;
}

export function planZoom(hop: boolean): ZoomPlan {
  const delayMs = hop ? HOP_PRE_BEAT_MS : 0;
  return { delayMs, durationMs: ZOOM_MS, totalMs: delayMs + ZOOM_MS };
}

export type UnzoomPlan =
  | { readonly kind: 'unzoom'; readonly to: Rect; readonly durationMs: number }
  | { readonly kind: 'unfade' };

/** Back to the card when it is still on screen; otherwise the route's own fade takes over. */
export function planUnzoom(sourceRect: Rect | undefined): UnzoomPlan {
  return sourceRect
    ? { kind: 'unzoom', to: sourceRect, durationMs: UNZOOM_MS }
    : { kind: 'unfade' };
}

export interface ActiveZoom {
  readonly key: number;
  readonly id: string;
  readonly direction: 'in' | 'out';
  readonly from: Rect;
  /** `null` until the destination's `SharedTarget` has measured itself. */
  readonly to: Rect | null;
  readonly hop: boolean;
  readonly render: () => ReactNode;
}

interface SourceEntry {
  readonly ref: RefObject<ViewInstance | null>;
  readonly render: () => ReactNode;
}

const sources = new Map<string, SourceEntry>();
let active: readonly ActiveZoom[] = [];
let nextKey = 0;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function measure(ref: RefObject<ViewInstance | null>): Promise<Rect | undefined> {
  return new Promise((resolve) => {
    const node = ref.current;
    if (!node) {
      resolve(undefined);
      return;
    }
    node.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
  });
}

/** Store the overlay host and targets read (exported for them and for tests). */
export const sharedGrowStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get active(): readonly ActiveZoom[] {
    return active;
  },
  reportTarget(id: string, rect: Rect): void {
    let changed = false;
    active = active.map((zoom) => {
      if (zoom.id !== id || zoom.direction !== 'in' || zoom.to) return zoom;
      changed = true;
      return { ...zoom, to: rect };
    });
    if (changed) notify();
  },
  complete(key: number): void {
    active = active.filter((zoom) => zoom.key !== key);
    notify();
  },
  resetForTests(): void {
    active = [];
    sources.clear();
    notify();
  },
};

/** Re-renders with the active zooms (overlay host, targets waiting for their hand-off). */
export function useActiveZooms(): readonly ActiveZoom[] {
  return useSyncExternalStore(
    (listener) => sharedGrowStore.subscribe(listener),
    () => active,
  );
}

/**
 * Marks a card as the source of a zoom: attach the returned ref to the card's root view. `render`
 * draws the clone that grows into the detail (usually the card's own face).
 */
export function useSharedSource(
  id: string,
  render: () => ReactNode,
): RefObject<ViewInstance | null> {
  const ref = useRef<ViewInstance | null>(null);
  const renderRef = useRef(render);
  useEffect(() => {
    renderRef.current = render;
  });
  useEffect(() => {
    const entry: SourceEntry = { ref, render: () => renderRef.current() };
    sources.set(id, entry);
    return () => {
      if (sources.get(id) === entry) sources.delete(id);
    };
  }, [id]);
  return ref;
}

export interface ZoomOptions {
  /** Stickers hop once (200 ms) before growing. */
  readonly hop?: boolean | undefined;
  /** Reduced motion: navigate with the route's cross-fade, no overlay. */
  readonly reduced?: boolean | undefined;
}

/** Card → detail: measures the source, starts the overlay clone and navigates. */
export async function zoomTo(id: string, href: Href, options: ZoomOptions = {}): Promise<void> {
  const source = sources.get(id);
  const from = source && !options.reduced ? await measure(source.ref) : undefined;
  if (source && from) {
    nextKey += 1;
    active = [
      ...active,
      {
        key: nextKey,
        id,
        direction: 'in',
        from,
        to: null,
        hop: options.hop ?? false,
        render: source.render,
      },
    ];
    notify();
  }
  router.push(href);
}

/** Detail → card on back: grows the clone back into the card if it is still mounted. */
export async function unzoom(id: string, targetRect: Rect): Promise<UnzoomPlan> {
  const source = sources.get(id);
  const sourceRect = source ? await measure(source.ref) : undefined;
  const plan = planUnzoom(sourceRect);
  if (plan.kind === 'unzoom' && source) {
    nextKey += 1;
    active = [
      ...active,
      {
        key: nextKey,
        id,
        direction: 'out',
        from: targetRect,
        to: plan.to,
        hop: false,
        render: source.render,
      },
    ];
    notify();
  }
  return plan;
}

export { measure as measureSharedRect };
