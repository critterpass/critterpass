/**
 * Disruption pushes (docs/api-contracts-async.md N-14, N-26, N-27, N-28): a row needing a yes goes
 * to the members who may decide it (ALWAYS, `cp.disruption` with APPROVE); a new disruption tells
 * its travellers what the guide already did; a plan-changing watch escalation and a running-late
 * detection are registered with their own features.
 */
import { DISRUPTION_PUSH, guideText, registerNotificationTrigger } from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type RoutedEvent } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, str } from '../setup/facts';

interface DisruptionFacts {
  readonly crew_id: string;
  readonly title: string;
  readonly summary: string;
  readonly i18n: unknown;
  readonly traveller_ids: string[];
  readonly actions: { poll?: { id: string } | null; affected_user_ids: string[]; label: string }[];
}

async function disruption(
  tx: pg.PoolClient,
  routed: RoutedEvent,
): Promise<DisruptionFacts | undefined> {
  const { rows } = await tx.query<DisruptionFacts>(
    `SELECT t.crew_id, d.title, d.summary, d.i18n, d.actions,
            coalesce(ARRAY(SELECT jsonb_array_elements_text(d.affected -> 'traveller_ids')), '{}')::uuid[]
              AS traveller_ids
       FROM disruptions d JOIN trips t ON t.id = d.trip_id WHERE d.id = $1`,
    [str(routed, 'disruption_id')],
  );
  return rows[0];
}

/** The disruption's headline and line in the recipient's language, when already translated. */
async function wordsFor(
  tx: pg.PoolClient,
  facts: DisruptionFacts,
  uid: string,
): Promise<{ headline: string; detail: string }> {
  const { rows } = await tx.query<{ locale: string }>('SELECT app.user_locale($1) AS locale', [
    uid,
  ]);
  const locale = rows[0]?.locale ?? 'en';
  const source = { title: facts.title, summary: facts.summary };
  return {
    headline: guideText('disruption', source, facts.i18n, 'title', locale) ?? facts.title,
    detail: guideText('disruption', source, facts.i18n, 'summary', locale) ?? facts.summary,
  };
}

let registered = false;

export function registerDisruptionNotifications(): void {
  if (registered) return;
  registered = true;
  registerNotificationTrigger('disruption.needs_yes', 'disruption_update');
  registerNotificationTrigger('disruption.detected', 'disruption_update');
  // A row's decision poll, or (storm) the disruption's own vote, whose voters are its members.
  const pollRow = async (tx: pg.PoolClient, routed: RoutedEvent) => {
    const facts = await disruption(tx, routed);
    const pollId = str(routed, 'action_id');
    const row = facts?.actions.find((action) => action.poll?.id === pollId);
    if (row !== undefined || facts === undefined) return { facts, row };
    const { rows } = await tx.query<{ question: string; voters: string[] }>(
      'SELECT question, eligible_voter_ids AS voters FROM polls WHERE id = $1',
      [pollId],
    );
    const poll = rows[0];
    return {
      facts,
      row:
        poll === undefined ? undefined : { affected_user_ids: poll.voters, label: poll.question },
    };
  };
  const deepLink = (routed: RoutedEvent) => `/disruption/${str(routed, 'disruption_id') ?? ''}`;
  registerNotification({
    key: 'disruption_update',
    event: 'disruption.needs_yes',
    audience: async (tx, routed) => (await pollRow(tx, routed)).row?.affected_user_ids ?? [],
    async compose(tx, routed, uid) {
      const { facts, row } = await pollRow(tx, routed);
      if (facts === undefined || row === undefined) return null;
      const words = await wordsFor(tx, facts, uid);
      return {
        title: DISRUPTION_PUSH.needsYesTitle,
        body: DISRUPTION_PUSH.needsYesBody,
        vars: { headline: words.headline, line: row.label },
        sender: DEFAULT_SETUP_GUIDE,
        crewId: facts.crew_id,
        tripId: str(routed, 'trip_id') ?? null,
        deepLink: deepLink(routed),
        needsYou: true,
        ctx: { poll_id: str(routed, 'action_id') ?? '' },
        collapseVars: { disruption_id: str(routed, 'disruption_id') ?? '' },
      };
    },
    dedupeKey: (routed, uid) => `disruption_yes:${str(routed, 'action_id') ?? ''}:${uid}`,
  });
  registerNotification({
    key: 'disruption_update',
    event: 'disruption.detected',
    audience: async (tx, routed) => (await disruption(tx, routed))?.traveller_ids ?? [],
    async compose(tx, routed, uid) {
      const facts = await disruption(tx, routed);
      if (facts === undefined || Number(routed.payload['done'] ?? 0) === 0) return null;
      const words = await wordsFor(tx, facts, uid);
      return {
        title: DISRUPTION_PUSH.doneTitle,
        body: DISRUPTION_PUSH.doneBody,
        vars: words,
        sender: DEFAULT_SETUP_GUIDE,
        crewId: facts.crew_id,
        tripId: str(routed, 'trip_id') ?? null,
        deepLink: deepLink(routed),
        collapseVars: { disruption_id: str(routed, 'disruption_id') ?? '' },
      };
    },
    dedupeKey: (routed, uid) => `disruption_done:${str(routed, 'disruption_id') ?? ''}:${uid}`,
  });
}
