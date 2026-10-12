/**
 * The words of setup together (4.08, 4.09): the checklist rows and what each says under its title,
 * the member's own part, the draft strip and the footer. Counts are faces' worth only: who has
 * done their part, never what they entered.
 */
import { plural, t } from '@lingui/core/macro';

import type { ChecklistRow, ChecklistRowKey, MemberPartKey } from '../../data/checklist';

export function rowTitle(key: ChecklistRowKey): string {
  switch (key) {
    case 'dates':
      return t({ id: 'setup.premium.row.dates', message: 'Dates' });
    case 'free_days':
      return t({ id: 'setup.premium.row.freeDays', message: 'Free days' });
    case 'budget':
      return t({ id: 'setup.premium.row.budget', message: 'Budget' });
    case 'must_dos':
      return t({ id: 'setup.premium.row.mustDos', message: 'Must-dos' });
    case 'getting_there':
      return t({ id: 'setup.premium.row.gettingThere', message: 'Getting there' });
    case 'route':
      return t({ id: 'setup.premium.row.route', message: 'The route' });
    case 'rooms':
      return t({ id: 'setup.premium.row.rooms', message: 'Rooms' });
  }
}

export function rowLine(
  row: ChecklistRow,
  input: { readonly dates: string | null; readonly total: number; readonly stops: number },
): string {
  if (row.state === 'waiting') {
    return t({ id: 'setup.premium.line.waiting', message: 'Once the dates are locked' });
  }
  const done = row.done.length;
  const total = input.total;
  switch (row.key) {
    case 'dates':
      return (
        input.dates ?? t({ id: 'setup.premium.line.pickDates', message: 'When everyone can go' })
      );
    case 'free_days':
      return t({
        id: 'setup.premium.line.freeDays',
        message: `${done} of ${total} marked their days`,
      });
    case 'budget':
      return row.state === 'done'
        ? t({ id: 'setup.premium.line.budgetLocked', message: 'Sweet spot set' })
        : t({
            id: 'setup.premium.line.budget',
            message: `${done} of ${total} maxes in, all private`,
          });
    case 'must_dos':
      return t({ id: 'setup.premium.line.mustDos', message: `${done} of ${total} starred one` });
    case 'getting_there':
      return t({
        id: 'setup.premium.line.gettingThere',
        message: `${done} of ${total} picked a way`,
      });
    case 'route': {
      const stops = input.stops;
      return stops <= 1
        ? t({ id: 'setup.premium.line.oneStop', message: 'One stop so far' })
        : t({ id: 'setup.premium.line.stops', message: plural(stops, { other: '# stops' }) });
    }
    case 'rooms':
      return row.state === 'done'
        ? t({ id: 'setup.premium.line.roomsLocked', message: 'Everyone has a bed' })
        : t({ id: 'setup.premium.line.rooms', message: 'Who sleeps where' });
  }
}

export function partTitle(key: MemberPartKey): string {
  switch (key) {
    case 'max':
      return t({ id: 'setup.premium.part.max', message: 'Your max' });
    case 'must_do':
      return t({ id: 'setup.premium.part.mustDo', message: 'Star a must-do' });
    case 'free_days':
      return t({ id: 'setup.premium.part.freeDays', message: 'Your free days' });
    case 'getting_there':
      return t({ id: 'setup.premium.part.gettingThere', message: 'Getting there' });
  }
}

export function partLine(key: MemberPartKey, done: boolean, guideName: string): string {
  switch (key) {
    case 'max':
      return t({ id: 'setup.premium.partLine.max', message: 'Nobody sees it, not even the crew' });
    case 'must_do':
      return done
        ? t({ id: 'setup.premium.partLine.mustDoDone', message: 'Starred' })
        : t({ id: 'setup.premium.partLine.mustDo', message: `The one place ${guideName} fits in` });
    case 'free_days':
      return done
        ? t({ id: 'setup.premium.partLine.daysDone', message: 'Marked' })
        : t({ id: 'setup.premium.partLine.days', message: 'From your calendar or by hand' });
    case 'getting_there':
      return done
        ? t({ id: 'setup.premium.partLine.wayDone', message: 'Picked' })
        : t({ id: 'setup.premium.partLine.way', message: 'Flight, bus, train, car or boat' });
  }
}

export function partAction(key: MemberPartKey): string {
  return key === 'must_do'
    ? t({ id: 'setup.premium.part.star', message: 'Star' })
    : t({ id: 'setup.premium.part.set', message: 'Set' });
}

export const copy = {
  title: (destination: string) =>
    t({ id: 'setup.premium.checklist.title', message: `${destination} setup` }),
  going: (dates: string | null, count: number) => {
    const going = t({ id: 'setup.premium.going', message: plural(count, { other: '# going' }) });
    return dates === null ? going : `${dates} · ${going}`;
  },
  organising: (name: string) =>
    t({ id: 'setup.premium.organising', message: `${name} is organising` }),
  back: () => t({ id: 'setup.premium.back', message: 'Back' }),
  loading: () => t({ id: 'setup.loading', message: 'Loading trip setup' }),
  missingTitle: () => t({ id: 'setup.missing.title', message: 'This trip isn’t here yet' }),
  missingLine: () =>
    t({
      id: 'setup.missing.line',
      message: 'It shows up once your phone has synced. Try again in a moment.',
    }),
  voteOpenTitle: () => t({ id: 'setup.voteOpen.title', message: 'The vote isn’t over yet' }),
  voteOpenLine: () =>
    t({
      id: 'setup.voteOpen.line',
      message: 'Setup opens once the crew has picked a place. Finish the vote from Home.',
    }),
  home: () => t({ id: 'setup.missing.home', message: 'Back home' }),
  share: () => t({ id: 'setup.premium.share', message: 'Share the invite' }),
  ready: (ready: number, total: number) =>
    t({ id: 'setup.premium.ready', message: `${ready} of ${total} ready` }),
  draftEyebrow: (guideName: string) =>
    t({ id: 'setup.premium.draftEyebrow', message: `${guideName} is drafting as you go` }),
  sketched: (sketched: number, days: number) =>
    t({ id: 'setup.premium.sketched', message: `${sketched} of ${days} days sketched` }),
  noSketch: () => t({ id: 'setup.premium.noSketch', message: 'Nothing sketched yet' }),
  peek: () => t({ id: 'setup.premium.peek', message: 'Peek ›' }),
  waitsOn: () =>
    t({ id: 'setup.premium.waitsOn', message: 'The rest waits on free days and must-dos.' }),
  draftNow: () => t({ id: 'setup.premium.draftNow', message: 'Draft with what we have' }),
  redrafts: (guideName: string) =>
    t({ id: 'setup.premium.redrafts', message: `${guideName} redrafts as the rest come in` }),
  locked: () => t({ id: 'setup.premium.locked', message: 'Locked' }),
  thingsLeft: (left: number) =>
    left === 0
      ? t({ id: 'setup.premium.allSet', message: 'Your part is done' })
      : t({
          id: 'setup.premium.thingsLeft',
          message: plural(left, { one: 'One thing left for you', other: '# things left for you' }),
        }),
  memberLine: () =>
    t({ id: 'setup.premium.memberLine', message: 'About a minute. Nobody sees your numbers.' }),
  yourPart: () => t({ id: 'setup.premium.yourPart', message: 'Your part' }),
  theCrew: () => t({ id: 'setup.premium.theCrew', message: 'The crew' }),
  memberNote: () =>
    t({
      id: 'setup.premium.memberNote',
      message: 'Set your max and I’ll stop guessing at dinners.',
    }),
  organiserNote: () =>
    t({
      id: 'setup.premium.organiserNote',
      message: 'Any order works once the dates are locked. I fill days in as answers land.',
    }),
};
