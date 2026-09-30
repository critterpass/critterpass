/** The trip egg's words: the PASS card and the hatch ceremony (3l-1), in the active locale. */
import { plural, t } from '@lingui/core/macro';

export function eggWaiting(place: string): { title: string; body: string } {
  return {
    title: t({ id: 'critters.egg.waitingTitle', message: 'Your egg' }),
    body: t({
      id: 'critters.egg.waitingBody',
      message: `It hatches when you land in ${place}.`,
    }),
  };
}

export function eggReady(place: string): { title: string; body: string; cta: string } {
  return {
    title: t({ id: 'critters.egg.readyTitle', message: 'Your egg is wobbling' }),
    body: t({
      id: 'critters.egg.readyBody',
      message: `You're in ${place}. It's ready when you are.`,
    }),
    cta: t({ id: 'critters.egg.hatchIt', message: 'Hatch it' }),
  };
}

export function eggUnseen(): { title: string; body: string; cta: string } {
  return {
    title: t({ id: 'critters.egg.unseenTitle', message: 'Your egg hatched' }),
    body: t({ id: 'critters.egg.unseenBody', message: 'Someone new is waiting to say hi.' }),
    cta: t({ id: 'critters.egg.meet', message: 'Meet them' }),
  };
}

export function landedEyebrow(time: string | null): string {
  return time === null
    ? t({ id: 'critters.hatch.youMadeIt', message: 'You made it' })
    : t({ id: 'critters.hatch.landed', message: `${time} · You landed` });
}

export function welcome(place: string): string {
  return t({ id: 'critters.hatch.welcome', message: `Welcome to ${place}` });
}

export function hatchedTitle(name: string | null): string {
  return name === null
    ? t({ id: 'critters.hatch.hatchedSomeone', message: 'Your egg hatched' })
    : t({ id: 'critters.hatch.hatched', message: `${name} hatched` });
}

export function hatchedBody(input: {
  readonly isGuide: boolean;
  readonly days: number | null;
  readonly no: number | null;
  readonly place: string;
}): string {
  const { days, no, place } = input;
  // "#1" is built outside the message: inside a plural, a bare # stands for the count.
  const number = no === null ? null : `#${no}`;
  if (input.isGuide && days !== null && number !== null) {
    return t({
      id: 'critters.hatch.guideBody',
      message: plural(days, {
        one: `Your guide for the next # day, and critter ${number} in the ${place} set.`,
        other: `Your guide for the next # days, and critter ${number} in the ${place} set.`,
      }),
    });
  }
  return number === null
    ? t({ id: 'critters.hatch.firstBody', message: `Your first critter in ${place}.` })
    : t({ id: 'critters.hatch.body', message: `Critter ${number} in the ${place} set.` });
}

export function sayHi(): string {
  return t({ id: 'critters.hatch.sayHi', message: 'Say hi' });
}

export function later(): string {
  return t({ id: 'critters.hatch.later', message: 'Show me around later' });
}

export function pendingNote(): string {
  return t({
    id: 'critters.hatch.pending',
    message: 'No signal. It joins your pass once you’re back online.',
  });
}
