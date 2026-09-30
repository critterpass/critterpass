/**
 * `ai.proposal_versions`: one recipient's personal version. The guide writes it (up to three
 * tries, each validated against the injected ids and numbers); after three rejections, or with
 * personal versions off, the crew's shared version stands in, with "{guide} wrote the group
 * version for {name}" on a failed one. The poster and postcard are drawn to private R2 keys when a
 * media store is configured, and each finished version stamps the organisers' send progress.
 */
import {
  sharedVersion,
  writeVersion,
  type AiUsageRecord,
  type Gateway,
  type VersionReply,
} from '@cp/ai';
import { outbox, withSystem } from '@cp/db';
import { PROPOSAL_QUEUES, PROPOSAL_RT, userChannel } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import type { ShareCardKeys, ShareCardRenderer } from './share-cards';
import { loadVersionContext, loadVersionTarget, type VersionTarget } from './version-context';

export const MAX_VERSION_ATTEMPTS = 3;

export type VersionWriter = (
  onUsage: (record: AiUsageRecord) => Promise<void>,
) => Pick<Gateway, 'callModel'>;

export interface VersionJobDeps {
  readonly writer?: VersionWriter | undefined;
  readonly render?: ShareCardRenderer | undefined;
  readonly onUsage?: (record: AiUsageRecord) => Promise<void>;
}

export interface VersionOutcome {
  readonly status: 'ready' | 'fallback' | 'skipped';
  readonly attempts: number;
  readonly rejected?: readonly string[];
}

const critterSeed = (id: string) => Number.parseInt(id.replace(/-/gu, '').slice(-8), 16) % 100_000;

async function store(
  pool: pg.Pool,
  target: VersionTarget,
  reply: VersionReply,
  facts: {
    status: 'ready' | 'fallback';
    attempts: number;
    shared: boolean;
    note: string | null;
    shareMinor: bigint | null;
    currency: string | null;
    savingsMinor: bigint | null;
    keys: ShareCardKeys | null;
  },
): Promise<void> {
  await withSystem(pool, async (tx) => {
    await tx.query(
      `UPDATE proposal_versions SET status = $2, shared = $3, slides = $4, poster = $5,
              postcard = $6, highlights = $7, savings = $8, lead_item_id = $9, share_minor = $10,
              currency = $11, savings_minor = $12, fallback_note = $13, attempts = $14,
              poster_key = $15, postcard_key = $16
        WHERE id = $1`,
      [
        target.version_id,
        facts.status,
        facts.shared,
        JSON.stringify(reply.slides),
        JSON.stringify(reply.poster),
        JSON.stringify(reply.postcard),
        JSON.stringify(reply.highlights),
        JSON.stringify(reply.savings),
        /^[0-9a-f-]{36}$/u.test(reply.lead_item_id) ? reply.lead_item_id : null,
        facts.shareMinor?.toString() ?? null,
        facts.currency,
        facts.savingsMinor?.toString() ?? null,
        facts.note,
        facts.attempts,
        facts.keys?.posterKey ?? null,
        facts.keys?.postcardKey ?? null,
      ],
    );
    const organisers = await tx.query<{ user_id: string }>(
      `SELECT user_id FROM trip_participants WHERE trip_id = $1 AND role = 'organiser'`,
      [target.trip_id],
    );
    for (const { user_id } of organisers.rows) {
      await outbox(tx, userChannel(user_id), PROPOSAL_RT.versionProgress, {
        proposal_id: target.proposal_id,
        recipient_id: target.recipient_id,
        status: facts.status,
      });
    }
  });
}

export async function runVersion(
  pool: pg.Pool,
  versionId: string,
  deps: VersionJobDeps = {},
): Promise<VersionOutcome> {
  const target = await loadVersionTarget(pool, versionId);
  if (target === null || target.status === 'ready' || target.status === 'fallback') {
    return { status: 'skipped', attempts: target?.attempts ?? 0 };
  }
  const loaded = await loadVersionContext(pool, target);
  const gateway = deps.writer?.(deps.onUsage ?? (() => Promise.resolve()));
  const rejected: string[] = [];
  let reply: VersionReply | null = null;
  let attempts = 0;
  if (target.personal && gateway !== undefined) {
    while (reply === null && attempts < MAX_VERSION_ATTEMPTS) {
      attempts += 1;
      const result = await writeVersion(gateway, loaded.context, {
        userId: target.recipient_id,
        tripId: target.trip_id,
      });
      if (result.ok) reply = result.reply;
      else rejected.push(result.rejected);
    }
  }
  const failed = reply === null && target.personal;
  const final = reply ?? sharedVersion(loaded.context);
  const guideName = loaded.context.guide === 'guest' ? 'Your guide' : loaded.context.guide;
  const keys =
    deps.render === undefined
      ? null
      : await deps.render({
          tripId: target.trip_id,
          proposalId: target.proposal_id,
          recipientId: target.recipient_id,
          posterTitle: final.poster.title,
          postcardMessage: final.postcard.message,
          destination: loaded.context.destination,
          senderName: target.organiser_name,
          critterSeed: critterSeed(target.recipient_id),
          guide: loaded.context.guide,
        });
  const status = failed ? 'fallback' : 'ready';
  await store(pool, target, final, {
    status,
    attempts,
    shared: reply === null,
    note: failed
      ? `${guideName.charAt(0).toUpperCase()}${guideName.slice(1)} wrote the group version for ${loaded.context.recipientFirstName}`
      : null,
    shareMinor: loaded.shareMinor,
    currency: loaded.currency,
    savingsMinor: reply === null ? null : loaded.savingsMinor,
    keys,
  });
  return { status, attempts, ...(rejected.length > 0 ? { rejected } : {}) };
}

export function proposalVersionsJob(deps: VersionJobDeps): AnyJobDefinition {
  return defineJob({
    queue: PROPOSAL_QUEUES.versions,
    schema: z.object({ version_id: z.uuid() }),
    singletonKey: (data) => data.version_id,
    async handler(data, { pool }) {
      return { ...(await runVersion(pool, data.version_id, deps)) };
    },
  });
}
