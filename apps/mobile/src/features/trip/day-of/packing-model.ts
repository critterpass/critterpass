/**
 * The day's packing chips: the crew's shared rows and my personal rows, with my adds, checks and
 * removals still in the upload queue applied on top. Cancelling a queued op (the offline card)
 * deletes it from the queue, so the list falls back to the synced rows by itself.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names and JSON paths, never copy. */
import { ADD_PACKING_ITEM, CHECK_PACKING_ITEM, REMOVE_PACKING_ITEM } from '../leave-by/commands';

export interface PackingRow {
  readonly id: string;
  readonly day: string | null;
  readonly owner_id: string | null;
  readonly label: string;
  readonly checked: number | null;
  readonly suggested_by: string | null;
  readonly deleted_at: string | null;
}

export interface PendingPackingOp {
  readonly cmd: string;
  readonly item_id: string | null;
  readonly checked: number | boolean | string | null;
  readonly label: string | null;
  readonly personal: number | boolean | string | null;
  readonly day: string | null;
  readonly trip_id: string | null;
}

export interface PackChip {
  readonly id: string;
  readonly label: string;
  readonly packed: boolean;
  readonly personal: boolean;
  readonly suggested: boolean;
  /** Only in the upload queue so far. */
  readonly pending: boolean;
}

export const PENDING_PACKING_SQL = `SELECT cmd,
    json_extract(envelope, '$.payload.item_id') AS item_id,
    json_extract(envelope, '$.payload.checked') AS checked,
    json_extract(envelope, '$.payload.label') AS label,
    json_extract(envelope, '$.payload.personal') AS personal,
    json_extract(envelope, '$.payload.day') AS day,
    json_extract(envelope, '$.payload.trip_id') AS trip_id
  FROM commands WHERE cmd IN ('${ADD_PACKING_ITEM}', '${CHECK_PACKING_ITEM}', '${REMOVE_PACKING_ITEM}')
  ORDER BY seq`;

function truthy(value: number | boolean | string | null): boolean {
  return value === true || value === 1 || value === 'true' || value === '1';
}

/** Rows for `day` (and undated rows, which belong to every day), with queued ops applied. */
export function buildPackChips(
  rows: readonly PackingRow[],
  pending: readonly PendingPackingOp[],
  tripId: string,
  day: string,
): PackChip[] {
  const chips = new Map<string, PackChip>();
  for (const row of rows) {
    if (row.deleted_at !== null) continue;
    if (row.day !== null && row.day !== day) continue;
    chips.set(row.id, {
      id: row.id,
      label: row.label,
      packed: row.checked === 1,
      personal: row.owner_id !== null,
      suggested: row.suggested_by !== null,
      pending: false,
    });
  }
  for (const op of pending) {
    if (op.item_id === null) continue;
    if (op.cmd === ADD_PACKING_ITEM) {
      if (op.trip_id !== tripId || (op.day !== null && op.day !== day)) continue;
      if (chips.has(op.item_id)) continue;
      chips.set(op.item_id, {
        id: op.item_id,
        label: op.label ?? '',
        packed: false,
        personal: truthy(op.personal),
        suggested: false,
        pending: true,
      });
    } else if (op.cmd === CHECK_PACKING_ITEM) {
      const chip = chips.get(op.item_id);
      if (chip !== undefined) chips.set(op.item_id, { ...chip, packed: truthy(op.checked) });
    } else {
      chips.delete(op.item_id);
    }
  }
  // Stable order (as added), so a chip never jumps when it is ticked.
  return [...chips.values()];
}
