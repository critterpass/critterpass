/**
 * Photo and voice-note messages wait here until their files are uploaded, then go out as one
 * `send_message` through the normal offline queue. Items live in the encrypted local database
 * (`local_state`, one row per message), so they survive the app being killed; they are processed
 * one at a time whenever the device is online. A message is sent exactly once: before sending, the
 * queue checks whether a send carrying the same media keys is already queued or synced.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, keys and content types, never copy. */
import { generateUuidV7 } from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CommandClient } from '@/data/commands/client';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import type { NetworkSource } from '@/data/status/network';
import { watchRows } from '@/data/status/watch-rows';

import { sendMessageCommand, type OutgoingMessage } from '../data/chat-commands';
import type { ChatMediaServices } from './media-services';
import { uploadAttachment } from './upload';

export const UPLOAD_KEY_PREFIX = 'chat_upload:';

export interface UploadFile {
  readonly uri: string;
  readonly kind: 'photo' | 'voice';
  readonly contentType: string;
  readonly w?: number;
  readonly h?: number;
  readonly durationMs?: number;
  readonly peaks?: readonly number[];
  /** Set once this file is uploaded. */
  readonly mediaKey?: string;
}

export interface UploadItem {
  readonly id: string;
  readonly crewId: string;
  readonly body: string;
  readonly replyTo?: string;
  readonly files: readonly UploadFile[];
  readonly state: 'waiting' | 'uploading' | 'failed';
  readonly progress: number;
  readonly error?: string;
  readonly createdAt: string;
}

export interface UploadQueueDeps {
  readonly db: AbstractPowerSyncDatabase;
  readonly commands: CommandClient;
  readonly media: ChatMediaServices;
  readonly network: NetworkSource;
}

async function save(db: AbstractPowerSyncDatabase, item: UploadItem): Promise<void> {
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    `${UPLOAD_KEY_PREFIX}${item.id}`,
    JSON.stringify(item),
  ]);
}

export async function listUploads(db: AbstractPowerSyncDatabase): Promise<UploadItem[]> {
  const rows = await db.getAll<{ value: string }>(
    `SELECT value FROM local_state WHERE id LIKE '${UPLOAD_KEY_PREFIX}%'`,
  );
  return rows
    .map((row) => JSON.parse(row.value) as UploadItem)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

async function remove(db: AbstractPowerSyncDatabase, id: string): Promise<void> {
  await db.execute('DELETE FROM local_state WHERE id = ?', [`${UPLOAD_KEY_PREFIX}${id}`]);
}

/** Whether a send carrying `mediaKey` is already queued, refused or synced. */
async function alreadySent(db: AbstractPowerSyncDatabase, mediaKey: string): Promise<boolean> {
  const like = `%${mediaKey.replace(/[%_]/gu, '')}%`;
  const row = await db.getOptional<{ n: number }>(
    `SELECT (SELECT count(*) FROM commands WHERE cmd = 'send_message' AND envelope LIKE ?)
          + (SELECT count(*) FROM messages WHERE attachments LIKE ?)
          + (SELECT count(*) FROM rejected_commands WHERE cmd = 'send_message' AND summary LIKE ?) AS n`,
    [like, like, like],
  );
  return Number(row?.n ?? 0) > 0;
}

export function createChatUploadQueue(deps: UploadQueueDeps) {
  const { db, media } = deps;
  let running: Promise<void> | null = null;

  async function uploadOne(item: UploadItem): Promise<UploadItem> {
    let current = { ...item, state: 'uploading' as const, progress: 0 };
    await save(db, current);
    const files = [...current.files];
    for (const [index, file] of files.entries()) {
      if (file.mediaKey !== undefined) continue;
      const bytes = await media.readBytes(file.uri);
      let saved = current.progress;
      const onProgress = (fraction: number) => {
        const overall = (index + fraction) / files.length;
        if (overall - saved < 0.1) return;
        saved = overall;
        current = { ...current, progress: overall };
        void save(db, current);
      };
      const outcome = await uploadAttachment(
        media.http,
        {
          purpose: file.kind,
          contentType: file.contentType,
          bytes,
          sha256: await media.sha256(bytes),
        },
        onProgress,
      );
      if (outcome.kind === 'offline') return { ...current, state: 'waiting' };
      if (outcome.kind === 'error') return { ...current, state: 'failed', error: outcome.code };
      files[index] = { ...file, mediaKey: outcome.mediaKey };
      current = { ...current, files, progress: (index + 1) / files.length };
      await save(db, current);
    }
    return current;
  }

  async function sendUploaded(item: UploadItem): Promise<void> {
    const keys = item.files.flatMap((file) => (file.mediaKey === undefined ? [] : [file.mediaKey]));
    if (keys.length !== item.files.length) return;
    const first = keys[0];
    if (first === undefined || !(await alreadySent(db, first))) {
      const payload: OutgoingMessage = {
        crew_id: item.crewId,
        body: item.body,
        mentions: [],
        mentions_guide: false,
        ...(item.replyTo === undefined ? {} : { reply_to: item.replyTo }),
        attachments: item.files.map((file) => ({
          media_key: file.mediaKey ?? '',
          kind: file.kind,
          ...(file.w === undefined ? {} : { w: file.w }),
          ...(file.h === undefined ? {} : { h: file.h }),
          ...(file.durationMs === undefined ? {} : { duration_ms: file.durationMs }),
          ...(file.peaks === undefined ? {} : { peaks: file.peaks }),
        })),
      };
      await deps.commands.send(sendMessageCommand, payload);
    }
    await remove(db, item.id);
  }

  async function drain(): Promise<void> {
    for (const item of await listUploads(db)) {
      if (!deps.network.isOnline()) return;
      if (item.state === 'failed') continue;
      const uploaded = await uploadOne(item);
      if (uploaded.state !== 'uploading') {
        await save(db, uploaded);
        if (uploaded.state === 'waiting') return;
        continue;
      }
      await sendUploaded(uploaded);
    }
  }

  /** Runs the queue once; concurrent calls share the run in flight. */
  function process(): Promise<void> {
    running ??= drain().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    process,
    async enqueue(input: Omit<UploadItem, 'id' | 'state' | 'progress' | 'createdAt'>) {
      const item: UploadItem = {
        ...input,
        id: generateUuidV7(),
        state: 'waiting',
        progress: 0,
        createdAt: new Date().toISOString(),
      };
      await save(db, item);
      void process();
      return item;
    },
    async retry(id: string) {
      const item = (await listUploads(db)).find((candidate) => candidate.id === id);
      if (item === undefined) return;
      const { error: _error, ...rest } = item;
      await save(db, { ...rest, state: 'waiting' });
      void process();
    },
    discard: (id: string) => remove(db, id),
  };
}

export type ChatUploadQueue = ReturnType<typeof createChatUploadQueue>;

/** The crew's pending media messages, and the queue that sends them (null without media). */
export function useUploadQueue(crewId: string, media: ChatMediaServices | null) {
  const { db, commands, network } = useLocalFirst();
  const queue = useMemo(
    () => (media === null ? null : createChatUploadQueue({ db, commands, media, network })),
    [db, commands, media, network],
  );
  const [items, setItems] = useState<readonly UploadItem[]>([]);
  useEffect(
    () =>
      watchRows<{ value: string }>(
        db,
        `SELECT value FROM local_state WHERE id LIKE '${UPLOAD_KEY_PREFIX}%'`,
        ['local_state'],
        (rows) =>
          setItems(
            rows
              .map((row) => JSON.parse(row.value) as UploadItem)
              .filter((item) => item.crewId === crewId)
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
          ),
      ),
    [db, crewId],
  );
  useEffect(() => {
    if (queue === null) return undefined;
    void queue.process();
    return network.subscribe((online) => {
      if (online) void queue.process();
    });
  }, [queue, network]);
  const add = useCallback(
    (input: Omit<UploadItem, 'id' | 'state' | 'progress' | 'createdAt' | 'crewId'>) =>
      queue?.enqueue({ ...input, crewId }) ?? Promise.resolve(null),
    [queue, crewId],
  );
  return { items, queue, add };
}
