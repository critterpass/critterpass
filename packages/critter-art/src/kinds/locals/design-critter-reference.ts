import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { loadDesignDoodleKit } from '../../core/design-doodle-kit-reference';
import type { DesignDoodleKit } from '../../core/design-doodle-kit-reference';
import type { LineOptions, WashOptions } from '../../core/ops';
import type { Point } from '../../core/geometry';

// Test-only: boots the unmodified `design/critters-draw-1.js` (and, for T6, `critters-draw-2.js`)
// in a Node vm context, then replays `boot()`'s own two-line "sort parts by order, invoke with
// (DK, X)" loop myself — `boot()`'s internal `X` object is never exposed on `window`, so this is the
// only way fidelity tests can reach the real `X.h`, `X.A.<archetype>`, `X.acc`, `X.ears`, `X.horns`
// functions instead of a hand-copied transcription. Never imported by shipped code.
const repoRoot = new URL('../../../../../', import.meta.url);

function readDesignFile(name: string): string {
  return readFileSync(new URL(`design/${name}`, repoRoot), 'utf8');
}

export interface DesignDrawSink {
  line(points: readonly Point[], options?: LineOptions): void;
  stroke(points: readonly Point[], color: string, width: number): void;
  wash(points: readonly Point[], color: string, options?: WashOptions): void;
  fill(points: readonly Point[], color: string): void;
  dot(x: number, y: number, r: number, color: string, alpha?: number): void;
}

/** Every archetype/accessory/ears/horns function in critters-draw-1/2.js: untyped on purpose — this bridges real, unmodified JS for comparison, not a contract shipped code relies on. */
export type DesignCritterFn = (sink: DesignDrawSink, ...rest: unknown[]) => void;

export interface DesignCritterKit {
  readonly h: Record<string, unknown>;
  readonly A: Record<string, DesignCritterFn>;
  readonly acc: DesignCritterFn;
  readonly ACC: Record<string, DesignCritterFn>;
  readonly ears: DesignCritterFn;
  readonly horns: DesignCritterFn;
}

type PluginPart = readonly [order: number, register: (dk: DesignDoodleKit, x: DesignCritterKit) => void];

interface CritterPartsSandbox {
  window?: unknown;
  __cp?: PluginPart[];
  DoodleKit?: DesignDoodleKit;
  CritterDex?: { list: unknown[]; ready: boolean };
  document?: { querySelectorAll: () => unknown[] };
  dispatchEvent?: () => boolean;
  Event?: typeof Event;
  console?: Console;
  Math?: typeof Math;
}

/**
 * Loads `X` by running the unmodified `critters-draw-1.js` (plus `critters-draw-2.js` when
 * `includeArchetypesPartTwo` is set) in a fresh vm context, then reconstructing `X` exactly as
 * `boot()` does: sort the pushed `[order, fn]` pairs and invoke each with `(DK, X)`. Both parts
 * populate the same `X`, so `X.h` (part 1) is available to part 2's archetypes.
 */
export function loadDesignCritterKit(includeArchetypesPartTwo = false): {
  X: DesignCritterKit;
  DK: DesignDoodleKit;
} {
  const DK = loadDesignDoodleKit();
  const sandbox: CritterPartsSandbox = {
    __cp: [],
    DoodleKit: DK,
    CritterDex: { list: [], ready: false },
    document: { querySelectorAll: () => [] },
    dispatchEvent: () => true,
    Event,
    console,
    Math,
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  new vm.Script(readDesignFile('critters-draw-1.js'), { filename: 'critters-draw-1.js' }).runInContext(
    context,
  );
  if (includeArchetypesPartTwo) {
    new vm.Script(readDesignFile('critters-draw-2.js'), {
      filename: 'critters-draw-2.js',
    }).runInContext(context);
  }

  const parts = (sandbox.__cp ?? []).slice().sort((a, b) => a[0] - b[0]);
  const seed: { h: Record<string, unknown>; A: Record<string, DesignCritterFn> } & Partial<
    Pick<DesignCritterKit, 'acc' | 'ACC' | 'ears' | 'horns'>
  > = { h: {}, A: {} };
  for (const [, register] of parts) register(DK, seed as unknown as DesignCritterKit);

  if (!seed.acc || !seed.ACC || !seed.ears || !seed.horns) {
    throw new Error('design/critters-draw-1.js layout changed; update loadDesignCritterKit');
  }
  return { X: seed as DesignCritterKit, DK };
}

/**
 * Evaluates a source slice from critters-draw-1/2.js between two markers, for private consts
 * (`tail`, `curls`, `puli`) the design never assigns onto `X` or `DK` and so `loadDesignCritterKit`
 * cannot reach. `scope` supplies the slice's free variables (e.g. `W`, `fluff`, `E`) by name, sourced
 * from an already-loaded `X.h`/`DK` so the comparison stays end-to-end unmodified design code.
 */
export function evaluateDesignCritterBlock<T>(
  file: 'critters-draw-1.js' | 'critters-draw-2.js',
  startMarker: string,
  endMarker: string,
  returnExpression: string,
  scope: Readonly<Record<string, unknown>>,
): T {
  const source = readDesignFile(file);
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start === -1 || end === -1) {
    throw new Error(`${file} layout changed; update the markers for "${returnExpression}"`);
  }
  const block = source.slice(start, end);
  const argNames = Object.keys(scope);
  const script = new vm.Script(
    `(function (${argNames.join(', ')}) {\n${block}\nreturn (${returnExpression});\n})`,
  );
  const factory = script.runInNewContext() as (...args: unknown[]) => T;
  return factory(...argNames.map((key) => scope[key]));
}

/** design/critters-draw-1.js `tail`: private to the file, used only by `X.A.sit`. */
export function loadDesignTailFn(): DesignCritterFn {
  const { X, DK } = loadDesignCritterKit();
  return evaluateDesignCritterBlock(
    'critters-draw-1.js',
    '  const TAIL = {',
    '\n\n  const MASK = {',
    'tail',
    { W: X.h['W'], fluff: X.h['fluff'], E: DK.E, arcB: X.h['arcB'] },
  );
}

/** design/critters-draw-1.js `MASK` (private, sit-only): face-marking overlays keyed by `spec.mask`. */
export function loadDesignMaskTable(): Record<string, DesignCritterFn> {
  const { X, DK } = loadDesignCritterKit();
  return evaluateDesignCritterBlock(
    'critters-draw-1.js',
    '  const MASK = {',
    '\n  const MUZ = {',
    'MASK',
    { E: DK.E, CR: X.h['CR'], blob: X.h['blob'], MIR: X.h['MIR'], F: X.h['F'] },
  );
}

/** design/critters-draw-1.js `MUZ` (private, sit-only): muzzle/snout overlays keyed by `spec.muz`. */
export function loadDesignMuzTable(): Record<string, DesignCritterFn> {
  const { X, DK } = loadDesignCritterKit();
  return evaluateDesignCritterBlock(
    'critters-draw-1.js',
    '  const MUZ = {',
    '\n  const PAT = {',
    'MUZ',
    {
      E: DK.E,
      INK: X.h['INK'],
      CR: X.h['CR'],
      MIR: X.h['MIR'],
      F: X.h['F'],
      blob: X.h['blob'],
      nose: X.h['nose'],
      smile: X.h['smile'],
    },
  );
}

/** design/critters-draw-1.js `PAT` (private, sit-only): coat-pattern overlays keyed by `spec.pat`. */
export function loadDesignPatTable(): Record<string, DesignCritterFn> {
  const { X, DK } = loadDesignCritterKit();
  return evaluateDesignCritterBlock(
    'critters-draw-1.js',
    '  const PAT = {',
    '\n  const curls = ',
    'PAT',
    { E: DK.E, MIR: X.h['MIR'], F: X.h['F'], star: X.h['star'] },
  );
}
