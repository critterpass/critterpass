/** Ideas' words (7f-2): how many are saved, the PLACE THEM FOR ME line, and the empty note. */
import { plural, t } from '@lingui/core/macro';

export function bodyText(count: number, guideName: string): string {
  return t({
    id: 'plan.ideas.body',
    message: plural(count, {
      one: `One saved place that isn't in a day yet. Drag it onto a day, or let ${guideName} place it.`,
      other: `# saved places that aren't in a day yet. Drag one onto a day, or let ${guideName} place them.`,
    }),
  });
}

export function placeLine(fitting: number, needCrew: number): string {
  if (needCrew === 0) {
    return t({
      id: 'plan.ideas.placeAll',
      message: plural(fitting, {
        one: 'It fits without moving anything booked.',
        other: 'All # fit without moving anything booked.',
      }),
    });
  }
  const fit =
    fitting === 0
      ? t({ id: 'plan.ideas.placeNone', message: 'None fit as things are.' })
      : t({
          id: 'plan.ideas.placeSome',
          message: plural(fitting, {
            one: 'One fits without moving anything booked.',
            other: '# fit without moving anything booked.',
          }),
        });
  const crew = t({
    id: 'plan.ideas.placeCrew',
    message: plural(needCrew, { one: 'One needs the crew.', other: '# need the crew.' }),
  });
  return `${fit} ${crew}`;
}

export function emptyLine(): string {
  return t({
    id: 'plan.ideas.emptyLine',
    message:
      'Save places from search, paste a link from TikTok or Maps, or swipe together, and they land here.',
  });
}

export function emptyBody(): string {
  return t({ id: 'plan.ideas.bodyEmpty', message: 'Nothing saved for this trip yet.' });
}

export function backToIdeas(): string {
  return t({ id: 'plan.placing.backToIdeas', message: 'Back to Ideas' });
}
