/**
 * `registerNotification` (docs/api-contracts-async.md §2.2): how a feature maps one of its domain
 * events to a catalogue key. The feature supplies who receives it (`audience`), what each recipient
 * sees (`compose`, with Lingui message descriptors so the router renders it in their locale) and,
 * optionally, the dedupe key; the router owns class, budget, quiet hours, roundup and delivery.
 *
 * The guide-voice rewrite is a separate, optional hook (the AI layer plugs a rewriter in); without
 * one, the template copy is sent as is.
 */
import { createHash } from 'node:crypto';

import type { ClassContext, NotificationKey, SenderKind } from '@cp/domain';
import type pg from 'pg';

import type { Copy, CopyVars } from '../../push/render';

export interface NotificationSender {
  readonly kind: SenderKind;
  /** Guide slug, member uid, or `critterpass` for system notices. */
  readonly id: string;
  readonly name: string;
  /** App Group / asset path of the avatar (`avatars/guide-tokek@3x.png`), when there is one. */
  readonly avatar?: string;
}

export interface RoutedEvent {
  readonly id: string;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly crewId: string | null;
  readonly tripId: string | null;
  readonly actorId: string | null;
  readonly occurredAt: Date;
}

export interface ComposedNotification {
  readonly title: Copy;
  readonly body: Copy;
  readonly vars?: CopyVars;
  readonly sender: NotificationSender;
  readonly crewId?: string | null;
  readonly tripId?: string | null;
  readonly deepLink?: string;
  readonly threadId?: string;
  /** Small, non-sensitive context for the `cp` block (poll options, ids). */
  readonly ctx?: Readonly<Record<string, unknown>>;
  readonly needsYou?: boolean;
  readonly classContext?: ClassContext;
  /** Variables for the catalogue's collapse template. */
  readonly collapseVars?: Readonly<Record<string, string | number>>;
  /** Overrides the catalogue TTL. */
  readonly expiresAt?: Date;
}

export interface NotificationRegistration {
  readonly key: NotificationKey;
  /** The domain event type that triggers it. */
  readonly event: string;
  readonly audience: (tx: pg.PoolClient, event: RoutedEvent) => Promise<readonly string[]>;
  /** `null` skips this recipient (nothing left to say by the time the job runs). */
  readonly compose: (
    tx: pg.PoolClient,
    event: RoutedEvent,
    uid: string,
  ) => Promise<ComposedNotification | null>;
  /** Defaults to `<key>:<event id>`: one delivery per recipient per event. */
  readonly dedupeKey?: (event: RoutedEvent, uid: string) => string;
}

const registrations = new Map<string, NotificationRegistration>();

const registrationId = (event: string, key: string): string => `${event}→${key}`;

export function registerNotification(registration: NotificationRegistration): void {
  const id = registrationId(registration.event, registration.key);
  if (registrations.has(id)) {
    throw new Error(
      `notification ${registration.key} is already registered for ${registration.event}`,
    );
  }
  registrations.set(id, registration);
}

export function registrationsForEvent(type: string): readonly NotificationRegistration[] {
  return [...registrations.values()].filter((registration) => registration.event === type);
}

export function getRegistration(event: string, key: string): NotificationRegistration | undefined {
  return registrations.get(registrationId(event, key));
}

/** Test-only: forgets every registration. */
export function resetNotificationRegistrationsForTests(): void {
  registrations.clear();
}

export function dedupeKeyFor(
  registration: NotificationRegistration,
  event: RoutedEvent,
  uid: string,
): string {
  return registration.dedupeKey?.(event, uid) ?? `${registration.key}:${event.id}`;
}

export interface RewriteInput {
  readonly key: string;
  readonly templateId: string;
  readonly locale: string;
  readonly guideId: string;
  readonly vars: CopyVars;
  /** The rendered template body. */
  readonly text: string;
}

export type NotificationRewriter = (input: RewriteInput) => Promise<string>;

const REWRITE_CACHE_LIMIT = 1000;

/**
 * Wraps a rewriter with a cache keyed by (key, template, locale, guide, vars hash): the same
 * notification for many recipients is rewritten once. A failing rewrite falls back to the template.
 */
export function cachedRewriter(rewriter: NotificationRewriter): NotificationRewriter {
  const cache = new Map<string, string>();
  return async (input) => {
    const varsHash = createHash('sha256').update(JSON.stringify(input.vars)).digest('hex');
    const cacheKey = [input.key, input.templateId, input.locale, input.guideId, varsHash].join('|');
    const hit = cache.get(cacheKey);
    if (hit !== undefined) return hit;
    let text: string;
    try {
      text = await rewriter(input);
    } catch {
      return input.text;
    }
    if (cache.size >= REWRITE_CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(cacheKey, text);
    return text;
  };
}
