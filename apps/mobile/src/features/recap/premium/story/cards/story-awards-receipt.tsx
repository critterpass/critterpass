/**
 * Two story cards. The crew awards: one card per award with the winner's initial, the award and
 * its line, tilted at the winner's own resting angle, the MVP tagged. Money, wrapped (8.11): the
 * headline, a paper receipt tipped −2° with a scalloped foot (its heading, dashed rules, lines and
 * total), the green PAID IN FULL stamp when everyone is square, and your share.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import {
  Avatar,
  CritterSticker,
  RoundStamp,
  Tag,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { restingAngle, type AwardsCardProps } from '../../../story/story-card-views';
import type { ReceiptCardProps } from '../../../story/story-card-views';
import { CardFrame } from './card-frame';
import { useClockReached } from './use-clock';

const RECEIPT_TILT = -2;
const STAMP_TILT = -14;
const SCALLOPS = 18;

const useStyles = makePremiumStyles((th) => ({
  award: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 22,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.raised,
  },
  receipt: {
    marginTop: 16,
    marginHorizontal: 12,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 26,
    gap: 8,
    borderRadius: 4,
    backgroundColor: th.accent.paper,
    boxShadow: th.shadow.raised,
  },
  rule: { borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: th.color.fieldBorder },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  scallops: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scallop: { width: 12, height: 12, borderRadius: 6, backgroundColor: th.color.ground },
}));

export function PremiumAwardsCard({ eyebrow, headline, awards }: AwardsCardProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  return (
    <CardFrame testID="recap-card-awards">
      <Text variant="label" tone="muted">
        {eyebrow}
      </Text>
      <Text variant="display">{headline}</Text>
      <View style={{ gap: 12, marginTop: 20 }}>
        {awards.map((award) => (
          <View
            key={award.id}
            style={[styles.award, { transform: [{ rotate: `${restingAngle(award.userId)}deg` }] }]}
            testID={`recap-award-card-${award.id}`}
          >
            <Avatar
              name={award.initial}
              color={award.mine ? th.accent.sun : th.accent.sky}
              size={44}
            />
            <View style={{ flex: 1 }}>
              <Text variant="rowTitle">{award.title}</Text>
              <Text variant="captionMuted" tone="muted">
                {award.line}
              </Text>
            </View>
            {award.mvp ? (
              <Tag
                label={t({ id: 'recap.premium.story.mvp', message: 'MVP' })}
                color={th.accent.pink}
                rotate={6}
              />
            ) : null}
          </View>
        ))}
      </View>
    </CardFrame>
  );
}

export function PremiumReceiptCard(props: ReceiptCardProps) {
  const styles = useStyles();
  const reduced = usePremiumReducedMotion();
  const stamped = useClockReached(1800);
  return (
    <CardFrame testID="recap-card-receipt">
      <Text variant="label" tone="muted">
        {props.eyebrow}
      </Text>
      <Text variant="hero">{props.headline}</Text>
      <View
        style={[styles.receipt, { transform: [{ rotate: `${RECEIPT_TILT}deg` }] }]}
        testID="recap-receipt"
      >
        <Text variant="rowTitle" align="center" testID="recap-receipt-title">
          {props.title.toLocaleUpperCase()}
        </Text>
        <Text variant="captionMuted" tone="muted" align="center">
          {props.subtitle}
        </Text>
        {props.sections.map((section, index) => (
          <View key={index} style={{ gap: 6 }}>
            <View style={styles.rule} />
            {section.map((line) => (
              <View key={line.key} style={styles.line}>
                <Text variant={line.emphasis === true ? 'rowTitle' : 'rowText'} style={{ flex: 1 }}>
                  {line.label}
                </Text>
                <Text variant={line.emphasis === true ? 'rowTitle' : 'rowText'}>{line.amount}</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={styles.rule} />
        <Text variant="captionMuted" tone="muted">
          {props.note}
        </Text>
        <Text variant="captionMuted" tone="muted" align="center">
          {props.footer}
        </Text>
        <View style={styles.scallops} pointerEvents="none">
          {Array.from({ length: SCALLOPS }, (_, index) => (
            <View key={index} style={styles.scallop} />
          ))}
        </View>
        {props.paidLabel !== null && stamped ? (
          <Animated.View
            entering={reduced ? FadeIn.duration(150) : ZoomIn.springify().damping(12)}
            style={{ position: 'absolute', right: -6, bottom: 24 }}
            testID="recap-receipt-paid"
          >
            <RoundStamp
              word={props.paidLabel.title}
              top={props.paidLabel.top}
              bottom={props.paidLabel.bottom}
              ink="green"
              size={110}
              rotate={STAMP_TILT}
            />
          </Animated.View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 }}>
        <CritterSticker kind="wallet" name={props.eyebrow} size={70} />
        {props.share === null ? null : (
          <Text variant="rowTitle" testID="recap-receipt-share">
            {props.share}
          </Text>
        )}
      </View>
    </CardFrame>
  );
}
