/**
 * Row-level operations on the local `commands` queue and `rejected_commands` list. Every function
 * takes the caller's transaction so an envelope, its optimistic overlay rows and its outcome are
 * always written atomically with each other.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import type { LockContext } from '@powersync/common';

import { OVERLAY_TABLE_PREFIX, type CommandStatus } from './local-tables';

export interface QueuedCommandInput {
  readonly opId: string;
  readonly cmd: string;
  /** The full envelope, sent verbatim to `POST /sync/upload`. */
  readonly envelope: unknown;
  /** i18n message descriptor for the queued list, or null to fall back to the command name. */
  readonly summary: unknown;
  readonly createdAt: string;
}

export interface QueuedCommandRow {
  readonly id: string;
  readonly seq: number;
  readonly cmd: string;
  readonly envelope: string;
  readonly summary: string | null;
  readonly status: CommandStatus;
  readonly attempts: number;
}

export interface RejectionInput {
  readonly opId: string;
  readonly code: string;
  readonly detail: unknown;
  readonly rejectedAt: string;
}

/** Appends one envelope at the end of the queue (`seq` = current max + 1, under the write lock). */
export async function insertQueuedCommand(tx: LockContext, input: QueuedCommandInput) {
  await tx.execute(
    `INSERT INTO commands (id, seq, cmd, envelope, summary, status, attempts, created_at)
     VALUES (?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM commands), ?, ?, ?, 'queued', 0, ?)`,
    [
      input.opId,
      input.cmd,
      JSON.stringify(input.envelope),
      input.summary === null ? null : JSON.stringify(input.summary),
      input.createdAt,
    ],
  );
}

/** Every overlay table in the open database's schema (`overlay_*`, see local-tables.ts). */
export async function overlayTableNames(tx: LockContext): Promise<string[]> {
  const rows = await tx.getAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'view' AND name GLOB ?`,
    [`${OVERLAY_TABLE_PREFIX}*`],
  );
  return rows.map((row) => row.name);
}

/** Removes every optimistic row a command wrote, in every overlay table. */
export async function deleteOverlayRows(tx: LockContext, opId: string): Promise<void> {
  for (const table of await overlayTableNames(tx)) {
    await tx.execute(`DELETE FROM "${table}" WHERE op_id = ?`, [opId]);
  }
}

/** The server accepted the op; its row stays (`done`) until reconcile sees the synced result. */
export async function markCommandsDone(tx: LockContext, opIds: readonly string[]): Promise<void> {
  if (opIds.length === 0) return;
  await tx.execute(
    `UPDATE commands SET status = 'done' WHERE id IN (${opIds.map(() => '?').join(', ')})`,
    [...opIds],
  );
}

/**
 * The server rejected the op: its optimistic rows roll back, it leaves the queue, and it joins the
 * "didn't go through" list with the code the UI maps to copy (`errors.<code>`).
 */
export async function recordRejection(tx: LockContext, input: RejectionInput): Promise<void> {
  const row = await tx.getOptional<{ cmd: string; summary: string | null }>(
    'SELECT cmd, summary FROM commands WHERE id = ?',
    [input.opId],
  );
  if (row === null) return;
  await deleteOverlayRows(tx, input.opId);
  await tx.execute('DELETE FROM commands WHERE id = ?', [input.opId]);
  await tx.execute(
    `INSERT OR REPLACE INTO rejected_commands (id, cmd, code, detail, summary, rejected_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.opId,
      row.cmd,
      input.code,
      input.detail === undefined ? null : JSON.stringify(input.detail),
      row.summary,
      input.rejectedAt,
    ],
  );
}

/** Puts ops back in line after a failed attempt (their `seq` keeps them in original order). */
export async function requeueCommands(tx: LockContext, opIds: readonly string[], error: string) {
  if (opIds.length === 0) return;
  await tx.execute(
    `UPDATE commands SET status = 'queued', last_error = ?
      WHERE status = 'sending' AND id IN (${opIds.map(() => '?').join(', ')})`,
    [error, ...opIds],
  );
}
