/**
 * Versioned quote sets: every price the app shows is one of these components, and every share,
 * band, delta and guide sentence is derived from a set by this package — one price truth.
 */
import { DomainError } from '@cp/domain';

import { type CurrencyCode } from '../money/currencies';
import { quoteSetVersion } from './version-hash';

export const COST_COMPONENT_KINDS = [
  'flight',
  'stay',
  'activity',
  'transfer',
  'food',
  'fun',
] as const;
export type CostComponentKind = (typeof COST_COMPONENT_KINDS)[number];

/**
 * `person`: `amountMinor` is charged to each member it applies to. `room`: `amountMinor` is the
 * room's price, split between its occupants (`memberIds`). `group`: `amountMinor` is one total
 * split across every member it applies to.
 */
export const COST_UNITS = ['person', 'room', 'group'] as const;
export type CostUnit = (typeof COST_UNITS)[number];

export const COST_SOURCES = [
  'travelpayouts',
  'viator',
  'user',
  'estimate',
  'editorial',
  'booking',
] as const;
export type CostSource = (typeof COST_SOURCES)[number];

/** A quote older than this is flagged stale (shown with its age), never silently dropped. */
export const QUOTE_STALE_AFTER_HOURS = 72;

export interface CostComponent {
  readonly id: string;
  readonly kind: CostComponentKind;
  readonly unit: CostUnit;
  /** `null` = no price known yet (a missing fare): shares that include it are ranges ("~"). */
  readonly amountMinor: bigint | null;
  readonly currency: CurrencyCode;
  readonly source: CostSource;
  /** ISO instant the price was last seen at its source. */
  readonly seenAt: string;
  /** ISO instant the price was pinned for a poll or proposal; absent while it may still move. */
  readonly frozenAt?: string;
  /** Flights: the airport this price is for; applies to members flying from it. */
  readonly origin?: string;
  /** Restricts the component to these members (room occupants, a personal item, an opt-in). */
  readonly memberIds?: readonly string[];
  /** Flights: door-to-door minutes, for "7H FROM SIN" labels. */
  readonly durationMin?: number;
  readonly label?: string;
  /** The `price_quotes` row this came from, when it came from one. */
  readonly quoteId?: string;
}

export interface QuoteSet {
  readonly version: string;
  readonly components: readonly CostComponent[];
  readonly frozenAt?: string;
}

function assertComponent(component: CostComponent): void {
  if (component.amountMinor !== null && component.amountMinor < 0n) {
    throw new DomainError('VALIDATION', { reason: 'negative_component', id: component.id });
  }
  if (component.unit === 'room' && (component.memberIds?.length ?? 0) === 0) {
    throw new DomainError('VALIDATION', { reason: 'room_without_occupants', id: component.id });
  }
  if (component.kind === 'flight' && component.origin === undefined && !component.memberIds) {
    throw new DomainError('VALIDATION', { reason: 'flight_without_origin', id: component.id });
  }
}

/** Builds a set and its content version; component ids must be unique. */
export function createQuoteSet(components: readonly CostComponent[]): QuoteSet {
  const ids = new Set<string>();
  for (const component of components) {
    if (ids.has(component.id)) {
      throw new DomainError('VALIDATION', { reason: 'duplicate_component', id: component.id });
    }
    ids.add(component.id);
    assertComponent(component);
  }
  return { version: quoteSetVersion(components), components: [...components] };
}

/** True when the component's price was seen more than 72 h before `now`. */
export function isStaleComponent(component: CostComponent, now: Date): boolean {
  const seenMs = Date.parse(component.seenAt);
  return now.getTime() - seenMs > QUOTE_STALE_AFTER_HOURS * 60 * 60 * 1000;
}
