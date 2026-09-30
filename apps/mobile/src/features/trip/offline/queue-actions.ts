/**
 * What the offline card can do with something still waiting to send: cancel it (the op leaves the
 * queue and every optimistic row it wrote rolls back in the same local transaction, so each screen
 * reads exactly what it read before the tap), or, for a chat message, change its text. Only ops
 * not yet on their way can change; one already uploading answers `sending`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and command names, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { deleteOverlayRows } from '@/data/commands/overlays';

export const SEND_MESSAGE = 'send_message';

export type QueueChange = 'done' | 'sending' | 'gone';

async function statusOf(
  tx: Parameters<Parameters<AbstractPowerSyncDatabase['writeTransaction']>[0]>[0],
  opId: string,
): Promise<string | null> {
  const row = await tx.getOptional<{ status: string }>('SELECT status FROM commands WHERE id = ?', [
    opId,
  ]);
  return row?.status ?? null;
}

export async function cancelQueued(
  db: AbstractPowerSyncDatabase,
  opId: string,
): Promise<QueueChange> {
  return db.writeTransaction(async (tx) => {
    const status = await statusOf(tx, opId);
    if (status === null) return 'gone';
    if (status !== 'queued') return 'sending';
    await deleteOverlayRows(tx, opId);
    await tx.execute('DELETE FROM commands WHERE id = ?', [opId]);
    return 'done';
  });
}

/** A queued chat message with new text (its summary follows, so the list shows the new words). */
export async function editQueuedMessage(
  db: AbstractPowerSyncDatabase,
  opId: string,
  body: string,
): Promise<QueueChange> {
  return db.writeTransaction(async (tx) => {
    const row = await tx.getOptional<{
      status: string;
      cmd: string;
      envelope: string;
      summary: string | null;
    }>('SELECT status, cmd, envelope, summary FROM commands WHERE id = ?', [opId]);
    if (row === null || row.cmd !== SEND_MESSAGE) return 'gone';
    if (row.status !== 'queued') return 'sending';
    const envelope = JSON.parse(row.envelope) as { payload: Record<string, unknown> };
    envelope.payload = { ...envelope.payload, body };
    const summary =
      row.summary === null
        ? null
        : (() => {
            const parsed = JSON.parse(row.summary) as { values?: Record<string, unknown> };
            return JSON.stringify({
              ...parsed,
              values: { ...parsed.values, preview: body.slice(0, 80) },
            });
          })();
    await tx.execute('UPDATE commands SET envelope = ?, summary = ? WHERE id = ?', [
      JSON.stringify(envelope),
      summary,
      opId,
    ]);
    return 'done';
  });
}

/** The text of a queued chat message, for the edit field. */
export async function queuedMessageBody(
  db: AbstractPowerSyncDatabase,
  opId: string,
): Promise<string | null> {
  const row = await db.getOptional<{ body: string | null }>(
    "SELECT json_extract(envelope, '$.payload.body') AS body FROM commands WHERE id = ?",
    [opId],
  );
  return row?.body ?? null;
}
