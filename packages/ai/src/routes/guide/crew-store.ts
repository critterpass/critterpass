/**
 * The crew-chat side of a guide mention: the claim, the crewmates whose Pass+ covers the ask, the
 * guide's pack, the chat window it reads and the posted reply. SQL runs through the calling
 * service's role runners, so the api and the worker share it.
 */
import { channelName } from '@cp/domain';

import type { ReaderClient, RunAsGuideReader } from '../../context/build';
import {
  LATEST_APPROVED_PERSONA_SQL,
  loadPersonaPack,
  type ApprovedPersonaRow,
} from '../../persona/loader';
import { personaIdSchema, type PersonaPack } from '../../persona/schema';
import type { RunAsSystem, SqlClient } from '../../usage';
import type { CrewTurnPorts, MentionClaim } from './crew-turn';
import { MENTION_WINDOW, type CrewChatLine } from './mention.prompt';

async function rowsOf<R>(tx: SqlClient, sql: string, values: unknown[]): Promise<R[]> {
  return ((await tx.query(sql, values)) as { rows: R[] }).rows;
}

/** Claims an unanswered mention, or null when it is not one or someone already answers it. */
export async function claimMention(
  run: RunAsSystem,
  messageId: string,
): Promise<MentionClaim | null> {
  return run(async (tx) => {
    const [row] = await rowsOf<{
      id: string;
      crew_id: string;
      trip_id: string | null;
      asker_id: string;
      body: string;
      guide_id: string | null;
      guide_slug: string | null;
    }>(
      tx,
      `WITH mention AS (
         SELECT m.id, m.crew_id, m.trip_id, m.sender_id, m.body FROM messages m
          WHERE m.id = $1 AND m.mentions_guide AND m.sender_kind = 'user'
            AND m.deleted_at IS NULL AND m.hidden_at IS NULL
       ), claimed AS (
         INSERT INTO guide_crew_turns (crew_id, trip_id, kind, message_id, asker_id)
         SELECT crew_id, trip_id, 'mention', id, sender_id FROM mention
         ON CONFLICT (message_id) DO NOTHING
         RETURNING id, crew_id, trip_id, asker_id
       )
       SELECT c.id, c.crew_id, c.trip_id, c.asker_id, mention.body, t.guide_id, g.slug AS guide_slug
         FROM claimed c JOIN mention ON true
         LEFT JOIN trips t ON t.id = c.trip_id
         LEFT JOIN guides g ON g.id = t.guide_id`,
      [messageId],
    );
    if (row === undefined) return null;
    return {
      turnId: row.id,
      messageId,
      crewId: row.crew_id,
      tripId: row.trip_id,
      askerId: row.asker_id,
      body: row.body,
      guideId: row.guide_id,
      guideSlug: row.guide_slug,
    };
  });
}

/** Active crewmates with Pass+: any one makes a crew-chat ask unmetered. */
export async function crewPassHolders(
  run: RunAsSystem,
  crewId: string,
  askerId: string,
): Promise<string[]> {
  return run(async (tx) => {
    const rows = await rowsOf<{ user_id: string }>(
      tx,
      `SELECT cm.user_id FROM crew_members cm
         JOIN user_entitlements ue ON ue.user_id = cm.user_id
        WHERE cm.crew_id = $1 AND cm.status = 'active' AND cm.user_id <> $2
          AND ue.guide_unlimited_global
        ORDER BY cm.user_id`,
      [crewId, askerId],
    );
    return rows.map((row) => row.user_id);
  });
}

/**
 * Whether the conversation has a local guide of its own. Without one (no trip, or a trip whose
 * destination has no guide) the default guide stands in and answers for any destination.
 */
export function hasOwnGuide(slug: string | null): boolean {
  return personaIdSchema.safeParse(slug).success;
}

/** The trip guide's pack as the asker may read it (latest approved release, else the repo's). */
export async function packFor(
  read: RunAsGuideReader,
  uid: string,
  tripId: string | null,
  slug: string | null,
): Promise<PersonaPack> {
  const id = personaIdSchema.safeParse(slug);
  const loaded = await loadPersonaPack(id.success ? id.data : 'tokek', (guideSlug) =>
    read(uid, tripId, async (tx: ReaderClient) => {
      const { rows } = await tx.query<ApprovedPersonaRow>(LATEST_APPROVED_PERSONA_SQL, [guideSlug]);
      return rows[0] ?? null;
    }),
  );
  return loaded.pack;
}

export async function chatWindow(
  ports: CrewTurnPorts,
  claim: MentionClaim,
): Promise<CrewChatLine[]> {
  return ports.runAsGuideReader(claim.askerId, claim.tripId, async (tx) => {
    const { rows } = await tx.query<CrewChatLine & { created_at: Date | string }>(
      'SELECT seq, author_kind, author_name, body, created_at FROM llm.chat_window($1, $2)',
      [claim.crewId, MENTION_WINDOW + 1],
    );
    return rows.map((row) => ({
      ...row,
      seq: Number(row.seq),
      created_at: new Date(row.created_at).toISOString(),
    }));
  });
}

export async function settle(
  ports: CrewTurnPorts,
  claim: MentionClaim,
  status: 'answered' | 'failed' | 'skipped',
  reply?: { readonly id: string; readonly text: string; readonly metered: boolean },
): Promise<void> {
  await ports.runAsSystem(async (tx) => {
    if (reply !== undefined) {
      const [posted] = await rowsOf<{ seq: string }>(
        tx,
        `INSERT INTO messages (id, crew_id, trip_id, sender_kind, guide_id, type, body, reply_to_id)
         VALUES ($1, $2, $3, 'guide', $4, 'text', $5, $6) RETURNING seq`,
        [
          reply.id,
          claim.crewId,
          claim.tripId,
          claim.guideId,
          reply.text.slice(0, 4000),
          claim.messageId,
        ],
      );
      await ports.publish(tx, channelName('crew_chat', claim.crewId), 'message.created', {
        crew_id: claim.crewId,
        message_id: reply.id,
        seq: Number(posted?.seq),
      });
    }
    await tx.query(
      `UPDATE guide_crew_turns SET status = $2, reply_message_id = $3, metered = $4 WHERE id = $1`,
      [claim.turnId, status, reply?.id ?? null, reply?.metered ?? false],
    );
  });
}
