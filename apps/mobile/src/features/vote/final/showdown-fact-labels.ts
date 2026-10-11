/**
 * A finalist's tool facts as words: flight hours from the viewer's home airport, the price each and
 * the best months, from its pitch. Both showdowns draw these (the current one sets them in capitals).
 */
import { useLingui } from '@lingui/react/macro';

import type { usePitchSections } from '../data/use-final';
import type { PollOptionView } from '../data/poll-view';
import { flightHours, money, monthShort } from '../format';

export function useShowdownFactLabels(
  option: PollOptionView | undefined,
  sectionsOf: ReturnType<typeof usePitchSections>,
): readonly string[] {
  const { t, i18n } = useLingui();
  const sections = option?.pitchId == null ? undefined : sectionsOf.get(option.pitchId);
  const locale = i18n.locale;
  return (sections?.chips ?? []).flatMap((chip) => {
    switch (chip.kind) {
      case 'flight':
        return [t({ id: 'vote.showdown.flight', message: `${flightHours(chip.minutes)}h flight` })];
      case 'price':
        return [
          t({
            id: 'vote.showdown.each',
            message: `${money(locale, chip.amount_minor, chip.currency)} each`,
          }),
        ];
      case 'best_months':
        return [
          t({
            id: 'vote.showdown.best',
            message: `Best ${chip.months.map((m) => monthShort(locale, m)).join(' · ')}`,
          }),
        ];
      case 'event':
      case 'prices_pending':
        return [];
    }
  });
}
