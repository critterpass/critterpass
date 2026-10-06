import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { EnqueueUploadRequest, PreparedPhoto, UploadEvents, UploadSnapshot } from './types';

/**
 * The native binding: iOS background URLSession, Android WorkManager. `null` where the module is
 * not linked (Jest, web), which the JS API reads as "background uploads unavailable".
 */
export declare class NativeCpMediaUploadModule extends NativeModule<UploadEvents> {
  preparePhoto(uri: string, id: string): Promise<PreparedPhoto>;
  enqueue(request: EnqueueUploadRequest): Promise<void>;
  /** Re-queues failed parts, with fresh presigned URLs keyed by part number. */
  retry(id: string, urls: Record<string, string>): Promise<void>;
  getUploads(): Promise<UploadSnapshot[]>;
  cancel(id: string): Promise<void>;
  finish(id: string): Promise<void>;
}

export const nativeCpMediaUploadModule =
  requireOptionalNativeModule<NativeCpMediaUploadModule>('CpMediaUpload');
