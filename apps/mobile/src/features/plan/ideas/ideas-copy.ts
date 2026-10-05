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

/** On her own draft, before the crew has a plan: she places them herself (the guide drafts days). */
export function draftBodyText(count: number): string {
  return t({
    id: 'plan.ideas.bodyDraft',
    message: plural(count, {
      one: "One saved place that isn't in a day yet. Drag it onto a day.",
      other: "# saved places that aren't in a day yet. Drag one onto a day.",
    }),
  });
}

/** A member before the plan is shared: saving is what there is to do. */
export function beforePlanBody(count: number, organiser: string | null): string {
  const saved = t({
    id: 'plan.ideas.bodySaved',
    message: plural(count, { one: 'One saved place.', other: '# saved places.' }),
  });
  const waiting =
    organiser === null
      ? t({
          id: 'plan.ideas.beforePlanAny',
          message: 'The plan isn’t shared yet. They go onto days once it is.',
        })
      : t({
          id: 'plan.ideas.beforePlan',
          message: `${organiser} is still putting the plan together. They go onto days once it’s shared.`,
        });
  return `${saved} ${waiting}`;
}

export function fitsNeedPlan(): string {
  return t({
    id: 'plan.ideas.fitNeedsPlan',
    message: 'Where it fits shows once the plan is shared',
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

/** A saved place that is already a stop: the row says where instead of where it would fit. */
export function inPlanFitLine(dayLabel: string): string {
  return t({ id: 'plan.ideas.inPlan', message: `Already in the plan · ${dayLabel}` });
}

export function removedToast(forEveryone: boolean): string {
  return forEveryone
    ? t({ id: 'plan.ideas.removedAll', message: 'Removed from Ideas for everyone' })
    : t({ id: 'plan.ideas.removedMine', message: 'Removed from your saved places' });
}

export function undoLabel(): string {
  return t({ id: 'plan.ideas.undo', message: 'UNDO' });
}

export function findPlacesLabel(): string {
  return t({ id: 'plan.ideas.findPlaces', message: 'Find places to save' });
}

export function placeFailedToast(guideName: string): { title: string; subtitle: string } {
  return {
    title: t({ id: 'plan.ideas.placeFailed', message: `${guideName} couldn’t start placing them` }),
    subtitle: t({ id: 'plan.ideas.placeFailedLine', message: 'Try again with signal.' }),
  };
}
