/**
 * 3a-5 "Where's home?": offline airport search, the IP hint's nearest airports on top (no GPS
 * prompt), and picking one inks the HOME stamp that lands on the pass next.
 */
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';
import { homeBaseFor } from '@cp/domain';
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Stamp } from '@/ui/documents/Stamp';
import { Icon } from '@/ui/icons/Icon';
import { useInputFont } from '@/ui/inputs/use-input-font';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { airportDataset, homeWord, tokekLine } from '../content';
import { STAMP_BREATHE, useOnboardingLoop } from '../motion';
import { OnboardingPage } from '../page-chrome';
import { TokekSays } from '../tokek-says';
import { driveLabel, rowFacts, rowKey, rowTitle } from './home-rows';
import type { HomeRow } from './home-search';
import { useHomeStep } from './use-home-step';

const useStyles = makeStyles((th) => ({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['10'],
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['16'],
    minHeight: 52,
    backgroundColor: th.semantic.bg.raised,
  },
  input: {
    flex: 1,
    color: th.semantic.text.primary,
    paddingVertical: th.space['12'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['16'],
    paddingHorizontal: th.space['16'],
    paddingVertical: th.space['12'],
    borderRadius: th.radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  code: { width: 56 }, // fixed so names line up; codes shrink into it, never wrap
  rowText: { flex: 1 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampWrap: { alignItems: 'center', paddingVertical: th.space['16'] },
}));

function ResultRow({
  row,
  selected,
  onPick,
  locale,
}: {
  readonly row: HomeRow;
  readonly selected: boolean;
  readonly onPick: (iata: string) => void;
  readonly locale: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const iata = rowKey(row);
  const title = rowTitle(row);
  const facts = rowFacts(row, locale);
  return (
    <PressScale
      onPress={() => onPick(iata)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${iata}, ${title}, ${facts}`}
      widthClass="wide"
      testID={`home-row-${iata}`}
    >
      <View
        style={[
          styles.row,
          selected
            ? { borderColor: theme.color.yellow, backgroundColor: theme.semantic.bg.raised }
            : null,
        ]}
      >
        <Text
          variant="h3"
          color={selected ? theme.color.yellow : theme.semantic.text.primary}
          style={styles.code}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {iata}
        </Text>
        <View style={styles.rowText}>
          <Text variant="rowTitle" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={1}>
            {facts}
          </Text>
        </View>
        {selected ? (
          <View style={[styles.check, { backgroundColor: theme.color.yellow }]}>
            <Icon name="check" size={16} color={theme.color.ink['950']} decorative />
          </View>
        ) : null}
      </View>
    </PressScale>
  );
}

function HomeStamp({ iata, locale }: { readonly iata: string; readonly locale: string }) {
  const theme = useTheme();
  const base = homeBaseFor(airportDataset(), iata);
  const ink = useSharedValue(0);
  const breathe = useOnboardingLoop(STAMP_BREATHE);
  useEffect(() => {
    ink.value = 0;
    ink.value = withTiming(1, { duration: tokens.motion.duration.base });
    // Re-inks for each new pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iata]);
  const inkStyle = useAnimatedStyle(() => ({
    opacity: ink.value,
    transform: [{ scale: 0.9 + ink.value * 0.1 }],
  }));
  if (base === null) return null;
  const home = upper(t({ id: 'onboarding.home.stampHome', message: 'Home' }), locale);
  const local = homeWord(base.country);
  return (
    <Animated.View style={[inkStyle, breathe]} testID="home-stamp">
      <Stamp
        title={upper(base.city, locale)}
        top={local === home ? home : `${home} · ${local}`}
        bottom={upper(t({ id: 'onboarding.home.stampNo', message: 'Stamp No. 1' }), locale)}
        ink={theme.color.yellow}
        size={150}
        tilt={0}
      />
    </Animated.View>
  );
}

export function HomeScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const inputFont = useInputFont();
  const { setQuery, searched, results, noResults, picked, pick, next: onNext } = useHomeStep();
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a content trigger id.
  const farLine = tokekLine('home_far', locale);
  return (
    <OnboardingPage
      page={4}
      testID="onboarding-home"
      footer={
        <PillButton
          label={t({ id: 'onboarding.home.next', message: 'That’s home' })}
          onPress={onNext}
          disabled={picked === null}
          testID="onboarding-home-next"
        />
      }
    >
      <Text variant="h1" accessibilityRole="header">
        {t({ id: 'onboarding.home.title', message: 'Where’s home?' })}
      </Text>
      <Text variant="body" color={theme.semantic.text.secondary}>
        {t({
          id: 'onboarding.home.body',
          message: 'Flights and budgets start here. It’s also your first stamp.',
        })}
      </Text>
      <View style={styles.search}>
        <Icon name="plane" size={20} color={theme.semantic.text.secondary} decorative />
        {/* Uncontrolled: the native field owns the typed text. A value written back from state
            can arrive after the next keystroke on a busy JS thread and reorder letters ("Sngi"). */}
        <TextInput
          onChangeText={setQuery}
          placeholder={t({ id: 'onboarding.home.search', message: 'City, airport or code' })}
          placeholderTextColor={theme.semantic.text.tertiary}
          accessibilityLabel={t({ id: 'onboarding.home.search', message: 'City, airport or code' })}
          autoCorrect={false}
          autoCapitalize="words"
          style={[styles.input, inputFont]}
          testID="home-search"
        />
      </View>
      <View testID="home-results">
        {results.rows.map((row) => (
          <ResultRow
            key={rowKey(row)}
            row={row}
            selected={picked === rowKey(row)}
            onPick={pick}
            locale={locale}
          />
        ))}
      </View>
      {noResults ? (
        <TokekSays
          testID="home-no-results"
          line={t({
            id: 'onboarding.home.noResults',
            message: `No airport called “${searched}”. Try a city or a three-letter code.`,
          })}
        />
      ) : null}
      {searched.length === 0 && results.farMinutes !== null ? (
        <TokekSays
          testID="home-far"
          line={t({
            id: 'onboarding.home.far',
            message: `Nearest is ${driveLabel(results.farMinutes)}. ${farLine}`,
          })}
        />
      ) : null}
      {picked !== null ? (
        <View style={styles.stampWrap}>
          <HomeStamp iata={picked} locale={locale} />
        </View>
      ) : null}
    </OnboardingPage>
  );
}
