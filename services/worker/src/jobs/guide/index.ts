/**
 * The guide's worker jobs, with the process's gateway: crew-chat mention replies, proactive offers,
 * queued answers at each zone's midnight and custom phrase cards. Without a model key none of them
 * is registered (mentions are then answered only from the app's stream).
 */
import type { AnyJobDefinition } from '../../boss';
import { guideMentionJob } from './mention';
import { guideProactiveJob } from './proactive';
import { guideRuntime, type GuideJobsDeps, type GuideJobsEnv } from './runtime';

export function guideJobs(env: GuideJobsEnv, deps: GuideJobsDeps): AnyJobDefinition[] {
  const runtime = guideRuntime(env, deps);
  if (runtime === undefined) return [];
  return [guideMentionJob(runtime), guideProactiveJob(runtime)];
}
