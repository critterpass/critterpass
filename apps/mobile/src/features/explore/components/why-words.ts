import { plural, t } from '@lingui/core/macro';
import { tasteWord } from '../swipe-copy';
import type { WhyLine } from '../swipe-model';

/** The guide's reasons for a card, worded of the swipe. */
export function whyWords(lines: readonly WhyLine[], guideName: string): string[] {
  return lines.map((line) => {
    if (line.kind === 'mustSee') {
      return t({
        id: 'explore.swipe.whyMustSee',
        message: `It's one of ${guideName}'s must-sees.`,
      });
    }
    if (line.kind === 'taste') {
      const tag = tasteWord(line.tag);
      return t({ id: 'explore.swipe.whyTaste', message: `It fits what the crew likes: ${tag}.` });
    }
    if (line.kind === 'crewSaved') {
      return t({
        id: 'explore.swipe.whySaved',
        message: plural(line.count, {
          one: '# of the crew saved it.',
          other: '# of the crew saved it.',
        }),
      });
    }
    const minutes = Math.max(1, Math.round(line.meters / 80));
    return t({
      id: 'explore.swipe.whyNear',
      message: `It's about ${minutes} min on foot from the stay.`,
    });
  });
}
