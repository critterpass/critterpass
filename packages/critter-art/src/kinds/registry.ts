import type { OpSink } from '../core/ops';
import { alpaca } from './guides/alpaca';
import { axolotl } from './guides/axolotl';
import { gecko } from './guides/gecko';
import { puffin } from './guides/puffin';
import { sardine } from './guides/sardine';
import { tanuki } from './guides/tanuki';
import { ANNOTATION_VIEW_BOXES, arrow, circle, squiggle, underline } from './icons/annotations';
import { cal, chat, egg, flame, lock, star } from './icons/badges';
import { bed, bell, boat, pin, ticket, wallet } from './icons/objects';
import { camera, check, food, heart, temple, wave } from './icons/scenes';
import { car, plane, rain, spark, sun, volcano } from './icons/weather';
import { registerLocalKinds } from './locals/register';

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
  /** `'design'` (default, golden mode) replicates the design's own blink seed jitter exactly; `'stable'` fixes it — see `OpSink.reserveSeed`. */
  readonly seedMode?: 'design' | 'stable';
}

export type KindFn = (sink: OpSink, options: KindDrawOptions) => void;

export interface KindRegistration {
  readonly fn: KindFn;
  readonly viewBox: readonly [number, number];
  /** Guides and locals get blink support: a closed-eye op list plus the blink loop. */
  readonly animates: boolean;
}

const registry = new Map<string, KindRegistration>();

export function registerKind(name: string, registration: KindRegistration): void {
  registry.set(name, registration);
}

export function hasKind(name: string): boolean {
  return registry.has(name);
}

function isProduction(): boolean {
  return typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'production';
}

/**
 * Resolves a kind (or a CritterDex id, aliased to its kind by `locals/register.ts`) to its
 * registration. Outside
 * production this throws on an unknown kind, so missing art surfaces immediately in development
 * and tests instead of silently drawing the wrong thing; in production it logs the miss and falls
 * back to `spark`, matching the design's own fallback (`K[kind] || K.spark`) so a bad id degrades
 * a single icon instead of crashing the render.
 */
export function resolveKind(kind: string): KindRegistration {
  const found = registry.get(kind);
  if (found) return found;
  if (!isProduction()) {
    throw new Error(`unknown critter-art kind "${kind}"`);
  }
  console.error(`[critter-art] unknown kind "${kind}"; rendering the "spark" fallback`);
  const fallback = registry.get('spark');
  if (!fallback) {
    throw new Error(`unknown critter-art kind "${kind}" and no "spark" fallback registered`);
  }
  return fallback;
}

registerKind('gecko', { fn: gecko, viewBox: DEFAULT_VIEW_BOX, animates: true });
registerKind('tanuki', { fn: tanuki, viewBox: DEFAULT_VIEW_BOX, animates: true });
registerKind('puffin', { fn: puffin, viewBox: DEFAULT_VIEW_BOX, animates: true });
registerKind('axolotl', { fn: axolotl, viewBox: DEFAULT_VIEW_BOX, animates: true });
registerKind('sardine', { fn: sardine, viewBox: DEFAULT_VIEW_BOX, animates: true });
registerKind('alpaca', { fn: alpaca, viewBox: DEFAULT_VIEW_BOX, animates: true });

const ICONS: Readonly<Record<string, KindFn>> = {
  egg,
  star,
  flame,
  lock,
  chat,
  cal,
  pin,
  bed,
  ticket,
  boat,
  wallet,
  bell,
  sun,
  rain,
  spark,
  plane,
  car,
  volcano,
  wave,
  temple,
  camera,
  food,
  check,
  heart,
  underline,
  circle,
  arrow,
  squiggle,
};

for (const [name, fn] of Object.entries(ICONS)) {
  registerKind(name, { fn, viewBox: ANNOTATION_VIEW_BOXES[name] ?? DEFAULT_VIEW_BOX, animates: false });
}

registerLocalKinds();
