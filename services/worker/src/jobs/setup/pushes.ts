/**
 * Trip setup pushes: N-05 the guide's private ask (to its member alone, with the two quick
 * replies), N-46 its outcome to whoever asked (freed, not movable, or no answer in 48 hours), and
 * the stale-calendar nudge, the must-do prompt (once per member per trip), a member's request to
 * swap rooms (to the organisers), and a tracked lottery's reminders (N-45). Bodies carry first
 * names, a place, a must-do's title and a short date range; never a calendar event, a budget or a
 * reply's words.
 */
import {
  addMustDoLink,
  ASK_BODY,
  ASK_REPLY_BODY,
  CALENDAR_STALE_BODY,
  CALENDAR_STALE_HOURS,
  LOTTERY_REMINDER_BODY,
  MUST_DO_PROMPT_BODY,
  ROOM_SWAP_BODY,
  SETUP_GUIDE_TITLE,
  setupAskLink,
  setupStepLink,
} from '@cp/domain';
import { fillAskLine } from '@cp/ai';

import { registerNotification } from '../notify/register';
import { dateRange, firstName, setupFacts, str } from './facts';

interface AskRow {
  readonly trip_id: string;
  readonly target_user_id: string;
  readonly requested_by: string | null;
  readonly block_start: string;
  readonly block_end: string;
  readonly ask_line: string | null;
  readonly status: string;
}

async function loadAsk(
  tx: Parameters<Parameters<typeof registerNotification>[0]['compose']>[0],
  askId: string | null,
): Promise<AskRow | undefined> {
  if (askId === null) return undefined;
  const { rows } = await tx.query<AskRow>(
    `SELECT trip_id, target_user_id, requested_by, block_start::text AS block_start,
            block_end::text AS block_end, ask_line, status
       FROM availability_asks WHERE id = $1`,
    [askId],
  );
  return rows[0];
}

export function registerSetupPushes(): void {
  registerNotification({
    key: 'guide_availability_ask',
    event: 'availability_ask.created',
    audience: (_tx, event) => {
      const target = str(event, 'target_user_id');
      return Promise.resolve(target === null ? [] : [target]);
    },
    async compose(tx, event, uid) {
      const askId = str(event, 'ask_id');
      const ask = await loadAsk(tx, askId);
      if (ask === undefined || ask.status !== 'asked' || ask.ask_line === null) return null;
      if (ask.target_user_id !== uid) return null;
      const facts = await setupFacts(tx, ask.trip_id);
      if (facts === undefined) return null;
      return {
        title: SETUP_GUIDE_TITLE,
        body: ASK_BODY,
        vars: {
          guide: facts.guide.name,
          crew: facts.crew,
          line: fillAskLine(ask.ask_line, dateRange(ask.block_start, ask.block_end)),
        },
        sender: facts.guide,
        crewId: facts.crewId,
        tripId: ask.trip_id,
        deepLink: setupAskLink(ask.trip_id, askId ?? ''),
        ctx: { ask_id: askId, actions: ['freed', 'not_movable'] },
        needsYou: true,
      };
    },
  });

  for (const event of ['availability_ask.answered', 'availability_ask.timed_out'] as const) {
    registerNotification({
      key: 'availability_reply',
      event,
      async audience(tx, routed) {
        const ask = await loadAsk(tx, str(routed, 'ask_id'));
        return ask?.requested_by ? [ask.requested_by] : [];
      },
      async compose(tx, routed) {
        const ask = await loadAsk(tx, str(routed, 'ask_id'));
        if (ask === undefined) return null;
        const facts = await setupFacts(tx, ask.trip_id);
        if (facts === undefined) return null;
        const outcome =
          routed.type === 'availability_ask.timed_out'
            ? 'timed_out'
            : str(routed, 'answer') === 'freed'
              ? 'freed'
              : 'not_movable';
        return {
          title: SETUP_GUIDE_TITLE,
          body: ASK_REPLY_BODY[outcome],
          vars: {
            guide: facts.guide.name,
            crew: facts.crew,
            name: await firstName(tx, ask.target_user_id),
            dates: dateRange(ask.block_start, ask.block_end),
          },
          sender: facts.guide,
          crewId: facts.crewId,
          tripId: ask.trip_id,
          deepLink: setupStepLink(ask.trip_id, 'when'),
          ctx: { ask_id: str(routed, 'ask_id'), outcome },
        };
      },
    });
  }

  registerNotification({
    key: 'setup_task',
    event: 'calendar.stale',
    audience: (_tx, event) => {
      const uid = str(event, 'user_id');
      return Promise.resolve(uid === null ? [] : [uid]);
    },
    async compose(tx, event, uid) {
      const tripId = str(event, 'trip_id');
      const facts = tripId === null ? undefined : await setupFacts(tx, tripId);
      if (facts === undefined) return null;
      const reason = str(event, 'reason') === 'stale' ? 'stale' : 'missing';
      return {
        title: SETUP_GUIDE_TITLE,
        body: CALENDAR_STALE_BODY[reason],
        vars: {
          guide: facts.guide.name,
          crew: facts.crew,
          name: await firstName(tx, uid),
          place: facts.place,
          days: Math.round(CALENDAR_STALE_HOURS / 24),
        },
        sender: facts.guide,
        crewId: facts.crewId,
        tripId: facts.tripId,
        deepLink: setupStepLink(facts.tripId, 'when'),
        ctx: { trip_id: facts.tripId, reason },
        collapseVars: { trip_id: facts.tripId },
      };
    },
  });

  registerNotification({
    key: 'setup_task',
    event: 'must_do.prompted',
    audience: (_tx, event) => {
      const uid = str(event, 'user_id');
      return Promise.resolve(uid === null ? [] : [uid]);
    },
    async compose(tx, event, uid) {
      const tripId = str(event, 'trip_id');
      const facts = tripId === null ? undefined : await setupFacts(tx, tripId);
      if (facts === undefined) return null;
      return {
        title: SETUP_GUIDE_TITLE,
        body: MUST_DO_PROMPT_BODY,
        vars: {
          guide: facts.guide.name,
          crew: facts.crew,
          name: await firstName(tx, uid),
          place: facts.place,
        },
        sender: facts.guide,
        crewId: facts.crewId,
        tripId: facts.tripId,
        deepLink: addMustDoLink(facts.tripId),
        ctx: { trip_id: facts.tripId, sheet: 'add_must_do' },
        needsYou: true,
        collapseVars: { trip_id: facts.tripId },
      };
    },
  });

  registerNotification({
    key: 'setup_task',
    event: 'room_swap.requested',
    async audience(tx, event) {
      const { rows } = await tx.query<{ user_id: string }>(
        "SELECT user_id FROM trip_participants WHERE trip_id = $1 AND role = 'organiser'",
        [str(event, 'trip_id')],
      );
      return rows.map((row) => row.user_id);
    },
    async compose(tx, event) {
      const tripId = str(event, 'trip_id');
      const asker = str(event, 'user_id');
      const facts = tripId === null ? undefined : await setupFacts(tx, tripId);
      if (facts === undefined || asker === null) return null;
      return {
        title: SETUP_GUIDE_TITLE,
        body: ROOM_SWAP_BODY,
        vars: { guide: facts.guide.name, crew: facts.crew, name: await firstName(tx, asker) },
        sender: facts.guide,
        crewId: facts.crewId,
        tripId: facts.tripId,
        deepLink: setupStepLink(facts.tripId, 'rooms'),
        ctx: { trip_id: facts.tripId, user_id: asker },
      };
    },
  });

  registerNotification({
    key: 'lottery_deadline',
    event: 'lottery.reminder_due',
    audience: (_tx, event) => {
      const uid = str(event, 'user_id');
      return Promise.resolve(uid === null ? [] : [uid]);
    },
    async compose(tx, event) {
      const mustDoId = str(event, 'must_do_id');
      const { rows } = await tx.query<{ trip_id: string; title: string; deadline: string | null }>(
        `SELECT trip_id, title, external_deadline::text AS deadline FROM must_dos
          WHERE id = $1 AND deleted_at IS NULL`,
        [mustDoId],
      );
      const mustDo = rows[0];
      const facts = mustDo === undefined ? undefined : await setupFacts(tx, mustDo.trip_id);
      if (mustDo === undefined || facts === undefined) return null;
      const slot = str(event, 'slot') === 'result' ? 'result' : 'deadline';
      return {
        title: SETUP_GUIDE_TITLE,
        body: LOTTERY_REMINDER_BODY[slot],
        vars: {
          guide: facts.guide.name,
          crew: facts.crew,
          title: mustDo.title,
          date: mustDo.deadline === null ? '' : dateRange(mustDo.deadline, mustDo.deadline),
        },
        sender: facts.guide,
        crewId: facts.crewId,
        tripId: facts.tripId,
        deepLink: setupStepLink(facts.tripId, 'must-dos'),
        ctx: { must_do_id: mustDoId, slot },
      };
    },
  });
}
