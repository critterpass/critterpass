/**
 * Cancel the trip (4.55): "Cancel Kyoto?", exactly what happens (each booking refunded, kept back
 * or asked about, the boost moving, money and chat staying), then the hold-to-cancel pill and the
 * safe "Keep the trip" as the ink one. Nothing is gone until the hold completes; with signal off
 * the consequences can't be read, and the page says so.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CancelSummaryResult } from '@cp/domain';

import { useCommand } from '@/data/commands/use-command';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';
import { Button, ListCard, Skeleton, Text, usePremiumTheme } from '@/ui/premium';
import { HoldToConfirm, PushScreen } from '@/ui/premium/shell';

import { CANCEL_TRIP } from '../../../trip/hub/trip-commands';
import { money } from '../../../vote/format';
import { useCancelSummary } from '../../settings/data/use-settings-reads';

type Consequence = CancelSummaryResult['consequences'][number];

function consequenceText(
  locale: string,
  line: Consequence,
): { readonly title: string; readonly line: string } {
  const title = line.title ?? '';
  const amount =
    line.amount_minor === null || line.currency === null
      ? null
      : money(locale, line.amount_minor, line.currency);
  switch (line.kind) {
    case 'booking_refund':
      return {
        title,
        line:
          amount === null
            ? t({ id: 'plan.cancel.refund', message: 'Refunded in full' })
            : t({ id: 'plan.cancel.refundAmount', message: `${amount} comes back` }),
      };
    case 'booking_kept':
      return {
        title,
        line:
          amount === null
            ? t({ id: 'plan.cancel.kept', message: 'Their terms keep part of it' })
            : t({ id: 'plan.cancel.keptAmount', message: `They keep ${amount}` }),
      };
    case 'booking_ask':
      return { title, line: t({ id: 'plan.cancel.ask', message: 'We ask them for you' }) };
    case 'boost_moves':
      return {
        title: t({ id: 'plan.cancel.boost', message: 'Your boost' }),
        line: t({ id: 'plan.cancel.boostLine', message: 'Moves to your next trip' }),
      };
    case 'money_stays': {
      const open = line.open_balances ?? 0;
      return {
        title: t({ id: 'plan.cancel.money', message: 'Money' }),
        line: t({ id: 'plan.cancel.moneyLine', message: `Balances stay to settle (${open} open)` }),
      };
    }
    case 'chat_stays':
      return {
        title: t({ id: 'plan.cancel.chat', message: 'Chat and photos' }),
        line: t({ id: 'plan.cancel.chatLine', message: 'Stay where they are' }),
      };
  }
}

export function CancelTripScreen({ tripId }: { readonly tripId: string }) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const plan = useTripPlan(tripId);
  const summary = useCancelSummary(tripId, plan.versionId);
  const cancel = useCommand(CANCEL_TRIP);
  const place = plan.trip?.destination_name ?? '';
  const title = t({ id: 'plan.settings.title', message: 'Trip settings' });
  const question = t({ id: 'plan.cancel.title', message: `Cancel ${place}?` });
  const data = summary.data;
  const confirm = async () => {
    const sent = await cancel.send({ trip_id: tripId });
    if (sent.kind !== 'applied') {
      toast.show({
        id: `cancel-failed-${tripId}`,
        title: t({
          id: 'trip.menu.failed',
          message: 'That didn’t go through. Try again with signal.',
        }),
      });
      return;
    }
    toast.show({
      id: `cancelled-${tripId}`,
      title: t({ id: 'trip.menu.cancelled', message: 'Trip called off. Everyone on it was told.' }),
    });
    router.navigate('/trips');
  };
  return (
    <PushScreen
      title={title}
      backLabel={t({ id: 'plan.settings.back', message: 'Back' })}
      scroll={false}
      testID="cancel-trip"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: theme.space.gap16,
          paddingTop: theme.space.gap8,
          gap: theme.space.gap16,
        }}
      >
        <View style={{ gap: theme.space.gap8, paddingHorizontal: theme.space.gap8 }}>
          <Text variant="display" accessibilityRole="header">
            {question}
          </Text>
          <Text variant="emptyLine" tone="muted">
            {t({
              id: 'plan.cancel.line',
              message: 'Here’s exactly what happens. Nothing’s gone until you hold the button.',
            })}
          </Text>
        </View>
        {data === null ? (
          summary.status === 'loading' ? (
            <Skeleton height={5 * 62} radius={theme.radius.card} tone="block" />
          ) : (
            <Text variant="body" tone="muted" testID="cancel-trip-unavailable">
              {t({
                id: 'plan.cancel.unavailable',
                message: 'What cancelling does shows with signal. Try again when you’re back.',
              })}
            </Text>
          )
        ) : (
          <ListCard>
            {data.consequences.map((line, index) => {
              const words = consequenceText(locale, line);
              return (
                <View
                  key={`${line.kind}-${line.booking_id ?? String(index)}`}
                  testID={`cancel-trip-${line.kind}`}
                  style={{
                    minHeight: 62,
                    justifyContent: 'center',
                    paddingHorizontal: theme.space.rowPadH,
                  }}
                >
                  <Text variant="rowTitle" numberOfLines={1}>
                    {words.title}
                  </Text>
                  <Text variant="captionMuted" tone="muted">
                    {words.line}
                  </Text>
                </View>
              );
            })}
          </ListCard>
        )}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: theme.space.titleGutter,
          paddingTop: theme.space.gap8,
          paddingBottom: insets.bottom + theme.space.gap16,
          gap: theme.space.gap8,
        }}
      >
        <HoldToConfirm
          label={t({ id: 'plan.cancel.hold', message: `Hold to cancel ${place}` })}
          onConfirm={() => void confirm()}
          disabled={data === null || !data.cancellable || cancel.pending}
          fallback={{
            title: question,
            message: t({ id: 'trip.menu.cancelTold', message: 'Everyone on it gets told.' }),
            confirm: t({ id: 'trip.menu.cancelConfirm', message: 'Call off trip' }),
            cancel: t({ id: 'common.cancel', message: 'Cancel' }),
          }}
          testID="cancel-trip-hold"
        />
        <Button
          label={t({ id: 'plan.cancel.keep', message: 'Keep the trip' })}
          onPress={() => router.back()}
          testID="cancel-trip-keep"
        />
      </View>
    </PushScreen>
  );
}
