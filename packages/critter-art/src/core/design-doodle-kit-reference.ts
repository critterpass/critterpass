import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import type { LineOptions, WashOptions } from './ops';
import type { Point } from './geometry';

// Test-only: runs the unmodified `design/doodles.js` behind a small DOM/custom-element shim (the
// same technique proven in the design analysis's Node prerender probe) so fidelity tests can call
// the real `K.<kind>` functions instead of a hand-copied transcription.
const repoRoot = new URL('../../../../', import.meta.url);

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

export interface DesignKindOptions {
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

export type DesignKindFn = ((sink: DesignDrawSink, options: DesignKindOptions) => void) & {
  readonly vb?: readonly [number, number];
};

export interface DesignDoodleKit {
  readonly K: Record<string, DesignKindFn>;
  readonly CREATURES: Record<string, number>;
  /** `E`/`eyes`/`cheeks`/`extras`/`toes`: untyped on purpose — critters-draw-1/2.js fixtures pass these through as opaque eval scope values, never call them from TypeScript directly. */
  readonly E: unknown;
  readonly eyes: unknown;
  readonly cheeks: unknown;
  readonly extras: unknown;
  readonly toes: unknown;
}

class HTMLElementShim {
  private readonly attrs = new Map<string, string>();
  style: Record<string, string> = {};
  getAttribute(name: string): string | null {
    return this.attrs.has(name) ? (this.attrs.get(name) ?? null) : null;
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, String(value));
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  appendChild(): void {}
  addEventListener(): void {}
  getBoundingClientRect(): { width: number } {
    return { width: Number(this.attrs.get('size')) || 48 };
  }
}

interface WindowShim {
  DoodleKit?: DesignDoodleKit;
  [key: string]: unknown;
}

/**
 * Boots the unmodified `design/doodles.js` in a Node vm context and returns the real `K` kind
 * registry (`K.gecko`, icons, etc.) plus `CREATURES`, exactly as `window.DoodleKit` exposes them.
 */
export function loadDesignDoodleKit(): DesignDoodleKit {
  const source = readDesignFile('doodles.js');
  const elementRegistry = new Map<string, unknown>();
  const sandbox: WindowShim = {
    HTMLElement: HTMLElementShim,
    customElements: {
      get: (name: string) => elementRegistry.get(name),
      define: (name: string, ctor: unknown) => {
        elementRegistry.set(name, ctor);
      },
    },
    document: {
      createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }),
      querySelectorAll: () => [],
    },
    matchMedia: () => ({ matches: false }),
    devicePixelRatio: 3,
    performance,
    setTimeout,
    clearTimeout,
    console,
    Math,
    Event,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    dispatchEvent: () => true,
  };
  sandbox['window'] = sandbox;
  const context = vm.createContext(sandbox);
  new vm.Script(source, { filename: 'doodles.js' }).runInContext(context);
  if (!sandbox.DoodleKit) {
    throw new Error('design/doodles.js did not set window.DoodleKit; update the shim in this file');
  }
  return sandbox.DoodleKit;
}
