/**
 * The boost sheet (4b-3): this trip or every trip all year, who pays, and what happens after the
 * trip. The price on the button is the store's. A trip that is already boosted, is over, or is
 * being boosted by someone else right now says so instead of offering a button.
 */
import type { StorePlatform } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Segmented } from '@/ui/inputs/Segmented';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { PlanRadioRows, type PlanOption } from '@/ui/monetize/PlanRadioRows';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { Disclosure, usePhaseLine } from '../paywall/purchase-copy';
import type { BoostModel, BoostOption, SeatedMember, WhoPays } from './boost-model';

export interface BoostViewProps {
  readonly model: BoostModel;
  readonly destination: string;
  readonly crew: string;
  /** The trip's dates, formatted; empty while they are not set. */
  readonly dates: string;
  /** The boost's last day, formatted; null while the trip has no end date. */
  readonly windowEnd: string | null;
  readonly seated: readonly SeatedMember[];
  readonly store: StorePlatform | null;
  readonly onOption: (option: BoostOption) => void;
  readonly onWhoPays: (who: WhoPays) => void;
  readonly onBuy: () => void;
  readonly onCheckAgain: () => void;
  readonly onTerms: () => void;
  readonly onPrivacy: () => void;
}

const useStyles = makeStyles((t) => ({
  after: {
    borderRadius: t.radius.lg,
    borderWidth: t.space['2'] / 2,
    borderStyle: 'dashed',
    borderColor: t.semantic.text.tertiary,
    padding: t.size.cardInner.max,
    gap: t.space['4'],
  },
  state: {
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    padding: t.size.cardInner.max,
    gap: t.space['4'],
  },
  grow: { flex: 1 },
  centre: { textAlign: 'center' },
}));

export function BoostView(props: BoostViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const phaseLine = usePhaseLine();
  const { model, destination, crew } = props;
  const { phase, offer, tripOffer, yearOffer } = model;
  const count = model.memberUids.length;
  const each = model.eachShare ?? '';
  const lockedBy = model.lockedBy ?? '';
  const until = props.windowEnd ?? '';
  const busy = phase === 'purchasing' || phase === 'verifying';

  const closed =
    phase === 'boosted'
      ? {
          title: t({ id: 'monetize.boost.boosted', message: 'This trip is already boosted' }),
          line: t({
            id: 'monetize.boost.boostedLine',
            message: 'Unlimited redrafts, the live map and crews of 16 are on for everyone.',
          }),
        }
      : phase === 'ended'
        ? {
            title: t({ id: 'monetize.boost.ended', message: 'This trip is over' }),
            line: t({
              id: 'monetize.boost.endedLine',
              message: 'A boost only runs during a trip, so there is nothing to buy here.',
            }),
          }
        : phase === 'locked'
          ? {
              title:
                lockedBy === ''
                  ? t({ id: 'monetize.boost.locked', message: 'Someone is boosting this now' })
                  : t({
                      id: 'monetize.boost.lockedBy',
                      message: `${lockedBy} is boosting this now`,
                    }),
              line: t({
                id: 'monetize.boost.lockedLine',
                message: 'Only one of you can pay at a time. Check back in a few minutes.',
              }),
            }
          : phase === 'done'
            ? {
                title: t({ id: 'monetize.boost.done', message: 'Boosted' }),
                line: t({ id: 'monetize.boost.doneLine', message: 'It’s on for the whole crew.' }),
              }
            : null;

  const options: PlanOption[] = [];
  if (tripOffer) {
    options.push({
      id: 'trip',
      title: t({ id: 'monetize.boost.thisTrip', message: 'This trip' }),
      detail:
        props.windowEnd === null
          ? t({ id: 'monetize.boost.thisTripLine', message: 'On until a week after you land' })
          : t({
              id: 'monetize.boost.thisTripUntil',
              message: `On until a week after you land, ${until}`,
            }),
      price: tripOffer.priceString,
    });
  }
  if (yearOffer) {
    options.push({
      id: 'year',
      title: t({ id: 'monetize.boost.allYear', message: 'Every trip, all year' }),
      detail: t({
        id: 'monetize.boost.allYearLine',
        message: `Any trip ${crew} plan for a year, plus Pass+ for you. Renews yearly.`,
      }),
      price: yearOffer.priceString,
    });
  }

  const status =
    phase === 'refused'
      ? t({
          id: 'monetize.boost.refused',
          message: 'We couldn’t start the purchase. Nothing was charged; try again.',
        })
      : closed === null &&
          phase !== 'done' &&
          phase !== 'boosted' &&
          phase !== 'ended' &&
          phase !== 'locked'
        ? phaseLine(phase)
        : null;

  return (
    <Stack gap="16" testID="boost">
      <Stack gap="4">
        <Text variant="eyebrow" color={theme.color.pink}>
          {props.dates === '' ? crew : `${crew} · ${props.dates}`}
        </Text>
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'monetize.boost.title', message: `Boost ${destination}` })}
        </Text>
      </Stack>
      {closed !== null ? (
        <View style={styles.state} testID={`boost-state-${phase}`}>
          <Text variant="h3">{closed.title}</Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {closed.line}
          </Text>
        </View>
      ) : (
        <>
          {options.length > 0 ? (
            <PlanRadioRows
              label={t({ id: 'monetize.boost.title', message: `Boost ${destination}` })}
              options={options}
              value={model.option}
              onChange={(id) => props.onOption(id === 'year' ? 'year' : 'trip')}
              testID="boost-options"
            />
          ) : null}
          {model.canSplit ? (
            <Stack gap="10">
              <Segmented
                label={t({ id: 'monetize.boost.whoPays', message: 'Who pays' })}
                value={model.whoPays}
                onChange={props.onWhoPays}
                segments={[
                  {
                    value: 'cover',
                    label: t({ id: 'monetize.boost.cover', message: 'I’ll cover it' }),
                  },
                  {
                    value: 'split',
                    label: t({
                      id: 'monetize.boost.split',
                      message: `Split ${props.seated.length} ways`,
                    }),
                  },
                ]}
                testID="boost-who-pays"
              />
              {model.whoPays === 'split' ? (
                <Row gap="12" align="center">
                  <AvatarStack
                    members={props.seated.map((member, index) => ({
                      key: member.uid,
                      name: member.name,
                      joinIndex: index,
                    }))}
                    size="sm"
                  />
                  <Text
                    variant="bodySm"
                    color={theme.semantic.text.secondary}
                    style={styles.grow}
                    testID="boost-split-line"
                  >
                    {model.eachShare === null
                      ? t({
                          id: 'monetize.boost.splitLine',
                          message: `It splits ${count} ways and each share goes into Balances, like any shared expense.`,
                        })
                      : t({
                          id: 'monetize.boost.splitLineEach',
                          message: `About ${each} each goes into Balances, like any shared expense. Settle it with the rest of the trip.`,
                        })}
                  </Text>
                </Row>
              ) : null}
            </Stack>
          ) : null}
          <View style={styles.after}>
            <Text variant="eyebrow">
              {t({ id: 'monetize.boost.after', message: 'AFTER THE TRIP' })}
            </Text>
            <Text variant="bodySm">
              {t({
                id: 'monetize.boost.afterLine',
                message:
                  'The plan, album, recap and map trail stay forever. Unlimited redrafts and the live map pause until the next boost. Nobody gets removed from the crew.',
              })}
            </Text>
          </View>
          {phase === 'verify_failed' ? (
            <PillButton
              label={t({ id: 'monetize.paywall.checkAgain', message: 'Check again' })}
              tone="pink"
              onPress={props.onCheckAgain}
              block
              testID="boost-check-again"
            />
          ) : (
            <PillButton
              label={
                offer === null
                  ? t({ id: 'monetize.boost.buy', message: 'Boost' })
                  : t({ id: 'monetize.boost.buyFor', message: `Boost for ${offer.priceString}` })
              }
              tone="pink"
              onPress={props.onBuy}
              loading={busy || phase === 'loading'}
              disabled={!model.canBuy}
              block
              testID="boost-buy"
            />
          )}
          {status === null ? null : (
            <Text
              variant="bodySm"
              color={theme.semantic.text.secondary}
              style={styles.centre}
              accessibilityLiveRegion="polite"
              testID={`boost-phase-${phase}`}
            >
              {status}
            </Text>
          )}
          <Text variant="caption" color={theme.semantic.text.secondary} style={styles.centre}>
            {t({
              id: 'monetize.boost.cancelled',
              message: 'Trip cancelled? The boost moves to your next one.',
            })}
          </Text>
          <Disclosure
            kind={model.option === 'year' ? 'subscription' : 'once'}
            price={offer?.priceString}
            period="yearly"
            store={props.store}
            onTerms={props.onTerms}
            onPrivacy={props.onPrivacy}
            testID="boost-disclosure"
          />
        </>
      )}
    </Stack>
  );
}
