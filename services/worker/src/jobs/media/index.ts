/**
 * Editorial media jobs, wired from the worker's environment. Without the media bucket the ingest
 * job is not registered; published assets stay pending and the app keeps its flat colour heroes.
 */
import type { AnyJobDefinition } from '../../boss';
import { createAvatarMediaStore } from '../avatar/media-store';
import { mediaIngestJob } from './ingest';

export interface MediaJobsEnv {
  readonly R2_S3_ENDPOINT?: string | undefined;
  readonly R2_BUCKET?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
}

export function mediaJobs(env: MediaJobsEnv): AnyJobDefinition[] {
  if (!(env.R2_S3_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY)) {
    return [];
  }
  const store = createAvatarMediaStore({
    endpoint: env.R2_S3_ENDPOINT,
    bucket: env.R2_BUCKET,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });
  return [mediaIngestJob({ store })];
}
