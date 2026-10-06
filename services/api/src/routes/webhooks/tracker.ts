/**
 * `POST /webhooks/tracker` (docs/api-contracts.md §5.8): GitHub tells us when an issue in the
 * feedback tracker closes, reopens or changes labels, so the tickets filed under it follow it.
 * The body must carry GitHub's `X-Hub-Signature-256` HMAC of the raw bytes under
 * `FEEDBACK_GITHUB_WEBHOOK_SECRET`, and name the configured repository; anything else changes
 * nothing. An issue closed as completed closes its tickets and queues the "we fixed it" card for
 * each reporter; `not planned` closes them without one; a reopened issue reopens them. The labels
 * `kind:`, `area:`, `severity:` and `fixed-in:<version>` are read back onto the tickets.
 * A redelivery lands on the same state and tells nobody twice.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { sendInTx, withSystem } from '@cp/db';
import { FEEDBACK_FIX_SHIPPED_QUEUE, readTrackerLabels } from '@cp/domain';
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type pg from 'pg';
import { z } from 'zod';

export interface TrackerWebhookDeps {
  readonly pool: pg.Pool;
  /** `owner/name` of the tracker repository. */
  readonly repo: string;
  readonly secret: string;
}

export interface TrackerWebhookEnv {
  readonly FEEDBACK_GITHUB_REPO?: string | undefined;
  readonly FEEDBACK_GITHUB_WEBHOOK_SECRET?: string | undefined;
}

/** The webhook's settings; `undefined` (no route) unless the repository and the secret are set. */
export function trackerWebhookConfig(
  env: TrackerWebhookEnv,
): Pick<TrackerWebhookDeps, 'repo' | 'secret'> | undefined {
  const repo = env.FEEDBACK_GITHUB_REPO?.trim();
  const secret = env.FEEDBACK_GITHUB_WEBHOOK_SECRET?.trim();
  if (repo === undefined || repo === '' || secret === undefined || secret === '') return undefined;
  return { repo, secret };
}

/** `sha256=<hex hmac of the raw body>`, compared in constant time. */
export function verifyTrackerSignature(
  secret: string,
  header: string | undefined,
  rawBody: string,
): boolean {
  const match = /^sha256=([0-9a-f]{64})$/iu.exec(header ?? '');
  if (match?.[1] === undefined) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(Buffer.from(match[1], 'hex'), expected);
}

const issueEventSchema = z.object({
  action: z.string(),
  issue: z.object({
    number: z.number().int().positive(),
    state: z.string(),
    state_reason: z.string().nullish(),
    labels: z.array(z.object({ name: z.string() })).default([]),
  }),
  repository: z.object({ full_name: z.string() }),
});

const refused = (code: string, message: string) => ({
  error: { code, message, retryable: false },
});

const HANDLED_ACTIONS = new Set(['closed', 'reopened', 'labeled', 'unlabeled']);

/** Applies one issue event to the tickets filed under the issue; answers how many it touched. */
export async function applyTrackerIssueEvent(
  tx: pg.PoolClient,
  event: z.infer<typeof issueEventSchema>,
): Promise<number> {
  const { issue, action } = event;
  const labels = readTrackerLabels(issue.labels.map((label) => label.name));
  const closed = action === 'closed';
  const fixed =
    closed && issue.state_reason !== 'not_planned' && issue.state_reason !== 'duplicate';
  const { rows } = await tx.query<{ id: string; fix_notified_at: Date | null }>(
    `UPDATE feedback_tickets
        SET status = CASE WHEN $2 THEN 'closed'
                          WHEN $3 AND status = 'closed' THEN 'in_tracker'
                          ELSE status END,
            triage_kind = coalesce($4, triage_kind),
            triage_area = coalesce($5, triage_area),
            severity = coalesce($6, severity),
            fixed_in_version = coalesce($7, fixed_in_version)
      WHERE tracker_issue_id = $1
      RETURNING id, fix_notified_at`,
    [
      String(issue.number),
      closed,
      action === 'reopened',
      labels.kind ?? null,
      labels.area ?? null,
      labels.severity ?? null,
      labels.fixedInVersion ?? null,
    ],
  );
  if (fixed) {
    for (const ticket of rows.filter((row) => row.fix_notified_at === null)) {
      await sendInTx(
        tx,
        FEEDBACK_FIX_SHIPPED_QUEUE,
        { ticket_id: ticket.id, waited: 0 },
        { singletonKey: `${ticket.id}:0` },
      );
    }
  }
  return rows.length;
}

export function registerTrackerWebhook<E extends { Variables: object }>(
  app: Hono<E>,
  deps: TrackerWebhookDeps,
): void {
  app.post('/webhooks/tracker', bodyLimit({ maxSize: 1024 * 1024 }), async (c) => {
    const rawBody = await c.req.text();
    if (!verifyTrackerSignature(deps.secret, c.req.header('x-hub-signature-256'), rawBody)) {
      return c.json(refused('AUTH_REQUIRED', 'invalid signature'), 401);
    }
    if (c.req.header('x-github-event') !== 'issues') return c.json({ received: true, tickets: 0 });
    let parsed;
    try {
      parsed = issueEventSchema.safeParse(JSON.parse(rawBody));
    } catch {
      return c.json(refused('VALIDATION', 'invalid JSON body'), 422);
    }
    if (!parsed.success) return c.json(refused('VALIDATION', 'not an issue event'), 422);
    const event = parsed.data;
    if (
      event.repository.full_name.toLowerCase() !== deps.repo.toLowerCase() ||
      !HANDLED_ACTIONS.has(event.action)
    ) {
      return c.json({ received: true, tickets: 0 });
    }
    const tickets = await withSystem(deps.pool, (tx) => applyTrackerIssueEvent(tx, event));
    return c.json({ received: true, tickets });
  });
}
