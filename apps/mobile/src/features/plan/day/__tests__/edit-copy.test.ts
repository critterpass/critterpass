/**
 * What the toast after a plan edit says changed: an add names the day and time it landed on, a
 * remove the day it left, a move across days where it went, a new time its range and how many
 * other stops moved with it, and a reorder how many stops were re-timed.
 */
import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import type { PlanOp, PlanState } from '@cp/domain';

import { instantOnDay } from '@/data/plan/plan-model';

import { describeEdit, type EditContext } from '../edit-copy';

const TZ = 'Asia/Makassar';
const TEMPLE = '0192f000-0000-7000-8000-0000000000e1';
const LUNCH = '0192f000-0000-7000-8000-0000000000e2';
const NEW = '0192f000-0000-7000-8000-0000000000e9';
const at = (date: string, time: string) =>
  instantOnDay(date, Number(time.slice(0, 2)) * 60 + Number(time.slice(3)), TZ);

const state: PlanState = {
  days: [
    { day_no: 1, date: '2026-10-19', theme: null },
    { day_no: 2, date: '2026-10-20', theme: null },
  ],
  items: [
    {
      stable_id: TEMPLE,
      day_no: 1,
      tz: TZ,
      starts_at: at('2026-10-19', '08:00'),
      ends_at: at('2026-10-19', '09:30'),
    },
    {
      stable_id: LUNCH,
      day_no: 1,
      tz: TZ,
      starts_at: at('2026-10-19', '10:00'),
      ends_at: at('2026-10-19', '11:00'),
    },
  ],
};

const ctx: EditContext = {
  state,
  titleOf: (id) => (id === TEMPLE ? 'Tirta Empul' : id === LUNCH ? 'Bu Nik' : null),
  dayName: (dayNo) => (dayNo === 1 ? 'Mon, Oct 19' : 'Tue, Oct 20'),
  tz: TZ,
  locale: 'en-GB',
};

const retimeOp = (item: string, start: string, end: string): PlanOp => ({
  op: 'move',
  item,
  new: { starts_at: at('2026-10-19', start), ends_at: at('2026-10-19', end) },
});

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('what a plan edit changed', () => {
  it('names where and when an added place landed', () => {
    const add: PlanOp = {
      op: 'add',
      item: NEW,
      new: { day_no: 2, tz: TZ, starts_at: at('2026-10-20', '16:30') },
    };
    expect(describeEdit([add], { ...ctx, label: 'Tanah Lot' })).toEqual({
      title: 'Tanah Lot',
      subtitle: 'Added to Tue, Oct 20 · 16:30',
    });
    expect(describeEdit([add, { ...add, item: LUNCH }], ctx).title).toBe('2 places added');
  });

  it('names the day a removed stop left', () => {
    expect(describeEdit([{ op: 'remove', item: LUNCH }], ctx)).toEqual({
      title: 'Bu Nik',
      subtitle: 'Removed from Mon, Oct 19',
    });
  });

  it('names the day a stop moved to, and counts the stops that moved for it', () => {
    const move: PlanOp = {
      op: 'move',
      item: TEMPLE,
      new: { day_no: 2, starts_at: at('2026-10-20', '13:00'), ends_at: at('2026-10-20', '14:30') },
    };
    expect(describeEdit([move], ctx)).toEqual({
      title: 'Tirta Empul',
      subtitle: 'Moved to Tue, Oct 20 · 13:00',
    });
    expect(describeEdit([move, retimeOp(LUNCH, '10:30', '11:30')], ctx).subtitle).toBe(
      'Moved to Tue, Oct 20 · 13:00 · 1 other stop moved',
    );
  });

  it('gives a new time as its range, with the later stops it pushed', () => {
    const resize: PlanOp = {
      op: 'resize',
      item: TEMPLE,
      new: { starts_at: at('2026-10-19', '12:00'), ends_at: at('2026-10-19', '13:30') },
    };
    expect(describeEdit([resize, retimeOp(LUNCH, '14:00', '15:00')], ctx)).toEqual({
      title: 'Tirta Empul',
      subtitle: 'Now 12:00–13:30 · 1 other stop moved',
    });
  });

  it('calls a drag a new order for the day, and a day swap by its own name', () => {
    const drag = [retimeOp(TEMPLE, '10:00', '11:30'), retimeOp(LUNCH, '08:00', '09:00')];
    expect(describeEdit(drag, ctx)).toEqual({
      title: 'New order for Mon, Oct 19',
      subtitle: '2 stops have new times',
    });
    expect(describeEdit([{ op: 'reorder_days', new: { order: [2, 1] } }], ctx)).toEqual({
      title: 'Days reordered',
    });
  });
});
