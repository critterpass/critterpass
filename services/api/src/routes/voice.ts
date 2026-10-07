/**
 * The voice, camera and phrase practice routes and their boot wiring: `POST /v1/stt/token`
 * (./stt-token.ts), `POST /v1/camera/menu` (./camera.ts) and `POST /v1/guide/phrase-feedback`,
 * which grades what the device heard against a phrase card and, on a mismatch, adds one short tip
 * from the guide. Practice is never metered.
 */
import { createGateway, phraseFeedback, recordUsage, type Gateway } from '@cp/ai';
import { withSystem } from '@cp/db';
import { DomainError, phraseFeedbackBodySchema } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import {
  enforceUidRateLimit,
  requireCommandSession,
  type SessionResolver,
} from '../commands/_framework/session';
import { createKillSwitches } from '../ops/kill-switches';
import { registerCameraRoutes } from './camera';
import { registerSttTokenRoutesFromEnv } from './stt-token';

const FEEDBACK_PER_UID_RULE = { windowSeconds: 60, max: 30 };

export interface PhraseFeedbackRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  readonly gateway: Pick<Gateway, 'callModel'>;
}

interface PhraseRow {
  readonly text: string;
  readonly romanisation: string | null;
  readonly gloss: string;
  readonly locale: string;
}

export function registerPhraseFeedbackRoute(
  app: OpenAPIHono<AppEnv>,
  deps: PhraseFeedbackRouteDeps,
): void {
  app.post('/v1/guide/phrase-feedback', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'phrase_feedback', uid, FEEDBACK_PER_UID_RULE);
    const parsed = phraseFeedbackBodySchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      throw new DomainError('VALIDATION', {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
      });
    }
    const body = parsed.data;
    // A live curated card, or the caller's own custom card once its text is written.
    const { rows } = await withSystem(deps.pool, (tx) =>
      tx.query<PhraseRow>(
        `SELECT p.text, p.romanisation, p.gloss, app.user_locale($2) AS locale
           FROM (
             SELECT text, romanisation, gloss FROM phrase_cards
              WHERE id = $1 AND app.is_live_release(release_id)
             UNION ALL
             SELECT text, romanisation, gloss FROM custom_phrase_cards
              WHERE id = $1 AND user_id = $2 AND text IS NOT NULL AND gloss IS NOT NULL
           ) p LIMIT 1`,
        [body.phrase_id, uid],
      ),
    );
    const phrase = rows[0];
    if (phrase === undefined) throw new DomainError('NOT_FOUND', { reason: 'phrase' });
    const feedback = await phraseFeedback(
      deps.gateway,
      {
        phrase: phrase.text,
        romanisation: phrase.romanisation,
        gloss: phrase.gloss,
        language: body.language,
        recognised: body.recognised,
        locale: phrase.locale,
      },
      { userId: uid, tripId: null },
    );
    c.header('Cache-Control', 'private, no-store');
    return c.json(feedback);
  });
}

export interface VoiceRouteDoors {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  readonly logger: { warn: (message: string) => void };
}

/**
 * Boot wiring. The token route is always mounted (it answers `SUPPLIER_UNAVAILABLE` without
 * `DEEPGRAM_API_KEY`); menu reading and phrase tips need the model key, like the guide itself.
 */
export function registerVoiceRoutesFromEnv(
  app: OpenAPIHono<AppEnv>,
  doors: VoiceRouteDoors,
  env: Readonly<Record<string, string | undefined>>,
): void {
  registerSttTokenRoutesFromEnv(app, doors, env);
  const apiKey = env['ANTHROPIC_API_KEY']?.trim();
  if (!apiKey) {
    doors.logger.warn('Menu reading and phrase tips are disabled: ANTHROPIC_API_KEY is unset');
    return;
  }
  const baseURL = env['ANTHROPIC_BASE_URL']?.trim();
  const gateway = createGateway({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    assertRouteOn: createKillSwitches(doors.pool).assertAiRoute,
    onUsage: (record) => recordUsage((fn) => withSystem(doors.pool, fn), record),
  });
  registerCameraRoutes(app, { ...doors, gateway });
  registerPhraseFeedbackRoute(app, { ...doors, gateway });
}
