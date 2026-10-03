/**
 * Album jobs, wired from the worker's environment, and (once per process) the hook that queues the
 * album's curation when photos come or go and when the trip moves on. Processing, curation and
 * "download all" need the media bucket; without it no album job is registered. The guide scores
 * and words the curation when a model key is set; code and the template do otherwise.
 */
import { createGateway, type AssertRouteOn, type Telemetry } from '@cp/ai';
import { onEventAppended, sendInTx } from '@cp/db';
import { albumCurateForEvent } from '@cp/domain';
import type pg from 'pg';

import type { AnyJobDefinition } from '../../boss';
import { createAvatarMediaStore, type MediaStoreConfig } from '../avatar/media-store';
import { albumCurateJob, type AlbumCurator } from './curate';
import { albumExportJob } from './export';
import { r2MultipartSinks } from './multipart-sink';
import { albumProcessPhotoJob } from './process-photo';

export interface AlbumJobsEnv {
  readonly R2_S3_ENDPOINT?: string | undefined;
  readonly R2_BUCKET?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
}

export interface AlbumJobsDeps {
  readonly assertRouteOn: AssertRouteOn;
  readonly telemetry?: Telemetry | undefined;
}

export async function albumEventHook(
  tx: pg.PoolClient,
  event: { readonly type: string; readonly tripId: string | null },
): Promise<void> {
  const request = albumCurateForEvent(event);
  if (request !== null) await sendInTx(tx, request.queue, request.data, request.options);
}

function curator(env: AlbumJobsEnv, deps: AlbumJobsDeps): AlbumCurator | undefined {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return undefined;
  return (onUsage) =>
    createGateway({
      apiKey,
      ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
      ...(deps.telemetry === undefined ? {} : { telemetry: deps.telemetry }),
      onUsage,
      assertRouteOn: deps.assertRouteOn,
    });
}

let hooked = false;

export function albumJobs(env: AlbumJobsEnv, deps: AlbumJobsDeps): AnyJobDefinition[] {
  if (!(env.R2_S3_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY)) {
    return [];
  }
  if (!hooked) {
    hooked = true;
    onEventAppended(albumEventHook);
  }
  const config: MediaStoreConfig = {
    endpoint: env.R2_S3_ENDPOINT,
    bucket: env.R2_BUCKET,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
  const store = createAvatarMediaStore(config);
  return [
    albumProcessPhotoJob(store),
    albumExportJob(store, r2MultipartSinks(config)),
    albumCurateJob(store, curator(env, deps)),
  ];
}
