import { describe, expect, it } from 'vitest';

import { DOMAIN_EVENT_TYPES, type DomainEventType } from '../../src/events/catalogue';
import { projectActivity } from '../../src/events/activity-rules';

/**
 * Events with no business belonging in a crew/trip activity ticker (activity-rules.ts's own
 * docstring: "private events stay out of the crew-visible ticker"). `auth.merged` describes an
 * identity operation on one account, not something any crew member should see in a shared feed.
 * `invite.opened` and `attribution.claimed` are funnel signals about a link or a device, not crew
 * activity. `fare.dropped`, `forecast.changed` and `hazard.changed` are system signals that the tip
 * strip and the watch job turn into their own surfaces; nobody in the crew did them.
 * `moderation.decided` is an ops verdict consumed by the reported content's owner; support
 * entitlement grants concern one account. A device's permission mirror and a POI visit are private
 * to their owner (visits are owner-only by design).
 */
const PRIVATE_EVENT_TYPES: ReadonlySet<DomainEventType> = new Set([
  'auth.merged',
  'invite.opened',
  'attribution.claimed',
  'fare.dropped',
  'forecast.changed',
  'hazard.changed',
  'moderation.decided',
  'entitlement.granted',
  'entitlement.revoked',
  'device.permissions_changed',
  'visit.recorded',
]);

function publicEventTypes(): readonly DomainEventType[] {
  return DOMAIN_EVENT_TYPES.filter((type) => !PRIVATE_EVENT_TYPES.has(type));
}

describe('projectActivity', () => {
  it('projects every public event (crew/trip visible)', () => {
    for (const type of publicEventTypes()) {
      expect(projectActivity(type)).not.toBeNull();
    }
  });

  it('never projects a private event', () => {
    for (const type of PRIVATE_EVENT_TYPES) {
      expect(projectActivity(type)).toBeNull();
    }
  });

  it('gives trip.status_changed the documented verb, object kind and i18n key', () => {
    expect(projectActivity('trip.status_changed')).toEqual({
      verb: 'moved',
      objectKind: 'trip',
      textKey: 'activity.trip_status_changed',
    });
  });

  it('every text key follows the activity.<verb-ish> convention', () => {
    for (const type of publicEventTypes()) {
      const projection = projectActivity(type);
      expect(projection?.textKey.startsWith('activity.')).toBe(true);
    }
  });
});
