/**
 * Settings › Language and currency on the premium kit. App language: four languages first, each in
 * its own script with a tick on the current one, then "N more" opens the rest in place; picking one
 * switches the whole app where it stands. Currency: the home currency (its choice list opens under
 * the row), how prices show with a sample price beside Tokek, and how old the rates are when they
 * are old. Formats: the clock and distance as two segmented rows that save at once.
 */
/* eslint-disable lingui/no-unlocalized-strings -- format values, never copy. */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import {
  CritterSticker,
  Icon,
  ListCard,
  Row,
  SegmentedControl,
  Spinner,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useFormatWords } from '../../language/format-words';
import { useLanguageModel, type LanguageScreenProps } from '../../language/use-language-model';
import { CurrencyChoice } from './currency-choice';

const TOKEK = guideSticker('tokek');
const SEGMENT_WIDTH = 168;

function Section(props: {
  readonly title: string;
  readonly note?: string;
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const th = usePremiumTheme();
  return (
    <View style={{ gap: th.space.gap4, marginTop: th.space.gap10 }} testID={props.testID}>
      <Text
        variant="caption"
        tone="muted"
        style={{ paddingHorizontal: 6 }}
        accessibilityRole="header"
      >
        {props.title}
      </Text>
      {props.children}
      {props.note === undefined ? null : (
        <Text variant="caption" tone="muted" style={{ paddingHorizontal: 6 }}>
          {props.note}
        </Text>
      )}
    </View>
  );
}

export function LanguagePremiumScreen(props: LanguageScreenProps = {}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const model = useLanguageModel(props);
  const words = useFormatWords();
  const { lines, display } = model;
  const shownLanguages = model.showMore ? [...model.featured, ...model.more] : model.featured;
  const selected = model.switching ?? model.current;
  const count = model.more.length;
  const homeTitle = t({ id: 'you.currency.home', message: 'Home currency' });
  const showIn = t({ id: 'you.currency.showIn', message: 'Show prices in' });
  const segment = (child: ReactNode) => <View style={{ width: SEGMENT_WIDTH }}>{child}</View>;
  return (
    <PushScreen
      title={t({ id: 'you.language.titleCurrency', message: 'Language and currency' })}
      backLabel={t({ id: 'you.language.back', message: 'Settings' })}
      testID="you-language"
    >
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap6 }}>
        <Section
          title={t({ id: 'you.language.appLanguage', message: 'App language' })}
          note={t({
            id: 'you.language.note',
            message:
              'The app, your guide’s replies and your notifications switch together. Places keep their local names.',
          })}
        >
          <ListCard radius={20} testID="you-language-list">
            {shownLanguages.map((choice) => (
              <Row
                key={choice.code}
                title={choice.nativeName}
                {...(choice.localName === choice.nativeName ? {} : { subtitle: choice.localName })}
                trailing={
                  model.switching === choice.code ? (
                    <Spinner color={th.color.ink} trackColor={th.color.control} />
                  ) : selected === choice.code ? (
                    <Icon name="check" size={18} color={th.color.ink} />
                  ) : undefined
                }
                onPress={() => model.pick(choice.code)}
                testID={`you-language-${choice.code}`}
              />
            ))}
            {model.showMore || model.more.length === 0 ? null : (
              <Row
                title={t({ id: 'you.language.more', message: `${count} more` })}
                trailing={<Icon name="forward" size={16} color={th.color.placeholder} />}
                onPress={() => model.setShowMore(true)}
                testID="you-language-more"
              />
            )}
          </ListCard>
        </Section>
        <Section
          title={t({ id: 'you.currency.title', message: 'Currency' })}
          note={t({
            id: 'you.currency.note',
            message: 'Balances split in the crew’s currency. Rates work offline.',
          })}
          testID="you-currency"
        >
          <ListCard radius={20}>
            <Row
              title={homeTitle}
              subtitle={
                lines.homeLine ??
                t({ id: 'you.currency.homeNone', message: 'Pick one, or set your home airport' })
              }
              {...(lines.homeSymbol === null ? {} : { trailingText: lines.homeSymbol })}
              trailing={
                <View style={{ transform: [{ rotate: model.picking ? '90deg' : '0deg' }] }}>
                  <Icon name="forward" size={16} color={th.color.placeholder} />
                </View>
              }
              onPress={() => model.setPicking(!model.picking)}
              testID="you-currency-home"
            />
            <Row
              title={showIn}
              trailing={segment(
                <SegmentedControl
                  options={[
                    { value: 'home', label: t({ id: 'you.currency.mode.home', message: 'Home' }) },
                    {
                      value: 'local',
                      label: t({ id: 'you.currency.mode.local', message: 'Local' }),
                    },
                    { value: 'both', label: t({ id: 'you.currency.mode.both', message: 'Both' }) },
                  ]}
                  value={display.mode}
                  onChange={model.setMode}
                  accessibilityLabel={showIn}
                  testID="you-currency-mode"
                />,
              )}
            />
            <Row
              title={lines.sample}
              subtitle={t({ id: 'you.currency.samplePlace', message: 'Tirta Empul' })}
              {...(lines.ratesLine === null ? {} : { trailingText: lines.ratesLine })}
              leading={
                <CritterSticker kind={TOKEK.kind} name={TOKEK.name} seed={TOKEK.seed} size={34} />
              }
              testID="you-currency-sample"
            />
          </ListCard>
          {model.picking ? (
            <CurrencyChoice
              airportCurrency={display.airportCurrency}
              chosen={display.homeFromAirport ? null : display.homeCurrency}
              onPick={model.setHome}
            />
          ) : null}
        </Section>
        <Section title={t({ id: 'you.formats.title', message: 'Formats' })} testID="you-formats">
          <ListCard radius={20}>
            <Row
              title={t({ id: 'you.formats.clock', message: 'Clock' })}
              trailing={segment(
                <SegmentedControl
                  options={(['24h', '12h'] as const).map((value) => ({
                    value,
                    label: words.time(value),
                  }))}
                  value={model.time}
                  onChange={model.setTime}
                  accessibilityLabel={t({ id: 'you.formats.clock', message: 'Clock' })}
                  testID="you-formats-time"
                />,
              )}
            />
            <Row
              title={t({ id: 'you.formats.distance', message: 'Distance' })}
              trailing={segment(
                <SegmentedControl
                  options={(['km', 'mi'] as const).map((value) => ({
                    value,
                    label: words.distance(value),
                  }))}
                  value={model.formats.distance}
                  onChange={model.setDistance}
                  accessibilityLabel={t({ id: 'you.formats.distance', message: 'Distance' })}
                  testID="you-formats-distance"
                />,
              )}
            />
          </ListCard>
        </Section>
      </View>
    </PushScreen>
  );
}
