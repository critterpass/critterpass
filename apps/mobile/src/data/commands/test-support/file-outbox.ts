/**
 * The App Group outbox on a real directory, with the native store's file contract
 * (modules/cp-app-group/ios/AppGroupStore.swift): `{schema, generated_at, actions}` JSON, entries
 * removed by `op_id` (entries without one dropped), a newer schema left untouched, and every write a
 * temp file renamed over the target. Node runs one thread here, so each call is its own critical
 * section, as the native store's coordinated read-modify-write is.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test support; literals are file paths and wire values. */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { ExtensionOutbox } from '../drain-extension-outbox';

export const PENDING_ACTIONS_PATH = 'state/pending-actions.json';

/** The file the Swift store writes for the fixture action (its own tests check it byte-for-byte). */
export const SWIFT_STORE_FIXTURE = path.resolve(
  __dirname,
  '../../../../modules/cp-app-group/ios/Tests/Fixtures/pending-actions.json',
);

/** The file the lock-screen "I'M UP" intent writes (targets/widgets/Tests checks the writer against it). */
export const IM_UP_INTENT_FIXTURE = path.resolve(
  __dirname,
  '../../../../targets/widgets/Tests/Fixtures/im-up-pending-actions.json',
);

type OutboxFile = { schema: number; generated_at: string; actions: unknown[] };

export interface FileOutbox extends ExtensionOutbox {
  readonly file: string;
  /** What an extension does: append one entry. */
  append(entry: unknown): void;
  entries(): unknown[];
}

export function fileOutbox(root: string): FileOutbox {
  const file = path.join(root, PENDING_ACTIONS_PATH);

  function load(): OutboxFile {
    if (!existsSync(file)) {
      return { schema: 1, generated_at: new Date().toISOString(), actions: [] };
    }
    return JSON.parse(readFileSync(file, 'utf8')) as OutboxFile;
  }

  function update(change: (actions: unknown[]) => unknown[]): number {
    const current = load();
    if (current.schema !== 1) throw new Error(`${PENDING_ACTIONS_PATH}: unsupported schema`);
    const next = {
      ...current,
      generated_at: new Date().toISOString(),
      actions: change(current.actions),
    };
    mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temp, JSON.stringify(next));
    renameSync(temp, file);
    return next.actions.length;
  }

  return {
    file,
    read: () => (existsSync(file) ? readFileSync(file, 'utf8') : JSON.stringify(load())),
    remove: (opIds) =>
      update((actions) =>
        actions.filter((entry) => {
          const opId = (entry as { op_id?: unknown } | null)?.op_id;
          return typeof opId === 'string' && !opIds.includes(opId);
        }),
      ),
    clear: () => void update(() => []),
    append: (entry) => void update((actions) => [...actions, entry]),
    entries: () => load().actions,
  };
}
