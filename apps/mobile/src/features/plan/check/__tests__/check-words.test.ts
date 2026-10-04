/**
 * The check's words say the reason and never leave a hole: a clash gives the drive and the time
 * the plan leaves for it (or the overlap), the line under a card drops a time it cannot give
 * instead of printing "at ,", an estimate is called one, the button names the kind of fix, and a
 * fixer's reason code is never shown as it is.
 */
import { beforeAll, describe, expect, it } from '@jest/globals';
import type { PlanCheckIssue } from '@cp/domain';
import { i18n } from '@lingui/core';

import { fixKindLabel, fixReasonWords, fixSummary } from '../fix-copy';
import { clashWords, type IssueContext } from '../issue-copy';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAY = id(2);

const ctx = (clock: (instant: string) => string): IssueContext => ({
  name: (stableId) => (stableId === id(20) ? 'Sate Babi' : 'Lokal Bar'),
  startOf: () => null,
  endOf: () => null,
  dayDate: () => '2026-10-20',
  bookingTitle: () => null,
  month: () => 'October',
  shortDate: () => '20 Oct',
  weekday: () => 'Tue',
  clock,
});

const issue = (fix: PlanCheckIssue['fix']): PlanCheckIssue => ({
  id: id(10),
  trip_id: id(1),
  version_id: id(3),
  kind: 'clash',
  params: { first: id(20), second: id(21), short_minutes: 2 },
  severity: 'fix',
  day_id: DAY,
  stable_ids: [id(20), id(21)],
  fix,
  rank: 0,
  fingerprint: 'clash:1',
});

const retime = (before: string, after: string): PlanCheckIssue['fix'] => ({
  kind: 'apply',
  ops: [
    {
      op: 'retime',
      target: id(21),
      before: { starts_at: before },
      after: { starts_at: after },
      reason: 'check_fix_clash',
      affected_user_ids: [],
      booking_impact: false,
    },
  ],
});

describe('a clash in words', () => {
  it('gives the drive and the time the plan leaves for it', () => {
    const words = clashWords('Sate Babi', 'Lokal Bar', '16:15', '17:00', 2);
    expect(words.title).toBe('Tight: Sate Babi → Lokal Bar');
    expect(words.body).toBe(
      '47 min drive, 45 min free. Sate Babi ends at 16:15, Lokal Bar starts at 17:00.',
    );
  });

  it('says by how much two stops overlap, and when there is no time at all between them', () => {
    expect(clashWords('A', 'B', '17:30', '17:00', 30).body).toContain('overlap by 30 min');
    expect(clashWords('A', 'B', '17:00', '17:00', 17).body).toContain(
      '17 min drive and no time between them',
    );
  });

  it('says only that time is short when a stop’s times are gone', () => {
    const words = clashWords('A', 'B', null, '17:00', 10);
    expect(words.body).not.toMatch(/ at [,.]| at $/u);
    expect(words.body).toContain('A');
  });
});

describe('what a fix does, in words', () => {
  it('names the new time and the old one, and never prints a blank time', () => {
    const fix = retime('2026-10-20T09:00:00Z', '2026-10-20T10:30:00Z');
    const clock = (instant: string) => instant.slice(11, 16);
    expect(fixSummary(issue(fix), ctx(clock), {})).toBe('Lokal Bar at 10:30 (was 09:00)');
    expect(
      fixSummary(
        issue(fix),
        ctx(() => ''),
        {},
      ),
    ).toBe('Move it to a time that works');
    const reorder = issue({ kind: 'screen', screen: 'less_driving' });
    const blank = fixSummary(
      reorder,
      ctx(() => ''),
      {
        savedMin: 71,
        movedTo: { stableId: id(21), time: '' },
      },
    );
    expect(blank).toBe('Same day, 1h11 less driving');
  });

  it('calls an order timed on estimates an estimate', () => {
    const reorder = issue({ kind: 'screen', screen: 'less_driving' });
    const line = fixSummary(
      reorder,
      ctx(() => '10:00'),
      {
        savedMin: 20,
        estimated: true,
        movedTo: { stableId: id(21), time: '10:00' },
      },
    );
    expect(line).toBe('Same day, about 20 min less driving');
  });

  it('labels the button by the kind of fix, and a member always suggests', () => {
    const labels = [
      retime('2026-10-20T09:00:00Z', '2026-10-20T10:30:00Z'),
      { kind: 'screen', screen: 'less_driving' } as const,
      { kind: 'screen', screen: 'rain_crowds' } as const,
      { kind: 'screen', screen: 'too_far' } as const,
    ].map((fix) => fixKindLabel({ fix }, true));
    expect(new Set(labels).size).toBe(4);
    expect(fixKindLabel({ fix: { kind: 'screen', screen: 'rain_crowds' } }, false)).toBe('Suggest');
  });

  it('turns every fixer reason code into words and leaves other reasons alone', () => {
    for (const code of [
      'check_fix_clash',
      'check_fix_reorder',
      'check_fix_closed',
      'check_fix_too_far',
      'check_fix_dry_after',
      'check_fix_quiet_before',
      'check_fix_indoors_in_rain',
      'check_fix_trades_places',
      'check_fix_something_new',
    ]) {
      const words = fixReasonWords(code);
      expect(words).not.toBeNull();
      expect(words).not.toContain('check_fix');
    }
    expect(fixReasonWords('before the crowds')).toBeNull();
  });
});
