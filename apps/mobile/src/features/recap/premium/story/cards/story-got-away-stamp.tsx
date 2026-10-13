/**
 * Two story cards. The one that got away: its gold silhouette, its name and story in the guide's
 * hand, and the forms found of all, the missed one in gold. The passport stamp: a paper page with
 * the trip's stamp slammed on (the place, the arrival and the dates), older stamps faint beneath,
 * and the crew who signed it.
 */
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  Avatar,
  CritterSticker,
  RectStamp,
  RoundStamp,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import type { GotAwayCardProps } from '../../../story/story-card-views';
import type { StampCardProps } from '../../../story/story-card-views';
import { CardFrame, FormSticker } from './card-frame';
import { useClockReached } from './use-clock';
import { popIn } from '../../entrances';

export function PremiumGotAwayCard(props: GotAwayCardProps) {
  const th = usePremiumTheme();
  return (
    <CardFrame testID="recap-card-got-away">
      <Text variant="label" tone="muted">
        {props.eyebrow}
      </Text>
      <View style={{ alignItems: 'center', marginVertical: 20 }}>
        <CritterSticker
          kind={props.kind}
          name={props.city}
          size={180}
          variant="mask"
          maskColor={th.color.lockedMaskGold}
        />
      </View>
      <Text variant="display" accessibilityRole="header" testID="recap-got-away-name">
        {props.name}
      </Text>
      <Text variant="guide" color={th.color.status.maybe.text} testID="recap-got-away-story">
        {props.story}
      </Text>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 }}
        testID="recap-got-away-forms"
      >
        {props.forms.map((form) =>
          form.found ? (
            <FormSticker key={form.row.id} row={form.row} size={52} />
          ) : (
            <CritterSticker
              key={form.row.id}
              kind={props.kind}
              name={props.city}
              size={52}
              variant="mask"
              maskColor={form.gotAway ? th.color.lockedMaskGold : th.color.lockedMask}
            />
          ),
        )}
        <Text variant="badge" tone="muted">
          {props.formsLabel}
        </Text>
      </View>
    </CardFrame>
  );
}

export function PremiumStampCard(props: StampCardProps) {
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const slammed = useClockReached(700);
  return (
    <CardFrame ground={th.accent.paper} testID="recap-card-stamp">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="label" tone="muted">
          {props.chrome}
        </Text>
        {props.page === null ? null : (
          <Text variant="label" tone="muted">
            {props.page}
          </Text>
        )}
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', top: 10, left: 0, gap: 10, opacity: 0.35 }}>
          {props.older.slice(0, 3).map((older, index) => (
            <RectStamp
              key={older.id}
              word={older.title.toLocaleUpperCase()}
              rotate={index % 2 === 0 ? -6 : 5}
            />
          ))}
        </View>
        {slammed ? (
          <Animated.View entering={popIn(reduced, 'lively')} testID="recap-stamp">
            <RoundStamp
              word={props.place.toLocaleUpperCase()}
              top={props.top}
              bottom={props.bottom}
              size={200}
              rotate={-10}
            />
          </Animated.View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }} testID="recap-signatures">
        {props.signers.map((signer) => (
          <View
            key={signer.userId}
            style={{ alignItems: 'center', gap: 2 }}
            testID={`recap-signature-${signer.userId}`}
          >
            <Avatar name={signer.name} color={signer.color} size={36} />
            <Text variant="badge" tone="muted">
              {signer.name}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="rowTitle" style={{ marginTop: 12 }}>
        {props.caption}
      </Text>
      <Text variant="captionMuted" tone="muted">
        {props.detail}
      </Text>
    </CardFrame>
  );
}
