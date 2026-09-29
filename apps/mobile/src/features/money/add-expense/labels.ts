/**
 * The add screen's words that follow the amount: the "≈ $28.42 · $4.74 each" line (or "$4.74
 * each" in the crew currency, or a note when the phone has no rate yet) and the ADD RP 450K button.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';

import { formatAmount, formatShort } from '../format';
import { amountMinorOf, type ExpenseDraft } from './draft';
import type { DraftPreview } from './preview';

export interface AddLabels {
  readonly approx: string | undefined;
  readonly ctaLabel: string;
  /** "$4.74" on an even split, for the toast. */
  readonly each: string | null;
}

export function useAddLabels(
  draft: ExpenseDraft,
  preview: DraftPreview | null,
  crewCurrency: string,
  editing: boolean,
): AddLabels {
  const locale = useLocale();
  const { t } = useLingui();
  const amountMinor = amountMinorOf(draft);
  const total = preview === null ? '' : formatAmount(preview.crewTotalMinor, crewCurrency, locale);
  const each =
    preview?.eachMinor == null ? null : formatAmount(preview.eachMinor, crewCurrency, locale);
  const foreign = draft.currency !== crewCurrency;
  let approx: string | undefined;
  if (preview !== null && foreign && !preview.converted) {
    approx = t({ id: 'money.add.noRate', message: 'Converts once this phone has a rate' });
  } else if (preview !== null && foreign) {
    approx =
      each === null
        ? t({ id: 'money.add.approx', message: `≈ ${total}` })
        : t({ id: 'money.add.approxEach', message: `≈ ${total} · ${each} each` });
  } else if (each !== null) {
    approx = t({ id: 'money.add.each', message: `${each} each` });
  }
  const short = formatShort(amountMinor, draft.currency, locale);
  const ctaLabel = upper(
    editing
      ? t({ id: 'money.add.save', message: 'Save' })
      : amountMinor === 0n
        ? t({ id: 'money.add.addEmpty', message: 'Add' })
        : t({ id: 'money.add.add', message: `Add ${short}` }),
    locale,
  );
  return { approx, ctaLabel, each };
}
