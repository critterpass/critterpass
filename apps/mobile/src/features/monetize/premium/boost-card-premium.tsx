/**
 * What the crew sees in chat when a trip is boosted (9.16): a card with a dashed pink strip, the
 * buyer, the trip's dates and how it's paid, a little BOOSTED stamp, the perks, and Settle / Thanks
 * for crewmates. A refunded or moved boost greys and says so. The chat lane places it.
 */
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Avatar, Button, Card, Skeleton, Text, usePremiumTheme } from '@/ui/premium';

import type { BoostCardViewProps } from '../boost-card/boost-card-props';
import { InkStamp } from './components/ink-stamp';
import { BOOST_STRIPE } from './repeating-gradient';

export function BoostCardPremium(props: BoostCardViewProps) {
  const { t } = useLingui();
  const th = usePremiumTheme();
  const locale = useLocale();
  const { model, buyer, destination } = props;
  const share = props.share ?? '';
  if (model.kind === 'loading') return <Skeleton height={150} radius={22} />;
  const title =
    buyer === ''
      ? t({ id: 'monetize.card.titleNoBuyer', message: `${destination} is boosted` })
      : t({ id: 'monetize.card.title', message: `${buyer} boosted ${destination}` });
  if (model.kind === 'gone') {
    return (
      <Card padded radius={22} earlier testID="boost-card-gone">
        <Text variant="rowTitle" tone="muted">
          {title}
        </Text>
        <Text variant="caption" tone="muted" testID="boost-card-gone-line">
          {model.reason === 'revoked'
            ? t({
                id: 'monetize.card.revoked',
                message: 'This boost was refunded, so it is off and nobody owes a share.',
              })
            : t({ id: 'monetize.card.moved', message: 'This boost moved to another trip.' })}
        </Text>
      </Card>
    );
  }
  const { remaining, ways } = model;
  const how = model.split
    ? t({ id: 'monetize.card.split', message: `split ${ways} ways` })
    : buyer === ''
      ? ''
      : t({ id: 'monetize.card.covered', message: `on ${buyer}` });
  const detail = [props.dates, how].filter((part) => part !== '').join(' · ');
  const names = format.list(
    locale,
    model.settled.map((m) => m.name),
  );
  return (
    <Card radius={22} style={styles.card} testID="boost-card">
      <View style={[styles.strip, { experimental_backgroundImage: BOOST_STRIPE }]} />
      <View style={styles.body}>
        <View style={styles.head}>
          {buyer === '' ? null : <Avatar name={buyer} color={th.accent.sun} size={36} />}
          <View style={styles.flex}>
            <Text variant="rowTitle" style={styles.bold} numberOfLines={2}>
              {title}
            </Text>
            {detail === '' ? null : (
              <Text variant="caption" tone="muted">
                {detail}
              </Text>
            )}
          </View>
          <InkStamp
            word={upper(t({ id: 'monetize.stamped.stamp', message: 'Boosted' }), locale)}
            ink={th.stamp.pink.ring}
            text={th.stamp.pink.text}
            size={74}
            shape="rect"
            height={36}
            wordSize={12}
            rotate={10}
          />
        </View>
        {props.perks.length === 0 ? null : (
          <View style={styles.chips}>
            {props.perks.map((perk) => (
              <View
                key={perk}
                style={[styles.chip, { backgroundColor: th.color.status.voteOpen.bg }]}
              >
                <Text variant="badge" color={th.color.status.voteOpen.text}>
                  {perk}
                </Text>
              </View>
            ))}
          </View>
        )}
        {model.splitPending ? (
          <Text variant="caption" tone="muted">
            {t({
              id: 'monetize.card.splitPending',
              message: 'The split is still being added to Balances.',
            })}
          </Text>
        ) : null}
        {model.viewer === 'buyer' && model.split && !model.splitPending ? (
          <Text variant="caption" tone="muted" testID="boost-card-to-go">
            {model.allSquare
              ? t({ id: 'monetize.card.square', message: 'Everyone’s square' })
              : t({ id: 'monetize.card.toGo', message: `${remaining} still to go` })}
          </Text>
        ) : null}
        {model.viewer === 'buyer' ? null : (
          <View style={styles.buttons}>
            {model.viewer === 'owes' && props.share !== null ? (
              <View style={styles.flex}>
                <Button
                  size="medium"
                  label={t({ id: 'monetize.card.settle', message: `Settle ${share}` })}
                  onPress={props.onSettle}
                  testID="boost-card-settle"
                />
              </View>
            ) : null}
            {model.thanks === 'none' ? null : (
              <View style={styles.flex}>
                <Button
                  size="medium"
                  variant="control"
                  label={
                    model.thanks === 'sent'
                      ? t({ id: 'monetize.card.thanked', message: 'Sent ♥' })
                      : t({ id: 'monetize.card.thanks', message: `Thanks ${buyer}` })
                  }
                  onPress={props.onThanks}
                  disabled={model.thanks === 'sent'}
                  loading={props.thanking === true}
                  testID={model.thanks === 'sent' ? 'boost-card-thanked' : 'boost-card-thanks'}
                />
              </View>
            )}
          </View>
        )}
        {model.settled.length === 0 ? null : (
          <View style={[styles.settled, { backgroundColor: th.color.status.booked.bg }]}>
            <Text variant="badge" color={th.color.banner.success.text}>
              {model.allSquare
                ? t({ id: 'monetize.card.square', message: 'Everyone’s square' })
                : t({
                    id: 'monetize.premium.settledRow',
                    message: `${names} settled · ${remaining} to go`,
                  })}
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  strip: { height: 8 },
  body: { padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 26, borderRadius: 13, paddingHorizontal: 10, justifyContent: 'center' },
  buttons: { flexDirection: 'row', gap: 8 },
  settled: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
});
