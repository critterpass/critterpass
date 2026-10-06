/**
 * The shapes background album uploads work with: what the media api answers, what the system's
 * transfer service reports, what the phone keeps about a photo on its way up, and the boundaries
 * the queue is given.
 */
import type { RegisterPhotoPayload } from '@cp/domain';

import type { SendResult } from '@/data/commands/client';

import type { PickedAlbumPhoto, UploadState } from './upload-queue';

export type Api<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'offline' }
  | { readonly kind: 'error'; readonly code: string };

export interface Prepared {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly width?: number;
  readonly height?: number;
  readonly gpsStripped: boolean;
}

export interface MultipartPlan {
  readonly mediaKey: string;
  readonly uploadId: string;
  readonly partBytes: number;
  readonly partCount: number;
}

export interface TransferSnapshot {
  readonly id: string;
  readonly state: 'uploading' | 'done' | 'failed';
  readonly sentBytes: number;
  readonly totalBytes: number;
  readonly failure?: string;
  readonly parts: readonly {
    readonly partNumber: number;
    readonly state: 'pending' | 'uploading' | 'done' | 'failed';
    readonly etag?: string;
  }[];
}

/** `new` → `transferring` (the system owns it) → `transferred` → `completed` → registered. */
export type Stage = 'new' | 'transferring' | 'transferred' | 'completed';

/** What the phone keeps about a photo on its way up. */
export interface PendingUpload {
  readonly id: string;
  readonly tripId: string;
  readonly photo: PickedAlbumPhoto;
  readonly stage: Stage;
  readonly state: UploadState;
  readonly prepared?: Prepared;
  readonly plan?: MultipartPlan;
  /** Upload links renewed for this photo so far. */
  readonly renewals: number;
}

export interface BackgroundUploadPorts {
  readonly prepare: (uri: string, id: string) => Promise<Prepared>;
  readonly createMultipart: (input: {
    readonly bytes: number;
    readonly sha256: string;
  }) => Promise<Api<MultipartPlan>>;
  readonly partUrls: (
    plan: MultipartPlan,
    partNumbers: readonly number[],
  ) => Promise<Api<Readonly<Record<number, string>>>>;
  readonly complete: (
    plan: MultipartPlan,
    sha256: string,
    parts: readonly { readonly part_number: number; readonly etag: string }[],
  ) => Promise<Api<true>>;
  readonly enqueue: (request: {
    readonly id: string;
    readonly filePath: string;
    readonly contentType: string;
    readonly parts: readonly {
      readonly partNumber: number;
      readonly url: string;
      readonly offset: number;
      readonly length: number;
    }[];
  }) => Promise<void>;
  readonly retry: (id: string, urls: Readonly<Record<number, string>>) => Promise<void>;
  readonly transfers: () => Promise<readonly TransferSnapshot[]>;
  /** Forgets the transfer and deletes the prepared file. */
  readonly finish: (id: string) => Promise<void>;
  readonly register: (payload: RegisterPhotoPayload) => Promise<SendResult>;
  readonly store: {
    readonly load: () => readonly PendingUpload[];
    readonly save: (all: readonly PendingUpload[]) => void;
  };
  /** Uploads a photo the system would not take, with the app open. */
  readonly foreground: (
    tripId: string,
    photo: PickedAlbumPhoto,
    known: ReadonlySet<string>,
  ) => void;
  readonly newId: () => string;
}
