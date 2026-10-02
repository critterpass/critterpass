/**
 * Widget commands (the extension's push token and the widgets an install shows) and the api's half
 * of the refresh hook: every event the api appends that moves something a widget shows queues
 * `widgets.refresh` in the same transaction (the worker hooks the events it appends itself).
 */
import { onEventAppended, sendInTx } from '@cp/db';
import { WIDGET_QUEUES, widgetRefreshPriority } from '@cp/domain';
import type pg from 'pg';

import type { CommandRegistry } from '../_framework/registry';
import { registerWidgetTokenCommand } from './register-widget-token';
import { syncInstalledWidgetsCommand } from './sync-installed-widgets';

export { loadWidgetSnapshot } from './snapshot-data';

export async function enqueueWidgetRefresh(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string },
): Promise<void> {
  if (widgetRefreshPriority(event.type) === null) return;
  await sendInTx(tx, WIDGET_QUEUES.refresh, { event_id: event.id }, { singletonKey: event.id });
}

let hooked = false;

export function registerWidgetCommands(registry: CommandRegistry): void {
  registry.register(registerWidgetTokenCommand);
  registry.register(syncInstalledWidgetsCommand);
  if (!hooked) {
    hooked = true;
    onEventAppended(enqueueWidgetRefresh);
  }
}
