import { t } from '@lingui/core/macro';
import { money } from '../budget/model';
import type { SetupMember } from '../data/setup-trip';
import { countWord, namesList, rangeLabel } from './copy';
import type { WindowOption } from './model';

export interface OptionPeople {
  readonly members: readonly SetupMember[];
  readonly guideName: string;
  readonly place: string;
  /** Must-do titles by id (the ones a partial week would miss). */
  readonly mustDoTitles: ReadonlyMap<string, string>;
}

/** "−$90" / "+$90" (the sign is added here: Hermes's NumberFormat has no `signDisplay`). */
export function deltaLabel(locale: string, amountMinor: number, currency: string): string {
  const amount = money(locale, Math.abs(amountMinor), currency);
  if (amountMinor === 0) return amount;
  return `${amountMinor < 0 ? '−' : '+'}${amount}`;
}

function nameOf(people: OptionPeople, uid: string | null): string {
  return people.members.find((member) => member.uid === uid)?.name ?? '';
}

export function optionTitle(locale: string, option: WindowOption, people: OptionPeople): string {
  const range = rangeLabel(locale, option.start, option.end);
  const total = countWord(option.memberCount);
  if (option.kind === 'ask_first') {
    const name = nameOf(people, option.askUserId);
    return t({ id: 'setup.when.option.askTitle', message: `Ask ${name} first` });
  }
  if (option.freeCount >= option.memberCount) {
    return t({ id: 'setup.when.option.allTitle', message: `${range} · all ${total}` });
  }
  const free = countWord(option.freeCount);
  return t({ id: 'setup.when.option.partTitle', message: `${range} · ${free} of ${total}` });
}

function askProgress(option: WindowOption, name: string): string | null {
  switch (option.askState) {
    case 'asked':
      return t({
        id: 'setup.when.option.asked',
        message: `Asked ${name} privately. Waiting for an answer, up to two days.`,
      });
    case 'freed':
      return t({ id: 'setup.when.option.freed', message: `${name} freed it. Everyone fits now.` });
    case 'not_movable':
      return t({
        id: 'setup.when.option.notMovable',
        message: `${name} can’t move it. Pick another week.`,
      });
    case 'timed_out':
      return t({
        id: 'setup.when.option.timedOut',
        message: `No answer from ${name} in two days, so I set this one aside.`,
      });
    case null:
      return null;
  }
}

export function optionLine(locale: string, option: WindowOption, people: OptionPeople): string {
  if (option.kind === 'ask_first') {
    const name = nameOf(people, option.askUserId);
    return (
      askProgress(option, name) ??
      t({
        id: 'setup.when.option.askLine',
        message: `${name} has a maybe block that week. I’ll ask privately.`,
      })
    );
  }
  const delta =
    option.priceDeltaMinor === null || option.priceDeltaMinor === 0 || option.currency === null
      ? null
      : deltaLabel(locale, Math.abs(option.priceDeltaMinor), option.currency).slice(1);
  if (option.freeCount >= option.memberCount) {
    const place = people.place;
    const first =
      option.reason === 'season_trade'
        ? t({
            id: 'setup.when.option.allPastSeason',
            message: `Everyone is free, but it’s past ${place}’s best season.`,
          })
        : t({ id: 'setup.when.option.allFree', message: 'Everyone is free that week.' });
    if (delta === null) return first;
    return (option.priceDeltaMinor ?? 0) < 0
      ? t({ id: 'setup.when.option.fareDrop', message: `${first} Flights drop ${delta}.` })
      : t({ id: 'setup.when.option.fareRise', message: `${first} Flights cost ${delta} more.` });
  }
  const names = namesList(
    locale,
    option.missingIds.map((uid) => nameOf(people, uid)).filter((name) => name !== ''),
  );
  const missed = option.missedMustDoIds
    .map((id) => people.mustDoTitles.get(id))
    .filter((title): title is string => title !== undefined);
  if (missed.length === 0) {
    return t({ id: 'setup.when.option.partLine', message: `${names} can’t make all of it.` });
  }
  const list = namesList(locale, missed);
  return t({
    id: 'setup.when.option.partMisses',
    message: `${names} can’t make all of it and would miss ${list}.`,
  });
}
