/**
 * Moves commands that extensions queued in the App Group (`state/pending-actions.json`,
 * docs/api-contracts-async.md §4, §6) into the app's own upload queue, on launch and every return
 * to the foreground. Each entry keeps its extension-generated `op_id` and `via`; the app adds what
 * only it knows (the signed-in uid and this device). Transfer is at-least-once and the server
 * dedupes on `op_id`, so every command applies exactly once:
 *
 * 1. read the file (entries an extension appends after this stay in the file for the next drain);
 * 2. insert every valid entry not already queued, in one local transaction;
 * 3. remove exactly those entries from the file (coordinated with extension writes natively).
 *
 * A crash between 2 and 3 re-reads the same entries next time; they are skipped while still
 * queued, and once uploaded a repeat comes back from the server as `duplicate`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a wire value or a developer-facing error, never copy. */
import { readPendingActions, type CommandDevice, type PendingAction } from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { registerOnSignOut } from '../auth/sign-out-hooks';
import { insertQueuedCommand } from '../powersync/queue-store';

/** The App Group outbox as the cp-app-group native module exposes it. */
export interface ExtensionOutbox {
  /** Raw text of `state/pending-actions.json` (an empty file when nothing was queued). */
  read(): string;
  /** Removes the listed entries, keeping anything appended meanwhile; returns how many remain. */
  remove(opIds: readonly string[]): number;
  /** Drops every entry (account switch). */
  clear(): void;
}

export interface DrainExtensionOutboxOptions {
  readonly db: AbstractPowerSyncDatabase;
  readonly outbox: ExtensionOutbox;
  readonly uid: () => string;
  readonly device: () => Promise<CommandDevice>;
  readonly queue: { schedule(): void };
}

export interface DrainResult {
  /** Entries newly added to the upload queue. */
  readonly queued: number;
  /** Malformed entries removed from the file: they could never be sent. */
  readonly dropped: number;
}

function envelopeFor(action: PendingAction, uid: string, device: CommandDevice) {
  return {
    op_id: action.op_id,
    cmd: action.cmd,
    v: action.v,
    actor: { uid, via: action.via },
    device,
    client_ts: action.client_ts,
    ...(action.base_version !== undefined ? { base_version: action.base_version } : {}),
    payload: action.payload,
  };
}

export async function drainExtensionOutbox(
  options: DrainExtensionOutboxOptions,
): Promise<DrainResult> {
  const read = readPendingActions(options.outbox.read());
  // Written by a newer build (or unreadable): leave it for a build that understands it.
  if (read.kind === 'unsupported') return { queued: 0, dropped: 0 };
  if (read.actions.length === 0 && read.invalid.length === 0) return { queued: 0, dropped: 0 };

  const uid = options.uid();
  const device = await options.device();
  const queued = await options.db.writeTransaction(async (tx) => {
    let added = 0;
    for (const action of read.actions) {
      const existing = await tx.getOptional('SELECT 1 FROM commands WHERE id = ?', [action.op_id]);
      if (existing !== null) continue;
      await insertQueuedCommand(tx, {
        opId: action.op_id,
        cmd: action.cmd,
        envelope: envelopeFor(action, uid, device),
        summary: null,
        createdAt: action.client_ts,
      });
      added += 1;
    }
    return added;
  });
  options.outbox.remove([...read.actions.map((action) => action.op_id), ...read.invalid]);
  if (queued > 0) options.queue.schedule();
  return { queued, dropped: read.invalid.length };
}

/** The slice of React Native's `AppState` the drain listens to. */
export interface ForegroundSource {
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

/**
 * Drains now and on every return to the foreground; concurrent triggers share one run. Returns
 * the function that stops listening.
 */
export function startExtensionOutboxDrain(
  options: DrainExtensionOutboxOptions & {
    readonly appState: ForegroundSource;
    readonly onError?: (error: unknown) => void;
  },
): () => void {
  let running: Promise<unknown> | null = null;
  const drain = () => {
    running ??= drainExtensionOutbox(options)
      .catch((error: unknown) => options.onError?.(error))
      .finally(() => {
        running = null;
      });
  };
  drain();
  const subscription = options.appState.addEventListener('change', (state) => {
    if (state === 'active') drain();
  });
  return () => subscription.remove();
}

/** Sign-out, merge and `SESSION_REVOKED` drop whatever extensions queued for the previous uid. */
export function registerExtensionOutboxReset(outbox: ExtensionOutbox): void {
  registerOnSignOut(() => outbox.clear());
}
