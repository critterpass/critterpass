import { PLAN_CHANGE_CHAT_LINE } from '@cp/domain';
import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import { systemLine } from '../system-line';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('a system line in the crew chat', () => {
  it('names the member by first name, and still says something when the member is unknown', () => {
    expect(systemLine('member_joined', 'Leo Tran', '')).toBe('Leo joined the crew');
    expect(systemLine('member_joined', null, '')).toBe('Someone joined the crew');
    expect(systemLine('member_left', undefined, '')).toBe('Someone left the crew');
  });

  it('says the trip locked by itself when nobody locked it, and names who did otherwise', () => {
    expect(systemLine('trip_locked', null, '')).toBe('The trip is locked in');
    expect(systemLine('trip_locked', 'Maya', '')).toBe('Maya locked the trip in');
  });

  it('names what the crew added to the plan, and only says it changed when the line names nothing', () => {
    expect(systemLine(PLAN_CHANGE_CHAT_LINE.added, null, 'Bà Nà Hills')).toBe(
      'The crew said yes: Bà Nà Hills is in the plan',
    );
    const changed = 'The crew said yes. The plan changed.';
    expect(systemLine(PLAN_CHANGE_CHAT_LINE.added, null, '')).toBe(changed);
    expect(systemLine(PLAN_CHANGE_CHAT_LINE.changed, null, '  ')).toBe(changed);
  });
});
