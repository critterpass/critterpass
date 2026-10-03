/** Critter detail words (3l-3), in the active locale. */
import { t } from '@lingui/core/macro';

import type { CritterFact } from '@/ui/critters/CritterDetail';

import type { DetailForm, DetailModel } from './detail-model';

export function detailCopy(
  model: DetailModel,
  form: DetailForm | undefined,
  guideName: string | null,
  crew: readonly string[],
) {
  const total = model.forms.length;
  const found = model.foundCount;
  return {
    formsLabel: t({ id: 'critters.detail.forms', message: `Forms · ${found} of ${total}` }),
    // A found form's own note first; the critter's while only its silhouette is known.
    fieldNote: (form?.found === true ? form.note : null) ?? model.note,
    fieldNoteSource:
      guideName === null
        ? t({ id: 'critters.detail.fieldNotes', message: 'From the field notes' })
        : t({ id: 'critters.detail.guideNotes', message: `From ${guideName}'s field notes` }),
    makeGuide: t({ id: 'critters.detail.makeGuide', message: 'Make it my guide' }),
    whereToFind: t({ id: 'critters.detail.whereToFind', message: 'Where to find it' }),
    classicLook: t({ id: 'critters.detail.classicLook', message: 'Back to the classic look' }),
    share: t({ id: 'critters.detail.share', message: 'Share' }),
    facts: (when: string | null): CritterFact[] => [
      ...(when === null
        ? []
        : [{ label: t({ id: 'critters.detail.found', message: 'Found' }), value: when }]),
      ...(form?.place == null
        ? []
        : [{ label: t({ id: 'critters.detail.where', message: 'Where' }), value: form.place }]),
      ...(crew.length === 0
        ? []
        : [
            {
              label: t({ id: 'critters.detail.alsoHas', message: 'Also has it' }),
              value: crew.join(', '),
            },
          ]),
    ],
  };
}

export function skinToast(name: string): string {
  return t({ id: 'critters.detail.skinSet', message: `${name} is your guide's look now` });
}

export function skinReverted(): string {
  return t({
    id: 'critters.detail.skinReverted',
    message: 'Your guide is back to the classic look',
  });
}

export function undo(): string {
  return t({ id: 'critters.detail.undo', message: 'Undo' });
}

export function shareAlt(name: string, city: string): string {
  return t({ id: 'critters.detail.shareAlt', message: `${name}, found in ${city}` });
}

export function shareLine(tier: string, city: string): string {
  return t({ id: 'critters.detail.shareLine', message: `${tier} · found in ${city}` });
}
