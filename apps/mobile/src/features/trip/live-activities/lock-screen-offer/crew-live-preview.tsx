/**
 * The small lock screen inside the offer sheet (5a-6): the clock, and the crew-live card with the
 * meet-up's time and the crew along one line. An illustration of the Live Activity drawn in the
 * app, so the sheet shows what the perk looks like before anyone has bought it.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { Avatar } from '@/ui/people/Avatar';
import { Tag } from '@/ui/plan/ActionPill';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { previewDots, type OfferFacts } from './offer-model';

const LANE_HEIGHT = 44;
const DOT = 24;
const ROW_SHIFT = 7;

const useStyles = makeStyles((th) => ({
  screen: {
    backgroundColor: th.semantic.bg.sunken,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
    gap: th.space['8'],
    alignItems: 'center',
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: th.color.ink['900'],
    borderRadius: th.radius.md,
    paddingHorizontal: th.space['12'],
    paddingVertical: th.space['8'],
    gap: th.space['4'],
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lane: { height: LANE_HEIGHT, justifyContent: 'center' },
  line: { height: 3, borderRadius: 2, backgroundColor: th.color.ink['600'] },
  dot: { position: 'absolute' },
}));

export interface CrewLivePreviewProps {
  readonly facts: OfferFacts;
  /** The lock screen's clock ("16:38"). */
  readonly clock: string;
  /** The meet-up's time ("17:00"); null when no meet-up is set. */
  readonly meetTime: string | null;
}

export function CrewLivePreview({ facts, clock, meetTime }: CrewLivePreviewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const span = Math.max(0, width - DOT);
  return (
    <View style={styles.screen} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text variant="h2" color={theme.color.paper.base}>
        {clock}
      </Text>
      <View style={styles.card}>
        <View style={styles.head}>
          <Text variant="eyebrow" color={theme.color.yellow}>
            {meetTime === null
              ? t({ id: 'trip.lockScreen.preview.meetUp', message: 'Meet-up' })
              : t({
                  id: 'trip.lockScreen.preview.meetUpAt',
                  message: `Meet-up · ${meetTime}`,
                })}
          </Text>
          <Tag
            label={t({ id: 'trip.lockScreen.preview.boost', message: 'Boost' })}
            color={theme.color.pink}
            textColor={theme.color.ink['930']}
          />
        </View>
        <View style={styles.lane} onLayout={onLayout}>
          <View style={styles.line} />
          {width > 0
            ? previewDots(facts.crew).map((dot) => (
                <View
                  key={dot.joinIndex}
                  style={[
                    styles.dot,
                    {
                      start: span * dot.x,
                      top: (LANE_HEIGHT - DOT) / 2 + dot.row * ROW_SHIFT,
                    },
                  ]}
                >
                  <Avatar name={dot.name} joinIndex={dot.joinIndex} size="sm" decorative />
                </View>
              ))
            : null}
        </View>
      </View>
    </View>
  );
}
