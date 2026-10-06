/**
 * `POST /v1/camera/menu` (docs/api-contracts.md §5.3): the text lines of a menu the camera locked
 * on, and optionally the frame's crop, read by the guide into translations keyed by line id with
 * dietary clash flags for crew members who consented to sharing theirs. One scan is one guide
 * question on the free meter (given back when the menu could not be read) and one `vision_calls`
 * unit of the silent fair-use cap. The crop goes to the model and is never stored.
 */
import { readMenu, type Gateway, type MenuCrewMember, type ParsedMenu } from '@cp/ai';
import { withGuideReader, withSystem, withUser } from '@cp/db';
import { cameraMenuBodySchema, DomainError } from '@cp/domain';
import { fairUseDecision } from '@cp/entitlements';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import { reserveGuideTurn } from '../ai/guide-meter';
import { deviceTzFrom } from '../ai/sse-route-helper';
import type { AppEnv } from '../app';
import {
  enforceUidRateLimit,
  requireCommandSession,
  type SessionResolver,
} from '../commands/_framework/session';

/** Scans a day on unlimited tiers before the guide stops reading menus until tomorrow. */
export const MENU_FAIR_USE_DAILY_CAP = 100;
const SCANS_PER_UID_RULE = { windowSeconds: 60, max: 10 };

export interface CameraRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  readonly gateway: Pick<Gateway, 'callModel'>;
}

export interface CameraMenuResult extends ParsedMenu {
  /** Members whose flags were checked; the app shows the advisory line whenever this is not empty. */
  readonly checked_members: readonly string[];
}

/** First names and flags of the trip's members who consented to sharing dietary flags. */
async function consentedCrew(
  pool: pg.Pool,
  uid: string,
  tripId: string | null,
): Promise<MenuCrewMember[]> {
  if (tripId === null) return [];
  return withGuideReader(pool, uid, tripId, async (tx) => {
    const { rows } = await tx.query<{ first_name: string; dietary_flags: string[] }>(
      `SELECT first_name, dietary_flags FROM llm.crew_profiles
        WHERE cardinality(dietary_flags) > 0 ORDER BY first_name, user_id`,
    );
    return rows
      .filter((row) => row.first_name !== '')
      .map((row) => ({ first_name: row.first_name, flags: row.dietary_flags }));
  });
}

async function requireMember(pool: pg.Pool, uid: string, tripId: string): Promise<void> {
  const member = await withUser(pool, uid, 'unknown', async (tx) => {
    const { rows } = await tx.query<{ member: boolean }>(
      'SELECT app.is_trip_member($1) AS member',
      [tripId],
    );
    return rows[0]?.member === true;
  });
  if (!member) throw new DomainError('NOT_FOUND');
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function visionAllowed(pool: pg.Pool, uid: string): Promise<boolean> {
  const { rows } = await withUser(pool, uid, 'unknown', (tx) =>
    tx.query<{ bump: { count: number; cap: number } }>(
      'SELECT app.bump_fair_use($1, $2, $3, $4) AS bump',
      [uid, 'vision_calls', utcDayStart(new Date()), MENU_FAIR_USE_DAILY_CAP],
    ),
  );
  const bump = rows[0]?.bump;
  return bump === undefined || fairUseDecision(bump.count, bump.cap) === 'ok';
}

async function userLocale(pool: pg.Pool, uid: string): Promise<string> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ locale: string }>('SELECT app.user_locale($1) AS locale', [uid]),
  );
  return rows[0]?.locale ?? 'en';
}

export function registerCameraRoutes(app: OpenAPIHono<AppEnv>, deps: CameraRouteDeps): void {
  app.post('/v1/camera/menu', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'camera_menu', uid, SCANS_PER_UID_RULE);
    const parsed = cameraMenuBodySchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      throw new DomainError('VALIDATION', {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
      });
    }
    const body = parsed.data;
    if (body.trip_id !== null) await requireMember(deps.pool, uid, body.trip_id);
    if (!(await visionAllowed(deps.pool, uid))) {
      throw new DomainError('RATE_LIMITED', { reason: 'fair_use' });
    }
    // A spent free meter answers QUOTA_EXHAUSTED here, before any model call.
    const meter = await reserveGuideTurn(deps.pool, {
      uid,
      device: c.req.header('x-cp-device') ?? 'unknown',
      deviceTz: deviceTzFrom(c.req.raw.headers),
      tripId: body.trip_id,
    });
    let menu: ParsedMenu;
    let crew: MenuCrewMember[];
    try {
      const [members, locale] = await Promise.all([
        consentedCrew(deps.pool, uid, body.trip_id),
        userLocale(deps.pool, uid),
      ]);
      crew = members;
      menu = await readMenu(
        deps.gateway,
        {
          lines: body.ocr_lines,
          crew,
          locale,
          ...(body.crop_b64 === undefined
            ? {}
            : { crop: { base64: body.crop_b64, mediaType: 'image/jpeg' as const } }),
          ...(body.currency_hint === undefined ? {} : { currencyHint: body.currency_hint }),
        },
        { userId: uid, tripId: body.trip_id },
      );
    } catch (error) {
      await meter.release();
      throw error;
    }
    // Only a menu the guide read costs a question.
    if (menu.status === 'ok') await meter.commit();
    else await meter.release();
    const result: CameraMenuResult = {
      ...menu,
      checked_members: crew.map((member) => member.first_name),
    };
    c.header('Cache-Control', 'private, no-store');
    return c.json(result);
  });
}
