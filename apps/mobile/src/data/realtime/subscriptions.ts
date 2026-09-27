/**
 * Ref-counted channel subscriptions over one centrifuge-js client (docs/api-contracts-async.md
 * §1.1). Each channel has one Centrifugo subscription however many screens listen; it resumes from
 * the persisted `(offset, epoch)`, drops replays by envelope `id` (last 500 per channel), validates
 * `data` by envelope `type`, and reports a lossy resubscribe (`recovered: false` or a new epoch) so
 * the caller reconciles from the sync layer instead of trusting a gap.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI realtime data layer: channel namespaces,
   event types and symbol descriptions, never rendered copy. */
import {
  channelName,
  rtEnvelopeSchema,
  rtUserPayloadSchema,
  type ChannelNamespace,
  type RtEnvelope,
} from '@cp/domain';
import type {
  Centrifuge,
  ClientInfo,
  JoinContext,
  LeaveContext,
  PublicationContext,
  SubscribedContext,
  Subscription,
} from 'centrifuge';

import type { RecoveryStore } from './recovery-store';

export const DEDUPE_WINDOW = 500;

/** Remembers the most recent `capacity` ids; `seen` records the id and says if it was known. */
export class RecentIds {
  private readonly ids = new Set<string>();

  constructor(private readonly capacity: number = DEDUPE_WINDOW) {}

  seen(id: string): boolean {
    if (this.ids.has(id)) {
      this.ids.delete(id);
      this.ids.add(id);
      return true;
    }
    this.ids.add(id);
    if (this.ids.size > this.capacity) {
      const oldest = this.ids.values().next().value;
      if (oldest !== undefined) this.ids.delete(oldest);
    }
    return false;
  }

  get size(): number {
    return this.ids.size;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

const isUid = (value: unknown): boolean => typeof value === 'string' && value.length > 0;

/**
 * Client publications arrive re-enveloped by the api's publish proxy with the publisher's verified
 * uid added to `data` (services/api/src/realtime/publish-rules.ts).
 */
const CLIENT_EVENT_CHECKS: Readonly<Record<string, (data: Record<string, unknown>) => boolean>> = {
  typing: (data) => hasExactly(data, ['uid']) && isUid(data.uid),
  cursor: (data) =>
    hasExactly(data, ['uid', 'anchor']) &&
    isUid(data.uid) &&
    (data.anchor === null || typeof data.anchor === 'string'),
  here: (data) =>
    hasExactly(data, ['uid', 'screen', 'day']) &&
    isUid(data.uid) &&
    typeof data.screen === 'string' &&
    (data.day === null || Number.isInteger(data.day)),
};

const INVALID = Symbol('invalid payload');

/**
 * Validates `data` by envelope `type`: the owner channel's schemas from @cp/domain, the client
 * event shapes everywhere else. Types without a registered shape pass through unchanged; a
 * mismatch returns `INVALID`.
 */
export function checkPayload(namespace: string, type: string, data: unknown): unknown {
  if (namespace === 'user') {
    const schema = rtUserPayloadSchema(type);
    if (schema === undefined) return data;
    const parsed = schema.safeParse(data);
    return parsed.success ? parsed.data : INVALID;
  }
  if (!Object.hasOwn(CLIENT_EVENT_CHECKS, type)) return data;
  return isRecord(data) && CLIENT_EVENT_CHECKS[type]?.(data) === true ? data : INVALID;
}

/** Envelope shape plus the type's payload check; `null` for anything a listener must not see. */
export function parsePublication(namespace: string, data: unknown): RtEnvelope | null {
  const envelope = rtEnvelopeSchema.safeParse(data);
  if (!envelope.success) return null;
  const payload = checkPayload(namespace, envelope.data.type, envelope.data.data);
  return payload === INVALID ? null : { ...envelope.data, data: payload };
}

export interface ChannelHandlers {
  readonly onEvent?: (envelope: RtEnvelope) => void;
  /** Missed messages could not be replayed: re-read this scope from the sync layer. */
  readonly onChannelReset?: () => void;
  readonly onJoin?: (info: ClientInfo) => void;
  readonly onLeave?: (info: ClientInfo) => void;
  /** Every (re)subscribe, e.g. to refresh presence. */
  readonly onSubscribed?: () => void;
}

interface Entry {
  readonly subscription: Subscription;
  readonly namespace: ChannelNamespace;
  readonly recent: RecentIds;
  readonly listeners: Set<ChannelHandlers>;
}

export interface ChannelRegistry {
  /** Adds a listener, subscribing on the first one; the returned function releases it. */
  acquire(namespace: ChannelNamespace, id: string, handlers: ChannelHandlers): () => void;
  subscription(namespace: ChannelNamespace, id: string): Subscription | undefined;
  /** Channels with at least one listener. */
  activeChannels(): string[];
}

function each(listeners: Set<ChannelHandlers>, call: (handlers: ChannelHandlers) => void): void {
  for (const handlers of [...listeners]) call(handlers);
}

export function createChannelRegistry(
  centrifuge: Centrifuge,
  positions: RecoveryStore,
): ChannelRegistry {
  const entries = new Map<string, Entry>();

  function open(namespace: ChannelNamespace, channel: string): Entry {
    const since = positions.get(channel);
    const subscription = centrifuge.newSubscription(channel, since ? { since } : {});
    const entry: Entry = { subscription, namespace, recent: new RecentIds(), listeners: new Set() };

    subscription.on('subscribed', (ctx: SubscribedContext) => {
      const stored = positions.get(channel);
      const epochChanged =
        stored !== undefined &&
        ctx.streamPosition !== undefined &&
        ctx.streamPosition.epoch !== stored.epoch;
      if (ctx.streamPosition !== undefined) positions.set(channel, ctx.streamPosition);
      if ((ctx.wasRecovering && !ctx.recovered) || epochChanged) {
        each(entry.listeners, (handlers) => handlers.onChannelReset?.());
      }
      each(entry.listeners, (handlers) => handlers.onSubscribed?.());
    });
    subscription.on('publication', (ctx: PublicationContext) => {
      if (ctx.offset !== undefined) {
        const epoch = positions.get(channel)?.epoch ?? since?.epoch;
        if (epoch !== undefined) positions.set(channel, { offset: ctx.offset, epoch });
      }
      const envelope = parsePublication(namespace, ctx.data);
      if (envelope === null || entry.recent.seen(envelope.id)) return;
      each(entry.listeners, (handlers) => handlers.onEvent?.(envelope));
    });
    subscription.on('join', (ctx: JoinContext) =>
      each(entry.listeners, (handlers) => handlers.onJoin?.(ctx.info)),
    );
    subscription.on('leave', (ctx: LeaveContext) =>
      each(entry.listeners, (handlers) => handlers.onLeave?.(ctx.info)),
    );
    // Subscription errors (e.g. a denied proxy) are retried by centrifuge-js or end in an
    // `unsubscribed` event; unhandled, the emitter would throw.
    subscription.on('error', () => undefined);
    subscription.subscribe();
    return entry;
  }

  return {
    acquire(namespace, id, handlers) {
      const channel = channelName(namespace, id);
      let entry = entries.get(channel);
      if (entry === undefined) {
        entry = open(namespace, channel);
        entries.set(channel, entry);
      }
      entry.listeners.add(handlers);
      const held = entry;
      return () => {
        if (!held.listeners.delete(handlers) || held.listeners.size > 0) return;
        if (entries.get(channel) !== held) return;
        entries.delete(channel);
        held.subscription.unsubscribe();
        held.subscription.removeAllListeners();
        centrifuge.removeSubscription(held.subscription);
      };
    },
    subscription: (namespace, id) => entries.get(channelName(namespace, id))?.subscription,
    activeChannels: () => [...entries.keys()],
  };
}
