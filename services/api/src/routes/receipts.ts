/**
 * `POST /v1/receipts` (docs/api-contracts.md §5.3): a trip member uploads a scan's OCR lines (and
 * the photo's key); the server stores the row as its scanner and queues `ai.receipt` in the same
 * transaction, which parses the lines and writes the validated result back onto the synced row.
 * Scans are free but count toward a silent daily fair-use cap: past it the scan is stored as
 * `failed{fair_use}` and the app offers the manual paths. Behind the `money.receipts` flag.
 */
import { sendInTx, withUser } from '@cp/db';
import {
  DomainError,
  MONEY_QUEUES,
  postReceiptBodySchema,
  RECEIPT_FAIR_USE_DAILY_CAP,
  type PostReceiptResult,
} from '@cp/domain';
import { fairUseDecision } from '@cp/entitlements';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import type { AppEnv } from '../app';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';
import { requireMoneyMember } from '../commands/money/shared';

export interface ReceiptRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  /** Whether `money.receipts` is on for this member. */
  readonly receiptsOn: (uid: string) => Promise<boolean>;
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function registerReceiptRoutes(app: OpenAPIHono<AppEnv>, deps: ReceiptRouteDeps): void {
  app.post('/v1/receipts', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    if (!(await deps.receiptsOn(session.uid))) {
      throw new DomainError('STATE_INVALID', { reason: 'receipts_off' });
    }
    const parsed = postReceiptBodySchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      throw new DomainError('VALIDATION', {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
      });
    }
    const body = parsed.data;
    const result = await withUser(deps.pool, session.uid, 'unknown', async (tx) => {
      const trip = await requireMoneyMember(tx, body.trip_id, session.uid);
      if (body.media_key !== undefined) {
        const owned = await ownsReceiptPhoto(tx, body.media_key, session.uid);
        if (!owned) throw new DomainError('NOT_FOUND', { reason: 'media' });
      }
      const existing = await tx.query('SELECT 1 FROM receipts WHERE id = $1', [body.receipt_id]);
      if ((existing.rowCount ?? 0) > 0) {
        throw new DomainError('STATE_INVALID', { reason: 'receipt_exists' });
      }
      await tx.query(
        `INSERT INTO receipts (id, user_id, trip_id, crew_id, media_key, quality_issue, ocr_source,
           ocr_lines)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          body.receipt_id,
          session.uid,
          trip.id,
          trip.crew_id,
          body.media_key ?? null,
          body.quality_issue ?? null,
          body.ocr_status === 'ok' && body.ocr_lines.length > 0 ? 'device' : 'server',
          JSON.stringify(body.ocr_lines.map(({ id, text }) => ({ id, text }))),
        ],
      );
      const { rows } = await tx.query<{ bump: { count: number; cap: number } }>(
        'SELECT app.bump_fair_use($1, $2, $3, $4) AS bump',
        [session.uid, 'vision_calls', utcDayStart(new Date()), RECEIPT_FAIR_USE_DAILY_CAP],
      );
      const bump = rows[0]?.bump;
      if (bump !== undefined && fairUseDecision(bump.count, bump.cap) !== 'ok') {
        await markFailed(tx, body.receipt_id, 'fair_use');
        const outcome: PostReceiptResult = {
          receipt_id: body.receipt_id,
          job_id: null,
          status: 'failed',
        };
        return outcome;
      }
      const jobId = await sendInTx(
        tx,
        MONEY_QUEUES.receipt,
        { receipt_id: body.receipt_id },
        { singletonKey: body.receipt_id },
      );
      const outcome: PostReceiptResult = {
        receipt_id: body.receipt_id,
        job_id: jobId,
        status: 'queued',
      };
      return outcome;
    });
    return c.json(result, 202);
  });
}

/** The photo must be the caller's own receipt upload. */
async function ownsReceiptPhoto(tx: pg.PoolClient, key: string, uid: string): Promise<boolean> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query(
      "SELECT 1 FROM media_objects WHERE r2_key = $1 AND owner_id = $2 AND purpose = 'receipt'",
      [key, uid],
    ),
  );
  return rows.length > 0;
}

function markFailed(tx: pg.PoolClient, receiptId: string, reason: string): Promise<unknown> {
  return asSystemRole(tx, () =>
    tx.query(
      "UPDATE receipts SET status = 'failed', failure_reason = $2, parsed_at = now() WHERE id = $1",
      [receiptId, reason],
    ),
  );
}
