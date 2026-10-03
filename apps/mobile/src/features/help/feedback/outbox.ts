/**
 * Feedback waits here until its attachments are uploaded, then goes out as one `submit_feedback`
 * through the normal offline queue. Items live in the encrypted local database (`local_state`, one
 * row per ticket), so a note written offline survives the app being closed; they are processed
 * whenever the device is online. Each file is uploaded once (its key is kept as it lands), and the
 * ticket's own id makes a repeated send land as the same ticket.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, keys and wire values, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import type { CommandClient } from '@/data/commands/client';

import { submitFeedbackCommand } from './commands';
import type { FeedbackPayload } from './draft';

export const FEEDBACK_KEY_PREFIX = 'feedback_outbox:';

export interface OutboxFile {
  readonly uri: string;
  readonly contentType: string;
  /** Set once the file is uploaded. */
  readonly mediaKey?: string;
}

export interface OutboxItem {
  readonly id: string;
  readonly payload: FeedbackPayload;
  readonly files: readonly OutboxFile[];
}

export interface OutboxHttpResponse {
  readonly status: number;
  readonly body: unknown;
}

/** The media api and the device's file access, as ports (the network boundary in tests). */
export interface OutboxPorts {
  readonly postJson: (path: string, body: unknown) => Promise<OutboxHttpResponse>;
  readonly put: (
    url: string,
    headers: Readonly<Record<string, string>>,
    bytes: Uint8Array,
  ) => Promise<OutboxHttpResponse>;
  readonly readBytes: (uri: string) => Promise<Uint8Array>;
  readonly sha256: (bytes: Uint8Array) => Promise<string>;
}

export async function saveOutboxItem(
  db: AbstractPowerSyncDatabase,
  item: OutboxItem,
): Promise<void> {
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    `${FEEDBACK_KEY_PREFIX}${item.id}`,
    JSON.stringify(item),
  ]);
}

export async function readOutbox(db: AbstractPowerSyncDatabase): Promise<OutboxItem[]> {
  const rows = await db.getAll<{ value: string }>(
    `SELECT value FROM local_state WHERE id LIKE '${FEEDBACK_KEY_PREFIX}%'`,
  );
  return rows.map((row) => JSON.parse(row.value) as OutboxItem);
}

async function removeOutboxItem(db: AbstractPowerSyncDatabase, id: string): Promise<void> {
  await db.execute('DELETE FROM local_state WHERE id = ?', [`${FEEDBACK_KEY_PREFIX}${id}`]);
}

type UploadResult = { readonly kind: 'uploaded'; readonly key: string } | { readonly kind: 'wait' };

async function uploadOne(ports: OutboxPorts, file: OutboxFile): Promise<UploadResult> {
  try {
    const bytes = await ports.readBytes(file.uri);
    const presign = await ports.postJson('/v1/media/presign', {
      purpose: 'feedback',
      content_type: file.contentType,
      bytes: bytes.byteLength,
      sha256: await ports.sha256(bytes),
    });
    const answer = presign.body as {
      media_key?: string;
      put_url?: string;
      headers?: Record<string, string>;
    };
    if (presign.status !== 200 || !answer.media_key || !answer.put_url) return { kind: 'wait' };
    const put = await ports.put(answer.put_url, answer.headers ?? {}, bytes);
    if (put.status < 200 || put.status >= 300) return { kind: 'wait' };
    return { kind: 'uploaded', key: answer.media_key };
  } catch {
    return { kind: 'wait' };
  }
}

/**
 * Uploads what is left of each waiting item and queues the ones whose files are all up. Returns
 * how many went into the queue; an item whose upload could not finish stays for the next run.
 */
export async function drainFeedbackOutbox(deps: {
  readonly db: AbstractPowerSyncDatabase;
  readonly commands: CommandClient;
  readonly ports: OutboxPorts;
}): Promise<number> {
  let queued = 0;
  for (const item of await readOutbox(deps.db)) {
    const files = [...item.files];
    let waiting = false;
    for (const [index, file] of files.entries()) {
      if (file.mediaKey !== undefined) continue;
      const result = await uploadOne(deps.ports, file);
      if (result.kind === 'wait') {
        waiting = true;
        break;
      }
      files[index] = { ...file, mediaKey: result.key };
      await saveOutboxItem(deps.db, { ...item, files });
    }
    if (waiting) continue;
    const mediaKeys = files.flatMap((file) => (file.mediaKey === undefined ? [] : [file.mediaKey]));
    await deps.commands.send(submitFeedbackCommand, { ...item.payload, media_keys: mediaKeys });
    await removeOutboxItem(deps.db, item.id);
    queued += 1;
  }
  return queued;
}
