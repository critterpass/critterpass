/**
 * Keeps the home and lock screen widgets fed: fetches the widget snapshot
 * (`GET /v1/widgets/snapshot`), checks it against the domain's contract, hands it to the App Group
 * writer (which writes it whole and reloads the widgets only when it changed), and tells the
 * server which widgets are placed on this phone (`sync_installed_widgets`), so it pushes
 * refreshes only to phones that show something.
 */
import {
  widgetSnapshotSchema,
  type SyncInstalledWidgetsPayload,
  type WidgetSnapshot,
} from '@cp/domain';

import { installedWidgetsPayload, type PlacedWidget } from './installed-widgets';

export type WidgetSnapshotFetch =
  | { readonly kind: 'ok'; readonly body: unknown }
  /** Offline, signed out or a server error: what the widgets show stays as it is. */
  | { readonly kind: 'unavailable' };

export interface WidgetSyncDeps {
  readonly fetchSnapshot: () => Promise<WidgetSnapshotFetch>;
  /** cp-app-group's widget snapshot writer. */
  readonly writer: { write(snapshot: WidgetSnapshot): 'written' | 'unchanged' };
  /** The widgets placed on this phone (cp-widgets), or null without the module. */
  readonly installed: (() => Promise<readonly PlacedWidget[]>) | null;
  readonly syncInstalled: (payload: SyncInstalledWidgetsPayload) => Promise<unknown>;
}

export type WidgetSyncResult = 'written' | 'unchanged' | 'invalid' | 'unavailable';

/** One refresh: the snapshot, then the placed widgets (each step on its own; neither throws). */
export async function syncWidgets(deps: WidgetSyncDeps): Promise<WidgetSyncResult> {
  const fetched = await deps.fetchSnapshot().catch(() => ({ kind: 'unavailable' }) as const);
  let result: WidgetSyncResult = 'unavailable';
  if (fetched.kind === 'ok') {
    const parsed = widgetSnapshotSchema.safeParse(fetched.body);
    result = parsed.success ? deps.writer.write(parsed.data) : 'invalid';
  }
  if (deps.installed !== null) {
    const placed = await deps.installed().catch(() => null);
    if (placed !== null) {
      await deps.syncInstalled(installedWidgetsPayload(placed)).catch(() => undefined);
    }
  }
  return result;
}
