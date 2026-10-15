/**
 * Boost a trip · who pays (9.12) as a full-height native sheet over the page that opened it: the entry stamp, the
 * perks, this trip or every trip all year, who pays (with the crew fanned out when it splits) and
 * the one button. The store's own sheet takes the payment (9.13). When a crewmate is paying right
 * now, the "someone's already boosting" alert (9.22) says so, and "Tell me when it's done" asks to
 * hear how it ends (the boost's own push if they finish, the guide's if the lock lapses).
 */
import { crewChatLink } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { goBackOr } from '@/lib/navigation/back';
import { Button, Card, SegmentedControl, Text, usePremiumTheme, useToast } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { useClosedCopy } from '../boost/closed-copy';
import { useBoostScreen } from '../boost/use-boost-screen';
import { useBillingRows } from '../data/use-billing-rows';
import { perkLines } from '../perks/perk-copy';
import { EntryStampCard, OptionRow, SplitFan } from './boost-parts';
import { BoostLockAlert } from './boost-lock-alert';
import { PerkChip } from './components/perk-chip';
import { PurchaseFooter } from './components/purchase-footer';

export function BoostPremium() {
  const { t, i18n } = useLingui();
  const th = usePremiumTheme();
  const props = useBoostScreen();
  const toast = useToast();
  const rows = useBillingRows();
  const closedCopy = useClosedCopy();
  const { model } = props;
  const { phase, tripOffer, yearOffer, offer } = model;
  const busy = phase === 'purchasing' || phase === 'verifying' || phase === 'loading';
  const split = model.whoPays === 'split';
  const perks = useMemo(() => perkLines(rows.perks, 'boost'), [rows.perks]);
  const [alertSeen, setAlertSeen] = useState(false);
  const closed = phase === 'locked' ? null : closedCopy(phase, model.lockedBy ?? '');
  const close = () => goBackOr();
  const ways = props.seated.length;
  const { crew, destination } = props;
  const dots = [th.accent.pink, th.accent.sky, th.accent.mint, th.accent.sun];
  const windowEnd = props.windowEnd ?? '';
  const until =
    props.windowEnd === null
      ? t({ id: 'monetize.boost.thisTripLine', message: 'On until a week after you land' })
      : t({
          id: 'monetize.premium.boostUntil',
          message: `On until ${windowEnd}, a week after you land`,
        });

  const price = offer?.priceString ?? '';
  const each = model.eachShare ?? '';
  const buyLabel =
    offer === null
      ? t({ id: 'monetize.boost.buy', message: 'Boost' })
      : split && model.eachShare !== null
        ? t({
            id: 'monetize.premium.boostSplitBuy',
            message: `Boost for ${price} · you pay ${each}`,
          })
        : t({ id: 'monetize.premium.boost.buyFor', message: `Boost for ${price}` });

  return (
    <>
      <SheetScreen
        cancelLabel={t({ id: 'monetize.premium.cancel', message: 'Cancel' })}
        title={t({ id: 'monetize.boost.title', message: `Boost ${destination}` })}
        {...(props.crew === ''
          ? {}
          : { subtitle: props.dates === '' ? props.crew : `${props.crew} · ${props.dates}` })}
        testID="boost-sheet"
        {...(closed !== null
          ? {}
          : {
              footer: (
                <View style={{ gap: 8 }}>
                  {phase === 'verify_failed' ? (
                    <Button
                      label={t({ id: 'monetize.paywall.checkAgain', message: 'Check again' })}
                      onPress={props.onCheckAgain}
                      testID="boost-check-again"
                    />
                  ) : (
                    <Button
                      label={buyLabel}
                      onPress={props.onBuy}
                      loading={busy}
                      disabled={!model.canBuy}
                      testID="boost-buy"
                    />
                  )}
                  {phase === 'refused' ? (
                    <Text variant="caption" color={th.color.destructive.helper} align="center">
                      {t({
                        id: 'monetize.boost.refused',
                        message: 'We couldn’t start the purchase. Nothing was charged; try again.',
                      })}
                    </Text>
                  ) : null}
                  <PurchaseFooter
                    kind={model.option === 'year' ? 'subscription' : 'once'}
                    phase={
                      phase === 'locked' ||
                      phase === 'refused' ||
                      phase === 'done' ||
                      phase === 'boosted' ||
                      phase === 'ended'
                        ? 'ready'
                        : phase
                    }
                    price={offer?.priceString}
                    period="yearly"
                    store={props.store}
                    onTerms={props.onTerms}
                    onPrivacy={props.onPrivacy}
                    testID="boost-disclosure"
                  />
                  <Text variant="caption" tone="muted" align="center">
                    {t({
                      id: 'monetize.boost.cancelled',
                      message: 'Trip cancelled? The boost moves to your next one.',
                    })}
                  </Text>
                </View>
              ),
            })}
      >
        <View style={{ gap: 14 }}>
          <EntryStampCard place={props.destination} until={until} />
          {perks.length === 0 ? null : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {perks.map((perk, i) => (
                <PerkChip
                  key={perk.key}
                  label={i18n._(perk.copy)}
                  color={dots[i % dots.length] ?? th.accent.pink}
                />
              ))}
            </View>
          )}
          {closed !== null ? (
            // Nothing to buy or split: the sheet says why right under what the boost gives.
            <Card padded testID={`boost-closed-${phase}`}>
              <View style={{ gap: 4, alignItems: 'center' }}>
                <Text variant="headline" align="center">
                  {closed.title}
                </Text>
                <Text variant="caption" tone="muted" align="center">
                  {closed.line}
                </Text>
              </View>
            </Card>
          ) : null}
          {closed !== null || tripOffer === null ? null : (
            <OptionRow
              title={t({ id: 'monetize.boost.thisTrip', message: 'This trip' })}
              detail={until}
              price={tripOffer.priceString}
              selected={model.option === 'trip'}
              onPress={() => props.onOption('trip')}
              testID="boost-option-trip"
            />
          )}
          {closed !== null || yearOffer === null ? null : (
            <OptionRow
              title={t({ id: 'monetize.boost.allYear', message: 'Every trip, all year' })}
              detail={t({
                id: 'monetize.boost.allYearLine',
                message: `Any trip ${crew} plan for a year, plus Pass+ for you. Renews yearly.`,
              })}
              price={yearOffer.priceString}
              selected={model.option === 'year'}
              tag={t({ id: 'monetize.premium.plusPassForYou', message: '+ PASS+ FOR YOU' })}
              onPress={() => props.onOption('year')}
              testID="boost-option-year"
            />
          )}
          {closed === null && model.canSplit ? (
            <>
              <SegmentedControl
                accessibilityLabel={t({ id: 'monetize.boost.whoPays', message: 'Who pays' })}
                options={[
                  {
                    value: 'cover',
                    label: t({ id: 'monetize.boost.cover', message: 'I’ll cover it' }),
                  },
                  {
                    value: 'split',
                    label: t({ id: 'monetize.premium.boost.split', message: `Split ${ways} ways` }),
                  },
                ]}
                value={model.whoPays}
                onChange={props.onWhoPays}
                testID="boost-who-pays"
              />
              <SplitFan seated={props.seated} split={split} share={model.eachShare} />
              {split && model.eachShare !== null ? (
                <Text variant="caption" tone="muted" align="center">
                  {model.eachShareExact
                    ? t({
                        id: 'monetize.premium.splitNote',
                        message: `${each} each goes into Balances, like any shared expense.`,
                      })
                    : t({
                        id: 'monetize.premium.splitNoteAbout',
                        message: `About ${each} each goes into Balances, like any shared expense.`,
                      })}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
      </SheetScreen>
      <BoostLockAlert
        visible={phase === 'locked' && !alertSeen}
        name={model.lockedBy ?? ''}
        onDone={() => {
          setAlertSeen(true);
          void props.onWatchLock().then((asked) => {
            if (!asked) {
              toast.show({
                kind: 'error',
                message: t({
                  id: 'monetize.premium.lockWatchFailed',
                  message: 'That didn’t go through. You’ll still hear if they finish.',
                }),
              });
            }
          });
          close();
        }}
        {...(props.crewId === null
          ? {}
          : {
              onMessage: () => {
                setAlertSeen(true);
                router.replace(crewChatLink(props.crewId ?? ''));
              },
            })}
      />
    </>
  );
}
