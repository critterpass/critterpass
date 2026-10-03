/**
 * The here-now card (3l-2): the local critter of the place you're in, its four forms (found ones
 * in colour, the rest as silhouettes) and where the next one lives, never its name. Each form is a
 * button: a found one opens the critter's page, the rest where to find them.
 */
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { HereNowForms } from '@/ui/critters/HereNowForms';
import { tierWord } from '@/ui/critters/tier';
import { PressScale } from '@/ui/press/PressScale';
import { SilhouetteSlot } from '@/ui/sticker/SilhouetteSlot';
import { Sticker } from '@/ui/sticker/Sticker';
import { tokens } from '@cp/design-tokens';

import { unknownName } from '../critters-copy';
import { formsOf, hereNowTitle, nextFormHint } from './dex-copy';
import type { HereNowModel } from './dex-model';
import { artKind } from '../art-kind';

const FORM_ART = 48;

export function HereNowCard({
  here,
  onOpen,
  onWhere,
}: {
  readonly here: HereNowModel;
  readonly onOpen: (critterId: string) => void;
  /** A form not found yet opens where to find it; a found one opens the critter's page. */
  readonly onWhere?: (formId: string) => void;
}) {
  const locale = useLocale();
  const { critter, forms, nextForm } = here;
  const name = critter.name ?? unknownName();
  const found = forms.filter((f) => f.found).length;
  const body = (
    <HereNowForms
      title={upper(hereNowTitle(here.place), locale)}
      subtitle={upper(formsOf(name, found, forms.length), locale)}
      forms={forms.map((form) => ({
        tier: form.rarity,
        found: form.found,
        sticker: form.found ? (
          <Sticker
            kind={artKind(critter.key)}
            name={name}
            size={FORM_ART}
            seed={critter.seed}
            {...(form.spec === null ? {} : { form: form.spec })}
          />
        ) : (
          <SilhouetteSlot
            kind={artKind(critter.key)}
            city={critter.city}
            size={FORM_ART}
            seed={critter.seed}
            maskColor={
              form.rarity === 'legendary'
                ? tokens.tier.locked.legendary.silhouette
                : tokens.tier.locked.default
            }
            glyphColor={tokens.tier[form.rarity].color}
          />
        ),
      }))}
      {...(nextForm?.requirement == null
        ? {}
        : { hint: nextFormHint(tierWord(nextForm.rarity), nextForm.requirement) })}
      {...(onWhere === undefined
        ? {}
        : {
            onPressForm: (index: number) => {
              const form = forms[index];
              if (form === undefined) return;
              if (form.found) onOpen(critter.id);
              else onWhere(form.formId);
            },
          })}
      testID="critters-here-now"
    />
  );
  if (!critter.found) return body;
  return (
    <PressScale
      onPress={() => onOpen(critter.id)}
      accessibilityRole="button"
      accessibilityLabel={`${hereNowTitle(here.place)}, ${formsOf(name, found, forms.length)}`}
      widthClass="wide"
    >
      {body}
    </PressScale>
  );
}
