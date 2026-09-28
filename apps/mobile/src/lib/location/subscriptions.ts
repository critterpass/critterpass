/**
 * Consumers of the engine's stream: encounters (dwell samples), shares, visits and leave-by.
 * Each gets fixes and region transitions only while the current mode allows its kind (no
 * encounters or visits on a travel day, only shares when the trip is off but Help or SOS is open).
 */
import type { ConsumerKind } from './modes';
import type { EngineFix, EngineRegionEvent } from './ports';

export interface Consumer {
  readonly onFix?: (fix: EngineFix) => void;
  readonly onRegion?: (event: EngineRegionEvent) => void;
}

export function createSubscriptions() {
  const byKind = new Map<ConsumerKind, Set<Consumer>>();
  return {
    subscribe(kind: ConsumerKind, consumer: Consumer): () => void {
      const set = byKind.get(kind) ?? new Set<Consumer>();
      set.add(consumer);
      byKind.set(kind, set);
      return () => set.delete(consumer);
    },
    has(kind: ConsumerKind): boolean {
      return (byKind.get(kind)?.size ?? 0) > 0;
    },
    fix(allowed: ReadonlySet<ConsumerKind>, fix: EngineFix): void {
      for (const [kind, set] of byKind) {
        if (!allowed.has(kind)) continue;
        for (const consumer of set) consumer.onFix?.(fix);
      }
    },
    region(allowed: ReadonlySet<ConsumerKind>, event: EngineRegionEvent): void {
      for (const [kind, set] of byKind) {
        if (!allowed.has(kind)) continue;
        for (const consumer of set) consumer.onRegion?.(event);
      }
    },
  };
}

export type Subscriptions = ReturnType<typeof createSubscriptions>;
