import { describe, expect, it } from 'vitest';

import { parseDomainEvent } from '../../src/events/envelope';

describe('parseDomainEvent', () => {
  it('accepts a well-formed event whose payload matches its type', () => {
    const tripId = crypto.randomUUID();
    const crewId = crypto.randomUUID();
    const parsed = parseDomainEvent({
      type: 'trip.created',
      aggregateKind: 'trip',
      aggregateId: tripId,
      actorKind: 'user',
      actorId: crypto.randomUUID(),
      payload: { trip_id: tripId, crew_id: crewId },
      crewId,
      tripId,
    });
    expect(parsed.type).toBe('trip.created');
  });

  it('allows a null actorId for a system-caused event', () => {
    expect(() =>
      parseDomainEvent({
        type: 'trip.status_changed',
        aggregateKind: 'trip',
        aggregateId: crypto.randomUUID(),
        actorKind: 'system',
        actorId: null,
        payload: { trip_id: crypto.randomUUID(), from: 'voting', to: 'won' },
      }),
    ).not.toThrow();
  });

  it('rejects a payload that does not match the declared type', () => {
    expect(() =>
      parseDomainEvent({
        type: 'trip.created',
        aggregateKind: 'trip',
        aggregateId: crypto.randomUUID(),
        actorKind: 'user',
        actorId: crypto.randomUUID(),
        // missing crew_id, required by trip.created's schema
        payload: { trip_id: crypto.randomUUID() },
      }),
    ).toThrow();
  });

  it('rejects an unknown event type', () => {
    expect(() =>
      parseDomainEvent({
        // @ts-expect-error deliberately outside the catalogue
        type: 'not.a_real_event',
        aggregateKind: 'trip',
        aggregateId: crypto.randomUUID(),
        actorKind: 'user',
        actorId: crypto.randomUUID(),
        payload: {},
      }),
    ).toThrow();
  });
});
