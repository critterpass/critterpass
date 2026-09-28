/**
 * Uploading one chat attachment through the media api (docs/api-contracts.md §5.4): a presigned
 * PUT up to 5 MB, multipart above it (8 MB parts, presigned in batches, then completed). Returns
 * the media key `send_message` references, or why it could not upload.
 */
/* eslint-disable lingui/no-unlocalized-strings -- routes, wire values and error codes, never copy. */
import type { MediaHttp } from './media-services';

export const SINGLE_PUT_MAX_BYTES = 5 * 1024 * 1024;
const PART_BATCH = 20;

export type UploadOutcome =
  | { readonly kind: 'uploaded'; readonly mediaKey: string }
  | { readonly kind: 'offline' }
  | { readonly kind: 'error'; readonly code: string };

export interface UploadInput {
  readonly purpose: 'photo' | 'voice';
  readonly contentType: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

function codeOf(body: unknown, status: number): string {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : `HTTP_${String(status)}`;
}

async function attempt<T>(run: () => Promise<T>): Promise<T | 'offline'> {
  try {
    return await run();
  } catch {
    return 'offline';
  }
}

export async function uploadAttachment(
  http: MediaHttp,
  input: UploadInput,
  onProgress: (fraction: number) => void,
): Promise<UploadOutcome> {
  const request = {
    purpose: input.purpose,
    content_type: input.contentType,
    bytes: input.bytes.byteLength,
    sha256: input.sha256,
  };
  if (input.bytes.byteLength <= SINGLE_PUT_MAX_BYTES) {
    const presign = await attempt(() => http.postJson('/v1/media/presign', request));
    if (presign === 'offline') return { kind: 'offline' };
    const answer = presign.body as {
      media_key?: string;
      put_url?: string;
      headers?: Record<string, string>;
    };
    if (presign.status !== 200 || !answer.media_key || !answer.put_url) {
      return { kind: 'error', code: codeOf(presign.body, presign.status) };
    }
    const put = await attempt(() =>
      http.put(answer.put_url ?? '', answer.headers ?? {}, input.bytes, onProgress),
    );
    if (put === 'offline') return { kind: 'offline' };
    if (put.status < 200 || put.status >= 300)
      return { kind: 'error', code: `PUT_${String(put.status)}` };
    onProgress(1);
    return { kind: 'uploaded', mediaKey: answer.media_key };
  }

  const created = await attempt(() => http.postJson('/v1/media/multipart', request));
  if (created === 'offline') return { kind: 'offline' };
  const plan = created.body as {
    media_key?: string;
    upload_id?: string;
    part_bytes?: number;
    part_count?: number;
  };
  if (
    created.status !== 200 ||
    !plan.media_key ||
    !plan.upload_id ||
    !plan.part_bytes ||
    !plan.part_count
  ) {
    return { kind: 'error', code: codeOf(created.body, created.status) };
  }
  const key = encodeURIComponent(plan.media_key);
  const parts: { part_number: number; etag: string }[] = [];
  for (let first = 1; first <= plan.part_count; first += PART_BATCH) {
    const numbers = Array.from(
      { length: Math.min(PART_BATCH, plan.part_count - first + 1) },
      (_, index) => first + index,
    );
    const urls = await attempt(() =>
      http.postJson(`/v1/media/multipart/${key}/parts`, {
        upload_id: plan.upload_id,
        part_numbers: numbers,
      }),
    );
    if (urls === 'offline') return { kind: 'offline' };
    const signed = (urls.body as { parts?: { part_number: number; url: string }[] }).parts ?? [];
    if (urls.status !== 200) return { kind: 'error', code: codeOf(urls.body, urls.status) };
    for (const part of signed) {
      const start = (part.part_number - 1) * plan.part_bytes;
      const chunk = input.bytes.subarray(start, start + plan.part_bytes);
      const put = await attempt(() =>
        http.put(part.url, {}, chunk, (fraction) =>
          onProgress((start + fraction * chunk.byteLength) / input.bytes.byteLength),
        ),
      );
      if (put === 'offline') return { kind: 'offline' };
      if (put.status < 200 || put.status >= 300 || !put.etag) {
        return { kind: 'error', code: `PUT_${String(put.status)}` };
      }
      parts.push({ part_number: part.part_number, etag: put.etag });
    }
  }
  const done = await attempt(() =>
    http.postJson(`/v1/media/multipart/${key}/complete`, {
      upload_id: plan.upload_id,
      sha256: input.sha256,
      parts,
    }),
  );
  if (done === 'offline') return { kind: 'offline' };
  if (done.status !== 200) return { kind: 'error', code: codeOf(done.body, done.status) };
  onProgress(1);
  return { kind: 'uploaded', mediaKey: plan.media_key };
}
