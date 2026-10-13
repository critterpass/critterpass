/**
 * The lock screen as the offer pictures it: the clock over an ink Live Activity card with the
 * meet-up time, the pink Boost tag and the crew as avatars along the line to the meet-up. An
 * illustration, so assistive tech skips it; the sheet's words say the same.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Avatar, Tag, Text, usePremiumTheme } from '@/ui/premium';

import { previewDots, type OfferFacts } from '../../live-activities/lock-screen-offer/offer-model';
import { crewAccent } from '../components/crew-accent';

const LANE_HEIGHT = 44;
const DOT = 26;
const ROW_SHIFT = 7;

export interface CrewLivePreviewPremiumProps {
  readonly facts: OfferFacts;
  readonly clock: string;
  readonly meetTime: string | null;
}

export function CrewLivePreviewPremium({ facts, clock, meetTime }: CrewLivePreviewPremiumProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const span = Math.max(0, width - DOT);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.screen,
        { backgroundColor: th.color.control, borderRadius: th.radius.cardRow },
      ]}
    >
      <Text variant="stat">{clock}</Text>
      <View
        style={[
          styles.card,
          { backgroundColor: th.color.inkSurface, borderRadius: th.radius.card },
        ]}
      >
        <View style={styles.head}>
          <Text variant="badge" color={th.accent.sun}>
            {meetTime === null
              ? t({ id: 'trip.lockScreen.preview.meetUp', message: 'Meet-up' })
              : t({ id: 'trip.lockScreen.preview.meetUpAt', message: `Meet-up · ${meetTime}` })}
          </Text>
          <Tag
            label={t({ id: 'trip.lockScreen.preview.boost', message: 'Boost' })}
            color={th.accent.pink}
          />
        </View>
        <View style={styles.lane} onLayout={onLayout}>
          <View style={[styles.line, { backgroundColor: th.color.inkSecondary }]} />
          {width > 0
            ? previewDots(facts.crew).map((dot) => (
                <View
                  key={dot.joinIndex}
                  style={[
                    styles.dot,
                    { start: span * dot.x, top: (LANE_HEIGHT - DOT) / 2 + dot.row * ROW_SHIFT },
                  ]}
                >
                  <Avatar name={dot.name} color={crewAccent(dot.joinIndex)} size={DOT} ringed />
                </View>
              ))
            : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 12, gap: 8, alignItems: 'center' },
  card: { alignSelf: 'stretch', paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lane: { height: LANE_HEIGHT, justifyContent: 'center' },
  line: { height: 3, borderRadius: 2 },
  dot: { position: 'absolute' },
});
