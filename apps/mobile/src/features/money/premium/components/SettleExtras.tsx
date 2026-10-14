/**
 * Settle up's extras: the Settled guide still to earn (7.24: its locked silhouette in a dashed
 * card, the reward's name in bold), and the page with no expenses yet (undesigned: the empty state
 * with the guide and the way to the first expense).
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { useWalletGuide } from '@/features/bookings';
import { guideCritterKind } from '@/features/trip';
import { Button, CritterSticker, EmptyState, Text, usePremiumTheme } from '@/ui/premium';

import { balancesNav } from '../../balances/use-balances-screen';

export function SettleReward(props: { readonly open: number; readonly people: number }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const guide = useWalletGuide();
  const reward = t({ id: 'money.premium.rewardName', message: `Settled ${guide.name}` });
  const line = t({
    id: 'money.premium.reward',
    message: plural(props.open, {
      one: `One more payment and all ${props.people} of you get the ${reward}.`,
      other: `# more payments and all ${props.people} of you get the ${reward}.`,
    }),
  });
  const at = line.indexOf(reward);
  return (
    <View
      style={[
        styles.reward,
        {
          marginHorizontal: th.space.gutter,
          borderRadius: th.radius.card,
          borderColor: th.color.outlineEmpty,
          backgroundColor: th.color.card,
        },
      ]}
      testID="money-settle-reward"
    >
      <CritterSticker
        kind={guideCritterKind(guide.id)}
        name={guide.name}
        size={48}
        variant="mask"
      />
      <Text variant="rowText" style={styles.flex}>
        {at < 0 ? (
          line
        ) : (
          <>
            {line.slice(0, at)}
            <Text variant="rowTitle">{reward}</Text>
            {line.slice(at + reward.length)}
          </>
        )}
      </Text>
    </View>
  );
}

export function NothingToSettle() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const guide = useWalletGuide();
  return (
    // In the optical centre of the page, not hanging under the title with the page blank below.
    <View style={{ flexGrow: 1, paddingTop: th.space.gutter }}>
      <EmptyState
        fill
        title={t({ id: 'money.settle.nothingTitle', message: 'Nothing to settle' })}
        line={t({
          id: 'money.settle.nothing',
          message: 'Everyone is square. Add what the crew spends and I keep who owes who.',
        })}
        critter={{ kind: guideCritterKind(guide.id), name: guide.name }}
        action={
          <Button
            label={t({ id: 'money.empty.add', message: 'Add an expense' })}
            onPress={balancesNav.add}
            testID="money-settle-add"
          />
        }
        testID="money-settle-empty"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  reward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
});
