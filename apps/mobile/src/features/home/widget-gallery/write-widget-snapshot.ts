/**
 * Puts the widget snapshot (`GET /v1/widgets/snapshot`) where the widgets read it
 * (docs/api-contracts-async.md §6): `snapshot/widgets.json` as the server built it, and
 * `snapshot/entitlements.json`, which every extension reads for locked states. Each file is
 * written whole (temp file renamed into place, by the native store), then the widgets reload.
 * A snapshot whose content has not changed writes nothing and reloads nothing: WidgetKit counts
 * reloads against a daily budget.
 */

/**
 * The parts of the snapshot (packages/domain `WidgetSnapshot`) the writer itself reads; the caller
 * has validated the body against the domain's schema.
 */
export interface WidgetSnapshotDocument {
  readonly schema: number;
  readonly generated_at: string;
  readonly trip: { readonly id: string } | null;
  readonly entitlements: { readonly pass_plus: boolean; readonly boost_active: boolean };
}

export const WIDGETS_SNAPSHOT_KEY = 'widgets';
export const ENTITLEMENTS_SNAPSHOT_KEY = 'entitlements';
export const ENTITLEMENTS_SCHEMA_VERSION = 1;

/** What the writer needs from the cp-app-group module (./widget-ports.ts). */
export interface WidgetSnapshotSink {
  writeSnapshot(key: string, json: string): void;
  reloadWidgets(): void;
}

/** `snapshot/entitlements.json`: the perks behind the locked widget states. */
export function entitlementsFile(snapshot: WidgetSnapshotDocument) {
  return {
    schema: ENTITLEMENTS_SCHEMA_VERSION,
    generated_at: snapshot.generated_at,
    passPlus: snapshot.entitlements.pass_plus,
    boostedTripIds:
      snapshot.entitlements.boost_active && snapshot.trip !== null ? [snapshot.trip.id] : [],
    boostExpiresAt: null,
  };
}

export type WidgetSnapshotWrite = 'written' | 'unchanged';

export interface WidgetSnapshotWriter {
  /** Writes one snapshot the caller has validated (the body `GET /v1/widgets/snapshot` answered). */
  write(snapshot: WidgetSnapshotDocument): WidgetSnapshotWrite;
}

export function createWidgetSnapshotWriter(sink: WidgetSnapshotSink): WidgetSnapshotWriter {
  let last: string | null = null;
  return {
    write(snapshot) {
      const { generated_at: _clock, ...rest } = snapshot;
      const content = JSON.stringify(rest);
      if (content === last) return 'unchanged';
      sink.writeSnapshot(WIDGETS_SNAPSHOT_KEY, JSON.stringify(snapshot));
      sink.writeSnapshot(ENTITLEMENTS_SNAPSHOT_KEY, JSON.stringify(entitlementsFile(snapshot)));
      sink.reloadWidgets();
      last = content;
      return 'written';
    },
  };
}
