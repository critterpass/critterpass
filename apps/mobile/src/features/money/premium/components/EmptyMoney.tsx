/**
 * Money before anything is spent (7.16): the crew's dark "$0.00" card, "Add the first expense"
 * and three ways to start (scan a receipt, type it in, set a budget), with the guide's tip. Also
 * the pages for no trip or crew yet and for a ledger still syncing (undesigned; built from the
 * empty-state pieces, see docs/undesigned-states.md).
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useWalletGuide } from '@/features/bookings';
import { crewAccent, guideCritterKind, IconTile, type LineIconName } from '@/features/trip';
import { GuideNote, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import type { ExpenseItem } from '../../data/expense-items';
import { balancesNav, type BalancesReady } from '../../balances/use-balances-screen';
import { EmptyLedgerHero } from './BalanceHero';
import { ExpenseRow } from './ExpenseRow';

function Tile(props: {
  readonly icon: LineIconName;
  readonly bg: string;
  readonly color: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  return (
    <PressableScale
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      testID={props.testID}
      style={styles.flex}
    >
      <View
        style={[
          styles.tile,
          {
            borderRadius: th.radius.cardRow,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        <IconTile name={props.icon} bg={props.bg} color={props.color} size={44} />
        <Text variant="rowTextStrong" align="center" numberOfLines={2}>
          {props.label}
        </Text>
      </View>
    </PressableScale>
  );
}

function Copy({ title, line }: { readonly title: string; readonly line: string }) {
  return (
    <View style={styles.copy}>
      <Text variant="title" align="center">
        {title}
      </Text>
      <Text variant="emptyLine" tone="muted" align="center">
        {line}
      </Text>
    </View>
  );
}

export function EmptyMoney({ state }: { readonly state: BalancesReady }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const guide = useWalletGuide();
  return (
    <View style={{ gap: th.space.gap16 }} testID="money-empty">
      <EmptyLedgerHero
        crewName={state.crew.name}
        currency={state.currency}
        members={state.ctx.members
          .filter((member) => member.active)
          .map((member) => ({
            id: member.userId,
            name: member.name,
            color: crewAccent(member.joinIndex),
          }))}
      />
      <Copy
        title={t({ id: 'money.premium.firstTitle', message: 'Add the first expense' })}
        line={t({
          id: 'money.premium.firstLine',
          message: 'Split it evenly, by share, or line by line from a receipt.',
        })}
      />
      <View style={[styles.tiles, { paddingHorizontal: th.space.gap16, gap: th.space.gap10 }]}>
        <Tile
          icon="scan"
          bg={th.color.status.rain.bg}
          color={th.color.status.rain.text}
          label={t({ id: 'money.premium.scanReceipt', message: 'Scan receipt' })}
          onPress={balancesNav.scan}
          testID="money-empty-scan"
        />
        <Tile
          icon="receipt"
          bg={th.color.status.maybe.bg}
          color={th.color.status.maybe.text}
          label={t({ id: 'money.premium.typeIt', message: 'Type it in' })}
          onPress={balancesNav.add}
          testID="money-empty-add"
        />
        <Tile
          icon="chart"
          bg={th.color.status.booked.bg}
          color={th.color.status.booked.text}
          label={t({ id: 'money.premium.setBudget', message: 'Set a budget' })}
          onPress={balancesNav.budget}
          testID="money-empty-budget"
        />
      </View>
      <View style={{ paddingHorizontal: th.space.gap16 }}>
        <GuideNote
          name={guide.name}
          critter={guideCritterKind(guide.id)}
          text={t({
            id: 'money.premium.tip',
            message: "Tip: forward hotel and ferry emails. I'll add them here and in bookings.",
          })}
        />
      </View>
    </View>
  );
}

export function MoneyNone(props: {
  readonly crew: boolean;
  readonly syncing?: boolean;
  readonly items?: readonly ExpenseItem[];
  readonly currency?: string;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const syncing = props.syncing === true;
  return (
    <View
      style={{ gap: th.space.gap16, paddingTop: th.space.gap16 }}
      testID={syncing ? 'money-syncing' : props.crew ? 'money-no-trip' : 'money-no-crew'}
    >
      <Copy
        title={
          syncing
            ? t({ id: 'money.syncing.title', message: 'Still syncing the balances' })
            : props.crew
              ? t({ id: 'money.noTrip.title', message: 'No trip to split yet' })
              : t({ id: 'money.noCrew.title', message: 'Money is for crews' })
        }
        line={
          syncing
            ? t({
                id: 'money.syncing.line',
                message: 'The totals show once every expense is in. Here is what I have so far.',
              })
            : props.crew
              ? t({
                  id: 'money.noTrip.line',
                  message:
                    'Once the crew has a trip, every expense lands here and I keep the tally.',
                })
              : t({
                  id: 'money.noCrew.line',
                  message: 'Start or join a crew and I will split every bill with them.',
                })
        }
      />
      {syncing && props.items !== undefined && props.currency !== undefined ? (
        <View
          style={{
            marginHorizontal: th.space.gutter,
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
            overflow: 'hidden',
          }}
        >
          {props.items.slice(0, 5).map((item) => (
            <ExpenseRow
              key={item.id}
              item={item}
              crewCurrency={props.currency ?? ''}
              onOpen={balancesNav.expense}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tile: {
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 6,
  },
  copy: { paddingHorizontal: 28, gap: 6 },
  tiles: { flexDirection: 'row' },
});
