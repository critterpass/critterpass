/**
 * What a pass shows, as plain values for any page that draws it (the paper pass reads these): the
 * number, the photo (a guide's face or the real photo), the printed fields with their "not yet"
 * states, and the MRZ lines.
 */
import { t } from '@lingui/core/macro';

import {
  guideOfForm,
  homeBaseFor,
  mrzLines,
  PASS_NUMBER_PLACEHOLDER,
  passStyleTags,
  tasteFromAnswers,
  type PassDraft,
} from '@cp/domain';
import { format, upper } from '@cp/i18n';

import { guideSticker } from '@/ui/avatar/guides';

import { airportDataset, onboardingQuiz } from './content';
import { tagWords } from './taste/tag-labels';

/** The issue date as the pass prints it. */
export const PASS_DATE: Intl.DateTimeFormatOptions = {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- Intl option values.
  day: '2-digit',
  month: 'short',
  year: 'numeric',
};

/** The travel-style tags the taste answers give the pass. */
export function styleTagsOf(draft: PassDraft) {
  return passStyleTags(tasteFromAnswers(onboardingQuiz(), draft.answers).tags);
}

export type PassFace =
  | {
      readonly kind: 'guide';
      readonly critter: string;
      readonly name: string;
      readonly seed: number;
    }
  | { readonly kind: 'photo'; readonly uri: string }
  | { readonly kind: 'empty' };

export interface PassFacts {
  readonly number: string;
  readonly face: PassFace;
  readonly name: string;
  readonly home: string | null;
  readonly homeCode: string | null;
  readonly issued: string | null;
  readonly style: string | null;
  readonly mrz: readonly string[];
}

export function passFace(draft: PassDraft): PassFace {
  const avatar = draft.avatar;
  if (avatar === null) return { kind: 'empty' };
  if (avatar.kind === 'photo') {
    return draft.photo_uri === null ? { kind: 'empty' } : { kind: 'photo', uri: draft.photo_uri };
  }
  if (avatar.kind !== 'critter') return { kind: 'empty' };
  const guide = guideOfForm(avatar.form_id);
  if (guide === null) return { kind: 'empty' };
  const info = guideSticker(guide);
  return { kind: 'guide', critter: info.kind, name: info.name, seed: info.seed };
}

export function passFacts(draft: PassDraft, locale: string, stampCount = 0): PassFacts {
  const home = draft.home_iata === null ? null : homeBaseFor(airportDataset(), draft.home_iata);
  const tags = styleTagsOf(draft);
  return {
    number: draft.number ?? PASS_NUMBER_PLACEHOLDER,
    face: passFace(draft),
    name: draft.given_name,
    home: home === null ? null : home.city,
    homeCode: home?.iata ?? null,
    issued:
      draft.issued_at === null ? null : format.date(locale, new Date(draft.issued_at), PASS_DATE),
    style: tags.length === 0 ? null : tags.map((tag) => tagWords(tag).short).join(' · '),
    mrz: mrzLines({
      givenName: draft.given_name,
      number: draft.number,
      homeIso3: home?.countryIso3 ?? null,
      styleTags: tags,
      stampCount,
    }),
  };
}

/** The pass's printed labels, upper-cased for the locale. */
export function passLabels(locale: string) {
  return {
    head: t({ id: 'onboarding.pass.head', message: 'CRITTERPASS · PASSEPORT' }),
    givenName: t({ id: 'onboarding.pass.givenName', message: 'GIVEN NAME · PRÉNOM' }),
    home: t({ id: 'onboarding.pass.home', message: 'HOME' }),
    issued: t({ id: 'onboarding.pass.issued', message: 'ISSUED' }),
    style: t({ id: 'onboarding.pass.travelStyle', message: 'TRAVEL STYLE' }),
    notYet: t({ id: 'onboarding.pass.notYet', message: 'Not yet' }),
    weWillAsk: t({ id: 'onboarding.pass.weWillAsk', message: 'We’ll ask' }),
    syncing: t({ id: 'onboarding.pass.syncing', message: 'SYNCING' }),
    upper: (text: string) => upper(text, locale),
  };
}
