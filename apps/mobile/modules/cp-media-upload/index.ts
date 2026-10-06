import type { EventSubscription } from 'expo-modules-core';

import { nativeCpMediaUploadModule } from './src/CpMediaUploadModule';
import type {
  EnqueueUploadRequest,
  PreparedPhoto,
  UploadEvents,
  UploadPartRequest,
  UploadSnapshot,
} from './src/types';

export type {
  EnqueueUploadRequest,
  PreparedPhoto,
  UploadEvents,
  UploadPartRequest,
  UploadSnapshot,
} from './src/types';

/**
 * Background photo uploads that keep going after the app is closed (iOS background URLSession,
 * Android WorkManager). The flow: `preparePhoto` (location removed, SHA-256 of the stripped
 * bytes) → presign (`POST /v1/media/presign` or the multipart create + parts routes) →
 * `enqueueUpload` → each part's ETag arrives in `onUploadPartDone` or in `getUploads()` after a
 * relaunch → the app completes the multipart upload and registers the photo, then `finishUpload`.
 */
export function isBackgroundUploadAvailable(): boolean {
  return nativeCpMediaUploadModule !== null;
}

function native() {
  if (!nativeCpMediaUploadModule) throw new Error('Background uploads are not available');
  return nativeCpMediaUploadModule;
}

export function preparePhoto(uri: string, id: string): Promise<PreparedPhoto> {
  return native().preparePhoto(uri, id);
}

/**
 * Byte ranges for a multipart upload with `partBytes` per part (the server's `part_bytes`); the
 * last part takes the remainder. Part numbers start at 1, as S3/R2 expect.
 */
export function partRanges(
  bytes: number,
  partBytes: number,
): { partNumber: number; offset: number; length: number }[] {
  if (bytes <= 0 || partBytes <= 0) throw new Error('partRanges needs positive sizes');
  const count = Math.ceil(bytes / partBytes);
  return Array.from({ length: count }, (_, index) => {
    const offset = index * partBytes;
    return { partNumber: index + 1, offset, length: Math.min(partBytes, bytes - offset) };
  });
}

export function enqueueUpload(request: EnqueueUploadRequest): Promise<void> {
  const total = request.parts.reduce((sum, part) => sum + part.length, 0);
  if (request.parts.length === 0 || total <= 0) {
    return Promise.reject(new Error('An upload needs at least one non-empty part'));
  }
  return native().enqueue(request);
}

export function retryUpload(id: string, urls: Readonly<Record<number, string>>): Promise<void> {
  const byPart = Object.fromEntries(Object.entries(urls).map(([part, url]) => [part, url]));
  return native().retry(id, byPart);
}

export function getUploads(): Promise<UploadSnapshot[]> {
  return nativeCpMediaUploadModule ? nativeCpMediaUploadModule.getUploads() : Promise.resolve([]);
}

export function cancelUpload(id: string): Promise<void> {
  return native().cancel(id);
}

/** Forgets a completed upload and deletes its prepared file. */
export function finishUpload(id: string): Promise<void> {
  return native().finish(id);
}

/** The parts as `{part_number, etag}` for the multipart complete call, or null while any is missing. */
export function completedParts(
  upload: UploadSnapshot,
): { part_number: number; etag: string }[] | null {
  const parts = upload.parts.map((part) =>
    part.state === 'done' && part.etag ? { part_number: part.partNumber, etag: part.etag } : null,
  );
  return parts.every((part) => part !== null) ? parts : null;
}

export function addUploadListener<E extends keyof UploadEvents>(
  event: E,
  listener: UploadEvents[E],
): EventSubscription | null {
  return nativeCpMediaUploadModule?.addListener(event, listener) ?? null;
}
