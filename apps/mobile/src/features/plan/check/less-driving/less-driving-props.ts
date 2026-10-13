import { type SketchPoint } from '@/ui/planning';

export interface OrderRow {
  readonly key: string;
  readonly time: string;
  readonly name: string;
  readonly booked: boolean;
  /** "WAS 12:00" / "WAS 4TH"; null when it stays where it was. */
  readonly was: string | null;
}

export interface LessDrivingViewProps {
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly state: 'loading' | 'none' | 'ready';
  readonly before: string;
  readonly after: string;
  readonly beforeStops: readonly SketchPoint[];
  readonly afterStops: readonly SketchPoint[];
  readonly stay: SketchPoint | null;
  readonly rows: readonly OrderRow[];
  /** Some of the new order's drives could not be routed in time: say they are estimates. */
  readonly estimate?: boolean;
  readonly primary: {
    readonly label: string;
    readonly busy: boolean;
    readonly onPress: () => void;
  } | null;
  readonly send: (() => void) | null;
  /** From the no-shorter-order state: the plan check, where a too-far day has its nearer swap. */
  readonly onOpenCheck?: (() => void) | undefined;
  readonly reducedMotion: boolean;
}

export interface RouteSketchProps {
  /** Stops in route order. */
  readonly stops: readonly SketchPoint[];
  readonly stay: SketchPoint | null;
  readonly width: number;
  readonly height: number;
  readonly testID?: string;
}

export const DOT = 22;

const MIN_GAP = DOT + 4;

interface Spot {
  readonly x: number;
  readonly y: number;
}

/**
 * Markers pushed apart until every number reads: the sketch shows the order, not the distances,
 * so two stops on the same street sit side by side instead of on top of each other.
 */
export function spreadApart(spots: readonly Spot[], width: number, height: number): Spot[] {
  const out = spots.map((spot) => ({ ...spot }));
  const clamp = (value: number, max: number) => Math.min(max - DOT / 2, Math.max(DOT / 2, value));
  for (let round = 0; round < 40; round += 1) {
    let moved = false;
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const a = out[i];
        const b = out[j];
        if (a === undefined || b === undefined) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const gap = Math.hypot(dx, dy);
        if (gap >= MIN_GAP) continue;
        // Two markers on the same spot part along a fixed diagonal, by their order.
        const ux = gap === 0 ? Math.cos(i + j) : dx / gap;
        const uy = gap === 0 ? Math.sin(i + j) : dy / gap;
        const push = (MIN_GAP - gap) / 2 + 0.5;
        a.x = clamp(a.x - ux * push, width);
        a.y = clamp(a.y - uy * push, height);
        b.x = clamp(b.x + ux * push, width);
        b.y = clamp(b.y + uy * push, height);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}
