/**
 * Seven's a crowd (9.20): the crew on an arc with the newcomer waiting in a dashed seat, what a
 * boost costs once they're in, and Boost or Keep it at six (the newcomer waits in line). Drawn
 * as a sheet over the page that hit the limit.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useIdleLoopRunning } from '@/motion/idle-pause';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Avatar,
  Button,
  Card,
  CrewStack,
  GuideNote,
  Tag,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import type { SeatCapViewProps } from '../seat-cap/seat-cap-props';
import { seatColour } from './components/crew-colours';
import { ModalSheet } from './components/modal-sheet';
import { MONETIZE_INK, MONETIZE_TIMING } from './monetize-palette';

const ARC = [14, 4, 0, 0, 4, 14];

function Newcomer({ name }: { readonly name: string }) {
  const reduced = usePremiumReducedMotion();
  const looping = useIdleLoopRunning(!reduced);
  const th = usePremiumTheme();
  const y = useSharedValue(0);
  useEffect(() => {
    if (!looping) {
      cancelAnimation(y);
      y.set(0);
      return;
    }
    y.set(withRepeat(withTiming(-6, { duration: MONETIZE_TIMING.newcomerBob }), -1, true));
  }, [looping, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={[styles.newcomer, style]}>
      <View
        style={[
          styles.dashed,
          { borderColor: th.color.outlineEmpty, backgroundColor: MONETIZE_INK.lilacBg },
        ]}
      >
        <Text variant="rowTitle" color={MONETIZE_INK.lilacInk}>
          {name.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.newTag}>
        <Tag label={name} color={MONETIZE_INK.lilac} rotate={-4} />
      </View>
    </Animated.View>
  );
}

export function SeatCapPremium(props: SeatCapViewProps) {
  const { t } = useLingui();
  const th = usePremiumTheme();
  const locale = useLocale();
  const { destination, cap, price, each, ways } = props;
  const seat = cap + 1;
  const name = props.invitee ?? t({ id: 'monetize.seatCap.someone', message: 'your invitee' });
  return (
    <Modal visible transparent animationType="none" onRequestClose={props.onDismiss}>
      <ModalSheet
        cancelLabel={t({ id: 'monetize.premium.cancel', message: 'Cancel' })}
        onCancel={props.onDismiss}
        testID="seat-cap-sheet"
        footer={
          <View style={{ gap: 6 }}>
            <Button
              label={
                price === null
                  ? t({ id: 'monetize.seatCap.boost', message: `Boost ${destination}` })
                  : t({
                      id: 'monetize.seatCap.boostPrice',
                      message: `Boost ${destination} · ${price}`,
                    })
              }
              onPress={props.onBoost}
              testID="seat-cap-boost"
            />
            <View style={{ alignItems: 'center' }}>
              <TextButton
                align="center"
                label={t({ id: 'monetize.seatCap.keep', message: `Keep it at ${cap}` })}
                onPress={props.onKeep}
                testID="seat-cap-keep"
              />
            </View>
          </View>
        }
      >
        <View style={{ gap: 14 }}>
          <Text variant="badge" tone="muted" style={styles.eyebrow}>
            {upper(
              t({ id: 'monetize.seatCap.eyebrow', message: `${destination} · Seat ${seat}` }),
              locale,
            )}
          </Text>
          <Text
            variant="display"
            style={styles.title}
            accessibilityRole="header"
            testID="seat-cap-title"
          >
            {cap === 6
              ? t({ id: 'monetize.seatCap.titleSix', message: 'Seven’s a crowd' })
              : t({ id: 'monetize.seatCap.title', message: 'The crew’s full' })}
          </Text>
          <Card radius={22} style={styles.seats} testID="seat-cap-seats">
            <View style={styles.arc}>
              {props.seats.slice(0, 16).map((member, i) => (
                <View
                  key={member.uid}
                  style={{
                    alignItems: 'center',
                    gap: 2,
                    transform: [{ translateY: ARC[i % ARC.length] ?? 0 }],
                  }}
                >
                  <Avatar name={member.name} color={seatColour(th, i)} uid={member.uid} size={40} />
                  <Text variant="badge" tone="placeholder">
                    {String(i + 1)}
                  </Text>
                </View>
              ))}
            </View>
            <Newcomer name={name} />
          </Card>
          <Text variant="body" tone="inkSecondary" testID="seat-cap-line">
            {t({
              id: 'monetize.seatCap.body',
              message: `Free crews top out at ${cap}. Boost ${destination} and ${name} gets a seat, with everything else a boost adds for the whole crew.`,
            })}
          </Text>
          {price === null ? null : (
            <Card padded radius={22}>
              <View style={styles.priceRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="title" style={styles.heavy} testID="seat-cap-price">
                    {each === null
                      ? price
                      : t({ id: 'monetize.seatCap.price', message: `${price}, or ${each} each` })}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {t({
                      id: 'monetize.premium.seatSplit',
                      message: `Split ${ways} ways, ${name} included`,
                    })}
                  </Text>
                </View>
                <CrewStack
                  members={props.seats.map((m, i) => ({
                    id: m.uid,
                    name: m.name,
                    color: seatColour(th, i),
                  }))}
                  max={4}
                  size={26}
                  accessibilityLabel={t({
                    id: 'monetize.seatCap.split',
                    message: `Split ${ways} ways`,
                  })}
                />
              </View>
            </Card>
          )}
          <GuideNote
            name="Pon"
            critter="tanuki"
            tint="pon"
            text={t({
              id: 'monetize.premium.seatGuide',
              message: `Or keep it at ${cap}: they wait first in line and get the next seat that opens.`,
            })}
          />
        </View>
      </ModalSheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontWeight: '800', letterSpacing: 0.8 },
  title: { fontWeight: '800' },
  heavy: { fontWeight: '800' },
  seats: { height: 150, paddingTop: 22, alignItems: 'center' },
  arc: { flexDirection: 'row', gap: 6 },
  newcomer: { position: 'absolute', right: 18, bottom: 14, alignItems: 'center' },
  dashed: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newTag: { marginTop: -6 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
