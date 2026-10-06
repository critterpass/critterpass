/** A photo rewritten without its location, ready to upload. */
export interface PreparedPhoto {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly width?: number;
  readonly height?: number;
  /** EXIF capture time as the camera wrote it (`2026:10:04 09:30:00`, local, no zone). */
  readonly takenAt?: string;
  /** True once the written file was checked to carry no GPS position. */
  readonly gpsStripped: boolean;
}

/** One presigned PUT of a byte range of the prepared file. */
export interface UploadPartRequest {
  readonly partNumber: number;
  readonly url: string;
  readonly offset: number;
  readonly length: number;
}

export interface EnqueueUploadRequest {
  /** The app's id for the upload (the photo id). */
  readonly id: string;
  readonly filePath: string;
  readonly contentType: string;
  readonly parts: readonly UploadPartRequest[];
}

export type UploadState = 'uploading' | 'done' | 'failed';

export interface UploadSnapshot {
  readonly id: string;
  readonly state: UploadState;
  readonly filePath: string;
  readonly sentBytes: number;
  readonly totalBytes: number;
  /** `network`, `cancelled`, `bad_url` or `http_<status>` (403 = the presigned URL expired). */
  readonly failure?: string;
  readonly parts: readonly {
    readonly partNumber: number;
    readonly state: 'pending' | 'uploading' | 'done' | 'failed';
    readonly etag?: string;
  }[];
}

export type UploadEvents = {
  onUploadProgress(event: { id: string; sentBytes: number; totalBytes: number }): void;
  onUploadPartDone(event: { id: string; partNumber: number; etag: string }): void;
  onUploadFailed(event: { id: string; partNumber: number; reason: string }): void;
  onUploadFinished(event: { id: string }): void;
};
