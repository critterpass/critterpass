import { describe, expect, it } from 'vitest';

import {
  CHANNEL_NAMESPACES,
  channelName,
  crewChannel,
  crewChannels,
  tripChannel,
  userChannel,
} from '../src/channel-names';

describe('channelName', () => {
  it('reserves # for the user-limited channel', () => {
    expect(channelName('user', 'abc-123')).toBe('user:#abc-123');
  });

  it('uses a plain colon for every other namespace', () => {
    expect(channelName('crew', 'crew-1')).toBe('crew:crew-1');
    expect(channelName('trip_presence', 'trip-1')).toBe('trip_presence:trip-1');
  });
});

describe('convenience builders', () => {
  it('match channelName for the same namespace', () => {
    expect(userChannel('uid-1')).toBe(channelName('user', 'uid-1'));
    expect(crewChannel('crew-1')).toBe(channelName('crew', 'crew-1'));
    expect(tripChannel('trip-1')).toBe(channelName('trip', 'trip-1'));
  });
});

describe('crewChannels', () => {
  it('lists every crew-scoped namespace for one crew', () => {
    expect(crewChannels('crew-1')).toEqual([
      'crew:crew-1',
      'crew_chat:crew-1',
      'crew_money:crew-1',
      'crew_bookings:crew-1',
      'crew_collection:crew-1',
    ]);
  });
});

describe('CHANNEL_NAMESPACES', () => {
  it('matches the documented realtime channel catalogue exactly', () => {
    expect([...CHANNEL_NAMESPACES].sort()).toEqual(
      [
        'user',
        'crew',
        'crew_chat',
        'crew_money',
        'crew_bookings',
        'crew_collection',
        'trip',
        'trip_setup',
        'trip_draft',
        'trip_plan',
        'trip_dayof',
        'trip_watch',
        'trip_quests',
        'trip_album',
        'trip_copresence',
        'trip_presence',
        'trip_locations',
        'poll',
        'swipe',
        'proposal',
        'guide_thread',
        'disruption',
        'sos',
        'recap',
        'memory',
      ].sort(),
    );
  });
});
