/**
 * Phrase card validators: text in the language's script (romanisation for non-Latin scripts),
 * every context present for every language, emergency and allergy cards flagged for native review,
 * and a warning while a card has no audio yet.
 */
import { NATIVE_REVIEW_CONTEXTS, PHRASE_CONTEXTS } from '@cp/content';

import type { Validators } from '../../validators/registry';
import { inScript } from '../critters/validate';
import { phraseLanguages } from './generate';

const scriptOf = new Map(phraseLanguages().map((l) => [l.language, l.script]));
const LATIN = /^[\p{Script=Latin}\p{M}\p{N}\p{P}\p{Zs}\p{S}]+$/u;

export const phraseValidators: Validators<'phrases'> = {
  items: [
    {
      id: 'script',
      severity: 'fail',
      check: (card) => {
        const script = scriptOf.get(card.language) ?? 'Latn';
        if (script === 'Latn') {
          return LATIN.test(card.text) ? [] : [`"${card.text}" is not in Latin script`];
        }
        const problems: string[] = [];
        if (!inScript(card.text, script))
          problems.push(`"${card.text}" is not written in ${script}`);
        if (card.romanisation === null) problems.push('non-Latin cards carry a romanisation');
        return problems;
      },
    },
    {
      id: 'native-review-flag',
      severity: 'fail',
      check: (card) =>
        NATIVE_REVIEW_CONTEXTS.has(card.context) && !card.needs_native_review
          ? ['emergency and allergy cards need native review']
          : [],
    },
    {
      id: 'audio',
      severity: 'warn',
      check: (card) => (card.audio_status === 'pending' ? ['audio pending'] : []),
    },
  ],
  batch: [
    {
      id: 'every-context',
      severity: 'fail',
      check: ({ items }) => {
        const languages = new Set(items.map((c) => c.language));
        const present = new Set(items.map((c) => c.context));
        return [...languages].flatMap((language) =>
          PHRASE_CONTEXTS.filter((context) => present.has(context))
            .filter(
              (context) => !items.some((c) => c.language === language && c.context === context),
            )
            .map((context) => ({ ref: null, message: `${language} has no ${context} cards` })),
        );
      },
    },
  ],
};
