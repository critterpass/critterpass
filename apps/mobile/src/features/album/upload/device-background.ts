/**
 * The device side of background album uploads: the system transfer module (looked up by name;
 * features never import native modules), the media api's multipart routes, and what is in flight
 * kept in the phone's key-value store so a relaunch can pick it up.
 */
/* eslint-disable lingui/no-unlocalized-strings -- routes, wire values and storage keys, never copy. */
import { requireOptionalNativeModule } from 'expo';
import { randomUUID } from 'expo-crypto';
import { createMMKV } from 'react-native-mmkv';

import type { CommandClient } from '@/data/commands/client';
import type { MediaHttp } from '@/features/crew';

import { registerPhotoCommand } from '../commands';
import {
  BackgroundUploadQueue,
  type Api,
  type BackgroundUploadPorts,
  type MultipartPlan,
  type PendingUpload,
  type Prepared,
  type TransferSnapshot,
} from './background-queue';

interface Subscription {
  remove(): void;
}

/** modules/cp-media-upload, as much of it as the queue uses. */
interface NativeMediaUpload {
  preparePhoto(uri: string, id: string): Promise<Prepared>;
  enqueue(request: Parameters<BackgroundUploadPorts['enqueue']>[0]): Promise<void>;
  retry(id: string, urls: Record<string, string>): Promise<void>;
  getUploads(): Promise<TransferSnapshot[]>;
  finish(id: string): Promise<void>;
  addListener(
    event: 'onUploadProgress',
    listener: (event: { id: string; sentBytes: number; totalBytes: number }) => void,
  ): Subscription;
  addListener(
    event: 'onUploadFailed' | 'onUploadFinished',
    listener: (event: { id: string }) => void,
  ): Subscription;
}

function native(): NativeMediaUpload | null {
  return requireOptionalNativeModule<NativeMediaUpload>('CpMediaUpload');
}

export function backgroundUploadsAvailable(): boolean {
  return native() !== null;
}

const STORE_KEY = 'cp.album.backgroundUploads';
const PART_BATCH = 20;

/** What the phone kept, read back; anything unreadable reads as nothing in flight. */
export function parsePending(raw: string | undefined): readonly PendingUpload[] {
  if (raw === undefined) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is PendingUpload =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as PendingUpload).id === 'string' &&
        typeof (item as PendingUpload).tripId === 'string' &&
        typeof (item as PendingUpload).photo?.uri === 'string',
    );
  } catch {
    return [];
  }
}

async function call<T>(
  run: () => Promise<{ status: number; body: unknown }>,
  read: (body: unknown) => T | null,
): Promise<Api<T>> {
  let response: { status: number; body: unknown };
  try {
    response = await run();
  } catch {
    return { kind: 'offline' };
  }
  const value = response.status === 200 ? read(response.body) : null;
  if (value !== null) return { kind: 'ok', value };
  const code = (response.body as { error?: { code?: unknown } } | null)?.error?.code;
  return { kind: 'error', code: typeof code === 'string' ? code : `HTTP_${response.status}` };
}

/** The media api's multipart routes (docs/api-contracts.md §5.4) for one photo. */
export function multipartApi(
  http: Pick<MediaHttp, 'postJson'>,
): Pick<BackgroundUploadPorts, 'createMultipart' | 'partUrls' | 'complete'> {
  const pathOf = (plan: MultipartPlan, tail: string) =>
    `/v1/media/multipart/${encodeURIComponent(plan.mediaKey)}/${tail}`;
  return {
    createMultipart: ({ bytes, sha256 }) =>
      call(
        () =>
          http.postJson('/v1/media/multipart', {
            purpose: 'photo',
            content_type: 'image/jpeg',
            bytes,
            sha256,
          }),
        (body) => {
          const plan = body as {
            media_key?: string;
            upload_id?: string;
            part_bytes?: number;
            part_count?: number;
          } | null;
          return plan?.media_key && plan.upload_id && plan.part_bytes && plan.part_count
            ? {
                mediaKey: plan.media_key,
                uploadId: plan.upload_id,
                partBytes: plan.part_bytes,
                partCount: plan.part_count,
              }
            : null;
        },
      ),
    partUrls: async (plan, partNumbers) => {
      const urls: Record<number, string> = {};
      for (let first = 0; first < partNumbers.length; first += PART_BATCH) {
        const batch = await call(
          () =>
            http.postJson(pathOf(plan, 'parts'), {
              upload_id: plan.uploadId,
              part_numbers: partNumbers.slice(first, first + PART_BATCH),
            }),
          (body) =>
            (body as { parts?: { part_number: number; url: string }[] } | null)?.parts ?? null,
        );
        if (batch.kind !== 'ok') return batch;
        for (const part of batch.value) urls[part.part_number] = part.url;
      }
      return { kind: 'ok', value: urls };
    },
    complete: (plan, sha256, parts) =>
      call(
        () => http.postJson(pathOf(plan, 'complete'), { upload_id: plan.uploadId, sha256, parts }),
        () => true as const,
      ),
  };
}

/** The app's background upload queue over the system module, or `null` where it is not linked. */
export function deviceBackgroundQueue(input: {
  readonly commands: CommandClient;
  readonly http: Pick<MediaHttp, 'postJson'>;
  readonly foreground: BackgroundUploadPorts['foreground'];
}): BackgroundUploadQueue | null {
  const module = native();
  if (module === null) return null;
  const storage = createMMKV();
  const queue = new BackgroundUploadQueue({
    ...multipartApi(input.http),
    prepare: (uri, id) => module.preparePhoto(uri, id),
    enqueue: (request) => module.enqueue(request),
    retry: (id, urls) =>
      module.retry(
        id,
        Object.fromEntries(Object.entries(urls).map(([part, url]) => [String(part), url])),
      ),
    transfers: () => module.getUploads(),
    finish: (id) => module.finish(id),
    register: (payload) => input.commands.send(registerPhotoCommand, payload),
    store: {
      load: () => parsePending(storage.getString(STORE_KEY)),
      save: (all) => storage.set(STORE_KEY, JSON.stringify(all)),
    },
    foreground: input.foreground,
    newId: () => randomUUID(),
  });
  module.addListener('onUploadProgress', (event) =>
    queue.onProgress(event.id, event.sentBytes, event.totalBytes),
  );
  module.addListener('onUploadFinished', (event) => queue.onSettled(event.id));
  module.addListener('onUploadFailed', (event) => queue.onSettled(event.id));
  return queue;
}
