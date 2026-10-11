/**
 * A booking found in someone's inbox, a paste or a scan (7.03): its kind tile tilted, the title
 * and line, "From Alex's email" and "Split 6 ways" (a toggle), then Add (ink) and Ignore. One still
 * being read says the guide is reading it; one that could not be read offers Add by hand.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { IconTile, turn } from '@/features/trip';
import { Button, Skeleton, StatusTag, Text, Toggle, usePremiumTheme } from '@/ui/premium';

import { useCandidateLine } from '../../candidates/candidate-line';
import type { CandidateView } from '../../candidates/candidate-model';
import { useWalletGuide } from '../../data/wallet-guide';
import { kindLook } from './kind-look';

export function CandidateCard(props: {
  readonly view: CandidateView;
  readonly split: boolean;
  readonly tz: string | undefined;
  readonly onSplit: (next: boolean) => void;
  readonly onAdd: () => void;
  readonly onIgnore: () => void;
  readonly onByHand: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { name: guideName } = useWalletGuide();
  const { view } = props;
  const line = useCandidateLine(view, props.tz);
  const testID = `bookings-candidate-${view.id}`;
  const card = [
    styles.card,
    { borderRadius: th.radius.cardRow, backgroundColor: th.color.card, boxShadow: th.shadow.card },
  ];
  if (view.state === 'parsing') {
    return (
      <View style={card} testID={`${testID}-parsing`}>
        <Text variant="caption" tone="muted">
          {t({ id: 'bookings.candidate.parsing', message: `${guideName} is reading it…` })}
        </Text>
        <Skeleton height={14} radius={7} />
      </View>
    );
  }
  const booking = view.booking;
  const look = kindLook(booking?.kind ?? 'other', th.color);
  const title = booking?.title ?? t({ id: 'bookings.candidate.untitled', message: 'A booking' });
  const head = (
    <View style={styles.head}>
      <View style={{ transform: [turn(-6)] }}>
        <IconTile name={look.icon} bg={look.bg} color={look.color} size={48} />
      </View>
      <View style={styles.flex}>
        <Text variant="headline" numberOfLines={2}>
          {title}
        </Text>
        {line === '' ? null : (
          <Text variant="caption" tone="muted">
            {line}
          </Text>
        )}
      </View>
    </View>
  );
  if (view.state === 'failed' || view.state === 'duplicate') {
    const failed = view.state === 'failed';
    return (
      <View style={card} testID={`${testID}-${view.state}`}>
        {booking === null ? null : head}
        <Text variant="rowText">
          {!failed
            ? t({ id: 'bookings.candidate.duplicate', message: 'Already in the wallet.' })
            : view.failureReason === 'flight_not_found'
              ? t({
                  id: 'bookings.candidate.flightNotFound',
                  message: 'Add the date and route, or add it by hand.',
                })
              : t({
                  id: 'bookings.candidate.failed',
                  message: 'Couldn’t read this one — add it by hand.',
                })}
        </Text>
        <View style={styles.pair}>
          {failed ? (
            <View style={styles.flex}>
              <Button
                label={t({ id: 'bookings.candidate.byHand', message: 'Add by hand' })}
                size="medium"
                onPress={props.onByHand}
                testID={`${testID}-by-hand`}
              />
            </View>
          ) : null}
          <View style={styles.flex}>
            <Button
              label={t({ id: 'bookings.candidate.dismiss', message: 'Dismiss' })}
              size="medium"
              variant="control"
              onPress={props.onIgnore}
              testID={`${testID}-dismiss`}
            />
          </View>
        </View>
      </View>
    );
  }
  const who = view.fromMember;
  return (
    <View style={card} testID={testID}>
      {head}
      <View style={styles.tags}>
        {who === null ? null : (
          <StatusTag
            label={t({ id: 'bookings.candidate.from', message: `From ${who}’s email` })}
            tone="rain"
          />
        )}
        {view.canSplit ? (
          <View style={styles.split}>
            <Text variant="caption">
              {t({
                id: 'bookings.candidate.split',
                message: plural(view.travellerIds.length, {
                  one: 'Split # way',
                  other: 'Split # ways',
                }),
              })}
            </Text>
            <Toggle
              value={props.split}
              onChange={props.onSplit}
              accessibilityLabel={t({
                id: 'bookings.candidate.splitA11y',
                message: 'Split the price',
              })}
              testID={`${testID}-split`}
            />
          </View>
        ) : null}
      </View>
      {view.needsConfirm ? (
        <Text variant="caption" color={th.color.status.tangerine.text}>
          {t({
            id: 'bookings.candidate.check',
            message: 'Something in this email looked odd. Check it before you add it.',
          })}
        </Text>
      ) : null}
      <View style={styles.pair}>
        <View style={styles.flex}>
          <Button
            label={t({ id: 'bookings.candidate.add', message: 'Add' })}
            size="medium"
            onPress={props.onAdd}
            testID={`${testID}-add`}
          />
        </View>
        <View style={styles.flex}>
          <Button
            label={t({ id: 'bookings.candidate.ignore', message: 'Ignore' })}
            size="medium"
            variant="control"
            onPress={props.onIgnore}
            testID={`${testID}-ignore`}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  tags: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  split: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  pair: { flexDirection: 'row', gap: 8 },
});
