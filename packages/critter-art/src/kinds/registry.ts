import type { OpSink } from '../core/ops';

/** Every kind defaults to the 100x100 local space; icons declare their own `viewBox`. */
export const DEFAULT_VIEW_BOX: readonly [number, number] = [100, 100];

export interface KindDrawOptions {
  readonly ink: string;
  readonly fill?: string;
  readonly accent?: string;
  readonly spot?: string;
  readonly belly?: string;
  readonly leaf?: string;
  readonly beak2?: string;
  readonly stripe?: string;
  readonly eye: string;
  readonly pupil: string;
  readonly pose?: string;
  readonly closed: boolean;
}

export type KindFn = (sink: OpSink, options: KindDrawOptions) => void;

export interface KindRegistration {
  readonly fn: KindFn;
  readonly viewBox: readonly [number, number];
  /** Guides (and, once T6 lands, locals) get blink support: a closed-eye op list plus the blink loop. */
  readonly animates: boolean;
}

const registry = new Map<string, KindRegistration>();

export function registerKind(name: string, registration: KindRegistration): void {
  registry.set(name, registration);
}

export function hasKind(name: string): boolean {
  return registry.has(name);
}

/**
 * Resolves a kind (or CritterDex id, once T6 wires that mapping) to its registration. Unknown
 * kinds throw — callers building a display list for a real spec should always pass a registered
 * kind; the design's silent `spark` fallback is a deliberate, separate choice left to T3, which
 * owns the registry population and the dev/production fallback policy.
 */
export function resolveKind(kind: string): KindRegistration {
  const found = registry.get(kind);
  if (!found) {
    throw new Error(`unknown critter-art kind "${kind}"`);
  }
  return found;
}
