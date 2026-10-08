/**
 * What a notification's button does when the app itself answers it: the money, chat, disruption,
 * invite, found-booking, briefing and memory categories of packages/domain
 * `NOTIFICATION_CATEGORY_SPECS`. A background button becomes its command, built from the ids the
 * push carries in `cp.ctx`, and goes through the command client (so it queues offline like the
 * same button in the app). A button the push cannot back (the id is missing, or the push did not
 * offer it) opens the push's link instead, so a tap never does nothing. Categories a feature
 * answers itself (change sets, leave-by, SOS, help, setup, vendor) and the posters the Notification
 * Content extension answers (vote, RSVP) are not handled here.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: ids and wire values. */
import {
  notificationCategorySpec,
  NOTIFICATION_CATEGORY_SPECS,
  type NotificationActionSpec,
  type NotificationCategory,
  type RegisteredCommandName,
} from '@cp/domain';

import { cpBlocks, tapFromNotification, type NotificationLike, type PushTap } from './routing';

/** The categories whose buttons this module answers. */
export const SHARED_ACTION_CATEGORIES: readonly NotificationCategory[] = [
  'cp.money',
  'cp.chat',
  'cp.disruption',
  'cp.invite',
  'cp.import',
  'cp.briefing',
  'cp.memory',
];

/** The slice of an expo-notifications response the routing reads. */
export interface ActionResponseLike {
  readonly actionIdentifier: string;
  /** What was typed into a reply field. */
  readonly userText?: string | null;
  readonly notification: NotificationLike & {
    readonly request: {
      readonly identifier: string;
      readonly content: { readonly categoryIdentifier?: string | null; readonly data?: unknown };
    };
  };
}

export interface ActionCommand {
  readonly name: RegisteredCommandName;
  /** May wait in the offline queue (the same choice the feature's own button makes). */
  readonly offline: boolean;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** The commands that only run against the server; every other one may queue. */
const ONLINE_ONLY = new Set(['confirm_paid', 'nudge_payment', 'defer_invite']);

const command = (
  name: RegisteredCommandName,
  payload: Readonly<Record<string, unknown>>,
): ActionCommand => ({
  name,
  offline: !ONLINE_ONLY.has(name),
  payload,
});

export interface ActionReply {
  /** One per notification and button: a reply is acted on once. */
  readonly key: string;
  readonly category: NotificationCategory;
  readonly action: NotificationActionSpec;
  /** The command to send, or null when the button opens the push's link. */
  readonly command: ActionCommand | null;
  readonly tap: PushTap | null;
}

type Ctx = Readonly<Record<string, unknown>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsed(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** `cp.ctx` of a push (an object on APNs, JSON text inside FCM data); empty when there is none. */
export function contextOf(notification: NotificationLike): Ctx {
  for (const candidate of cpBlocks(notification)) {
    const block = parsed(candidate);
    if (!isRecord(block)) continue;
    const ctx = parsed(block['ctx']);
    if (isRecord(ctx)) return ctx;
  }
  return {};
}

const uuid = (value: unknown): string | null =>
  typeof value === 'string' && UUID.test(value) ? value : null;

/** The payment method a button records: the push cannot ask which one was used. */
export const PUSH_PAYMENT_METHOD = 'other';
/** The reaction the memory push's one button leaves. */
export const PUSH_MEMORY_REACTION = '❤️';
/** A reply longer than a chat message is cut to this many characters. */
const REPLY_MAX = 4000;

type Build = (ctx: Ctx, text: string) => ActionCommand | null;

const withId =
  (
    key: string,
    name: RegisteredCommandName,
    extra: Readonly<Record<string, unknown>> = {},
  ): Build =>
  (ctx) => {
    const id = uuid(ctx[key]);
    return id === null ? null : command(name, { [key]: id, ...extra });
  };

/** A payment button counts only when the push offered it (`ctx.actions`: the payer's or payee's). */
const offered =
  (action: string, build: Build): Build =>
  (ctx, text) => {
    const actions = ctx['actions'];
    return Array.isArray(actions) && actions.includes(action) ? build(ctx, text) : null;
  };

const BUILDERS: Readonly<Record<string, Build>> = {
  'cp.money:MARK_PAID': offered(
    'MARK_PAID',
    withId('payment_id', 'mark_paid', { method: PUSH_PAYMENT_METHOD }),
  ),
  'cp.money:CONFIRM': offered('CONFIRM', withId('payment_id', 'confirm_paid')),
  'cp.money:NUDGE': offered('NUDGE', withId('payment_id', 'nudge_payment')),
  'cp.chat:REPLY': (ctx, text) => {
    const crewId = uuid(ctx['crew_id']);
    const body = text.trim().slice(0, REPLY_MAX);
    if (crewId === null || body === '') return null;
    return command('send_message', {
      crew_id: crewId,
      body,
      mentions: [],
      mentions_guide: false,
      attachments: [],
    });
  },
  'cp.chat:READ': (ctx) => {
    const crewId = uuid(ctx['crew_id']);
    const seq = ctx['seq'];
    if (crewId === null || typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) {
      return null;
    }
    return command('mark_read', { crew_id: crewId, seq });
  },
  'cp.disruption:APPROVE': (ctx) => {
    const disruptionId = uuid(ctx['disruption_id']);
    const actionId = ctx['action_id'];
    if (disruptionId === null || typeof actionId !== 'string' || actionId === '') return null;
    return command('decide_disruption_action', {
      disruption_id: disruptionId,
      action_id: actionId,
      decision: 'approve',
    });
  },
  'cp.invite:LATER': withId('invite_id', 'defer_invite'),
  'cp.import:ADD_ALL': withId('candidate_id', 'resolve_import_candidate', { action: 'add' }),
  'cp.briefing:DONE': withId('item_id', 'act_briefing_item', { action: 'done' }),
  'cp.briefing:NUDGE': withId('item_id', 'act_briefing_item', { action: 'nudge' }),
  'cp.memory:REACT': withId('memory_id', 'react_memory', { emoji: PUSH_MEMORY_REACTION }),
};

/**
 * The background button a response carries, when it is one this module answers; null for anything
 * else.
 */
export function actionReplyOf(response: ActionResponseLike): ActionReply | null {
  const request = response.notification.request;
  const category = SHARED_ACTION_CATEGORIES.find((id) => id === request.content.categoryIdentifier);
  if (category === undefined) return null;
  const action = notificationCategorySpec(category).actions.find(
    (spec) => spec.id === response.actionIdentifier,
  );
  // A button that opens the app is a tap like any other: the tap router follows the push's link.
  if (action === undefined || action.foreground) return null;
  const build = BUILDERS[`${category}:${action.id}`];
  const built =
    build === undefined ? null : build(contextOf(response.notification), response.userText ?? '');
  return {
    key: `${request.identifier}:${action.id}`,
    category,
    action,
    command: built,
    tap: tapFromNotification(response.notification),
  };
}

/**
 * Whether a response is a button that runs without opening the app (any category's): such a tap
 * must not navigate, so the tap router skips it.
 */
export function isBackgroundAction(response: {
  readonly actionIdentifier: string;
  readonly notification: {
    readonly request: { readonly content: { readonly categoryIdentifier?: string | null } };
  };
}): boolean {
  const category = response.notification.request.content.categoryIdentifier;
  const spec = NOTIFICATION_CATEGORY_SPECS.find((entry) => entry.id === category);
  const action = spec?.actions.find((entry) => entry.id === response.actionIdentifier);
  return action !== undefined && !action.foreground;
}

export interface ActionReplyDeps {
  /** Sends through the command client; resolves with its outcome (`queued`, `applied`, `rejected`). */
  readonly send: (command: ActionCommand) => Promise<{ readonly kind: string }>;
  /** Opens the push's link (the tap router). */
  readonly open: (tap: PushTap | null) => void;
}

export interface ActionReplyHandler {
  handle(reply: ActionReply | null): Promise<void>;
}

/**
 * Acts on each reply once (the live listener and the cold-start read may both see it): sends the
 * button's command, or opens the push's link when the button has none or the server refused it,
 * so the screen there shows why.
 */
export function createActionReplyHandler(deps: ActionReplyDeps): ActionReplyHandler {
  const handled = new Set<string>();
  return {
    async handle(reply) {
      if (reply === null || handled.has(reply.key)) return;
      handled.add(reply.key);
      if (reply.command === null) {
        deps.open(reply.tap);
        return;
      }
      const outcome = await deps.send(reply.command).catch(() => null);
      if (outcome === null) {
        // Never reached the queue: the next sighting of this reply may try again.
        handled.delete(reply.key);
        return;
      }
      if (outcome.kind === 'rejected') deps.open(reply.tap);
    },
  };
}
