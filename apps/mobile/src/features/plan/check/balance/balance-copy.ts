/**
 * Balance the crew's words (7h-5): the title, the line about the crew, each member's name and
 * must-do, "3 OF 4 SAVES IN", Tokek's line for someone at zero, the two buttons, and what happened
 * to an ask. None of it ever leaves the organiser's phone.
 */
import { plural, select, t } from '@lingui/core/macro';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'] as const;
const word = (count: number): string => WORDS[count] ?? 'many';

export function balanceTitle(): string {
  return t({ id: 'plan.check.balance.title', message: 'WHOSE PICKS\nMADE IT' });
}

export function balanceSummary(mustDosIn: boolean, even: boolean): string {
  if (mustDosIn && even) {
    return t({
      id: 'plan.check.balance.allIn',
      message: 'Everyone’s must-do is in, and the saves are even.',
    });
  }
  if (mustDosIn) {
    return t({
      id: 'plan.check.balance.uneven',
      message: 'Everyone’s must-do is in. Saves are uneven.',
    });
  }
  return t({ id: 'plan.check.balance.mustDoMissing', message: 'Not every must-do is in yet.' });
}

export function youName(name: string): string {
  return t({ id: 'plan.check.balance.you', message: `${name} (you)` });
}

export function mustDoLine(title: string, placed: boolean): string {
  return placed
    ? t({ id: 'plan.check.balance.mustDoIn', message: `Must-do: ${title} ✓` })
    : t({ id: 'plan.check.balance.mustDo', message: `Must-do: ${title}` });
}

export function savesIn(placed: number, saved: number): string {
  const k = String(placed);
  return t({
    id: 'plan.check.balance.savesIn',
    message: plural(saved, { one: `${k} OF # SAVE IN`, other: `${k} OF # SAVES IN` }),
  });
}

export function zeroLine(name: string, saved: number, fit: number): string {
  const missed = t({
    id: 'plan.check.balance.missed',
    message: select(word(saved), {
      one: `${name}’s save missed.`,
      two: `${name}’s two saves both missed.`,
      three: `${name}’s three saves all missed.`,
      other: `${name}’s saves all missed.`,
    }),
  });
  const fits = t({
    id: 'plan.check.balance.fit',
    message: select(word(fit), {
      zero: 'None fits without moving something.',
      one: 'One fits without moving anything.',
      two: 'Two fit without moving anything.',
      other: 'Some fit without moving anything.',
    }),
  });
  return `${missed} ${fits}`;
}

export function addThemLabel(count: number): string {
  return count === 2
    ? t({ id: 'plan.check.balance.addBoth', message: 'ADD BOTH' })
    : t({ id: 'plan.check.balance.addIt', message: 'ADD IT' });
}

export function askLabel(name: string): string {
  return t({ id: 'plan.check.balance.ask', message: `ASK ${name} FIRST` });
}

export function askedLabel(): string {
  return t({ id: 'plan.check.balance.asked', message: 'ASKED' });
}

export function askedToast(name: string, guideName: string): { title: string; subtitle: string } {
  return {
    title: t({
      id: 'plan.check.balance.askedToast',
      message: `${guideName} asked ${name} privately`,
    }),
    subtitle: t({ id: 'plan.check.balance.askedToastLine', message: 'Nobody else sees it.' }),
  };
}

export function waitingLine(name: string, guideName: string): string {
  return t({
    id: 'plan.check.balance.waiting',
    message: `${guideName} asked ${name}. Waiting for an answer.`,
  });
}

export function declinedLine(name: string): string {
  return t({
    id: 'plan.check.balance.declined',
    message: `${name} said not now. Their saves stay in Ideas.`,
  });
}

export function acceptedLine(name: string): string {
  return t({ id: 'plan.check.balance.accepted', message: `${name} said yes. Their saves are in.` });
}

export function addedToast(): string {
  return t({ id: 'plan.check.balance.added', message: 'Added to the plan' });
}

export function onlyYouLabel(): string {
  return t({ id: 'plan.check.onlyYou', message: 'ONLY YOU SEE THIS' });
}
