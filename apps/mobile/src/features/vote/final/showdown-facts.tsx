/**
 * A showdown half's tool chips: flight hours from the viewer's home airport, the price each and
 * the best months, from the finalist's pitch. They sit on the place's colour, so their outline and
 * their label are both ink, whatever the app's theme.
 */
import { useLingui } from '@lingui/react/macro';

import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { SurfaceToneProvider } from '@/ui/surface/Scaffold';

import type { usePitchSections } from '../data/use-final';
import type { PollOptionView } from '../data/poll-view';
import { flightHours, money, monthShort, upper } from '../format';

/** The chips wrap inside this share of the half, beside the guide's silhouette. */
const CHIP_COLUMN = '78%';

export function ShowdownFacts({
  option,
  sectionsOf,
  alignEnd,
}: {
  readonly option: PollOptionView;
  readonly sectionsOf: ReturnType<typeof usePitchSections>;
  readonly alignEnd: boolean;
}) {
  const { t, i18n } = useLingui();
  const sections = option.pitchId === null ? undefined : sectionsOf.get(option.pitchId);
  const locale = i18n.locale;
  const chips = (sections?.chips ?? []).flatMap((chip) => {
    switch (chip.kind) {
      case 'flight':
        return [
          upper(
            t({ id: 'vote.showdown.flight', message: `${flightHours(chip.minutes)}h flight` }),
            locale,
          ),
        ];
      case 'price':
        return [
          upper(
            t({
              id: 'vote.showdown.each',
              message: `${money(locale, chip.amount_minor, chip.currency)} each`,
            }),
            locale,
          ),
        ];
      case 'best_months':
        return [
          upper(
            t({
              id: 'vote.showdown.best',
              message: `Best ${chip.months.map((m) => monthShort(locale, m)).join(' · ')}`,
            }),
            locale,
          ),
        ];
      case 'event':
      case 'prices_pending':
        return [];
    }
  });
  if (chips.length === 0) return null;
  return (
    <SurfaceToneProvider value="accent">
      <Row
        gap="6"
        wrap
        justify={alignEnd ? 'flex-end' : 'flex-start'}
        style={{ maxWidth: CHIP_COLUMN }}
        testID={`showdown-facts-${alignEnd ? 1 : 0}`}
      >
        {chips.map((chip) => (
          <InfoPill key={chip} variant="outline">
            {chip}
          </InfoPill>
        ))}
      </Row>
    </SurfaceToneProvider>
  );
}
