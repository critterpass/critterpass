/**
 * The account area's export jobs, wired from the worker's environment: `export.build` and the
 * hourly `export.expire`, both against the media bucket (no bucket configured: a build fails
 * cleanly and the person can ask again), and the "your data is ready" push.
 */
import type { AnyJobDefinition } from '../../boss/define-job';
import { createAvatarMediaStore } from '../avatar/media-store';
import { exportBuildJob, exportExpireJob } from './export-build';
import { registerExportReadyPush } from './export-notify';

export interface AccountJobsEnv {
  readonly R2_S3_ENDPOINT?: string | undefined;
  readonly R2_BUCKET?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
}

export function accountExportJobs(env: AccountJobsEnv): AnyJobDefinition[] {
  const store =
    env.R2_S3_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
      ? createAvatarMediaStore({
          endpoint: env.R2_S3_ENDPOINT,
          bucket: env.R2_BUCKET,
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        })
      : null;
  registerExportReadyPush();
  return [exportBuildJob(store), exportExpireJob(store)];
}
