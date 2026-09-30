/**
 * The guide's worker jobs, with the process's gateway: crew-chat mention replies, proactive offers,
 * queued answers at each zone's midnight and custom phrase cards. Without a model key none of them
 * is registered (mentions are then answered only from the app's stream).
 */
import type { AnyJobDefinition } from '../../boss';
import { createAvatarMediaStore } from '../avatar/media-store';
import { createElevenLabs } from './elevenlabs';
import { guideMentionJob } from './mention';
import { phraseTtsJob, type PhraseVoice } from './phrase-tts';
import { guideProactiveJob } from './proactive';
import { queuedAnswerJob } from './queued-answer';
import { guideRuntime, type GuideJobsDeps, type GuideJobsEnv } from './runtime';

export interface PhraseVoiceEnv {
  readonly ELEVENLABS_API_KEY?: string | undefined;
  /** Voice for guides whose persona names none. */
  readonly ELEVENLABS_VOICE_ID?: string | undefined;
  readonly R2_S3_ENDPOINT?: string | undefined;
  readonly R2_BUCKET?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
}

/** Recorded phrase audio needs the voice provider and the media bucket; else on-device speech. */
export function phraseVoiceFromEnv(env: PhraseVoiceEnv): PhraseVoice | undefined {
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

export function guideJobs(
  env: GuideJobsEnv & PhraseVoiceEnv,
  pool: GuideJobsDeps['pool'],
  assertRouteOn: GuideJobsDeps['assertRouteOn'],
  telemetry?: GuideJobsDeps['telemetry'],
): AnyJobDefinition[] {
  const runtime = guideRuntime(env, { pool, assertRouteOn, telemetry });
  if (runtime === undefined) return [];
  return [
    guideMentionJob(runtime),
    guideProactiveJob(runtime),
    queuedAnswerJob(runtime),
    phraseTtsJob(runtime, phraseVoiceFromEnv(env)),
  ];
}
