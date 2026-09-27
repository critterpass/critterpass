import { describe, expect, it } from 'vitest';

import { DOMAIN_EVENT_TYPES } from '../../src/events/catalogue';
import { projectActivity } from '../../src/events/activity-rules';

describe('projectActivity', () => {
  it('projects every currently-catalogued event (all are crew/trip visible, none private)', () => {
    for (const type of DOMAIN_EVENT_TYPES) {
      expect(projectActivity(type)).not.toBeNull();
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
    for (const type of DOMAIN_EVENT_TYPES) {
      const projection = projectActivity(type);
      expect(projection?.textKey.startsWith('activity.')).toBe(true);
    }
  });
});
