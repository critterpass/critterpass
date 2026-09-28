/**
 * The one way an api route streams a guide turn (docs/api-contracts.md §5.3; used by the guide
 * thread, crew mention, pitch and camera routes). The meter is reserved before the response
 * starts, so a spent free meter is an ordinary `QUOTA_EXHAUSTED` error body (HTTP 402, detail
 * carries `resetAt`); after that the body is `text/event-stream` and the turn settles the meter
 * itself. A route switched off in the ops console (or paused by the cost guard) is refused before
 * the meter with `STATE_INVALID switched_off`. A client that disconnects aborts the model call and releases the reserved unit.
 */
import {
  runTurn,
  SSE_HEADERS,
  sseStream,
  type Gateway,
  type RunTurnInput,
  type ToolRegistry,
} from '@cp/ai';
import type { KillSwitchReader } from '@cp/db';
import { DomainError, isIanaTimeZone } from '@cp/domain';
import type pg from 'pg';
import type { Logger } from 'pino';

import { reserveGuideTurn, type GuideMeterRequest } from './guide-meter';

export interface GuideStreamDeps {
  readonly pool: pg.Pool;
  readonly gateway: Gateway;
  /** The ops kill switches: a switched-off route is refused before the meter or the stream. */
  readonly switches: Pick<KillSwitchReader, 'assertAiRoute'>;
  readonly registry: ToolRegistry;
  readonly logger: Logger;
  readonly heartbeatMs?: number;
}

export interface GuideTurnRequest {
  readonly meter: GuideMeterRequest;
  /** The prompt, built by the route from `buildGuideContext` and persona layering. */
  readonly turn: Omit<RunTurnInput, 'signal'>;
}

/** `X-CP-TZ` (docs/api-contracts.md §1 "Locale"); UTC when the client sends none. */
export function deviceTzFrom(headers: Headers): string {
  const tz = headers.get('x-cp-tz');
  if (tz === null || tz === '') return 'UTC';
  if (!isIanaTimeZone(tz)) throw new DomainError('VALIDATION', { field: 'X-CP-TZ' });
  return tz;
}

export async function streamGuideTurn(
  deps: GuideStreamDeps,
  request: GuideTurnRequest,
): Promise<Response> {
  // Switched off: an ordinary `STATE_INVALID switched_off` body, nothing reserved or streamed.
  await deps.switches.assertAiRoute(request.turn.route);
  const meter = await reserveGuideTurn(deps.pool, request.meter);
  const abort = new AbortController();
  const log = deps.logger.child({ route: request.turn.route });
  const events = runTurn(
    { ...request.turn, signal: abort.signal },
    {
      gateway: deps.gateway,
      registry: deps.registry,
      meter,
      hooks: {
        onToolResult: (result) => {
          if (!result.ok)
            log.info({ tool: result.name, failure: result.failure }, 'guide tool failed');
        },
        // Counts and kinds only: the flagged values are model text and may quote the user.
        onGroundingFlags: (flags) =>
          log.warn(
            { flags: flags.length, kinds: [...new Set(flags.map((f) => f.kind))] },
            'guide grounding flags',
          ),
        onSettled: (outcome, cause) => {
          const code =
            cause instanceof Error ? cause.name : typeof cause === 'string' ? cause : undefined;
          log.info({ outcome, cause: code }, 'guide meter settled');
        },
      },
    },
  );
  const body = sseStream(events, {
    abort,
    ...(deps.heartbeatMs === undefined ? {} : { heartbeatMs: deps.heartbeatMs }),
  });
  return new Response(body, { status: 200, headers: SSE_HEADERS });
}
