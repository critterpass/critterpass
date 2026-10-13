/**
 * A supplier offer on a white card (built from the 7.x wallet cards): the "From Viator" tag and
 * when it was seen, the supplier's own words under THEIR WORDS, the truthful status line and hold
 * chip, the guide's note, then Book (ink) and the partner link.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { guideCritterKind } from '@/features/trip';
import { Button, GuideNote, StatusTag, Text, usePremiumTheme } from '@/ui/premium';

import type { OfferCardProps } from '../../supplier/OfferCard';
import { ErrorLine, HoldChip } from './SupplierParts';

export function OfferCardPremium(props: OfferCardProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { supplier } = props;
  return (
    <View
      testID={props.testID ?? 'supplier-offer-card'}
      style={[
        styles.card,
        {
          borderRadius: th.radius.card,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
          gap: th.space.gap12,
        },
      ]}
    >
      <View style={styles.top}>
        <StatusTag
          label={t({ id: 'suppliers.offer.from', message: `From ${supplier}` })}
          tone="maybe"
        />
        {props.seen ? (
          <Text variant="captionMuted" tone="muted" style={styles.shrink}>
            {props.seen}
          </Text>
        ) : null}
      </View>
      <View style={{ gap: th.space.gap4 }}>
        {props.verbatim ? (
          <Text variant="badge" tone="muted">
            {t({ id: 'suppliers.offer.theirWords', message: 'Their words' })}
          </Text>
        ) : null}
        <Text variant="rowTitle" testID="supplier-offer-title">
          {props.title}
        </Text>
        {(props.lines ?? []).map((line) => (
          <Text key={line} variant="rowText" tone="inkSecondary">
            {line}
          </Text>
        ))}
      </View>
      {props.status || props.holdUntil ? (
        <View style={[styles.wrap, { gap: th.space.gap8 }]}>
          {props.status ? (
            <Text variant="rowTextStrong" testID="supplier-offer-status" style={styles.shrink}>
              {props.status}
            </Text>
          ) : null}
          {props.holdUntil ? (
            <HoldChip until={props.holdUntil} onExpired={props.onHoldExpired} />
          ) : null}
        </View>
      ) : null}
      {props.note ? (
        <GuideNote
          name={props.note.name}
          text={props.note.line}
          critter={guideCritterKind(props.note.guide)}
        />
      ) : null}
      <View style={[styles.actions, { gap: th.space.gap8 }]}>
        {props.secondary ? (
          <View style={styles.flex}>
            <Button
              label={props.secondary.label}
              size="small"
              variant="secondary"
              onPress={props.secondary.onPress}
              {...(props.secondary.testID ? { testID: props.secondary.testID } : {})}
            />
          </View>
        ) : null}
        <View style={styles.flex}>
          <Button
            label={props.primary.label}
            size="small"
            loading={props.primary.loading ?? false}
            onPress={props.primary.onPress}
            {...(props.primary.testID ? { testID: props.primary.testID } : {})}
          />
        </View>
      </View>
      {props.error ? <ErrorLine text={props.error} testID="supplier-offer-error" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  wrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  actions: { flexDirection: 'row' },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
});
