import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { LA_SWIFT_TYPES } from '../live-activities';
import { renderLaSwift } from './la-swift';

describe('renderLaSwift', () => {
  const swift = renderLaSwift(LA_SWIFT_TYPES, '// header');

  it('declares every server-driven activity as ActivityAttributes with a ContentState', () => {
    for (const name of [
      'LeaveByActivityAttributes',
      'MeetUpActivityAttributes',
      'FlightActivityAttributes',
      'VoteActivityAttributes',
      'CritterNearbyActivityAttributes',
      'StormActivityAttributes',
      'SOSActivityAttributes',
      'RideActivityAttributes',
    ]) {
      expect(swift).toContain(`public struct ${name}: ActivityAttributes, Hashable, Sendable {`);
    }
    expect(swift.match(/public struct ContentState: Codable, Hashable, Sendable/g)).toHaveLength(8);
    expect(swift).not.toContain('AlarmAttributes');
  });

  it('keeps wire names in CodingKeys and names nested types per kind', () => {
    expect(swift).toContain('        public var leaveAt: Int');
    expect(swift).toContain('            case leaveAt = "leave_at"');
    expect(swift).toContain('        public var pips: [LALeaveByPip]');
    expect(swift).toContain('public enum LALeaveByState: String, Codable, Hashable, Sendable {');
    expect(swift).toContain('    public var legs: [String]');
    expect(swift).toContain('        public var pickup: LAFlightPickup?');
  });

  it('escapes Swift keywords used as enum values', () => {
    expect(swift).toContain('    case `default` = "default"');
  });

  it('refuses a zod type it cannot map', () => {
    const odd = {
      name: 'X',
      prefix: 'LAX',
      attributes: z.object({}),
      contentState: z.object({ at: z.date() }),
    };
    expect(() => renderLaSwift([odd], '')).toThrow(/unsupported zod type "date"/);
  });
});
