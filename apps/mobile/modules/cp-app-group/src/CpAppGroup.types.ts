/**
 * One command an extension queued in `state/pending-actions.json` (api-contracts-async.md §4, §6):
 * the envelope minus the uid and device, which the app adds when it drains the file. The zod
 * schema in `packages/domain/src/surfaces/app-group.ts` is the source of this shape and the
 * validation boundary; the Swift and Kotlin types are generated from it.
 */
export interface PendingAction {
  op_id: string;
  cmd: string;
  v: 1;
  via: 'widget' | 'notif_action' | 'la_intent' | 'app_intent';
  scope: string;
  client_ts: string;
  base_version?: number;
  payload: Record<string, unknown>;
}
