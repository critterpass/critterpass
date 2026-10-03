/**
 * Recap jobs, wired from the worker's environment, and (once per process) the hook that queues a
 * build when a trip ends or late data lands. Leg distances route on Valhalla when `VALHALLA_URL` is
 * set, otherwise every leg is a straight-line estimate the recap marks as such. The guide writes the
 * copy when a model key is set (the template does otherwise), and reads it aloud when a voice and
 * the media bucket are configured (the story shows the words alone otherwise).
 */
import { createGateway, type AssertRouteOn, type Telemetry } from '@cp/ai';
import { onEventAppended } from '@cp/db';

import type { AnyJobDefinition } from '../../boss';
import { anniversaryScanJob } from '../anniversary/scan';
import { createAvatarMediaStore } from '../avatar/media-store';
import { createElevenLabs } from '../guide/elevenlabs';
import { straightLineRouter, valhallaRouter } from '../live-map/meetup-router';
import { recapBuildJob } from './build';
import type { RecapCopyWriter } from './copy';
import { recapMvpCloseJob } from './mvp-close';
import { recapNarrateJob, type RecapVoice } from './narrate';
import { recapEventHook } from './rerun';

export { registerRecapContributor } from './contributors';

export interface RecapJobsEnv {
  readonly VALHALLA_URL?: string | undefined;
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly ELEVENLABS_API_KEY?: string | undefined;
  readonly ELEVENLABS_VOICE_ID?: string | undefined;
  readonly R2_S3_ENDPOINT?: string | undefined;
  readonly R2_BUCKET?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
}

export interface RecapJobsDeps {
  readonly assertRouteOn: AssertRouteOn;
  readonly telemetry?: Telemetry | undefined;
  readonly onRouterError?: (error: unknown) => void;
}

function copyWriter(env: RecapJobsEnv, deps: RecapJobsDeps): RecapCopyWriter | undefined {
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

/** Recorded narration needs the voice provider and the media bucket; else text only. */
function recapVoice(env: RecapJobsEnv): RecapVoice | undefined {
  const { ELEVENLABS_API_KEY: apiKey, ELEVENLABS_VOICE_ID: voiceId } = env;
  if (!(apiKey && voiceId && env.R2_S3_ENDPOINT && env.R2_BUCKET)) return undefined;
  if (!(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY)) return undefined;
  return {
    tts: createElevenLabs({ apiKey }),
    store: createAvatarMediaStore({
      endpoint: env.R2_S3_ENDPOINT,
      bucket: env.R2_BUCKET,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    }),
    defaultVoiceId: voiceId,
  };
}

let hooked = false;

export function recapJobs(env: RecapJobsEnv, deps: RecapJobsDeps): AnyJobDefinition[] {
  if (!hooked) {
    hooked = true;
    onEventAppended(recapEventHook);
  }
  const router =
    env.VALHALLA_URL === undefined
      ? straightLineRouter
      : valhallaRouter({
          baseUrl: env.VALHALLA_URL,
          ...(deps.onRouterError === undefined ? {} : { onError: deps.onRouterError }),
        });
  return [
    recapBuildJob({ router, writer: copyWriter(env, deps) }),
    recapMvpCloseJob(),
    recapNarrateJob(recapVoice(env)),
    anniversaryScanJob(),
  ];
}
