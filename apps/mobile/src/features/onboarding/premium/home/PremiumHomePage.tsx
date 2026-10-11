/**
 * 2.09 / 2.10 "Where's home?": a search over the bundled airports (offline too), the nearest ones
 * from the network hint on top, a picked row in the warm tint with an ink check, and the orange
 * HOME stamp landing on the page (the keyboard steps aside when a row is picked). Nothing found
 * says so and keeps the airports near you below.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Keyboard, TextInput, View } from 'react-native';

import { homeBaseFor } from '@cp/domain';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  GuideNote,
  Icon,
  ListCard,
  PressableScale,
  RoundStamp,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import { airportDataset, homeWord, tokekLine } from '../../content';
import { guideFacts } from '../../guide-faces';
import { driveLabel, rowFacts, rowKey, rowTitle } from '../../home/home-rows';
import { HOME_ROWS, homeResults, readerCountryOf, type HomeRow } from '../../home/home-search';
import { useHomeStep } from '../../home/use-home-step';
import { PICKED_ROW } from '../components/onboarding-colours';
import { StampLanding } from '../components/StampLanding';
import { WizardPage } from '../components/WizardPage';

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

function Rows({
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

export function PremiumHomePage() {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const step = useHomeStep();
  const tokek = guideFacts('tokek');
  const base = step.picked === null ? null : homeBaseFor(airportDataset(), step.picked);
  // With nothing found, the airports near you (the empty query's rows) still show.
  const near = useMemo(
    () =>
      step.noResults
        ? homeResults(airportDataset(), '', null, HOME_ROWS, readerCountryOf(locale)).rows
        : [],
    [step.noResults, locale],
  );
  const pick = (iata: string) => {
    Keyboard.dismiss();
    step.pick(iata);
  };
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a content trigger id.
  const farLine = tokekLine('home_far', locale);
  const homeLabel = t({ id: 'onboarding.home.stampHome', message: 'Home' });
  const local = base === null ? null : homeWord(base.country);
  return (
    <WizardPage
      step={{ current: 4, total: 4 }}
      backLabel={t({ id: 'onboarding.invite.code.back', message: 'Back' })}
      onBack={() => router.back()}
      testID="onboarding-home"
      footer={
        <Button
          label={t({ id: 'onboarding.home.next', message: 'That’s home' })}
          onPress={step.next}
          disabled={step.picked === null}
          testID="onboarding-home-next"
        />
      }
    >
      <View style={{ gap: theme.space.gap4 }}>
        <Text variant="largeTitle" accessibilityRole="header">
          {t({ id: 'onboarding.home.title', message: 'Where’s home?' })}
        </Text>
        <Text variant="body" tone="muted">
          {t({
            id: 'onboarding.home.body',
            message: 'Flights and budgets start here. It’s also your first stamp.',
          })}
        </Text>
      </View>
      <View
        style={{
          height: 50,
          borderRadius: theme.radius.field,
          backgroundColor: theme.color.card,
          boxShadow: theme.shadow.raised,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.gap10,
          paddingHorizontal: theme.space.fieldPadH,
        }}
      >
        <Icon name="pin" size={18} color={theme.color.muted} />
        {/* Uncontrolled: the native field owns the typed text, so a busy JS thread never reorders
            letters. */}
        <TextInput
          onChangeText={step.setQuery}
          placeholder={t({ id: 'onboarding.home.search', message: 'City, airport or code' })}
          placeholderTextColor={theme.color.placeholder}
          selectionColor={theme.color.caret}
          accessibilityLabel={t({ id: 'onboarding.home.search', message: 'City, airport or code' })}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          style={{
            flex: 1,
            fontSize: theme.type.field.size,
            fontWeight: theme.type.field.weight,
            color: theme.color.ink,
          }}
          testID="home-search"
        />
      </View>
      {step.noResults ? (
        <View style={{ gap: theme.space.gap4 }} testID="home-no-results">
          <Text variant="title">
            {t({
              id: 'onboarding.premium.home.nothing',
              message: `Nothing called “${step.searched}”`,
            })}
          </Text>
          <Text variant="rowText" tone="muted">
            {t({
              id: 'onboarding.premium.home.nothingLine',
              message: 'Try a city, an airport or its three-letter code.',
            })}
          </Text>
        </View>
      ) : null}
      <Rows rows={step.results.rows} picked={step.picked} onPick={pick} testID="home-results" />
      {near.length > 0 ? (
        <View style={{ gap: theme.space.gap8 }}>
          <Text variant="label" tone="muted">
            {t({ id: 'onboarding.premium.home.near', message: 'Airports near you' })}
          </Text>
          <Rows rows={near} picked={step.picked} onPick={pick} testID="home-near" />
        </View>
      ) : null}
      {step.searched.length === 0 && step.results.farMinutes !== null ? (
        <GuideNote
          name={tokek.name}
          critter={tokek.kind}
          text={t({
            id: 'onboarding.home.far',
            message: `Nearest is ${driveLabel(step.results.farMinutes)}. ${farLine}`,
          })}
          testID="home-far"
        />
      ) : null}
      {base === null ? null : (
        <View style={{ alignItems: 'center', paddingVertical: theme.space.gap16 }}>
          <StampLanding key={base.iata}>
            <RoundStamp
              word={base.city}
              top={local === null || local === homeLabel ? homeLabel : `${homeLabel} · ${local}`}
              bottom={t({ id: 'onboarding.home.stampNo', message: 'Stamp No. 1' })}
              ink="orange"
              size={200}
              rotate={-10}
              testID="home-stamp"
            />
          </StampLanding>
        </View>
      )}
    </WizardPage>
  );
}
