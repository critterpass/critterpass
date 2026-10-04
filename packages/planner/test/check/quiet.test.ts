import { describe, expect, it } from 'vitest';

import { aroundOf, splitQuiet, type QuietDay, type QuietMark } from '../../src/check/quiet';

const at = (hour: number) => new Date(Date.UTC(2026, 9, 17, hour));
const day = (dayNo: number, ...stops: [string, number][]): QuietDay => ({
  dayNo,
  items: stops.map(([stableId, hour]) => ({ stableId, startsAt: at(hour) })),
});
const issue = (kind: string, ...stableIds: string[]) => ({
  kind,
  stableIds,
  dayNo: 1,
  bookingId: null,
});
const same = <T>(value: T): T => value;

describe('quiet plan check issues', () => {
  const plan = [day(1, ['market', 8], ['temple', 10], ['falls', 13], ['dinner', 19])];
  const issues = [issue('too_far', 'falls'), issue('crowds', 'temple')];
  const mark: QuietMark = { ...issue('too_far', 'falls'), around: null };

  it('leaves a kept issue out and remembers the stops around it', () => {
    const split = splitQuiet(issues, same, [mark], plan);
    expect(split.live).toEqual([issue('crowds', 'temple')]);
    expect(split.marks).toEqual([{ ...mark, around: '1:temple>falls>dinner' }]);
  });

  it('stays quiet while its neighbours stay, whatever else on the day moves', () => {
    const held = splitQuiet(issues, same, [mark], plan).marks;
    const later = [day(1, ['temple', 10], ['falls', 14], ['dinner', 20], ['market', 7])];
    expect(splitQuiet(issues, same, held, later).live).toEqual([issue('crowds', 'temple')]);
  });

  it('comes back when a stop next to it changes, and the mark is dropped', () => {
    const held = splitQuiet(issues, same, [mark], plan).marks;
    const swapped = [day(1, ['market', 8], ['temple', 10], ['falls', 13], ['bar', 19])];
    const split = splitQuiet(issues, same, held, swapped);
    expect(split.live).toEqual(issues);
    expect(split.marks).toEqual([]);
  });

  it('drops a mark whose stop left the plan, or moved next to other stops on another day', () => {
    const held = splitQuiet(issues, same, [mark], plan).marks;
    const gone = [day(1, ['market', 8], ['temple', 10], ['dinner', 19])];
    expect(splitQuiet([], same, held, gone).marks).toEqual([]);
    const moved = [day(1, ['temple', 10], ['dinner', 19]), day(2, ['falls', 13])];
    expect(splitQuiet(issues, same, held, moved).marks).toEqual([]);
  });

  it('keeps quiet only the same problem on the same stop', () => {
    const split = splitQuiet(
      [issue('rain', 'falls'), issue('too_far', 'temple')],
      same,
      [mark],
      plan,
    );
    expect(split.live).toHaveLength(2);
  });

  it('reads an issue about a whole day by the order of that day', () => {
    const pace = { kind: 'pace', stableIds: [], dayNo: 1, bookingId: null };
    expect(aroundOf(pace, plan)).toBe('1:market>temple>falls>dinner');
    const held = splitQuiet([pace], same, [{ ...pace, around: null }], plan);
    expect(held.live).toEqual([]);
    const fewer = [day(1, ['market', 8], ['temple', 10], ['dinner', 19])];
    expect(splitQuiet([pace], same, held.marks, fewer).live).toEqual([pace]);
    expect(aroundOf({ ...pace, dayNo: 4 }, plan)).toBeNull();
  });
});
