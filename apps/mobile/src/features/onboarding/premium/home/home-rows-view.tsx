/**
 * The rows of "Where's home?": an airport or town result (the picked one in the warm tint with an
 * ink check), the list of them, and the card for a town the airport search does not know.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Button, Icon, ListCard, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import { rowFacts, rowKey, rowTitle } from '../../home/home-rows';
import type { HomeRow } from '../../home/home-search';
import type { TownGuess } from '../../home/town-guess';
import { PICKED_ROW } from '../components/onboarding-colours';

function ResultRow({
  row,
  selected,
  onPick,
}: {
  readonly row: HomeRow;
  readonly selected: boolean;
  readonly onPick: (iata: string) => void;
}) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const iata = rowKey(row);
  const title = rowTitle(row);
  const facts = rowFacts(row, locale);
  return (
    <PressableScale
      onPress={() => onPick(iata)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${iata}, ${title}, ${facts}`}
      testID={`home-row-${iata}`}
      pressedScale={0.99}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.gap14,
          paddingVertical: theme.space.gap12,
          paddingHorizontal: theme.space.rowPadH,
          backgroundColor: selected && theme.scheme === 'light' ? PICKED_ROW : 'transparent',
        }}
      >
        <Text variant="title" style={{ width: 52 }} numberOfLines={1} adjustsFontSizeToFit>
          {iata}
        </Text>
        <View style={{ flex: 1 }}>
          <Text variant="rowTitle" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {facts}
          </Text>
        </View>
        {selected ? (
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: theme.color.ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="check" size={14} color={theme.color.onInk} />
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

export function Rows({
  rows,
  picked,
  onPick,
  testID,
}: {
  readonly rows: readonly HomeRow[];
  readonly picked: string | null;
  readonly onPick: (iata: string) => void;
  readonly testID: string;
}) {
  if (rows.length === 0) return null;
  return (
    <ListCard testID={testID}>
      {rows.map((row) => (
        <ResultRow key={rowKey(row)} row={row} selected={picked === rowKey(row)} onPick={onPick} />
      ))}
    </ListCard>
  );
}

export function TownCard({
  guess,
  picked,
  onUse,
}: {
  readonly guess: TownGuess;
  readonly picked: boolean;
  readonly onUse: () => void;
}) {
  const theme = usePremiumTheme();
  const nearestLine = t({
    id: 'onboarding.premium.home.nearestAirport',
    message: `nearest airport ${guess.iata}`,
  });
  return (
    <ListCard testID="home-did-you-mean">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.gap14,
          paddingVertical: theme.space.gap12,
          paddingHorizontal: theme.space.rowPadH,
          backgroundColor: picked && theme.scheme === 'light' ? PICKED_ROW : 'transparent',
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: theme.color.status.voteOpen.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="pin" size={20} color={theme.color.status.voteOpen.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="rowTitle" numberOfLines={1}>
            {guess.town}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {guess.region === null ? nearestLine : `${guess.region} · ${nearestLine}`}
          </Text>
        </View>
        <Button
          alignSelf="auto"
          label={t({ id: 'onboarding.premium.home.use', message: 'Use' })}
          size="small"
          onPress={onUse}
          testID="home-did-you-mean-use"
        />
      </View>
    </ListCard>
  );
}
