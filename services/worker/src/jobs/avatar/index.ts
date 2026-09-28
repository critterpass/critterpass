/**
 * Photo avatar jobs: `avatar.moderate` and `avatar.render`, wired from the worker's environment.
 * Without the media bucket nothing can be read or written, so every photo waits for ops review
 * (moderation still files the report) and no variants are rendered.
 */
import { createGateway, type AssertRouteOn, type GatewayEnvOptions, type Telemetry } from '@cp/ai';

import type { AnyJobDefinition } from '../../boss';
import { photoDnaMatcher } from './hash-match';
import { createAvatarMediaStore } from './media-store';
import { avatarModerateJob } from './moderate';
import { avatarRenderJob } from './render';

export interface AvatarJobsEnv {
  readonly R2_S3_ENDPOINT?: string | undefined;
  readonly R2_BUCKET?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
  readonly PHOTODNA_API_KEY?: string | undefined;
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
}

export function avatarJobs(
  env: AvatarJobsEnv,
  /** The ops kill switches, checked before every model call. */
  assertRouteOn: AssertRouteOn,
  telemetry?: Telemetry,
): AnyJobDefinition[] {
  const store =
    env.R2_S3_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
      ? createAvatarMediaStore({
          endpoint: env.R2_S3_ENDPOINT,
          bucket: env.R2_BUCKET,
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        })
      : undefined;
  const generation: GatewayEnvOptions | undefined =
    env.ANTHROPIC_API_KEY === undefined
      ? undefined
      : {
          apiKey: env.ANTHROPIC_API_KEY,
          ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
        };
  const jobs: AnyJobDefinition[] = [
    avatarModerateJob({
      store,
      matcher:
        env.PHOTODNA_API_KEY === undefined
          ? undefined
          : photoDnaMatcher({ apiKey: env.PHOTODNA_API_KEY }),
      classifier:
        generation === undefined
          ? undefined
          : (onUsage) =>
              createGateway({
                ...generation,
                ...(telemetry === undefined ? {} : { telemetry }),
                onUsage,
                assertRouteOn,
              }),
    }),
  ];
  if (store !== undefined) jobs.push(avatarRenderJob({ store }));
  return jobs;
}
