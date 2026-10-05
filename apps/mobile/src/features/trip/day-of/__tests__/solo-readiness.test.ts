/** A trip of one reads her own state on the leave-by hero, never a count of a crew. */
import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import type { LeaveByView } from '../../leave-by/model';
import { heroCopy } from '../day-of-copy';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

const AT = new Date('2026-10-05T23:45:00Z');
const person = (id: string, up: boolean, me = false) => ({ id, name: id, joinIndex: 0, up, me });

function view(crew: ReturnType<typeof person>[]): LeaveByView {
  const sleepers = crew.filter((p) => !p.up);
  return {
    id: 'l1',
    tripId: 't1',
    title: 'Mì Quảng',
    placeName: 'Mì Quảng',
    localDate: '2026-10-06',
    tz: 'Asia/Ho_Chi_Minh',
    startsAt: new Date('2026-10-06T00:00:00Z'),
    leaveAt: AT,
    deadline: { kind: 'leave_by', at: AT },
    alarmAt: new Date('2026-10-05T23:35:00Z'),
    pickup: null,
    guideNote: null,
    withoutTraffic: false,
    phase: 'before',
    ringFraction: 0.5,
    crew,
    upCount: crew.length - sleepers.length,
    allUp: crew.length > 0 && sleepers.length === 0,
    sleepers,
    viewerIn: true,
    viewerUp: crew.find((p) => p.me)?.up ?? false,
    viewerSnoozes: 0,
    knocked: false,
  } as unknown as LeaveByView;
}

const now = new Date('2026-10-05T22:00:00Z');

describe('the readiness line', () => {
  it('reads her own state on a trip of one', () => {
    expect(heroCopy(view([person('me', false, true)]), now, 'Tokek', 'en').readinessLabel).toBe(
      'Not up yet',
    );
    const up = heroCopy(view([person('me', true, true)]), now, 'Tokek', 'en');
    expect(up.readinessLabel).toBe("You're up");
    expect(up.readinessDetail).not.toMatch(/everyone/iu);
  });

  it('counts the crew when there is one', () => {
    const crew = [person('me', true, true), person('rin', false)];
    expect(heroCopy(view(crew), now, 'Tokek', 'en').readinessLabel).toBe('1 of 2 are up');
  });
});
