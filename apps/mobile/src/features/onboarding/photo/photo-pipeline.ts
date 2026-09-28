/**
 * The real-photo avatar path (3a-3 "USE A REAL PHOTO"): pick from the library (the system picker
 * needs no permission) or take one (camera, behind its just-in-time primer), lift the subject on
 * the device, fall back to a circle crop when no subject is found, then upload through the avatar
 * presign. Every step is a port so the screen's states are testable without native code.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and outcome kinds, never copy. */

export interface PickedPhoto {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

export type TakePhotoOutcome =
  | { readonly kind: 'taken'; readonly photo: PickedPhoto }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'denied' };

export interface PhotoPicker {
  pickFromLibrary(): Promise<PickedPhoto | null>;
  takePhoto(): Promise<TakePhotoOutcome>;
}

/** On-device subject segmentation; null when no subject was found. */
export interface SubjectLift {
  lift(uri: string): Promise<{ readonly uri: string } | null>;
}

/** The square PNG that gets uploaded: the cut-out, or the circle crop. */
export interface PreparedAvatar {
  readonly uri: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly cutout: boolean;
}

export type AvatarUploadOutcome =
  | { readonly kind: 'uploaded'; readonly mediaKey: string }
  | { readonly kind: 'rate_limited'; readonly retryAfterS: number | null }
  | { readonly kind: 'offline' }
  | { readonly kind: 'error'; readonly code: string };

export interface PhotoServices {
  readonly picker: PhotoPicker;
  /** Null on devices without segmentation: every photo takes the circle crop. */
  readonly lift: SubjectLift | null;
  /** Crops (cut-out or circle) to the square avatar PNG; `zoom` ≥ 1 crops tighter on the centre. */
  prepare(uri: string, lifted: boolean, zoom: number): Promise<PreparedAvatar>;
  upload(
    prepared: PreparedAvatar,
    onProgress: (fraction: number) => void,
  ): Promise<AvatarUploadOutcome>;
}

export interface PresignHttp {
  postJson(path: string, body: unknown): Promise<{ status: number; body: unknown }>;
  put(
    url: string,
    headers: Readonly<Record<string, string>>,
    bytes: Uint8Array,
    onProgress: (fraction: number) => void,
  ): Promise<number>;
}

interface PresignAnswer {
  readonly media_key: string;
  readonly put_url: string;
  readonly headers: Readonly<Record<string, string>>;
}

function isPresignAnswer(value: unknown): value is PresignAnswer {
  const v = value as Partial<PresignAnswer> | null;
  return typeof v?.media_key === 'string' && typeof v.put_url === 'string';
}

function errorOf(body: unknown): { code?: string; detail?: { retry_after_s?: number } } | null {
  const error = (body as { error?: { code?: string; detail?: { retry_after_s?: number } } } | null)
    ?.error;
  return error ?? null;
}

/** `POST /v1/media/presign {purpose: avatar}` then the signed PUT (docs/api-contracts.md §5.4). */
export async function uploadAvatar(
  http: PresignHttp,
  prepared: PreparedAvatar,
  onProgress: (fraction: number) => void,
): Promise<AvatarUploadOutcome> {
  let presign;
  try {
    presign = await http.postJson('/v1/media/presign', {
      purpose: 'avatar',
      content_type: 'image/png',
      bytes: prepared.bytes.byteLength,
      sha256: prepared.sha256,
    });
  } catch {
    return { kind: 'offline' };
  }
  if (presign.status === 429 || errorOf(presign.body)?.code === 'RATE_LIMITED') {
    return {
      kind: 'rate_limited',
      retryAfterS: errorOf(presign.body)?.detail?.retry_after_s ?? null,
    };
  }
  if (presign.status !== 200 || !isPresignAnswer(presign.body)) {
    return { kind: 'error', code: errorOf(presign.body)?.code ?? `HTTP_${String(presign.status)}` };
  }
  let status;
  try {
    status = await http.put(presign.body.put_url, presign.body.headers, prepared.bytes, onProgress);
  } catch {
    return { kind: 'offline' };
  }
  if (status < 200 || status >= 300) return { kind: 'error', code: `PUT_${String(status)}` };
  onProgress(1);
  return { kind: 'uploaded', mediaKey: presign.body.media_key };
}
