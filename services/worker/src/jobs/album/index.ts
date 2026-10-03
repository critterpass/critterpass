/**
 * Album jobs, wired from the worker's environment: photo processing and "download all" need the
 * media bucket; without it there is nothing to process and no job is registered.
 */
import type { AnyJobDefinition } from '../../boss';
import { createAvatarMediaStore, type MediaStoreConfig } from '../avatar/media-store';
import { albumExportJob } from './export';
import { r2MultipartSinks } from './multipart-sink';
import { albumProcessPhotoJob } from './process-photo';

export interface AlbumJobsEnv {
  readonly R2_S3_ENDPOINT?: string | undefined;
  readonly R2_BUCKET?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
}

export function albumJobs(env: AlbumJobsEnv): AnyJobDefinition[] {
  if (!(env.R2_S3_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY)) {
    return [];
  }
  const config: MediaStoreConfig = {
    endpoint: env.R2_S3_ENDPOINT,
    bucket: env.R2_BUCKET,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
  const store = createAvatarMediaStore(config);
  return [albumProcessPhotoJob(store), albumExportJob(store, r2MultipartSinks(config))];
}
