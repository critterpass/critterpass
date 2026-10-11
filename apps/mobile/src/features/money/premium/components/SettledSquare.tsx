/**
 * All square (7.28): the green SQUARE stamp with the trip and how many expenses, the guide
 * cheering, "Everyone's even", then every expense, the books as a spreadsheet to keep, and back to
 * the trip's recap. Adding an expense later opens the books again.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useWalletGuide } from '@/features/bookings';
import { guideCritterKind, IconTile } from '@/features/trip';
import { useScreenHref } from '@/lib/navigation/screen-registry';
import { toast } from '@/motion/island-toast';
import { Button, CritterSticker, Row, RoundStamp, Text, usePremiumTheme } from '@/ui/premium';

import { useExportExpenses } from '../../export/use-export-expenses';
import { MONEY_ROUTES } from '../../routes';
import type { SettleState } from '../../settle/use-settle';

type Ready = Extract<SettleState, { kind: 'ready' }>;

export function SettledSquare({ settle }: { readonly settle: Ready }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const guide = useWalletGuide();
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
      toast.show({
        id: 'money-export',
        title:
          outcome === 'empty'
            ? t({ id: 'money.premium.exportEmpty', message: 'Nothing to export yet.' })
            : t({
                id: 'money.premium.exportFailed',
                message: "That export didn't work. Try again.",
              }),
      });
    });
  return (
    <View style={{ gap: th.space.gap16 }} testID="money-settle-square">
      <View style={styles.stampWrap}>
        <RoundStamp
          word={t({ id: 'money.premium.squareStamp', message: 'SQUARE' })}
          top={name.toUpperCase()}
          bottom={t({
            id: 'money.premium.squareCount',
            message: plural(settle.expenses, { one: '# EXPENSE', other: '# EXPENSES' }),
          })}
          ink="green"
          size={200}
          rotate={-8}
        />
        <View style={styles.cheer}>
          <CritterSticker
            kind={guideCritterKind(guide.id)}
            name={guide.name}
            size={88}
            pose="cheer"
          />
        </View>
      </View>
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
  stampWrap: { alignItems: 'center', paddingTop: 24 },
  cheer: { position: 'absolute', right: 40, top: 0 },
  links: { overflow: 'hidden' },
});
