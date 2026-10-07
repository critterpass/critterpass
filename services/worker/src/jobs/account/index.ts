/**
 * The account area's jobs besides the database purge, wired from the worker's environment:
 * `export.build` and the hourly `export.expire`, both against the media bucket (no bucket
 * configured: a build fails cleanly and the person can ask again), the "your data is ready" push,
 * the purge of what an account left outside Postgres, and the daily purge reminder. The earned
 * app icons register here too: they are part of the same account, opened by `reward.fanout`.
 */
import { LANGFUSE_DEFAULT_HOST } from '@cp/ai';

import type { AnyJobDefinition } from '../../boss/define-job';
import { registerAppIconUnlocks } from '../app-icons/unlock';
import { createAvatarMediaStore } from '../avatar/media-store';
import { exportBuildJob, exportExpireJob } from './export-build';
import { registerExportReadyPush } from './export-notify';
import { createObjectStore } from '../ops/object-store';
import { accountPurgeExternalJob, type ExternalPurgeStores } from './purge-external';
import { accountPurgeReminderJob } from './purge-reminder';

export interface AccountJobsEnv {
  readonly R2_S3_ENDPOINT?: string | undefined;
  readonly R2_BUCKET?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
  readonly POSTHOG_PROJECT_API_KEY?: string | undefined;
  readonly ANALYTICS_PID_SALT?: string | undefined;
  readonly LANGFUSE_PUBLIC_KEY?: string | undefined;
  readonly LANGFUSE_SECRET_KEY?: string | undefined;
  readonly LANGFUSE_HOST?: string | undefined;
}

/**
 * The stores the external purge erases from. Deleting an analytics person needs a personal API key
 * and the project's id (`POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`), which only this job
 * uses; they are read from the process environment.
 */
export function externalPurgeStores(
  env: AccountJobsEnv,
  processEnv: Record<string, string | undefined>,
): ExternalPurgeStores {
  const personalKey = processEnv.POSTHOG_PERSONAL_API_KEY;
  const projectId = processEnv.POSTHOG_PROJECT_ID;
  return {
    media:
      env.R2_S3_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
        ? createObjectStore({
            endpoint: env.R2_S3_ENDPOINT,
            bucket: env.R2_BUCKET,
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
          })
        : null,
    analytics: {
      collecting: Boolean(env.POSTHOG_PROJECT_API_KEY),
      admin: personalKey && projectId ? { apiKey: personalKey, projectId } : null,
      pidSalt: env.ANALYTICS_PID_SALT,
    },
    traces:
      env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY
        ? {
            publicKey: env.LANGFUSE_PUBLIC_KEY,
            secretKey: env.LANGFUSE_SECRET_KEY,
            host: env.LANGFUSE_HOST ?? LANGFUSE_DEFAULT_HOST,
          }
        : null,
  };
}

export function accountExportJobs(
  env: AccountJobsEnv,
  processEnv: Record<string, string | undefined> = process.env,
): AnyJobDefinition[] {
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
  registerAppIconUnlocks();
  return [
    exportBuildJob(store),
    exportExpireJob(store),
    accountPurgeExternalJob(externalPurgeStores(env, processEnv)),
    accountPurgeReminderJob(),
  ];
}
