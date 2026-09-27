/**
 * The "SENDS WHEN YOU'RE BACK" list (3k-4) and chat pending marks: every op still in the local
 * queue, oldest first, with its human summary and `queued → sending → done` progress. An op leaves
 * the list once its server result has synced (or it moves to the rejected list).
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, never copy. */
import type { MessageDescriptor } from '@lingui/core';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { summaryOrName } from '../commands/summaries';
import type { CommandStatus } from '../powersync/local-tables';
import { useLocalFirst } from '../powersync/local-first-context';
import { useWatchedRows, watchRows } from './watch-rows';

export interface QueuedCommand {
  readonly opId: string;
  readonly cmd: string;
  readonly status: CommandStatus;
  readonly summary: MessageDescriptor;
  readonly attempts: number;
  readonly createdAt: string;
}

interface Row {
  readonly id: string;
  readonly cmd: string;
  readonly status: CommandStatus;
  readonly summary: string | null;
  readonly attempts: number;
  readonly created_at: string;
}

const SQL = 'SELECT id, cmd, status, summary, attempts, created_at FROM commands ORDER BY seq';
const TABLES = ['commands'];

function toQueued(row: Row): QueuedCommand {
  return {
    opId: row.id,
    cmd: row.cmd,
    status: row.status,
    summary: summaryOrName(row.cmd, row.summary),
    attempts: row.attempts,
    createdAt: row.created_at,
  };
}

export async function listQueuedCommands(db: AbstractPowerSyncDatabase): Promise<QueuedCommand[]> {
  return (await db.getAll<Row>(SQL)).map(toQueued);
}

export function watchQueuedCommands(
  db: AbstractPowerSyncDatabase,
  onChange: (items: QueuedCommand[]) => void,
): () => void {
  return watchRows<Row>(db, SQL, TABLES, (rows) => onChange(rows.map(toQueued)));
}

export function useQueuedCommands(): readonly QueuedCommand[] {
  const { db } = useLocalFirst();
  return useWatchedRows<Row, QueuedCommand>(db, SQL, TABLES, toQueued);
}
