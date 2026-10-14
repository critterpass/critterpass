/**
 * 2.09 / 2.10 "Where's home?": a search over the bundled airports (offline too), the nearest ones
 * from the network hint on top, a picked row in the warm tint with an ink check, and the orange
 * HOME stamp landing on the page (the keyboard steps aside when a row is picked). Nothing found
 * says so and keeps the airports near you below.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { Keyboard, View } from 'react-native';

import { homeBaseFor } from '@cp/domain';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  CritterSticker,
  GuideNote,
  RoundStamp,
  SearchField,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import { airportDataset, homeWord, tokekLine } from '../../content';
import { guideFacts } from '../../guide-faces';
import { driveLabel } from '../../home/home-rows';
import { useHomeStep } from '../../home/use-home-step';
import { StampLanding } from '../components/StampLanding';
import { WizardPage } from '../components/WizardPage';
import { Rows, TownCard } from './home-rows-view';

export function PremiumHomePage() {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const step = useHomeStep();
  const tokek = guideFacts('tokek');
  const base = step.picked === null ? null : homeBaseFor(airportDataset(), step.picked);
  const near = step.near;
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
      {/* Uncontrolled: the native field owns the typed text, so a busy JS thread never reorders
          letters. */}
      <SearchField
        surface="white"
        onChangeText={step.setQuery}
        accessibilityLabel={t({ id: 'onboarding.home.search', message: 'City, airport or code' })}
        autoCorrect={false}
        autoCapitalize="words"
        testID="home-search"
      />
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
      {step.didYouMean === null ? null : (
        <View style={{ gap: theme.space.gap8 }}>
          <Text variant="label" tone="muted">
            {t({ id: 'onboarding.premium.home.didYouMean', message: 'Did you mean' })}
          </Text>
          <TownCard
            guess={step.didYouMean}
            picked={step.picked === step.didYouMean.iata}
            onUse={() => pick(step.didYouMean?.iata ?? '')}
          />
        </View>
      )}
      <Rows rows={step.results.rows} picked={step.picked} onPick={pick} testID="home-results" />
      {near.length > 0 ? (
        <View style={{ gap: theme.space.gap8 }}>
          <Text variant="label" tone="muted">
            {t({ id: 'onboarding.premium.home.near', message: 'Airports near you' })}
          </Text>
          <Rows rows={near} picked={step.picked} onPick={pick} testID="home-near" />
        </View>
      ) : null}
      {step.noResults && step.canLocate ? (
        <View style={{ gap: theme.space.gap10, alignItems: 'center' }}>
          <Button
            label={t({ id: 'onboarding.premium.home.locate', message: 'Use my location' })}
            variant="secondary"
            icon="pin"
            loading={step.locate === 'locating'}
            onPress={step.locateMe}
            testID="home-locate"
          />
          <Text variant="caption" tone="muted" align="center" testID="home-locate-line">
            {step.locate === 'denied'
              ? t({
                  id: 'onboarding.premium.home.locateDenied',
                  message: 'Location is off for CritterPass. Search for your town instead.',
                })
              : step.locate === 'no_fix'
                ? t({
                    id: 'onboarding.premium.home.locateNoFix',
                    message: 'Couldn’t find you just now. Search for your town instead.',
                  })
                : t({
                    id: 'onboarding.premium.home.locateOnce',
                    message: 'Location is only used for this, once.',
                  })}
          </Text>
        </View>
      ) : null}
      {step.searched.length === 0 && step.results.farMinutes !== null ? (
        <GuideNote
          name={tokek.name}
          critter={tokek.kind}
          text={t({
            id: 'onboarding.premium.home.far',
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
              paper
              testID="home-stamp"
            />
          </StampLanding>
          {/* Tokek cheers over the stamp's lower edge (2.09). */}
          <View pointerEvents="none" style={{ position: 'absolute', right: 20, bottom: 0 }}>
            <CritterSticker kind={tokek.kind} name={tokek.name} size={96} pose="cheer" />
          </View>
        </View>
      )}
    </WizardPage>
  );
}
