/**
 * Notification buttons the app answers itself: each background button becomes its command from
 * the ids the push carries, a button the push cannot back opens the push's link instead, and a
 * reply seen twice (the live listener and the cold-start read) is acted on once.
 */
import { describe, expect, it, jest } from '@jest/globals';

import { NOTIFICATION_CATEGORY_SPECS } from '@cp/domain';

import {
  actionReplyOf,
  createActionReplyHandler,
  isBackgroundAction,
  PUSH_MEMORY_REACTION,
  SHARED_ACTION_CATEGORIES,
  type ActionCommand,
  type ActionResponseLike,
} from '../notification-actions';

const ID = (n: number) => `0199a3c0-0000-7000-8000-${String(n).padStart(12, '0')}`;

/** A response as iOS reports it: the `cp` block inside the APNs payload. */
function response(
  category: string,
  action: string,
  ctx: Record<string, unknown> | null,
  extra: { userText?: string; nid?: string } = {},
): ActionResponseLike {
  return {
    actionIdentifier: action,
    ...(extra.userText === undefined ? {} : { userText: extra.userText }),
    notification: {
      request: {
        identifier: `apns-${extra.nid ?? 'n1'}`,
        content: { categoryIdentifier: category, data: {} },
        trigger: {
          payload: {
            cp: {
              nid: extra.nid ?? 'n1',
              deeplink: '/inbox/somewhere',
              ...(ctx === null ? {} : { ctx }),
            },
          },
        },
      },
    },
  };
}

const commandOf = (r: ActionResponseLike) => actionReplyOf(r)?.command ?? null;

describe('a notification button becomes its command', () => {
  it('marks, confirms and nudges a payment only when the push offered that button', () => {
    const payer = { payment_id: ID(1), actions: ['MARK_PAID'] };
    expect(commandOf(response('cp.money', 'MARK_PAID', payer))).toEqual({
      name: 'mark_paid',
      offline: true,
      payload: { payment_id: ID(1), method: 'other' },
    });
    // The payer's push never confirms receipt: that button belongs to the payee's push.
    expect(commandOf(response('cp.money', 'CONFIRM', payer))).toBeNull();
    expect(
      commandOf(response('cp.money', 'CONFIRM', { payment_id: ID(1), actions: ['CONFIRM'] })),
    ).toEqual({ name: 'confirm_paid', offline: false, payload: { payment_id: ID(1) } });
    expect(
      commandOf(response('cp.money', 'NUDGE', { payment_id: ID(1), actions: ['NUDGE'] })),
    ).toEqual({ name: 'nudge_payment', offline: false, payload: { payment_id: ID(1) } });
    // An expense push names no payment.
    expect(commandOf(response('cp.money', 'MARK_PAID', null))).toBeNull();
  });

  it('sends a typed reply to the crew chat and marks the chat read up to the message', () => {
    const ctx = { crew_id: ID(2), message_id: ID(3), seq: 41 };
    expect(commandOf(response('cp.chat', 'REPLY', ctx, { userText: '  on my way  ' }))).toEqual({
      name: 'send_message',
      offline: true,
      payload: {
        crew_id: ID(2),
        body: 'on my way',
        mentions: [],
        mentions_guide: false,
        attachments: [],
      },
    });
    expect(commandOf(response('cp.chat', 'REPLY', ctx, { userText: '   ' }))).toBeNull();
    expect(commandOf(response('cp.chat', 'READ', ctx))).toEqual({
      name: 'mark_read',
      offline: true,
      payload: { crew_id: ID(2), seq: 41 },
    });
    expect(commandOf(response('cp.chat', 'READ', { crew_id: ID(2) }))).toBeNull();
  });

  it('answers a disruption row, sets an invite aside, adds a found booking, acts on a briefing line and reacts to a memory', () => {
    expect(
      commandOf(
        response('cp.disruption', 'APPROVE', { disruption_id: ID(4), action_id: 'rebook-1' }),
      ),
    ).toEqual({
      name: 'decide_disruption_action',
      offline: true,
      payload: { disruption_id: ID(4), action_id: 'rebook-1', decision: 'approve' },
    });
    // A push that names only the poll cannot say which row is approved.
    expect(commandOf(response('cp.disruption', 'APPROVE', { poll_id: ID(5) }))).toBeNull();
    expect(commandOf(response('cp.invite', 'LATER', { invite_id: ID(6) }))).toEqual({
      name: 'defer_invite',
      offline: false,
      payload: { invite_id: ID(6) },
    });
    expect(commandOf(response('cp.import', 'ADD_ALL', { candidate_id: ID(7) }))).toEqual({
      name: 'resolve_import_candidate',
      offline: true,
      payload: { candidate_id: ID(7), action: 'add' },
    });
    expect(commandOf(response('cp.briefing', 'DONE', { item_id: ID(8) }))?.payload).toEqual({
      item_id: ID(8),
      action: 'done',
    });
    expect(commandOf(response('cp.briefing', 'NUDGE', { item_id: ID(8) }))?.payload).toEqual({
      item_id: ID(8),
      action: 'nudge',
    });
    expect(commandOf(response('cp.memory', 'REACT', { memory_id: ID(9) }))).toEqual({
      name: 'react_memory',
      offline: true,
      payload: { memory_id: ID(9), emoji: PUSH_MEMORY_REACTION },
    });
  });

  it('reads the context from FCM data, where the block is JSON text', () => {
    const fcm: ActionResponseLike = {
      actionIdentifier: 'LATER',
      notification: {
        request: {
          identifier: 'fcm-1',
          content: { categoryIdentifier: 'cp.invite' },
          trigger: {
            remoteMessage: {
              data: { cp: JSON.stringify({ nid: 'n9', ctx: { invite_id: ID(6) } }) },
            },
          },
        },
      },
    };
    expect(commandOf(fcm)?.payload).toEqual({ invite_id: ID(6) });
  });

  it('never takes an id that is not one, a button that opens the app, or another category', () => {
    expect(commandOf(response('cp.invite', 'LATER', { invite_id: "x' OR 1=1" }))).toBeNull();
    expect(actionReplyOf(response('cp.invite', 'JOIN', { invite_id: ID(6) }))).toBeNull();
    expect(actionReplyOf(response('cp.disruption', 'OPEN', null))).toBeNull();
    expect(actionReplyOf(response('cp.sos', 'COMING', { sos_id: ID(1) }))).toBeNull();
    expect(actionReplyOf(response('cp.vote', 'VOTE_1', { poll_id: ID(1) }))).toBeNull();
    expect(
      actionReplyOf(response('cp.chat', 'expo.modules.notifications.actions.DEFAULT', {})),
    ).toBeNull();
  });

  it('has a command for every background button of the categories it answers', () => {
    const full = {
      payment_id: ID(1),
      actions: ['MARK_PAID', 'CONFIRM', 'NUDGE'],
      crew_id: ID(2),
      seq: 3,
      disruption_id: ID(4),
      action_id: 'row',
      invite_id: ID(6),
      candidate_id: ID(7),
      item_id: ID(8),
      memory_id: ID(9),
    };
    for (const spec of NOTIFICATION_CATEGORY_SPECS) {
      if (!SHARED_ACTION_CATEGORIES.includes(spec.id)) continue;
      for (const action of spec.actions.filter((entry) => !entry.foreground)) {
        const reply = actionReplyOf(response(spec.id, action.id, full, { userText: 'hi' }));
        // The command the button runs is the one the category table names for it.
        expect([spec.id, action.id, reply?.command?.name]).toEqual([
          spec.id,
          action.id,
          action.command,
        ]);
      }
    }
  });
});

describe('background buttons never navigate on their own', () => {
  it('tells a background button from a tap or a button that opens the app', () => {
    expect(isBackgroundAction(response('cp.chat', 'READ', {}))).toBe(true);
    expect(isBackgroundAction(response('cp.help', 'STOP_SHARE', {}))).toBe(true);
    expect(isBackgroundAction(response('cp.invite', 'JOIN', {}))).toBe(false);
    expect(
      isBackgroundAction(response('cp.chat', 'expo.modules.notifications.actions.DEFAULT', {})),
    ).toBe(false);
    // A feature's own ids are not in the table: it decides for itself.
    expect(isBackgroundAction(response('cp.changeset', 'approve', {}))).toBe(false);
  });
});

describe('acting on a reply', () => {
  function setup(outcome: { kind: string } | Error) {
    const sent: ActionCommand[] = [];
    const open = jest.fn();
    const handler = createActionReplyHandler({
      send: (command) => {
        sent.push(command);
        return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
      },
      open,
    });
    return { sent, open, handler };
  }
  const later = () => actionReplyOf(response('cp.invite', 'LATER', { invite_id: ID(6) }));

  it('sends once when the live listener and the cold-start read both see the reply', async () => {
    const { sent, open, handler } = setup({ kind: 'queued' });
    await handler.handle(later());
    await handler.handle(later());
    expect(sent.map((command) => command.name)).toEqual(['defer_invite']);
    expect(open).not.toHaveBeenCalled();
  });

  it('opens the push when it cannot back the button, or the server refused the answer', async () => {
    const unbacked = setup({ kind: 'applied' });
    await unbacked.handler.handle(actionReplyOf(response('cp.money', 'MARK_PAID', null)));
    expect(unbacked.sent).toEqual([]);
    expect(unbacked.open).toHaveBeenCalledWith(
      expect.objectContaining({ nid: 'n1', deeplink: '/inbox/somewhere' }),
    );

    const refused = setup({ kind: 'rejected' });
    await refused.handler.handle(later());
    expect(refused.open).toHaveBeenCalledTimes(1);
  });

  it('tries again on the next sighting when the send never reached the queue', async () => {
    const { sent, open, handler } = setup(new Error('no session yet'));
    await handler.handle(later());
    await handler.handle(later());
    expect(sent).toHaveLength(2);
    expect(open).not.toHaveBeenCalled();
  });
});
