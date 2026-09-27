/**
 * Local-only tables of the encrypted client database (docs/data-model-sync-and-privacy.md §1, §4):
 * never replicated, never uploaded by PowerSync itself. `commands` is the ordered upload queue
 * flushed to `POST /sync/upload`; `rejected_commands` keeps the "didn't go through" list across
 * restarts; `local_private` holds the owner's C3 values fetched over HTTPS; `local_state` is a tiny
 * key-value store (which uid owns this database). Optimistic rows live in `overlay_<name>` tables
 * that feature code declares with `overlayTable()`, so a synced table is only ever written by sync.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import { column, Table, type ColumnsType } from '@powersync/common';

export const COMMAND_STATUSES = ['queued', 'sending', 'done'] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

export const LOCAL_TABLES = {
  /** One row per queued envelope; `id` is the envelope's `op_id`, `seq` its insertion order. */
  commands: new Table(
    {
      seq: column.integer,
      cmd: column.text,
      envelope: column.text,
      summary: column.text,
      status: column.text,
      attempts: column.integer,
      last_error: column.text,
      created_at: column.text,
      sent_at: column.text,
    },
    { localOnly: true, indexes: { by_seq: ['seq'] } },
  ),
  /** `id` is the rejected op's `op_id`; kept until the user dismisses it. */
  rejected_commands: new Table(
    {
      cmd: column.text,
      code: column.text,
      detail: column.text,
      summary: column.text,
      rejected_at: column.text,
    },
    { localOnly: true },
  ),
  local_private: new Table(
    { kind: column.text, data: column.text, fetched_at: column.text },
    { localOnly: true },
  ),
  local_state: new Table({ value: column.text }, { localOnly: true }),
};

export const LOCAL_TABLE_NAMES = Object.keys(LOCAL_TABLES) as (keyof typeof LOCAL_TABLES)[];

/** `local_state` key holding the uid whose data this database currently contains. */
export const OWNER_UID_KEY = 'owner_uid';

export const OVERLAY_TABLE_PREFIX = 'overlay_';

/**
 * An optimistic-row table for one synced entity: the entity's own columns plus the `op_id` of the
 * command that wrote it, so reconcile can clear or roll back exactly that command's rows.
 */
export function overlayTable(columns: ColumnsType): Table {
  return new Table(
    { ...columns, op_id: column.text },
    { localOnly: true, indexes: { by_op: ['op_id'] } },
  );
}
