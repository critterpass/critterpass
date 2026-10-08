/**
 * The guide's price line under the rooms (3c-6): the sticker, a line in the guide's voice and the
 * per-person price as a rolling odometer that settles as people move. Equal rooms give one price
 * ("$470 each"); unequal rooms give the range; a member hears their own share.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { currencyExponent, isKnownCurrency } from '@cp/cost-engine';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideColour, guideSticker } from '@/ui/avatar/guides';
import { Odometer } from '@/ui/data/Odometer';
import { Row } from '@/ui/layout/Row';
import type { GuideId } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { moneyAffixes } from '../budget/model';
import type { PerPerson } from './model';

const useStyles = makeStyles((th) => ({
  words: { flex: 1, gap: th.space['2'] },
  amounts: { flexWrap: 'wrap' },
}));

/** Decimal places of `currency` (2 when unknown). */
export function fractionDigits(currency: string): number {
  return isKnownCurrency(currency) ? currencyExponent(currency) : 2;
}

export function PriceLine({
  guide,
  price,
  currency,
  member,
  solo = false,
}: {
  readonly guide: GuideId;
  readonly price: PerPerson;
  readonly currency: string;
  readonly member: boolean;
  /** A trip for one: the stay's price is theirs alone, nothing is split. */
  readonly solo?: boolean | undefined;
}) {
  const styles = useStyles();
  const sticker = guideSticker(guide);
  const colour = guideColour(guide);
  const affixes = moneyAffixes(useLocale(), currency);
  const each = t({ id: 'setup.rooms.price.each', message: ' each' });
  const equal = price.low === price.high;
  let line: string;
  if (solo) line = t({ id: 'setup.rooms.price.solo', message: 'Your stay comes to' });
  else if (member) line = t({ id: 'setup.rooms.price.mine', message: 'Your share of the rooms:' });
  else if (equal)
    line = t({ id: 'setup.rooms.price.equal', message: 'Every room splits the same way.' });
  else
    line = t({
      id: 'setup.rooms.price.unequal',
      message: 'Bigger rooms cost their people a bit more.',
    });
  const amount = (value: number, suffix: string, testID: string) => (
    <Odometer
      value={value}
      prefix={affixes.prefix}
      suffix={`${affixes.suffix}${suffix}`}
      variant="voice"
      color={colour}
      testID={testID}
    />
  );
  return (
    <Row gap="10" align="center" testID="setup-rooms-price">
      <Sticker kind={sticker.kind} name={sticker.name} size={44} />
      <View style={styles.words}>
        <Text variant="voice" color={colour}>
          {line}
        </Text>
        <Row align="center" style={styles.amounts}>
          {member && price.mine !== null ? (
            amount(price.mine, '', 'setup-rooms-price-mine')
          ) : equal ? (
            amount(price.low, solo ? '' : each, 'setup-rooms-price-each')
          ) : (
            <>
              {amount(price.low, '', 'setup-rooms-price-low')}
              <Text variant="voice" color={colour}>
                {t({ id: 'setup.rooms.price.to', message: ' to ' })}
              </Text>
              {amount(price.high, each, 'setup-rooms-price-high')}
            </>
          )}
        </Row>
      </View>
    </Row>
  );
}
