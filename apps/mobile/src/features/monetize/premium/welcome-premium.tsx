/**
 * Welcome to Pass+ · admitted (9.15) on the night ground: the visa drops in, the green ADMITTED
 * stamp lands (1.07) with confetti, the gecko cheers, the perks tick in one by one, and the gold
 * button tries the Stamp icon. It celebrates only once the server says Pass+ is on; a restore is
 * welcomed without the party.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { mrzLine } from '@/ui/documents/mrz';
import {
  CritterSticker,
  Icon,
  LoadingCritter,
  REDUCED_FADE,
  SPRINGS,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { useScreenInsets } from '@/ui/premium/shell';
import { useNoBackByDesign } from '@/lib/qa/back-affordance';

import { useWelcomeScreen } from '../welcome/use-welcome-screen';
import { Confetti } from './components/confetti';
import { GoldButton } from './components/gold-button';
import { InkStamp } from './components/ink-stamp';
import { NIGHT, NightGlass, NightGround } from './components/night';
import { PopIn } from './components/pop-in';
import { StampIcon } from './components/stamp-icon';
import { StampSlam } from './components/stamp-slam';
import { VisaCard } from './components/visa-card';
import { PAPER } from './monetize-palette';

export function WelcomePremium() {
  useNoBackByDesign();
  const { t, i18n } = useLingui();
  const th = usePremiumTheme();
  const locale = useLocale();
  const insets = useScreenInsets();
  const reduced = usePremiumReducedMotion();
  const props = useWelcomeScreen();
  const name = props.name.trim();
  const party = props.passPlus && props.celebrate;
  const [hit, setHit] = useState(!props.celebrate);

  const drop = useSharedValue(0);
  useEffect(() => {
    if (!props.passPlus) return;
    drop.set(reduced ? withTiming(1, REDUCED_FADE) : withDelay(360, withSpring(1, SPRINGS.smooth)));
  }, [props.passPlus, reduced, drop]);
  const visa = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [
      { translateY: -40 * (1 - drop.value) },
      { rotate: `${String(-4 * (1 - drop.value))}deg` },
    ],
  }));

  if (!props.passPlus) {
    return (
      <NightGround
        style={{
          paddingTop: insets.top + 80,
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 20,
        }}
      >
        <View style={styles.flex} testID="welcome-waiting">
          <Text variant="display" color={NIGHT.text} accessibilityRole="header">
            {t({ id: 'monetize.welcome.waiting', message: 'Almost there' })}
          </Text>
          <Text variant="body" color={NIGHT.textSoft} style={styles.gap}>
            {t({
              id: 'monetize.welcome.waitingLine',
              message:
                'We’re still confirming Pass+ with the store. It turns on by itself; nothing more to pay.',
            })}
          </Text>
          <LoadingCritter
            label={t({
              id: 'monetize.premium.welcomeWaiting',
              message: 'Tokek is checking with the store…',
            })}
          />
        </View>
        <TextButton
          label={t({ id: 'monetize.welcome.done', message: 'Done' })}
          color={NIGHT.textSoft}
          onPress={props.onDone}
          testID="welcome-done"
        />
      </NightGround>
    );
  }

  return (
    <NightGround>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 24,
          paddingBottom: 16,
          gap: 16,
        }}
        testID="welcome"
      >
        <Animated.View style={visa}>
          <VisaCard
            title={t({ id: 'monetize.paywall.passPlus', message: 'Pass+' })}
            header={upper(
              t({ id: 'monetize.paywall.visaEyebrow', message: 'Visa · For you · Pour vous' }),
              locale,
            )}
            page={t({ id: 'monetize.paywall.page', message: 'PAGE 07' })}
            price={null}
            priceNote={null}
            fields={[
              [t({ id: 'monetize.paywall.holder', message: 'Holder' }), name],
              [
                t({ id: 'monetize.paywall.entries', message: 'Entries' }),
                t({ id: 'monetize.paywall.unlimited', message: 'Unlimited' }),
              ],
              [
                t({ id: 'monetize.paywall.worksIn', message: 'Works in' }),
                t({ id: 'monetize.paywall.everyCrew', message: 'Every crew' }),
              ],
            ]}
            mrz={mrzLine(['V', 'CPPASS', 'PLUS', name])}
            height={250}
            iconLabel={t({ id: 'monetize.premium.stampIcon', message: 'The Stamp app icon' })}
            accessibilityLabel={t({
              id: 'monetize.welcome.visaLabel',
              message: `Pass+ visa, holder ${name}`,
            })}
            testID="welcome-visa"
          >
            <View style={styles.stamp} pointerEvents="none">
              <StampSlam
                play
                delay={props.celebrate ? 1560 : 0}
                from={party ? 2.2 : 1}
                fall={party ? 120 : 0}
                rotate={-12}
                onImpact={() => setHit(true)}
              >
                <InkStamp
                  word={upper(t({ id: 'monetize.welcome.admitted', message: 'Admitted' }), locale)}
                  top={upper(t({ id: 'monetize.welcome.entry', message: 'Entry' }), locale)}
                  bottom={upper(props.admittedOn, locale)}
                  ink={th.stamp.green.ring}
                  fill={PAPER.showThrough}
                  size={120}
                  wordSize={19}
                  testID="welcome-stamp"
                />
              </StampSlam>
            </View>
          </VisaCard>
        </Animated.View>
        <View style={styles.gecko} pointerEvents="none">
          <PopIn play={hit} delay={props.celebrate ? 960 : 0}>
            <CritterSticker kind="gecko" name="Tokek" size={110} pose="cheer" />
          </PopIn>
        </View>
        <Text
          variant="largeTitle"
          color={NIGHT.text}
          accessibilityRole="header"
          testID="welcome-title"
        >
          {name === ''
            ? t({ id: 'monetize.welcome.title', message: 'You’re in' })
            : t({ id: 'monetize.welcome.titleNamed', message: `You’re in, ${name}` })}
        </Text>
        {props.renewal === null ? null : (
          <Text variant="rowText" color={NIGHT.textSoft} testID="welcome-renewal">
            {props.renewal}
          </Text>
        )}
        {props.perks.length === 0 ? null : (
          <NightGlass style={styles.perks}>
            {props.perks.map((perk, i) => (
              <View
                key={perk.key}
                style={[
                  styles.perk,
                  i > 0
                    ? { borderTopWidth: th.size.hairline, borderTopColor: NIGHT.hairline }
                    : null,
                ]}
              >
                <PopIn play={hit} delay={props.celebrate ? 1440 + i * 360 : 0}>
                  <View style={[styles.tick, { backgroundColor: th.accent.mint }]}>
                    <Icon name="check" size={14} color={th.color.onAccent} />
                  </View>
                </PopIn>
                <Text variant="toast" color={NIGHT.text} style={styles.flex}>
                  {i18n._(perk.copy)}
                </Text>
              </View>
            ))}
          </NightGlass>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 12, gap: 6 }}>
        {props.onPickIcon === undefined ? null : (
          <GoldButton
            label={t({ id: 'monetize.premium.tryStamp', message: 'Try the Stamp icon' })}
            onPress={props.onPickIcon}
            leading={
              <StampIcon
                size={30}
                shape="icon"
                label={t({ id: 'monetize.premium.stampIcon', message: 'The Stamp app icon' })}
              />
            }
            testID="welcome-pick-icon"
          />
        )}
        <TextButton
          label={t({ id: 'monetize.welcome.done', message: 'Done' })}
          color={NIGHT.textSoft}
          onPress={props.onDone}
          testID="welcome-done"
        />
      </View>
      <Confetti fire={party && hit} x={0.3} y={0.33} count={44} />
    </NightGround>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { marginTop: 8, marginBottom: 24 },
  stamp: { position: 'absolute', right: 20, bottom: 30 },
  gecko: { position: 'absolute', right: 18, top: 300 },
  perks: { borderRadius: 26, paddingHorizontal: 16, paddingVertical: 6 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  tick: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
