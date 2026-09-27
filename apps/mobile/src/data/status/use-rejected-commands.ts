/**
 * The "didn't go through" list: ops the server rejected, newest first, each with the error code
 * whose copy key (`errors.<code>`) the UI shows and offers a fix for. Entries stay until dismissed.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, never copy. */
import { errorMessageKey, type ErrorCode } from '@cp/domain';
import type { MessageDescriptor } from '@lingui/core';
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useCallback } from 'react';

import { summaryOrName } from '../commands/summaries';
import { useLocalFirst } from '../powersync/local-first-context';
import { useWatchedRows, watchRows } from './watch-rows';

export interface RejectedCommand {
  readonly opId: string;
  readonly cmd: string;
  readonly code: string;
  /** i18n key for the code's copy (`errors.<code>`). */
  readonly messageKey: string;
  readonly detail: unknown;
  readonly summary: MessageDescriptor;
  readonly rejectedAt: string;
}

interface Row {
  readonly id: string;
  readonly cmd: string;
  readonly code: string;
  readonly detail: string | null;
  readonly summary: string | null;
  readonly rejected_at: string;
}

const SQL = `SELECT id, cmd, code, detail, summary, rejected_at FROM rejected_commands
              ORDER BY rejected_at DESC, id DESC`;
const TABLES = ['rejected_commands'];

function parse(detail: string | null): unknown {
  if (detail === null) return null;
  try {
    return JSON.parse(detail) as unknown;
  } catch {
    return detail;
  }
}

function toRejected(row: Row): RejectedCommand {
  return {
    opId: row.id,
    cmd: row.cmd,
    code: row.code,
    messageKey: errorMessageKey(row.code as ErrorCode),
    detail: parse(row.detail),
    summary: summaryOrName(row.cmd, row.summary),
    rejectedAt: row.rejected_at,
  };
}

export async function listRejectedCommands(
  db: AbstractPowerSyncDatabase,
): Promise<RejectedCommand[]> {
  return (await db.getAll<Row>(SQL)).map(toRejected);
}

export function watchRejectedCommands(
  db: AbstractPowerSyncDatabase,
  onChange: (items: RejectedCommand[]) => void,
): () => void {
  return watchRows<Row>(db, SQL, TABLES, (rows) => onChange(rows.map(toRejected)));
}

export async function dismissRejected(db: AbstractPowerSyncDatabase, opId: string): Promise<void> {
  await db.execute('DELETE FROM rejected_commands WHERE id = ?', [opId]);
}

export function useRejectedCommands() {
  const { db } = useLocalFirst();
  const items = useWatchedRows<Row, RejectedCommand>(db, SQL, TABLES, toRejected);
  const dismiss = useCallback((opId: string) => dismissRejected(db, opId), [db]);
  return { items, dismiss };
}
