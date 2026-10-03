/**
 * Every job definition the worker runs, built from its dependencies. The entry point starts the
 * runtime with this list; tests build the same list to check registry-wide rules (for example,
 * that each scheduled queue accepts the payload its cron sends).
 */
import type { Telemetry } from '@cp/ai';
import type { KillSwitchReader } from '@cp/db';
import type pg from 'pg';

import { aiJobs, guideJobs } from './ai';
import type { AnyJobDefinition } from './boss';
import { contentJobs } from './content';
import { costRecomputeJob } from './cost/recompute';
import type { WorkerEnv } from './env';
import { guideActionExecuteJob, guideActionUndoExpireJob } from './guide-actions';
import { draftJobs } from './jobs/ai/draft';
import { avatarJobs } from './jobs/avatar';
import { billingJobs } from './jobs/billing';
import { bookingsJobs } from './jobs/bookings';
import { chatJobs } from './jobs/chat';
import { mediaJobs } from './jobs/media';
import { countdownRecomputeJob } from './jobs/countdown';
import { inboxFanoutJob } from './jobs/inbox';
import { inviteJobs } from './jobs/invites';
import { liveMapJobs } from './jobs/live-map';
import { fixesTtlJob } from './jobs/location/fixes-ttl';
import { visitsTtlJob } from './jobs/location/visits-ttl';
import { accountExportJobs } from './jobs/account';
import { accountPurgeJob } from './jobs/account/purge';
import { anonGcJob } from './jobs/maint/anon-gc';
import { purgeJob } from './jobs/maint/purge';
import { moneyJobs } from './jobs/money';
import { notifyReleaseJob, notifyRouteJob } from './jobs/notify';
import { nudgeDispatchJob } from './jobs/nudges';
import { aiCostGuardJob } from './jobs/ops/ai-cost-guard';
import { backupJob } from './jobs/ops/backup';
import { createObjectStore } from './jobs/ops/object-store';
import { pitchJobs } from './jobs/pitches';
import { planJobs } from './jobs/plan';
import { pollBoardAdvanceJob, pollCloseJob, pollRemindJob } from './jobs/polls';
import { pushSendJob } from './jobs/push/send';
import { roundupBuildJob, roundupScanJob } from './jobs/roundup/build';
import { enqueueDueJob } from './jobs/sched/enqueue-due';
import { setupJobs } from './jobs/setup';
import { tipsJobs } from './jobs/tips';
import type { createLogger } from './obs/logger';
import type { MetricsRecorder } from './obs/metrics';
import { defaultBundleId, type CopyRenderer, type PushProviders } from './push';
import { createCentrifugoApi, rtRelayJob } from './rt-relay';
import { travelDataJobs } from './travel-data';

export interface JobRegistryDeps {
  readonly env: WorkerEnv;
  /** The raw process environment, for the job families that read optional keys directly. */
  readonly processEnv: Record<string, string | undefined>;
  readonly pool: pg.Pool;
  readonly logger: ReturnType<typeof createLogger>;
  readonly aiSwitches: KillSwitchReader;
  readonly llmObservability: Telemetry;
  readonly metrics: MetricsRecorder;
  readonly renderer: CopyRenderer;
  readonly pushProviders: PushProviders;
}

export async function buildJobRegistry(deps: JobRegistryDeps): Promise<AnyJobDefinition[]> {
  const { env, processEnv, pool, logger, aiSwitches, llmObservability, renderer } = deps;
  const assertRouteOn = aiSwitches.assertAiRoute;
  const jobs: AnyJobDefinition[] = [
    enqueueDueJob(),
    purgeJob(),
    aiCostGuardJob(),
    anonGcJob(),
    accountPurgeJob(),
    ...accountExportJobs(env),
    fixesTtlJob(),
    visitsTtlJob(),
    ...inviteJobs(env),
    guideActionExecuteJob(),
    guideActionUndoExpireJob(),
    ...aiJobs(
      env,
      (error) => logger.warn({ err: error }, 'langfuse export failed'),
      llmObservability,
      assertRouteOn,
    ),
    ...travelDataJobs(env, pool, logger.child({ component: 'travel-data' }), assertRouteOn),
    ...contentJobs(),
    costRecomputeJob,
    ...avatarJobs(env, assertRouteOn, llmObservability),
    ...chatJobs(env),
    ...mediaJobs(env),
    ...liveMapJobs(env, (error) => logger.warn({ err: error }, 'valhalla matrix failed')),
    inboxFanoutJob(),
    nudgeDispatchJob(),
    countdownRecomputeJob(),
    pollCloseJob(),
    pollBoardAdvanceJob(),
    pollRemindJob(),
    ...tipsJobs(env, assertRouteOn, llmObservability),
    ...pitchJobs(env, assertRouteOn, llmObservability),
    ...setupJobs(env, { pool, assertRouteOn, telemetry: llmObservability }),
    ...draftJobs(env, { pool, assertRouteOn, telemetry: llmObservability }),
    ...moneyJobs(env, { pool, assertRouteOn, telemetry: llmObservability }),
    ...bookingsJobs(env, pool, assertRouteOn, llmObservability),
    ...billingJobs(processEnv, logger, deps.metrics),
    ...planJobs(),
    ...guideJobs({ ...processEnv, ...env }, pool, assertRouteOn, llmObservability),
    ...(await import('./jobs/suppliers')).supplierJobs(env, pool, logger, aiSwitches, processEnv),
    ...(await import('./jobs/trip-day')).tripDayJobs(processEnv, aiSwitches, llmObservability),
    ...(await import('./jobs/place-details')).placeDetailsJobs(env, logger),
    ...(await import('./jobs/disruptions')).disruptionJobs(
      processEnv,
      aiSwitches,
      llmObservability,
    ),
    ...(await import('./jobs/proposal')).proposalJobs(env, pool, aiSwitches, llmObservability),
    ...(await import('./jobs/critters')).critterJobs(),
    ...(await import('./jobs/quests')).questJobs(processEnv, aiSwitches, llmObservability),
    ...(await import('./jobs/trips/lifecycle-jobs')).tripLifecycleJobs(),
    ...(await import('./jobs/album')).albumJobs(
      { ...processEnv, ...env },
      { assertRouteOn, telemetry: llmObservability },
    ),
    ...(await import('./jobs/recap')).recapJobs(
      { ...processEnv, ...env },
      {
        assertRouteOn,
        telemetry: llmObservability,
        onRouterError: (error) => logger.warn({ err: error }, 'valhalla route failed'),
      },
    ),
    ...(await import('./jobs/safety')).safetyJobs(processEnv, aiSwitches, llmObservability),
    ...(await import('./jobs/la')).laJobs({
      ...deps,
      switches: aiSwitches,
      defaultBundleId: defaultBundleId(env.APP_ENV),
    }),
    ...(await import('./jobs/widgets')).widgetJobs({
      ...(deps.pushProviders.apns === undefined ? {} : { apns: deps.pushProviders.apns }),
      ...(deps.pushProviders.fcm === undefined ? {} : { fcm: deps.pushProviders.fcm }),
      switches: aiSwitches,
      defaultBundleId: defaultBundleId(env.APP_ENV),
    }),
  ];

  const backupStore =
    env.BACKUP_S3_ENDPOINT &&
    env.BACKUP_S3_BUCKET &&
    env.BACKUP_S3_ACCESS_KEY_ID &&
    env.BACKUP_S3_SECRET_ACCESS_KEY
      ? createObjectStore({
          endpoint: env.BACKUP_S3_ENDPOINT,
          bucket: env.BACKUP_S3_BUCKET,
          accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID,
          secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY,
          region: env.BACKUP_S3_REGION,
        })
      : undefined;
  if (env.APP_ENV !== 'local' || (backupStore && env.BACKUP_DATABASE_URL)) {
    jobs.push(
      backupJob({
        databaseUrl: env.BACKUP_DATABASE_URL,
        store: backupStore,
        pgDump: [env.BACKUP_PG_DUMP_PATH],
      }),
    );
  }
  if (env.CENTRIFUGO_API_URL && env.CENTRIFUGO_HTTP_API_KEY) {
    jobs.push(
      rtRelayJob(
        createCentrifugoApi({
          baseUrl: env.CENTRIFUGO_API_URL,
          apiKey: env.CENTRIFUGO_HTTP_API_KEY,
        }),
      ),
    );
  } else {
    logger.warn(
      'rt_outbox relay is disabled: CENTRIFUGO_API_URL or CENTRIFUGO_HTTP_API_KEY is unset',
    );
  }

  // Notifications (docs/api-contracts-async.md §2.2): routing, the release of what quiet hours
  // held, the evening roundup and delivery.
  const roundupBuild = roundupBuildJob({ renderer });
  jobs.push(
    notifyRouteJob({ renderer }),
    notifyReleaseJob(),
    pushSendJob({
      ...deps.pushProviders,
      renderer,
      defaultBundleId: defaultBundleId(env.APP_ENV),
    }),
    roundupBuild,
    roundupScanJob(roundupBuild),
  );
  return jobs;
}
