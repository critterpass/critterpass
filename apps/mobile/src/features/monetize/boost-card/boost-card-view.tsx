/**
 * The crew's boost card (4c-1): who boosted where, the perks the server lists for a boost, the
 * viewer's own share to settle and a one-time thanks; under it the guide's line and the live
 * SETTLED row. A boost that was refunded or moved keeps its place, greyed, with the reason.
 */
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { ChatRichCard } from '@/ui/chat/ChatRichCard';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { GuideLine } from '@/ui/people/GuideLine';
import { PressScale } from '@/ui/press/PressScale';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, sizeToken, useTheme } from '@/ui/theme';

import type { BoostCardModel } from './boost-card-model';

export interface BoostCardViewProps {
  readonly model: BoostCardModel;
  /** The buyer's first name; empty when nobody bought it (a free first trip, a gift). */
  readonly buyer: string;
  readonly destination: string;
  /** The trip's dates, formatted; empty when it has none yet. */
  readonly dates: string;
  /** Short perk chips, from the server's switched-on boost perks. */
  readonly perks: readonly string[];
  /** The viewer's share, formatted, when they owe one. */
  readonly share: string | null;
  /** The trip's guide and its line under the card; null says nothing. */
  readonly guide: { readonly id: string; readonly name: string; readonly line: string } | null;
  readonly thanking?: boolean;
  readonly onSettle: () => void;
  readonly onThanks: () => void;
}

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.brand.boost,
    borderRadius: th.radius.xl,
    padding: th.space['16'],
    gap: th.space['12'],
  },
  gone: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.xl,
    padding: th.space['16'],
    gap: th.space['4'],
  },
  titles: { flex: 1, gap: th.space['2'] },
  chip: {
    backgroundColor: th.color.ink['850'],
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
  },
  action: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: sizeToken(th.size.primaryCta, 'radius'),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: th.space['12'],
    borderWidth: th.space['2'],
    borderColor: th.color.ink['850'],
  },
  filled: { backgroundColor: th.color.ink['850'] },
  quiet: { opacity: 0.6 },
}));

export function BoostCardView(props: BoostCardViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { model, buyer, destination } = props;
  const ink = theme.color.ink['850'];
  const pink = theme.semantic.brand.boost;

  if (model.kind === 'loading') return <Skeleton preset="card" />;

  const title =
    buyer === ''
      ? t({ id: 'monetize.card.titleNoBuyer', message: `${destination} is boosted` })
      : t({ id: 'monetize.card.title', message: `${buyer} boosted ${destination}` });

  if (model.kind === 'gone') {
    return (
      <View style={styles.gone} accessible testID="boost-card-gone">
        <Text variant="h3" color={theme.semantic.text.secondary}>
          {upper(title, locale)}
        </Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary} testID="boost-card-gone-line">
          {model.reason === 'revoked'
            ? t({
                id: 'monetize.card.revoked',
                message: 'This boost was refunded, so it is off and nobody owes a share.',
              })
            : t({
                id: 'monetize.card.moved',
                message: 'This boost moved to another trip.',
              })}
        </Text>
      </View>
    );
  }

  const ways = model.ways;
  const how = model.split
    ? t({ id: 'monetize.card.split', message: `split ${ways} ways` })
    : buyer === ''
      ? ''
      : t({ id: 'monetize.card.covered', message: `on ${buyer}` });
  const detail = [props.dates, how].filter((part) => part !== '').join(' · ');
  const remaining = model.remaining;
  const share = props.share;
  const settledNames = format.list(
    locale,
    model.settled.map((member) => member.name),
  );

  return (
    <Stack gap="10" testID="boost-card">
      <View style={styles.card}>
        <Row gap="12" align="center">
          {buyer === '' ? null : <Avatar name={buyer} size="md" decorative />}
          <View
            style={styles.titles}
            accessible
            accessibilityRole="header"
            accessibilityLabel={[title, detail].filter((part) => part !== '').join(', ')}
          >
            <Text variant="h3" color={ink} testID="boost-card-title">
              {upper(title, locale)}
            </Text>
            {detail === '' ? null : (
              <Text variant="label" color={ink} testID="boost-card-detail">
                {detail}
              </Text>
            )}
          </View>
        </Row>
        {props.perks.length === 0 ? null : (
          <Row gap="6" wrap>
            {props.perks.map((perk) => (
              <View key={perk} style={styles.chip}>
                <Text variant="eyebrow" color={pink}>
                  {upper(perk, locale)}
                </Text>
              </View>
            ))}
          </Row>
        )}
        {model.splitPending ? (
          <Text variant="bodySm" color={ink} testID="boost-card-split-pending">
            {t({
              id: 'monetize.card.splitPending',
              message: 'The split is still being added to Balances.',
            })}
          </Text>
        ) : null}
        {model.viewer === 'buyer' && model.split && !model.splitPending ? (
          <Text variant="label" color={ink} testID="boost-card-to-go">
            {model.allSquare
              ? t({ id: 'monetize.card.square', message: 'Everyone’s square' })
              : t({ id: 'monetize.card.toGo', message: `${remaining} still to go` })}
          </Text>
        ) : null}
        {model.viewer === 'buyer' ? null : (
          <Row gap="8">
            {share !== null ? (
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={t({
                  id: 'monetize.card.settleLabel',
                  message: `Settle ${share} with ${buyer}`,
                })}
                onPress={props.onSettle}
                style={[styles.action, styles.filled]}
                testID="boost-card-settle"
              >
                <Text variant="buttonSm" color={pink}>
                  {upper(t({ id: 'monetize.card.settle', message: `Settle ${share}` }), locale)}
                </Text>
              </PressScale>
            ) : model.viewer === 'settled' ? (
              <View style={[styles.action, styles.quiet]} accessible testID="boost-card-settled">
                <Text variant="buttonSm" color={ink}>
                  {upper(t({ id: 'monetize.card.settledMine', message: 'Settled ✓' }), locale)}
                </Text>
              </View>
            ) : null}
            {model.thanks === 'none' ? null : model.thanks === 'sent' ? (
              <View style={[styles.action, styles.quiet]} accessible testID="boost-card-thanked">
                <Text variant="buttonSm" color={ink}>
                  {upper(t({ id: 'monetize.card.thanked', message: 'Sent ♥' }), locale)}
                </Text>
              </View>
            ) : (
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={t({ id: 'monetize.card.thanks', message: `Thanks ${buyer}` })}
                disabled={props.thanking === true}
                onPress={props.onThanks}
                style={styles.action}
                testID="boost-card-thanks"
              >
                <Text variant="buttonSm" color={ink}>
                  {upper(t({ id: 'monetize.card.thanks', message: `Thanks ${buyer}` }), locale)}
                </Text>
              </PressScale>
            )}
          </Row>
        )}
      </View>
      {props.guide === null ? null : (
        <GuideLine
          guide={props.guide.id}
          name={props.guide.name}
          line={props.guide.line}
          testID="boost-card-guide"
        />
      )}
      {model.settled.length === 0 ? null : (
        <ChatRichCard
          kind="settled"
          label={upper(t({ id: 'monetize.card.settledRow', message: 'Settled' }), locale)}
          detail={
            model.allSquare
              ? t({ id: 'monetize.card.square', message: 'Everyone’s square' })
              : t({
                  id: 'monetize.card.settledDetail',
                  message: `${settledNames} · ${remaining} still to go`,
                })
          }
          people={
            <AvatarStack
              size="sm"
              members={model.settled.map((member, index) => ({
                key: member.uid,
                name: member.name,
                joinIndex: index,
              }))}
            />
          }
          testID="boost-card-settled-row"
        />
      )}
    </Stack>
  );
}
