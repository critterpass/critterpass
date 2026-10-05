/**
 * The builder's rules, apart from the screen: the config the organiser is choosing, whether the
 * proposal already built still matches it (or must be rebuilt before SEND), the reply-by dates on
 * offer (never after the earliest free cancellation of a booked stay, never in the past) and what
 * SEND does from here.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import {
  defaultReplyBy,
  liveFreeCancels,
  MIN_REPLY_WINDOW_MS,
  type ProposalFormat,
} from '@cp/domain';

import type { Proposal } from '../data/proposal';

export interface BuilderConfig {
  readonly format: ProposalFormat;
  readonly showCost: boolean;
  readonly personal: boolean;
  /** An ISO instant the organiser picked, or null for the default. */
  readonly replyBy: string | null;
}

export const DEFAULT_CONFIG: BuilderConfig = {
  format: 'trailer',
  showCost: true,
  personal: true,
  replyBy: null,
};

/** The config a built proposal carries. */
export function configOf(proposal: Proposal): BuilderConfig {
  return {
    format: proposal.format,
    showCost: proposal.showCost,
    personal: proposal.personal,
    replyBy: proposal.replyBy,
  };
}

/** Whether the proposal built so far was built with this config (a default reply-by matches any). */
export function matches(proposal: Proposal, config: BuilderConfig): boolean {
  if (proposal.format !== config.format) return false;
  if (proposal.showCost !== config.showCost || proposal.personal !== config.personal) return false;
  if (config.replyBy === null || proposal.replyBy === null) return true;
  return new Date(proposal.replyBy).getTime() === new Date(config.replyBy).getTime();
}

export type SendPlan =
  | { readonly kind: 'blocked'; readonly reason: 'no_recipients' | 'offline_build' | 'sent' }
  | { readonly kind: 'send'; readonly proposalId: string }
  | { readonly kind: 'build_then_send' };

/** What SEND does: send what is built, build first (online only), or why it can't. */
export function sendPlan(input: {
  readonly proposal: Proposal | null;
  readonly config: BuilderConfig;
  readonly recipients: number;
  readonly offline: boolean;
}): SendPlan {
  const { proposal, config } = input;
  if (proposal !== null && proposal.status !== 'building')
    return { kind: 'blocked', reason: 'sent' };
  if (input.recipients === 0) return { kind: 'blocked', reason: 'no_recipients' };
  if (proposal !== null && matches(proposal, config)) {
    return { kind: 'send', proposalId: proposal.id };
  }
  if (input.offline) return { kind: 'blocked', reason: 'offline_build' };
  return { kind: 'build_then_send' };
}

const DAY_MS = 86_400_000;

export interface ReplyByFacts {
  readonly freeCancelDeadlines: readonly string[];
  readonly tripStart: string | null;
  readonly now: Date;
}

function inputs(facts: ReplyByFacts) {
  return {
    // A free cancellation that has passed bounds nothing.
    freeCancelDeadlines: liveFreeCancels(
      facts.freeCancelDeadlines.map((d) => new Date(d)),
      facts.now,
    ),
    tripStart:
      facts.tripStart === null ? null : new Date(`${facts.tripStart.slice(0, 10)}T00:00:00Z`),
    now: facts.now,
  };
}

/** The deadline the server picks when the organiser leaves it. */
export function defaultReply(facts: ReplyByFacts): Date {
  return defaultReplyBy(inputs(facts));
}

/**
 * Up to `count` evening deadlines (20:00 device time) from tomorrow, each at least an hour away
 * and none after the earliest free cancellation or the trip start.
 */
export function replyByChoices(facts: ReplyByFacts, count = 10): Date[] {
  const bound = inputs(facts);
  // A trip already under way (or starting within the hour) bounds nothing either.
  const start = bound.tripStart?.getTime() ?? null;
  const limits = [
    ...bound.freeCancelDeadlines.map((d) => d.getTime()),
    ...(start === null || start < facts.now.getTime() + 2 * MIN_REPLY_WINDOW_MS ? [] : [start]),
  ];
  const latest = limits.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...limits);
  const choices: Date[] = [];
  const day = new Date(facts.now);
  day.setHours(20, 0, 0, 0);
  for (let i = 0; i < 60 && choices.length < count; i += 1) {
    const at = new Date(day.getTime() + i * DAY_MS);
    if (at.getTime() < facts.now.getTime() + MIN_REPLY_WINDOW_MS) continue;
    if (at.getTime() > latest) break;
    choices.push(at);
  }
  return choices;
}

export function sameConfig(a: BuilderConfig, b: BuilderConfig): boolean {
  return (
    a.format === b.format &&
    a.showCost === b.showCost &&
    a.personal === b.personal &&
    a.replyBy === b.replyBy
  );
}

/** The proposal id a create command answered with. */
export function proposalIdOf(result: unknown): string | null {
  const id = (result as { proposal_id?: unknown } | null)?.proposal_id;
  return typeof id === 'string' ? id : null;
}

/** The builder's choices as the create command takes them. */
export function toWire(config: BuilderConfig) {
  return {
    format: config.format,
    show_cost: config.showCost,
    personal: config.personal,
    ...(config.replyBy === null ? {} : { reply_by: config.replyBy }),
    options: [],
  };
}
