/**
 * A single queued command envelope written by an extension or a `LiveActivityIntent`
 * (api-contracts-async.md §4, §6 `state/pending-actions.json`). `readOutbox()` returns the raw
 * JSON text of `{ schema, generated_at, actions: PendingAction[] }`; callers decode it with the
 * same zod schema the app uses to validate everything else entering the system from outside JS.
 */
export interface PendingAction {
  op_id: string;
  created_at: string;
  command: string;
  scope: string;
  payload: Record<string, string>;
}
