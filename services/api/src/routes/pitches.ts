/**
 * `POST /v1/pitches` (docs/api-contracts.md §5.3): the place's guide pitches it to a crew as a
 * stream of sections, `sticker, chip…, headline, reason…, quote, alternative…, done`. The sticker
 * and the chips come from the pitch tools straight away; the model's lines follow as each one
 * validates. A pitch is cached per (crew, place, month) until its fares change, so asking again
 * replays it without the model. Unmetered (system guide work); a switched-off route or a failed
 * model call answers the numbers-free template, never a made-up line. A month is the guide's to
 * name only when the asker chose one (before dates exist the fares' month is not "when you go"),
 * and an asker whose app is in another language reads the lines in it (./pitch-reader-language).
 */
import {
  createGateway,
  PITCH_PROMPT_VERSION,
  recordUsage,
  streamPitch,
  templatePitch,
  type Gateway,
  type PitchModelSection,
} from '@cp/ai';
import {
  findCachedPitch,
  loadPitchFacts,
  pitchCacheKeyFor,
  storePitch,
  withSystem,
  withUser,
} from '@cp/db';
import {
  buildPitchSections,
  DomainError,
  pitchRequestSchema,
  type PitchFacts,
  type PitchSections,
  type PitchStreamEvent,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import { validationHook } from '../commands/_framework/doors';
import { enqueueCrewGuideTextIfRead } from '../commands/guide/guide-text';
import {
  enforceUidRateLimit,
  requireCommandSession,
  type SessionResolver,
} from '../commands/_framework/session';
import type { ApiEnv } from '../env';
import { createKillSwitches } from '../ops/kill-switches';
import {
  pitchForReader,
  readsSourceLanguage,
  sectionsFor,
  storePitchTranslation,
} from './pitch-reader-language';
import { SSE_RESPONSE_HEADERS, sseBody } from './sse';

export interface PitchRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  /** Undefined (no model key) = template pitches only. */
  readonly gateway: Pick<Gateway, 'streamModel' | 'callModel'> | undefined;
  readonly now?: () => Date;
}

/** A crew browsing places pitches a lot; this only stops a runaway client. */
const PITCHES_PER_UID_RULE = { windowSeconds: 60, max: 30 };

/** How often a held stream says it is still working (well inside the app's stall limit). */
const WORKING_EVERY_MS = 5_000;

function quiet(ms: number): Promise<undefined> {
  return new Promise((resolve) => setTimeout(() => resolve(undefined), ms));
}

function* replay(sections: PitchSections): Generator<PitchStreamEvent> {
  yield { type: 'sticker', ...sections.sticker };
  for (const chip of sections.chips) yield { type: 'chip', ...chip };
  if (sections.headline !== null) yield { type: 'headline', text: sections.headline };
  for (const reason of sections.reasons) yield { type: 'reason', ...reason };
  if (sections.quote !== null) yield { type: 'quote', text: sections.quote };
  for (const alternative of sections.alternatives) yield { type: 'alternative', ...alternative };
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new DomainError('VALIDATION', { reason: 'invalid_json' });
  }
}

export function registerPitchRoutes(app: OpenAPIHono<AppEnv>, deps: PitchRouteDeps): void {
  app.post('/v1/pitches', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'pitches', uid, PITCHES_PER_UID_RULE);
    const parsed = pitchRequestSchema.safeParse(await readBody(c.req.raw));
    validationHook(parsed);
    const body = parsed.data as { crew_id: string; place_id: string; month?: number };
    const asker = await withUser(deps.pool, uid, 'unknown', async (tx) => {
      const { rows } = await tx.query<{ member: boolean; locale: string }>(
        'SELECT app.is_crew_member($1) AS member, app.user_locale($2) AS locale',
        [body.crew_id, uid],
      );
      return { member: rows[0]?.member === true, locale: rows[0]?.locale ?? 'en' };
    });
    if (!asker.member) throw new DomainError('NOT_FOUND', { reason: 'crew' });
    const translated = !readsSourceLanguage(asker.locale);
    const now = deps.now?.() ?? new Date();
    const loaded = await withSystem(deps.pool, (tx) =>
      loadPitchFacts(tx, {
        crewId: body.crew_id,
        placeId: body.place_id,
        month: body.month ?? null,
        now,
      }),
    );
    if (loaded === undefined) throw new DomainError('NOT_FOUND', { reason: 'place' });
    const { facts, fareSnapshotId } = loaded;
    // What the guide may say: the month only when the asker chose it.
    const said: PitchFacts = body.month === undefined ? { ...facts, month: null } : facts;
    // A pitch with no chosen month is cached apart from the month-by-month ones.
    const cacheKey = pitchCacheKeyFor(body.place_id, said.month);
    const cached = await withSystem(deps.pool, (tx) =>
      findCachedPitch(tx, {
        crewId: body.crew_id,
        cacheKey,
        fareSnapshotId: loaded.fareSnapshotId,
      }),
    );

    async function* frames(signal: AbortSignal): AsyncGenerator<PitchStreamEvent> {
      if (cached !== undefined) {
        yield* replay(sectionsFor(cached.sections, cached.i18n, asker.locale));
        yield {
          type: 'done',
          pitch_id: cached.id,
          cached: true,
          ai_generated: cached.sections.reasons.length > 0,
        };
        return;
      }
      const skeleton = buildPitchSections(facts, []);
      yield { type: 'sticker', ...skeleton.sticker };
      for (const chip of skeleton.chips) yield { type: 'chip', ...chip };
      const lines: PitchModelSection[] = [];
      let fromModel = deps.gateway !== undefined;
      try {
        if (deps.gateway === undefined) throw new Error('no model configured');
        for await (const line of streamPitch(
          deps.gateway,
          said,
          { userId: uid, crewId: body.crew_id },
          signal,
          translated ? asker.locale : undefined,
        )) {
          lines.push(line);
          // A reader of another language gets the lines once they are in it, below; until then
          // the stream says it is alive, so the app does not take the silence for a stall.
          if (!translated) yield* replaySection(facts, line);
          else yield { type: 'working' };
        }
      } catch {
        if (signal.aborted) return;
        fromModel = false;
      }
      let translation: Readonly<Record<string, string>> | null = null;
      if (translated && fromModel && deps.gateway !== undefined) {
        const saying = pitchForReader(deps.gateway, said, lines, asker.locale, {
          userId: uid,
          crewId: body.crew_id,
        });
        let reader: Awaited<typeof saying> | undefined;
        while (reader === undefined) {
          reader = await Promise.race([saying, quiet(WORKING_EVERY_MS)]);
          if (reader === undefined) yield { type: 'working' };
        }
        if (signal.aborted) return;
        translation = reader.translation;
        lines.splice(0, lines.length, ...reader.kept);
        for (const line of reader.shown) yield* replaySection(facts, line);
      } else if (translated) {
        for (const line of lines) yield* replaySection(facts, line);
      }
      if (!lines.some((line) => line.s === 'headline')) {
        translation = null;
        for (const line of templatePitch(facts)) {
          lines.push(line);
          if (line.s === 'headline') yield { type: 'headline', text: line.text };
        }
      }
      for (const alternative of facts.alternatives) yield { type: 'alternative', ...alternative };
      const sections = buildPitchSections(facts, lines);
      const pitchId = await withSystem(deps.pool, async (tx) => {
        const id = await storePitch(tx, {
          crewId: body.crew_id,
          placeId: body.place_id,
          month: said.month,
          pitchedBy: uid,
          sections: fromModel ? sections : { ...sections, headline: null },
          model: fromModel ? 'pitch.place' : null,
          promptVersion: PITCH_PROMPT_VERSION,
          fareSnapshotId,
        });
        if (translation !== null) {
          await storePitchTranslation(tx, id, sections, asker.locale, translation);
        }
        // Crewmates whose apps are in another language read the pitch in theirs.
        await enqueueCrewGuideTextIfRead(tx, body.crew_id);
        return id;
      });
      yield { type: 'done', pitch_id: pitchId, cached: false, ai_generated: fromModel };
    }

    return new Response(sseBody(frames), { status: 200, headers: SSE_RESPONSE_HEADERS });
  });
}

function* replaySection(facts: PitchFacts, line: PitchModelSection): Generator<PitchStreamEvent> {
  if (line.s === 'headline') yield { type: 'headline', text: line.text };
  if (line.s === 'quote') yield { type: 'quote', text: line.text };
  if (line.s === 'reason') {
    const members = facts.taste.find((taste) => taste.tag === line.tag)?.member_ids ?? [];
    yield { type: 'reason', text: line.text, tag: line.tag, member_ids: members };
  }
}

/** Boot wiring: the model runs only with a key and honours the ops kill switches. */
export function registerPitchRoutesFromEnv(
  app: OpenAPIHono<AppEnv>,
  deps: Omit<PitchRouteDeps, 'gateway'>,
  env: Pick<ApiEnv, 'ANTHROPIC_API_KEY' | 'ANTHROPIC_BASE_URL'>,
): void {
  const switches = createKillSwitches(deps.pool);
  const gateway =
    env.ANTHROPIC_API_KEY === undefined
      ? undefined
      : createGateway({
          apiKey: env.ANTHROPIC_API_KEY,
          ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
          assertRouteOn: switches.assertAiRoute,
          onUsage: (record) => recordUsage((fn) => withSystem(deps.pool, fn), record),
        });
  registerPitchRoutes(app, { ...deps, gateway });
}
