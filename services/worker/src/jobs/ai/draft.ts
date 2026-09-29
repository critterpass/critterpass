/**
 * `ai.draft` (docs/api-contracts-async.md §2.2): the organiser's trip draft as a workflow, not a
 * free agent. Read the crew (guide_reader views and the crew-visible setup rows) → prefetch in
 * code (season signal, cited closures) → outline → every day at once → validate and repair the
 * broken days → save one private version. Each step is resumable (its result lives in
 * `agent_jobs.partial`), reports what it actually did on `trip_draft:` and the drafting screen, and
 * the saved version reaches the organiser through sync, with a push when the app is backgrounded.
 * A job that finally fails puts the trip back into setup; no quota is involved (system AI).
 */
import {
  createGateway,
  createTavilySearch,
  gatewayModel,
  recordUsage,
  writeDraftSummary,
  type AssertRouteOn,
  type Gateway,
  type Telemetry,
  type DraftModel,
  type DraftedDays,
  type RepairOutcome,
  type SkeletonPlan,
  type UsageContext,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import { DRAFT_QUEUES, type DraftResult } from '@cp/domain';
import type pg from 'pg';

import { defineAgentJob, type AgentJobDefinition } from '../../ai/job-runner';
import type { AnyJobDefinition } from '../../boss';
import { webClosureCheck } from './draft/closures';
import { daysStage } from './draft/fan-out';
import {
  giveBack,
  hint,
  load,
  modelFor,
  prefetched,
  type DraftModelFactory,
} from './draft/job-context';
import { persistDraft, allMustDosMade, type DraftToSave } from './draft/persist';
import { noClosureCheck, prefetch, type ClosureCheck } from './draft/prefetch';
import { outlineStage } from './draft/skeleton';
import {
  balanceLabel,
  draftChannel,
  foodLabel,
  publishDone,
  readProfilesLabel,
  savedLabel,
  seasonLabel,
  staysLabel,
} from './draft/steps';
import { stayRows, type SlotCheck, noSlotCheck } from './draft/suppliers';
import { checkStage } from './draft/validate-repair';
import { redraftJob } from './redraft';

export interface DraftJobDeps {
  /** The model for one job's calls; absent without a DeepSeek key (the job then fails cleanly). */
  readonly model?: DraftModelFactory | undefined;
  readonly closures?: ClosureCheck;
  readonly slots?: SlotCheck;
}

export function gatewayDraftModel(gateway: Pick<Gateway, 'callModel'>) {
  return (usage: UsageContext): DraftModel => gatewayModel(gateway, usage);
}

export function draftJob(deps: DraftJobDeps): AgentJobDefinition {
  const closures = deps.closures ?? noClosureCheck;
  const slots = deps.slots ?? noSlotCheck;
  return defineAgentJob({
    kind: 'draft',
    queue: DRAFT_QUEUES.draft,
    progressChannel: (job) => (job.tripId === null ? undefined : draftChannel(job.tripId)),
    steps: [
      {
        id: 'read_profiles',
        maxTries: 2,
        run: async (ctx) => {
          await hint(ctx, 'read_profiles', 'running');
          const { trip } = await load(ctx);
          const label = readProfilesLabel(trip);
          await hint(ctx, 'read_profiles', 'done', label);
          return { label, crew_id: trip.crewId, members: trip.members.length };
        },
        compensate: (_result, ctx) => giveBack(ctx.pool, ctx.agentJob),
      },
      {
        id: 'check_season',
        run: async (ctx) => {
          await hint(ctx, 'check_season', 'running');
          const { trip, input } = await load(ctx);
          const mustDoPlaces = input.pools.mustDos.flatMap((slot) => {
            const poi = input.pois.get(slot.poiId);
            return poi === undefined ? [] : [poi];
          });
          const places = [...mustDoPlaces, ...input.pools.activities].map((p) => ({
            id: p.id,
            name: p.name,
          }));
          const found = await prefetch(ctx.pool, trip, places, closures, ctx.usage);
          const label = seasonLabel(found.signal);
          await hint(ctx, 'check_season', 'done', label);
          return { label, signal: found.signal, closures: found.closures };
        },
      },
      {
        id: 'skeleton',
        maxTries: 2,
        run: async (ctx) => {
          await hint(ctx, 'skeleton', 'running');
          const { trip, input } = await load(ctx, prefetched(ctx));
          const skeleton = await outlineStage(
            ctx.pool,
            modelFor(deps.model, ctx),
            input,
            trip,
            ctx.agentJob.id,
          );
          const label = staysLabel(trip, skeleton);
          await hint(ctx, 'skeleton', 'done', label);
          return { label, skeleton };
        },
      },
      {
        id: 'days',
        maxTries: 2,
        run: async (ctx) => {
          await hint(ctx, 'days', 'running');
          const { trip, input } = await load(ctx, prefetched(ctx));
          const skeleton = (ctx.results.skeleton as { skeleton: SkeletonPlan }).skeleton;
          const drafted = await daysStage(
            ctx.pool,
            modelFor(deps.model, ctx),
            input,
            skeleton,
            trip,
            ctx.agentJob.id,
          );
          const label = balanceLabel(trip);
          await hint(ctx, 'days', 'done', label);
          return { label, ...drafted };
        },
      },
      {
        id: 'validate',
        maxTries: 2,
        run: async (ctx) => {
          await hint(ctx, 'validate', 'running');
          const { trip, input } = await load(ctx, prefetched(ctx));
          const skeleton = (ctx.results.skeleton as { skeleton: SkeletonPlan }).skeleton;
          const drafted = ctx.results.days as DraftedDays;
          const outcome = await checkStage(
            modelFor(deps.model, ctx),
            input,
            skeleton,
            drafted.itinerary,
          );
          const label = foodLabel(trip);
          await hint(ctx, 'validate', 'done', label);
          return {
            label,
            itinerary: outcome.itinerary,
            first_ok: outcome.first.ok,
            first: { ok: outcome.first.ok, violations: [], costPpMinor: outcome.first.costPpMinor },
            loops: outcome.loops,
            dropped: outcome.dropped,
            left: outcome.final.violations.map((v) => v.code),
          };
        },
      },
      {
        id: 'persist',
        maxTries: 3,
        run: async (ctx) => {
          await hint(ctx, 'persist', 'running');
          const { trip, input } = await load(ctx, prefetched(ctx));
          const checked = ctx.results.validate as Pick<
            RepairOutcome,
            'itinerary' | 'first' | 'loops' | 'dropped'
          >;
          const save: DraftToSave = {
            jobId: ctx.agentJob.id,
            trip,
            input,
            outcome: checked,
            stays: stayRows(trip),
            closures: prefetched(ctx),
            slotAvailable: await slots(trip, checked.itinerary, input),
          };
          const summary = await writeDraftSummary(modelFor(deps.model, ctx), {
            guide: input.guide,
            destination: trip.destination.split(',')[0] ?? trip.destination,
            themes: checked.itinerary.days.map((d) => d.theme),
            allMustDos: allMustDosMade(save),
            names: [...input.pois.values()].map((p) => p.name),
          });
          const saved = await withSystem(ctx.pool, async (tx) => {
            const outcome = await persistDraft(tx, save);
            if (outcome !== null) {
              await publishDone(tx, trip.tripId, {
                job_id: ctx.agentJob.id,
                status: 'succeeded',
                version_id: outcome.versionId,
              });
            }
            return outcome;
          });
          if (saved === null) throw new Error('trip_not_drafting');
          await hint(ctx, 'persist', 'done', savedLabel());
          return {
            label: savedLabel(),
            version_id: saved.versionId,
            days: checked.itinerary.days.length,
            summary,
          };
        },
      },
    ],
    resultRef: (results): DraftResult => {
      const saved = results.persist as { version_id: string; days: number; summary: string };
      return { version_id: saved.version_id, days: saved.days, summary: saved.summary };
    },
    notifyOnComplete: (results, job) => {
      const saved = results.persist as { version_id: string };
      const crewId = (results.read_profiles as { crew_id: string }).crew_id;
      if (job.tripId === null || job.userId === null) return undefined;
      return {
        type: 'draft.ready',
        aggregateKind: 'trip',
        aggregateId: job.tripId,
        actorKind: 'system',
        actorId: null,
        crewId,
        tripId: job.tripId,
        payload: {
          trip_id: job.tripId,
          job_id: job.id,
          version_id: saved.version_id,
          user_id: job.userId,
        },
      };
    },
  });
}

export interface DraftJobsEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly TAVILY_API_KEY?: string | undefined;
}

export interface DraftJobsDeps {
  readonly pool: pg.Pool;
  readonly assertRouteOn: AssertRouteOn;
  readonly telemetry?: Telemetry | undefined;
  readonly closures?: ClosureCheck;
}

/** The drafting jobs with the process's gateway (every call billed to its job's `ai_usage`). */
export function draftJobs(env: DraftJobsEnv, deps: DraftJobsDeps): AnyJobDefinition[] {
  const apiKey = env.ANTHROPIC_API_KEY;
  const gateway =
    apiKey === undefined
      ? undefined
      : createGateway({
          apiKey,
          ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
          ...(deps.telemetry === undefined ? {} : { telemetry: deps.telemetry }),
          onUsage: (record) => recordUsage((fn) => withSystem(deps.pool, fn), record),
          assertRouteOn: deps.assertRouteOn,
        });
  const model = gateway === undefined ? undefined : gatewayDraftModel(gateway);
  const closures =
    deps.closures ??
    (gateway === undefined || env.TAVILY_API_KEY === undefined
      ? undefined
      : webClosureCheck({ search: createTavilySearch({ apiKey: env.TAVILY_API_KEY }), gateway }));
  return [
    draftJob({ model, ...(closures === undefined ? {} : { closures }) }),
    redraftJob({ model }),
  ];
}
