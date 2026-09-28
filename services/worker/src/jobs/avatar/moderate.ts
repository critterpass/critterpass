/**
 * `avatar.moderate`: decides a pending photo avatar, in this order.
 *
 * 1. Known-image hash match (./hash-match.ts), before any model sees the photo. With the ops
 *    switch off or no vendor configured, the photo waits for an ops reviewer. A hit rejects the
 *    avatar, moves the upload into quarantine, and files an ops report for the legal report path;
 *    the photo never reaches the classifier.
 * 2. Image classification on the DeepSeek fast tier through the AI gateway (`avatar.moderate`):
 *    `allow` approves and queues the PNG variants, `reject` rejects, `uncertain` (or no model, or a
 *    reply that does not parse) files an ops report and keeps the avatar pending.
 *
 * Crewmates see initials until an avatar is approved; a rejected one stays the owner's current
 * avatar row so the app can show the rejection with a retry.
 */
import { parseStructuredText, recordUsage, textOf, type AiUsageRecord, type Gateway } from '@cp/ai';
import { enqueueRealtime, sendInTx, withSystem } from '@cp/db';
import {
  AVATAR_MODERATE_QUEUE,
  AVATAR_RENDER_QUEUE,
  avatarJobSchema,
  crewChannel,
  switchedOffKey,
  type AvatarJob,
} from '@cp/domain';
import type pg from 'pg';
import sharp from 'sharp';
import { z } from 'zod';

import { defineJob, type JobDefinition, type JobLogger } from '../../boss';
import { hashMatchSwitchedOn, type HashMatcher } from './hash-match';
import { quarantineKey, type AvatarMediaStore } from './media-store';

export type AvatarClassifier = Pick<Gateway, 'callModel'>;

export interface AvatarModerateOptions {
  readonly store: AvatarMediaStore | undefined;
  /** The enrolled vendor; undefined = not enrolled (photos wait for ops review). */
  readonly matcher: HashMatcher | undefined;
  /** Builds the gateway for one run (usage rows bill to the avatar's owner); undefined = no model. */
  readonly classifier:
    ((onUsage: (record: AiUsageRecord) => Promise<void>) => AvatarClassifier) | undefined;
}

const CATEGORIES = [
  'nudity',
  'sexual',
  'violence',
  'gore',
  'hate_symbol',
  'drugs',
  'weapons',
  'self_harm',
] as const;

const verdictSchema = z.object({
  verdict: z.enum(['allow', 'reject', 'uncertain']),
  categories: z.array(z.enum(CATEGORIES)).default([]),
});
export type AvatarVerdict = z.infer<typeof verdictSchema>;

const INSTRUCTIONS = `You review profile pictures for a group travel app used by adults.
Reply with JSON only: {"verdict": "allow" | "reject" | "uncertain", "categories": [...]}.
reject when the image shows nudity or sexual content, graphic violence or gore, hate symbols,
drug use, weapons aimed at the viewer, or self-harm; list those categories from: ${CATEGORIES.join(', ')}.
allow everything else, including pictures that are not a person (pets, places, food, drawings).
uncertain when you cannot tell.`;

const REPLY_FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['allow', 'reject', 'uncertain'] },
      categories: { type: 'array', items: { type: 'string', enum: [...CATEGORIES] } },
    },
    required: ['verdict', 'categories'],
    additionalProperties: false,
  },
};

interface PendingAvatar {
  readonly user_id: string;
  readonly media_key: string;
}

type Outcome = 'approved' | 'rejected' | 'blocked' | 'review';

async function announce(tx: pg.PoolClient, uid: string): Promise<void> {
  const { rows } = await tx.query<{ crew_id: string }>(
    "SELECT crew_id FROM crew_members WHERE user_id = $1 AND status = 'active'",
    [uid],
  );
  for (const { crew_id: crewId } of rows) {
    await enqueueRealtime(tx, {
      channel: crewChannel(crewId),
      payload: { type: 'member.updated', user_id: uid, fields: ['avatar'] },
    });
  }
}

/** One open ops report per avatar (source `compliance`: no user filed it). */
async function fileReport(tx: pg.PoolClient, avatarId: string, reason: string): Promise<void> {
  await tx.query(
    `INSERT INTO moderation_reports (source, target_kind, target_id, reason)
     SELECT 'compliance', 'avatar', $1, $2
     WHERE NOT EXISTS (
       SELECT 1 FROM moderation_reports
       WHERE target_kind = 'avatar' AND target_id = $1 AND status = 'open')`,
    [avatarId, reason],
  );
}

async function settle(
  tx: pg.PoolClient,
  avatarId: string,
  status: 'approved' | 'rejected',
  reason: string | null,
): Promise<string | null> {
  const { rows } = await tx.query<{ user_id: string }>(
    `UPDATE avatars SET moderation_status = $2, moderation_reason = $3
     WHERE id = $1 AND moderation_status = 'pending' RETURNING user_id`,
    [avatarId, status, reason],
  );
  return rows[0]?.user_id ?? null;
}

/** JPEGs the checks read: the full photo for hash matching, a 512 px copy for the model. */
async function normalise(bytes: Uint8Array): Promise<{ full: Buffer; small: Buffer } | null> {
  try {
    const full = await sharp(bytes).rotate().jpeg({ quality: 90 }).toBuffer();
    const small = await sharp(full)
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { full, small };
  } catch {
    return null;
  }
}

async function classify(
  classifier: AvatarClassifier,
  image: Buffer,
  signal: AbortSignal,
  owner: string,
): Promise<AvatarVerdict> {
  const reply = await classifier.callModel(
    'avatar.moderate',
    {
      system: INSTRUCTIONS,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: image.toString('base64') },
            },
            { type: 'text', text: 'Review this profile picture.' },
          ],
        },
      ],
      outputFormat: REPLY_FORMAT,
      signal,
    },
    { userId: owner },
  );
  const parsed = verdictSchema.safeParse(parseStructuredText(textOf(reply.message)));
  return parsed.success ? parsed.data : { verdict: 'uncertain', categories: [] };
}

export function avatarModerateJob(options: AvatarModerateOptions): JobDefinition<AvatarJob> {
  async function review(pool: pg.Pool, avatarId: string, reason: string): Promise<Outcome> {
    await withSystem(pool, (tx) => fileReport(tx, avatarId, reason));
    return 'review';
  }

  async function decide(
    pool: pg.Pool,
    avatarId: string,
    status: 'approved' | 'rejected',
    reason: string | null,
  ): Promise<Outcome> {
    await withSystem(pool, async (tx) => {
      const owner = await settle(tx, avatarId, status, reason);
      if (owner === null) return;
      if (status === 'approved') {
        const job: AvatarJob = { avatar_id: avatarId };
        await sendInTx(tx, AVATAR_RENDER_QUEUE, job, { singletonKey: avatarId });
      }
      await announce(tx, owner);
    });
    return status;
  }

  async function block(
    pool: pg.Pool,
    avatarId: string,
    avatar: PendingAvatar,
    bytes: Uint8Array,
    contentType: string | null,
    reference: string | null,
    logger: JobLogger,
  ): Promise<Outcome> {
    const store = options.store;
    if (store !== undefined) {
      await store.put(
        quarantineKey(avatar.media_key),
        bytes,
        contentType ?? 'application/octet-stream',
      );
      await store.delete(avatar.media_key);
    }
    await withSystem(pool, async (tx) => {
      const owner = await settle(tx, avatarId, 'rejected', 'hash_match');
      await fileReport(
        tx,
        avatarId,
        `hash_match:${options.matcher?.vendor ?? 'vendor'}:${reference ?? 'no-ref'}`,
      );
      if (owner !== null) await announce(tx, owner);
    });
    // Ops follows the legal report path from the report; the log carries ids only.
    logger.error(
      { avatar_id: avatarId, vendor: options.matcher?.vendor, reference },
      'avatar hash match hit',
    );
    return 'blocked';
  }

  return defineJob({
    queue: AVATAR_MODERATE_QUEUE,
    schema: avatarJobSchema,
    singletonKey: (data) => data.avatar_id,
    handler: async (data, ctx) => {
      const { avatar, hashOn } = await withSystem(ctx.pool, async (tx) => {
        const { rows } = await tx.query<PendingAvatar>(
          `SELECT user_id, media_key FROM avatars
           WHERE id = $1 AND kind = 'photo' AND moderation_status = 'pending'`,
          [data.avatar_id],
        );
        return { avatar: rows[0], hashOn: await hashMatchSwitchedOn(tx) };
      });
      if (avatar === undefined) return { outcome: 'skipped' };
      const store = options.store;
      if (!hashOn || options.matcher === undefined || store === undefined) {
        return { outcome: await review(ctx.pool, data.avatar_id, 'hash_match_unavailable') };
      }

      const upload = await store.get(avatar.media_key);
      if (upload === null) {
        // The client may still be uploading (offline issue): retry, then give up as missing.
        if (!ctx.job.isFinalAttempt)
          throw new Error(`avatar upload ${data.avatar_id} not there yet`);
        return { outcome: await decide(ctx.pool, data.avatar_id, 'rejected', 'upload_missing') };
      }
      const images = await normalise(upload.bytes);
      if (images === null) {
        return { outcome: await review(ctx.pool, data.avatar_id, 'unreadable_image') };
      }

      const match = await options.matcher.match(images.full, ctx.job.signal);
      if (match.hit) {
        const outcome = await block(
          ctx.pool,
          data.avatar_id,
          avatar,
          upload.bytes,
          upload.contentType,
          match.reference,
          ctx.logger,
        );
        return { outcome };
      }

      if (options.classifier === undefined) {
        return { outcome: await review(ctx.pool, data.avatar_id, 'classifier_unavailable') };
      }
      const classifier = options.classifier((record) =>
        recordUsage((fn) => withSystem(ctx.pool, fn), record),
      );
      let verdict: AvatarVerdict;
      try {
        verdict = await classify(classifier, images.small, ctx.job.signal, avatar.user_id);
      } catch (error) {
        // A model outage never lets a photo through: retry, then leave it to ops review. A
        // switched-off classifier goes to review at once (retrying cannot help).
        const off = switchedOffKey(error) !== undefined;
        if (!ctx.job.isFinalAttempt && !off) throw error;
        const reason = off ? 'classifier_switched_off' : 'classifier_error';
        return { outcome: await review(ctx.pool, data.avatar_id, reason) };
      }
      if (verdict.verdict === 'allow') {
        return { outcome: await decide(ctx.pool, data.avatar_id, 'approved', null) };
      }
      if (verdict.verdict === 'reject') {
        const reason = verdict.categories.length > 0 ? verdict.categories.join(',') : 'model';
        return { outcome: await decide(ctx.pool, data.avatar_id, 'rejected', reason) };
      }
      return { outcome: await review(ctx.pool, data.avatar_id, 'classifier_uncertain') };
    },
  });
}
