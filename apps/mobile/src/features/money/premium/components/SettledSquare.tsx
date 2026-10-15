/**
 * All square (7.28): the green SQUARE stamp with the trip and how many expenses, the guide
 * cheering, "Everyone's even", then every expense, the books as a spreadsheet to keep, and back to
 * the trip's recap. Adding an expense later opens the books again.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useWalletGuide } from '@/features/bookings';
import { guideCritterKind, IconTile } from '@/features/trip';
import { useScreenHref } from '@/lib/navigation/screen-registry';
import {
  Button,
  CritterSticker,
  Row,
  RoundStamp,
  StampMoment,
  Text,
  usePremiumTheme,
  useToast,
} from '@/ui/premium';

import { useExportExpenses } from '../../export/use-export-expenses';
import { MONEY_ROUTES } from '../../routes';
import type { SettleState } from '../../settle/use-settle';

type Ready = Extract<SettleState, { kind: 'ready' }>;

const STAMP_SIZE = 200;

export function SettledSquare({ settle }: { readonly settle: Ready }) {
  // Drops once the page has drawn, so the fall is seen.
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setLanded(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const th = usePremiumTheme();
  const { t } = useLingui();
  const guide = useWalletGuide();
  const toast = useToast();
  const exporter = useExportExpenses();
  const recap = useScreenHref(
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a screen id, not copy
    '3m-1',
    { tripId: settle.tripId },
  );
  const name = settle.trip.destinationName ?? '';
  const exportBooks = () =>
    void exporter.exportCsv().then((outcome) => {
      if (outcome === 'shared') return;
      toast.show(
        outcome === 'empty'
          ? {
              kind: 'done',
              message: t({ id: 'money.premium.exportEmpty', message: 'Nothing to export yet.' }),
            }
          : {
              kind: 'error',
              message: t({
                id: 'money.premium.exportFailed',
                message: "That export didn't work. Try again.",
              }),
            },
      );
    });
  return (
    <View style={{ gap: th.space.gap16 }} testID="money-settle-square">
      {/* The stamp drops onto the page as it opens (1.07): falls, squashes, inks, confetti. */}
      <StampMoment
        landed={landed}
        ink="green"
        style={styles.stampWrap}
        testID="money-settle-square-moment"
        stamp={
          <RoundStamp
            word={t({ id: 'money.premium.squareStamp', message: 'SQUARE' })}
            top={name.toUpperCase()}
            bottom={t({
              id: 'money.premium.squareCount',
              message: plural(settle.expenses, { one: '# EXPENSE', other: '# EXPENSES' }),
            })}
            ink="green"
            size={STAMP_SIZE}
          />
        }
      >
        <View style={styles.cheer}>
          <CritterSticker
            kind={guideCritterKind(guide.id)}
            name={guide.name}
            size={88}
            pose="cheer"
          />
        </View>
      </StampMoment>
      <View style={{ paddingHorizontal: th.space.titleGutter, gap: th.space.gap6 }}>
        <Text variant="emptyTitle" align="center">
          {t({ id: 'money.premium.even', message: 'Everyone’s even' })}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {t({
            id: 'money.premium.booksClosed',
            message: `The last payment landed. ${guide.name} closed the books for ${name}.`,
          })}
        </Text>
      </View>
      <View
        style={[
          styles.links,
          {
            marginHorizontal: th.space.gutter,
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        <Row
          title={t({ id: 'money.premium.everyExpense', message: 'See every expense' })}
          subtitle={t({
            id: 'money.premium.everyExpenseSub',
            message: plural(settle.expenses, {
              one: '# item, filter by person',
              other: '# items, filter by person',
            }),
          })}
          leading={
            <IconTile
              name="receipt"
              bg={th.color.status.rain.bg}
              color={th.color.status.rain.text}
            />
          }
          onPress={() => router.push(MONEY_ROUTES.history)}
          testID="money-square-history"
        />
        <Row
          title={t({ id: 'money.premium.export', message: 'Export for your records' })}
          subtitle={t({ id: 'money.premium.exportSub', message: 'A spreadsheet of every expense' })}
          leading={
            <IconTile
              name="download"
              bg={th.color.status.booked.bg}
              color={th.color.status.booked.text}
            />
          }
          onPress={exportBooks}
          testID="money-square-export"
        />
      </View>
      {recap === undefined ? null : (
        <View style={{ paddingHorizontal: th.space.gutter }}>
          <Button
            label={t({ id: 'money.premium.toRecap', message: 'Back to the recap' })}
            onPress={() => router.push(recap)}
            testID="money-square-recap"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stampWrap: { flex: 0, height: STAMP_SIZE + 24, marginTop: 24 },
  cheer: { position: 'absolute', right: 40, top: 0 },
  links: { overflow: 'hidden' },
});
