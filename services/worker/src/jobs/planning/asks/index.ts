/**
 * An organiser's private ask about one member's saves (the plan check's Balance the crew), in the
 * worker: the push and the inbox row, both to the asked member only. The push names who asked and
 * nothing else; the inbox row carries ids and answers yes or no through `answer_member_ask`. The
 * places, the balance and the guide's line show only in the app, from the ask the two of them can
 * read. Neither is sent once the ask is answered.
 */
import {
  CHECK_ASK_MEMBER_BODY,
  CHECK_ASK_MEMBER_TITLE,
  CHECK_INBOX_KIND,
  type InboxAction,
  memberAskResolveKey,
  tripCheckLink,
} from '@cp/domain';
import type pg from 'pg';

import type { AnyJobDefinition } from '../../../boss';
import { registerInboxFanout } from '../../inbox/fanout';
import { registerNotification } from '../../notify/register';
import { firstName, setupFacts, str } from '../../setup/facts';

interface AskRow {
  readonly id: string;
  readonly trip_id: string;
  readonly asked_by: string;
  readonly member_id: string;
  readonly status: string;
}

async function openAsk(tx: pg.PoolClient, askId: string | null): Promise<AskRow | undefined> {
  if (askId === null) return undefined;
  const { rows } = await tx.query<AskRow>(
    `SELECT id, trip_id, asked_by, member_id, status FROM member_asks
      WHERE id = $1 AND status = 'open'`,
    [askId],
  );
  return rows[0];
}

const answer = (askId: string, accept: boolean): InboxAction => ({
  id: accept ? 'yes' : 'no',
  style: accept ? 'primary' : 'secondary',
  command: 'answer_member_ask',
  payload: { ask_id: askId, accept },
});

let registered = false;

export function registerMemberAskDelivery(): void {
  if (registered) return;
  registered = true;
  registerNotification({
    key: 'check_ask_member',
    event: 'check.member_asked',
    audience: (_tx, event) => {
      const member = str(event, 'member_id');
      return Promise.resolve(member === null ? [] : [member]);
    },
    async compose(tx, event, uid) {
      const ask = await openAsk(tx, str(event, 'ask_id'));
      if (ask === undefined || ask.member_id !== uid) return null;
      const facts = await setupFacts(tx, ask.trip_id);
      if (facts === undefined) return null;
      const asker = await firstName(tx, ask.asked_by);
      return {
        title: CHECK_ASK_MEMBER_TITLE,
        body: CHECK_ASK_MEMBER_BODY,
        vars: { crew: facts.crew, asker },
        sender: { kind: 'member', id: ask.asked_by, name: asker },
        crewId: facts.crewId,
        tripId: ask.trip_id,
        deepLink: tripCheckLink(ask.trip_id),
        ctx: { ask_id: ask.id },
        collapseVars: { ask_id: ask.id },
        needsYou: true,
      };
    },
  });
  registerInboxFanout({
    kind: CHECK_INBOX_KIND.memberAsk,
    async audience(tx, event) {
      const ask = await openAsk(tx, str(event, 'ask_id'));
      return ask === undefined ? [] : [ask.member_id];
    },
    async build(tx, event, uid) {
      const ask = await openAsk(tx, str(event, 'ask_id'));
      if (ask === undefined || ask.member_id !== uid) return null;
      return {
        tripId: ask.trip_id,
        actorId: ask.asked_by,
        data: { ask_id: ask.id },
        actions: [answer(ask.id, true), answer(ask.id, false)],
        deepLink: tripCheckLink(ask.trip_id),
        resolveKey: memberAskResolveKey(ask.id),
      };
    },
  });
}

/** No queue of its own: the ask rides the existing notify and inbox fan-out jobs. */
export function memberAskJobs(): readonly AnyJobDefinition[] {
  registerMemberAskDelivery();
  return [];
}
