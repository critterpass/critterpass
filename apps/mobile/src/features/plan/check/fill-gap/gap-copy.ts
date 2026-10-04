/**
 * Fill a gap's words (7h-2): the window ("WED 14 · 16:00–19:00"), who is free ("FOUR OF YOU ARE
 * FREE"), where the others are, how many ideas Tokek has, each idea's title, line and chips, and
 * the button that follows the pick ("ADD COFFEE + MARKET").
 */
import { plural, select, t } from '@lingui/core/macro';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'] as const;
const word = (count: number): string => WORDS[count] ?? 'many';

export function windowLabel(day: string, from: string, to: string): string {
  return t({ id: 'plan.check.gap.window', message: `${day} · ${from}–${to}` });
}

export function freeTitle(count: number): string {
  const n = String(count);
  return t({
    id: 'plan.check.gap.free',
    message: select(word(count), {
      two: 'TWO OF YOU\nARE FREE',
      three: 'THREE OF YOU\nARE FREE',
      four: 'FOUR OF YOU\nARE FREE',
      five: 'FIVE OF YOU\nARE FREE',
      six: 'SIX OF YOU\nARE FREE',
      seven: 'SEVEN OF YOU\nARE FREE',
      eight: 'EIGHT OF YOU\nARE FREE',
      other: `${n} OF YOU\nARE FREE`,
    }),
  });
}

export function ideasEyebrow(count: number): string {
  const n = String(count);
  return t({
    id: 'plan.check.gap.ideas',
    message: select(word(count), {
      one: 'TOKEK HAS ONE IDEA',
      two: 'TOKEK HAS TWO IDEAS',
      three: 'TOKEK HAS THREE IDEAS',
      other: `TOKEK HAS ${n} IDEAS`,
    }),
  });
}

export function busyLine(names: string, place: string, until: string): string {
  return t({ id: 'plan.check.gap.busy', message: `${names} are at ${place} till ${until}.` });
}

export function busyOneLine(name: string, place: string, until: string): string {
  return t({ id: 'plan.check.gap.busyOne', message: `${name} is at ${place} till ${until}.` });
}

export function nextLine(place: string, at: string): string {
  return t({ id: 'plan.check.gap.next', message: `${place} is at ${at}.` });
}

export function andNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  const head = names.slice(0, -1).join(', ');
  const last = names[names.length - 1] ?? '';
  return t({ id: 'plan.check.gap.and', message: `${head} and ${last}` });
}

export function pairTitle(first: string, second: string): string {
  return t({ id: 'plan.check.gap.pairTitle', message: `${first}, then ${second}` });
}

export function stayTitle(): string {
  return t({ id: 'plan.check.gap.stayTitle', message: 'Back to the stay' });
}

export function stayBody(voter: string | null): string {
  return voter === null
    ? t({ id: 'plan.check.gap.stayBody', message: 'Free, and nothing to get to.' })
    : t({ id: 'plan.check.gap.stayVoted', message: `Free. ${voter} already voted for this one.` });
}

export function saveOf(name: string): string {
  return t({ id: 'plan.check.gap.saveOf', message: `${name}’s save` });
}

export function closesLine(place: string, at: string): string {
  return t({ id: 'plan.check.gap.closes', message: `${place} shuts at ${at}.` });
}

export function minutesChip(minutes: number): string {
  return t({
    id: 'plan.check.gap.minutes',
    message: plural(minutes, { one: '# MIN', other: '# MIN' }),
  });
}

export function freeChip(): string {
  return t({ id: 'plan.check.gap.freeChip', message: 'FREE' });
}

export function eachChip(money: string): string {
  return t({ id: 'plan.check.gap.each', message: `${money} EACH` });
}

export function addLabel(names: readonly string[]): string {
  const [first, second] = names;
  if (first === undefined) return t({ id: 'plan.check.gap.keepFree', message: 'KEEP IT FREE' });
  if (second === undefined) return t({ id: 'plan.check.gap.addOne', message: `ADD ${first}` });
  return t({ id: 'plan.check.gap.addTwo', message: `ADD ${first} + ${second}` });
}

export function somethingElse(): string {
  return t({ id: 'plan.check.gap.else', message: 'Something else' });
}

export function noIdeas(): string {
  return t({
    id: 'plan.check.gap.none',
    message: 'Nothing nearby fits this window. Try Something else, or keep it free.',
  });
}

export function addedToast(count: number): string {
  return t({
    id: 'plan.check.gap.added',
    message: plural(count, { one: 'Added for you', other: 'Added for the # of you' }),
  });
}
