/**
 * One guide sheet turn (docs/api-contracts.md §5.3): the thread is opened or found, the free meter
 * reserved before the stream opens (a spent meter is a plain `QUOTA_EXHAUSTED` body carrying the
 * crewmates with Pass+), then the question is recorded and the answer streams. The turn settles the
 * meter itself; the finished answer is saved with its cards and sources, and a group thread's
 * tokens go out on `guide_thread:{id}` as they arrive.
 */
import {
  buildGuideChatRequest,
  GUIDE_CHAT_ROUTE,
  LATEST_APPROVED_PERSONA_SQL,
  loadPersonaPack,
  logToolMarkup,
  personaIdSchema,
  runTurn,
  SSE_HEADERS,
  sseStream,
  type ApprovedPersonaRow,
  type Gateway,
  type GuideHistoryTurn,
  type PersonaPack,
  type ToolRegistry,
  type TurnEvent,
} from '@cp/ai';
import { outbox, withGuideReader, withSystem, type KillSwitchReader } from '@cp/db';
import { channelName, generateUuidV7, type GuideTurnBody } from '@cp/domain';
import type pg from 'pg';
import type { Logger } from 'pino';

import type { ApiCompliance } from '../../ai/compliance';
import { buildGuideContext } from '../../ai/context';
import { reserveGuideTurn } from '../../ai/guide-meter';
import { speakTurn, spokenTags, type VoiceTurnDeps } from '../../lib/tts';
import { requireVoiceConsent } from '../../lib/voice-consent';
import { crewPassHolders, openThread, type GuideThread } from './threads';

export interface GuideTurnDeps {
  readonly pool: pg.Pool;
  readonly gateway: Gateway;
  readonly switches: Pick<KillSwitchReader, 'assertAiRoute'>;
  readonly registry: ToolRegistry;
  readonly compliance: Pick<ApiCompliance, 'startGuideInputCheck'>;
  readonly logger: Logger;
  readonly heartbeatMs?: number;
  /** Group token flush interval (default 300 ms). */
  readonly flushMs?: number;
  /** Spoken replies for voice turns; absent, a voice turn answers in text. */
  readonly voice?: VoiceTurnDeps;
}

export interface GuideTurnRequest {
  readonly uid: string;
  readonly device: string;
  readonly deviceTz: string;
  readonly threadId: string;
  readonly body: GuideTurnBody;
}

const HOME_GUIDE = 'tokek';

/** The trip guide's pack (its latest approved release, else the repo pack). */
export async function guidePack(
  pool: pg.Pool,
  uid: string,
  tripId: string | null,
  slug: string | null,
): Promise<PersonaPack> {
  const id = personaIdSchema.safeParse(slug);
  const persona = id.success ? id.data : HOME_GUIDE;
  const loaded = await loadPersonaPack(persona, (guideSlug) =>
    withGuideReader(pool, uid, tripId ?? '', async (tx) => {
      const { rows } = await tx.query<ApprovedPersonaRow>(LATEST_APPROVED_PERSONA_SQL, [guideSlug]);
      return rows[0] ?? null;
    }),
  );
  return loaded.pack;
}

async function readHistory(pool: pg.Pool, uid: string, thread: GuideThread) {
  return withGuideReader(pool, uid, thread.tripId ?? '', async (tx) => {
    await tx.query("SELECT set_config('app.thread', $1, true)", [thread.id]);
    const { rows } = await tx.query<{ role: 'user' | 'guide'; content: string }>(
      'SELECT role, content FROM llm.guide_history ORDER BY created_at DESC LIMIT 24',
    );
    return rows.reverse() satisfies GuideHistoryTurn[];
  });
}

/** The language the asker's app is in (`app.user_locale`): the guide replies in it. */
async function userLocale(pool: pg.Pool, uid: string): Promise<string> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ locale: string }>('SELECT app.user_locale($1) AS locale', [uid]),
  );
  return rows[0]?.locale ?? 'en';
}

interface Answer {
  text: string;
  cards: unknown[];
  sources: readonly string[];
  metered: boolean;
}

/** Saves the answer, and publishes a group thread's buffered tokens, as the turn streams. */
async function* recordTurn(
  deps: GuideTurnDeps,
  thread: GuideThread,
  streamId: string,
  metered: boolean,
  events: AsyncGenerator<TurnEvent, void, undefined>,
): AsyncGenerator<TurnEvent, void, undefined> {
  const answer: Answer = { text: '', cards: [], sources: [], metered };
  const channel = thread.mode === 'group' ? channelName('guide_thread', thread.id) : undefined;
  let pending = '';
  let seq = 0;
  let lastFlush = Date.now();
  const flush = async (force: boolean) => {
    if (channel === undefined || pending === '') return;
    if (!force && Date.now() - lastFlush < (deps.flushMs ?? 300)) return;
    const text = pending;
    pending = '';
    lastFlush = Date.now();
    await withSystem(deps.pool, (tx) =>
      outbox(tx, channel, 'token', { stream_id: streamId, seq: seq++, text }),
    );
  };
  for await (const event of events) {
    if (event.type === 'token') {
      answer.text += event.text;
      pending += event.text;
      await flush(false);
    } else if (event.type === 'tool_result' && event.card.status === 'ok') {
      answer.cards.push({ kind: 'tool', tool: event.card.tool, data: event.card.data });
    } else if (event.type === 'proposal') {
      answer.cards.push({ kind: 'proposal', changeset_id: event.changeset_id });
      if (channel !== undefined) {
        await withSystem(deps.pool, (tx) =>
          outbox(tx, channel, 'proposal', { changeset_id: event.changeset_id }),
        );
      }
    } else if (event.type === 'done') {
      answer.sources = event.sources;
      await flush(true);
      await saveAnswer(deps.pool, thread, streamId, answer);
    }
    yield event;
  }
}

async function saveAnswer(pool: pg.Pool, thread: GuideThread, id: string, answer: Answer) {
  await withSystem(pool, async (tx) => {
    await tx.query(
      `INSERT INTO guide_messages (id, thread_id, trip_id, role, content, cards, sources, meter_counted)
       VALUES ($1, $2, $3, 'guide', $4, $5, $6, $7)`,
      [
        id,
        thread.id,
        thread.tripId,
        answer.text.slice(0, 8000),
        JSON.stringify(answer.cards),
        JSON.stringify(answer.sources.map((url) => ({ url }))),
        answer.metered,
      ],
    );
    await tx.query('UPDATE guide_threads SET last_message_at = now() WHERE id = $1', [thread.id]);
  });
}

export async function streamThreadTurn(
  deps: GuideTurnDeps,
  request: GuideTurnRequest,
): Promise<Response> {
  await deps.switches.assertAiRoute(GUIDE_CHAT_ROUTE);
  const { uid, body } = request;
  // Before anything is stored or counted: a spoken turn needs the voice consent to stand.
  if (body.mode === 'voice') await requireVoiceConsent(deps.pool, uid);
  const thread = await openThread(deps.pool, {
    uid,
    device: request.device,
    threadId: request.threadId,
    mode: body.thread_mode,
    tripId: body.context.trip_id,
  });
  const usage = { userId: uid, tripId: thread.tripId, crewId: thread.crewId };
  const inputCheck = deps.compliance.startGuideInputCheck(body.text, usage);
  const holders = await crewPassHolders(deps.pool, thread.crewId, uid);
  const meter = await reserveGuideTurn(deps.pool, {
    uid,
    device: request.device,
    deviceTz: request.deviceTz,
    tripId: thread.tripId,
    ...(holders.length === 0 ? {} : { crewPassHolders: holders }),
  });

  const [pack, context, history, locale] = await Promise.all([
    guidePack(deps.pool, uid, thread.tripId, thread.guideSlug),
    buildGuideContext(deps.pool, { uid, tripId: thread.tripId, surface: 'C' }),
    readHistory(deps.pool, uid, thread),
    userLocale(deps.pool, uid),
  ]);
  await withSystem(deps.pool, (tx) =>
    tx.query(
      `INSERT INTO guide_messages (thread_id, trip_id, role, author_id, content, attachments, voice)
       VALUES ($1, $2, 'user', $3, $4, $5, $6)`,
      [
        thread.id,
        thread.tripId,
        uid,
        body.text,
        JSON.stringify(body.attachments),
        body.mode === 'voice',
      ],
    ),
  );
  const voiceId =
    body.mode === 'voice' && body.speak !== false && deps.voice !== undefined
      ? await deps.voice.voiceFor(thread.guideSlug).catch(() => null)
      : null;
  // Only a reply that will be spoken is asked for audio tags; they leave before anything is kept.
  const tags = voiceId === null ? null : spokenTags();
  const request_ = buildGuideChatRequest({
    pack,
    // No trip, or a trip without a guide of its own: the home guide answers for anywhere.
    anywhere: !personaIdSchema.safeParse(thread.guideSlug).success,
    tripContext: context.tripContext,
    history,
    question: body.text,
    documents: context.documents,
    directives: { chattiness: context.prefs.chattiness, locale },
    now: { at: new Date(), tz: request.deviceTz },
    ...(tags === null ? {} : { spoken: true }),
  });

  const abort = new AbortController();
  const log = deps.logger.child({ route: GUIDE_CHAT_ROUTE });
  const events = runTurn(
    {
      route: GUIDE_CHAT_ROUTE,
      system: request_.system,
      messages: request_.messages,
      // The thread's trip and crew: the guide never asks the traveller which trip this is.
      tool: { uid, tripId: thread.tripId, crewId: thread.crewId, caller: 'C' },
      usage,
      inputCheck,
      signal: abort.signal,
    },
    {
      gateway: deps.gateway,
      registry: deps.registry,
      meter,
      hooks: {
        onToolResult: (result) => {
          if (!result.ok)
            log.info({ tool: result.name, failure: result.failure }, 'guide tool failed');
        },
        onSettled: (outcome) => log.info({ outcome }, 'guide meter settled'),
        onToolMarkup: logToolMarkup(log),
      },
    },
  );
  const shown = tags === null ? events : tags.strip(events);
  const recorded = recordTurn(deps, thread, generateUuidV7(), meter.reservation.metered, shown);
  const outgoing =
    voiceId === null || deps.voice === undefined
      ? recorded
      : speakTurn(recorded, {
          voiceId,
          language: locale,
          synthesize: deps.voice.synthesize,
          ...(tags === null ? {} : { spokenText: tags.spokenFor }),
          onFirstAudio: (ms) => {
            deps.voice?.onFirstAudio(ms);
            log.info({ first_audio_ms: ms }, 'guide voice first audio');
          },
          onFailed: (error) => log.warn({ err: error }, 'guide voice synthesis failed'),
        });
  const stream = sseStream(outgoing, {
    abort,
    ...(deps.heartbeatMs === undefined ? {} : { heartbeatMs: deps.heartbeatMs }),
  });
  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
