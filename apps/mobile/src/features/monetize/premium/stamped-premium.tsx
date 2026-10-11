/**
 * Boosted · the entry stamp (9.14): a passport page; once the server has the boost, BOOSTED lands
 * on it (1.07: fall, squash, ink ring, confetti, a heavy tap), Pon cheers, the perks pop in, and
 * the split card says who owes what. Plays once. Until the server confirms, the page waits.
 */
/* eslint-disable lingui/no-unlocalized-strings -- colour values, never copy. */
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  CritterSticker,
  CrewStack,
  LoadingCritter,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';

import { useStampedScreen } from '../boost/use-stamped-screen';
import { useBillingRows } from '../data/use-billing-rows';
import { perkLines } from '../perks/perk-copy';
import { Confetti } from './components/confetti';
import { seatColour } from './components/crew-colours';
import { InkRipple } from './components/ink-ripple';
import { InkStamp } from './components/ink-stamp';
import { PerkChip } from './components/perk-chip';
import { PopIn } from './components/pop-in';
import { StampSlam } from './components/stamp-slam';
import { MONETIZE_INK, PAPER } from './monetize-palette';

const PAPER_MUTED = PAPER.muted;

export function StampedPremium() {
  useNoBackByDesign();
  const { t, i18n } = useLingui();
  const th = usePremiumTheme();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const props = useStampedScreen();
  const rows = useBillingRows();
  const PAPER_INK = th.color.onAccent;
  const STAMP_RING = th.stamp.pink.ring;
  const STAMP_TEXT = th.stamp.pink.text;
  const PAPER_INK = th.color.onAccent;
  const STAMP_RING = th.stamp.pink.ring;
  const STAMP_TEXT = th.stamp.pink.text;
  const perks = perkLines(rows.perks, 'boost').slice(0, 4);
  const [hit, setHit] = useState(false);
  const owing = props.owing ?? [];
  const names = format.list(
    locale,
    owing.map((m) => m.name),
  );
  const each = props.eachShare ?? null;
  const dots = [th.accent.pink, th.accent.sky, th.accent.mint, th.accent.sun];
  const line = !props.boosted
    ? t({
        id: 'monetize.stamped.finishingLine',
        message:
          'You’ve paid. The boost turns on by itself in a moment; there is nothing more to do.',
      })
    : !props.split
      ? t({ id: 'monetize.stamped.coverLine', message: 'It’s on for the whole crew, on you.' })
      : owing.length > 0 && each !== null
        ? owing.length === 1
          ? t({
              id: 'monetize.stamped.owesLine',
              message: `${names} owes you ${each}. It’s in Balances.`,
            })
          : t({
              id: 'monetize.stamped.oweLine',
              message: `${names} each owe you ${each}. It’s in Balances.`,
            })
        : t({
            id: 'monetize.stamped.splitPending',
            message: 'The boost is on. The split is still being added to Balances.',
          });

  return (
    <View
      style={[styles.page, { paddingTop: insets.top + 12, backgroundColor: th.accent.paper }]}
      testID="stamped"
    >
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 16 }]}>
        <View style={styles.header}>
          <Text variant="mono" color={PAPER_MUTED}>
            {t({ id: 'monetize.compare.chrome', message: 'ENTRIES · ENTRÉES' })}
          </Text>
          <Text variant="mono" color={PAPER_MUTED}>
            {t({ id: 'monetize.compare.page', message: 'PAGE 08' })}
          </Text>
        </View>
        <View style={styles.stage}>
          {props.boosted ? (
            <>
              <InkRipple fire={hit} color={STAMP_RING} width={280} height={160} radius={24} />
              <StampSlam
                play
                delay={600}
                from={2.3}
                fall={140}
                spin={-30}
                rotate={-7}
                onImpact={() => setHit(true)}
              >
                <InkStamp
                  shape="rect"
                  size={270}
                  height={150}
                  ink={STAMP_RING}
                  text={STAMP_TEXT}
                  top={upper(props.crew, locale)}
                  word={upper(t({ id: 'monetize.stamped.stamp', message: 'Boosted' }), locale)}
                  bottom={upper(
                    props.window === ''
                      ? props.destination
                      : `${props.destination} · ${props.window}`,
                    locale,
                  )}
                  wordSize={52}
                  testID="stamped-stamp"
                />
              </StampSlam>
              <View style={styles.pon} pointerEvents="none">
                <PopIn play={hit} delay={570}>
                  <CritterSticker kind="tanuki" name="Pon" size={120} pose="cheer" />
                </PopIn>
              </View>
            </>
          ) : (
            <View testID="stamped-pending">
              <LoadingCritter
                label={t({
                  id: 'monetize.premium.stampedWaiting',
                  message: 'Pon is fetching your stamp…',
                })}
                critter={{ kind: 'tanuki', name: 'Pon' }}
              />
            </View>
          )}
        </View>
        <Text variant="display" color={PAPER_INK} accessibilityRole="header" testID="stamped-title">
          {props.boosted
            ? props.split
              ? t({ id: 'monetize.stamped.crewIn', message: 'The crew’s in' })
              : t({ id: 'monetize.stamped.onYou', message: `${props.destination} is boosted` })
            : t({ id: 'monetize.stamped.finishing', message: 'Finishing up' })}
        </Text>
        {props.boosted ? (
          <PopIn play={hit} delay={810}>
            <Text variant="guide" color={MONETIZE_INK.guideOnPaper}>
              {t({
                id: 'monetize.premium.stampedGuide',
                message: 'Unlimited redrafts. I already have ideas.',
              })}
            </Text>
          </PopIn>
        ) : null}
        <View style={styles.chips}>
          {props.boosted
            ? perks.map((perk, i) => (
                <PopIn key={perk.key} play={hit} delay={1170 + i * 240}>
                  <PerkChip
                    label={i18n._(perk.copy)}
                    color={dots[i % dots.length] ?? th.accent.pink}
                    mark="tick"
                    height={34}
                  />
                </PopIn>
              ))
            : null}
        </View>
        <View
          style={[styles.split, { backgroundColor: th.accent.paper, boxShadow: th.shadow.card }]}
          testID="stamped-owing"
        >
          {owing.length > 0 ? (
            <CrewStack
              members={owing.map((m, i) => ({
                id: m.uid,
                name: m.name,
                color: seatColour(th, i + 1),
              }))}
              size={28}
              accessibilityLabel={names}
            />
          ) : null}
          <Text variant="note" color={PAPER_INK} style={styles.flex} testID="stamped-line">
            {line}
          </Text>
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {props.onTell === undefined ? null : (
          <Button
            label={
              props.told
                ? t({ id: 'monetize.stamped.told', message: 'The crew knows' })
                : t({ id: 'monetize.stamped.tell', message: 'Tell the crew' })
            }
            onPress={props.onTell}
            disabled={props.told === true}
            loading={props.telling === true}
            testID="stamped-tell"
          />
        )}
        {props.onTell === undefined ? (
          <Button
            label={t({ id: 'monetize.welcome.done', message: 'Done' })}
            onPress={props.onDone}
            testID="stamped-done"
          />
        ) : (
          <TextButton
            label={t({ id: 'monetize.welcome.done', message: 'Done' })}
            onPress={props.onDone}
            testID="stamped-done"
          />
        )}
      </View>
      <Confetti fire={hit} x={0.5} y={0.3} count={48} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    experimental_backgroundImage:
      'repeating-linear-gradient(115deg, rgba(23,20,42,0.035) 0 1px, transparent 1px 6px)',
  },
  content: { paddingHorizontal: 24, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  stage: { height: 260, alignItems: 'center', justifyContent: 'center' },
  pon: { position: 'absolute', right: -8, bottom: -12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  split: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, padding: 14 },
  flex: { flex: 1 },
  footer: { paddingHorizontal: 24, gap: 6, alignItems: 'stretch' },
});
