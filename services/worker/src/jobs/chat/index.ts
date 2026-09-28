/**
 * Crew chat jobs (photo thumbnails, voice-note transcodes) and the chat push, wired from the
 * worker's environment. Without the media bucket the media jobs are not registered; their queued
 * messages keep showing the original photo and the recorded voice note.
 */
import type { AnyJobDefinition } from '../../boss';
import { createAvatarMediaStore } from '../avatar/media-store';
import { chatPhotoThumbnailJob } from './photo-thumbnail';
import { chatVoiceTranscodeJob } from './voice-transcode';

export { registerChatNotifications } from './notify';

export interface ChatJobsEnv {
  readonly R2_S3_ENDPOINT?: string | undefined;
  readonly R2_BUCKET?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
}

export function chatJobs(env: ChatJobsEnv): AnyJobDefinition[] {
  if (!(env.R2_S3_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY)) {
    return [];
  }
  const store = createAvatarMediaStore({
    endpoint: env.R2_S3_ENDPOINT,
    bucket: env.R2_BUCKET,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });
  return [chatPhotoThumbnailJob({ store }), chatVoiceTranscodeJob({ store })];
}
