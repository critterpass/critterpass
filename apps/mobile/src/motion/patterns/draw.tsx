import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { quadInOutEasing } from '../easing';
import { useReducedImpactMotion } from './shared';

// docs/design-system.md §3.1 `draw`: "700 icons / 1500 creatures, easeInOutQuad".
const ICON_DRAW_MS = 700;
const CREATURE_DRAW_MS = 1500;
// docs/code-standards.md §7 motion budget: "≤2 concurrent critter draw-ons".
const MAX_CONCURRENT_DRAW_ONS = 2;

type DrawSlotId = symbol;

const grantedSlots = new Set<DrawSlotId>();
const queuedSlots: DrawSlotId[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function processQueue(): void {
  while (grantedSlots.size < MAX_CONCURRENT_DRAW_ONS && queuedSlots.length > 0) {
    const next = queuedSlots.shift();
    if (next) grantedSlots.add(next);
  }
}

/**
 * The app's single ≤2-concurrent draw-on gate (docs/code-standards.md §7). A third simultaneous
 * draw-on queues rather than drawing, and is granted a slot as soon as one frees up. Stickers never
 * own a gate of their own — they only ever consume the progress value `useDraw` drives.
 */
export const drawGate = {
  // `this: void`: documents that this method never reads `this`, since `useDrawGate` below tears it
  // off and hands the bare reference straight to `useSyncExternalStore`.
  subscribe(this: void, listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  isGranted(id: DrawSlotId): boolean {
    return grantedSlots.has(id);
  },
  request(id: DrawSlotId): void {
    if (grantedSlots.has(id) || queuedSlots.includes(id)) return;
    queuedSlots.push(id);
    processQueue();
    notify();
  },
  release(id: DrawSlotId): void {
    const queueIndex = queuedSlots.indexOf(id);
    if (queueIndex !== -1) queuedSlots.splice(queueIndex, 1);
    const wasGranted = grantedSlots.delete(id);
    if (wasGranted) processQueue();
    notify();
  },
  get activeCount(): number {
    return grantedSlots.size;
  },
  get queueLength(): number {
    return queuedSlots.length;
  },
};

/** Requests a draw-on slot while `active`, releasing it on unmount or once `active` goes false. */
export function useDrawGate(active: boolean): boolean {
  const [id] = useState<DrawSlotId>(() => Symbol('draw-on'));
  const granted = useSyncExternalStore(drawGate.subscribe, () => drawGate.isGranted(id));

  useEffect(() => {
    if (!active) {
      drawGate.release(id);
      return;
    }
    drawGate.request(id);
    return () => drawGate.release(id);
  }, [active, id]);

  return granted;
}

export interface UseDrawOptions {
  readonly active: boolean;
  readonly kind: 'icon' | 'creature';
}

export interface UseDrawResult {
  /** Feed into critter-art's `frame(model, progress.value)` (stroke-trim draw-on progress, 0 to 1). */
  readonly progress: SharedValue<number>;
  /** `false` while queued behind the ≤2-concurrent gate; the caller may show a static placeholder. */
  readonly isDrawing: boolean;
}

/**
 * Drives a critter-art draw-on's progress once a `drawGate` slot is granted (docs/design-system.md
 * §3.1 `draw`: "stroke trim 700 icons / 1500 creatures, easeInOutQuad"). Reduced motion: the final
 * frame shows immediately once granted, matching design-system.md §5 ("draw-on ... show final frame").
 */
export function useDraw({ active, kind }: UseDrawOptions): UseDrawResult {
  const isDrawing = useDrawGate(active);
  const progress = useSharedValue(0);
  const reduced = useReducedImpactMotion();

  useEffect(() => {
    if (!active || !isDrawing) return;
    const durationMs = kind === 'icon' ? ICON_DRAW_MS : CREATURE_DRAW_MS;
    progress.value = reduced ? 1 : withTiming(1, { duration: durationMs, easing: quadInOutEasing });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- progress is a stable shared value ref.
  }, [active, isDrawing, kind, reduced]);

  return { progress, isDrawing };
}
