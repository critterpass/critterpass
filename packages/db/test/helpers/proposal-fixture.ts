import type pg from 'pg';

export interface ProposalSeed {
  readonly proposalId: string;
  readonly threadId: string;
}

/**
 * A sent proposal on the fixture trip with the member's and the co-organiser's versions, the
 * member's reaction, an open, a private objection and a follow-up, the crew hype row, an anonymous
 * suggestion, an organiser reply suggestion and the ex-member's dropout record.
 */
export async function seedProposalRows(
  tx: pg.PoolClient,
  f: { tripId: string; organiser: string; coOrganiser: string; member: string; exMember: string },
): Promise<ProposalSeed> {
  const one = async (sql: string, params: unknown[]) =>
    (await tx.query<{ id: string }>(sql, params)).rows[0]!.id;
  const proposalId = await one(
    `INSERT INTO proposals (trip_id, created_by, reply_by, status, sent_at)
     VALUES ($1, $2, now() + interval '7 days', 'sent', now()) RETURNING id`,
    [f.tripId, f.organiser],
  );
  await tx.query(
    `INSERT INTO proposal_versions (proposal_id, trip_id, recipient_id, status)
     VALUES ($1, $2, $3, 'ready'), ($1, $2, $4, 'ready')`,
    [proposalId, f.tripId, f.member, f.coOrganiser],
  );
  await tx.query(
    `INSERT INTO proposal_reactions (proposal_id, trip_id, user_id, kind)
     VALUES ($1, $2, $3, 'six_am')`,
    [proposalId, f.tripId, f.member],
  );
  await tx.query(
    `INSERT INTO hype_aggregates (proposal_id, trip_id, hype_pct, reacted_count, recipients)
     VALUES ($1, $2, 50, 1, 2)`,
    [proposalId, f.tripId],
  );
  await tx.query(
    `INSERT INTO engagement_events (proposal_id, trip_id, user_id, kind, local_hour)
     VALUES ($1, $2, $3, 'opened', 21)`,
    [proposalId, f.tripId, f.member],
  );
  const threadId = await one(
    `INSERT INTO private_guide_threads (trip_id, proposal_id, owner_id, reason)
     VALUES ($1, $2, $3, 'cost') RETURNING id`,
    [f.tripId, proposalId, f.member],
  );
  await tx.query(
    `INSERT INTO anonymous_suggestions (trip_id, proposal_id, topic, text)
     VALUES ($1, $2, 'dates', 'Someone asked about the dates')`,
    [f.tripId, proposalId],
  );
  await tx.query(
    `INSERT INTO rsvp_suggestions (proposal_id, trip_id, kind, copy, dedupe_key)
     VALUES ($1, $2, 'offer', 'Offer everyone the cheaper room?', 'offer:cost')`,
    [proposalId, f.tripId],
  );
  await tx.query(
    `INSERT INTO proposal_followups (proposal_id, trip_id, user_id, kind, due_at)
     VALUES ($1, $2, $3, 'followup', now() + interval '2 days')`,
    [proposalId, f.tripId, f.member],
  );
  await tx.query('INSERT INTO trip_dropouts (trip_id, user_id) VALUES ($1, $2)', [
    f.tripId,
    f.exMember,
  ]);
  return { proposalId, threadId };
}
