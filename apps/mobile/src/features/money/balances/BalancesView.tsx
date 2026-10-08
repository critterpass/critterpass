/**
 * Balances (Money home): "MONEY · $4,812 SPENT" with the crew-currency chip, the rolling hero
 * ("YOU'RE OWED" / "YOU OWE" in pink / "ALL SQUARE"), the diverging bars, SETTLE IN n TAPS, the
 * SCAN / ADD / BUDGET tiles and the latest expense. Pure: the screen hands it the engine's numbers.
 */
import { upper } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { WalletSwitch } from '@/features/bookings';
import { PrivateContent } from '@/features/help';
import { useLocale } from '@/lib/i18n/use-locale';
import { useLoop } from '@/motion/use-loop';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { TileGrid } from '@/ui/cards/TileGrid';
import { BalanceBars } from '@/ui/data/BalanceBars';
import { Odometer } from '@/ui/data/Odometer';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { HeaderPill } from '@/ui/shell/HeaderPills';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { EmptyState } from '@/ui/states/EmptyState';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';
import { useWalletGuide } from '@/features/bookings';

import { ExpenseListRow } from '../components/ExpenseListRow';
import type { ExpenseItem } from '../data/expense-items';
import { homeEquivalent, useMoneyDisplay } from '@/data/money';

import { formatSigned, formatWhole, heroParts, heroVariant } from '../format';
import type { BalanceLine, HeroKind } from './model';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['20'], paddingTop: t.space['8'] },
  heroRow: { alignItems: 'center', justifyContent: 'space-between' },
  gecko: { opacity: 0.5 },
}));

export interface BalancesViewProps {
  readonly locale?: string;
  readonly currency: string;
  readonly totalSpentMinor: bigint;
  readonly hero: { readonly kind: HeroKind; readonly amountMinor: bigint };
  readonly lines: readonly BalanceLine[];
  readonly settleTaps: number;
  readonly latest: ExpenseItem | null;
  readonly offline: boolean;
  /** No expense and no ledger entry yet: the first-expense invitation replaces the hero. */
  readonly empty: boolean;
  /** Nobody else in the crew or its ledger yet: what was spent replaces who owes whom. */
  readonly solo?: boolean;
  /** Another trip of the crew is available: shows the trip name as a switch. */
  readonly tripLabel?: string | null;
  readonly onTrip?: (() => void) | undefined;
  readonly onCurrency: () => void;
  readonly onSettle: () => void;
  readonly onScan: () => void;
  readonly onAdd: () => void;
  readonly onBudget: () => void;
  readonly onHistory: () => void;
  readonly onExpense: (id: string) => void;
}

type HeroProps = BalancesViewProps['hero'] & { readonly currency: string; readonly solo?: boolean };

function Hero({ kind, amountMinor, currency, solo = false }: HeroProps) {
  const { t } = useLingui();
  const locale = useLocale();
  useMoneyDisplay();
  const home = homeEquivalent(amountMinor < 0n ? -amountMinor : amountMinor, currency, locale);
  const theme = useTheme();
  const styles = useStyles();
  const bob = useLoop('bob');
  const guide = useWalletGuide();
  const tokek = guideSticker(guide.id);
  const eyebrow = solo
    ? t({ id: 'money.hero.soloSpent', message: 'Spent so far' })
    : kind === 'owed'
      ? t({ id: 'money.hero.owed', message: "You're owed" })
      : kind === 'owes'
        ? t({ id: 'money.hero.owes', message: 'You owe' })
        : t({ id: 'money.hero.square', message: 'All square' });
  const color = solo
    ? theme.semantic.text.primary
    : kind === 'owed'
      ? theme.semantic.action.primary
      : kind === 'owes'
        ? theme.semantic.state.urgent
        : theme.semantic.text.primary;
  const parts = heroParts(amountMinor, currency, locale);
  return (
    <Stack gap="4" testID={solo ? 'money-hero-solo' : `money-hero-${kind}`}>
      <Text variant="eyebrow">{upper(eyebrow, locale)}</Text>
      <PrivateContent>
        <Row style={styles.heroRow}>
          <Odometer
            // The odometer measures its line once: a new size starts a new one.
            key={heroVariant(parts)}
            value={parts.whole}
            variant={heroVariant(parts)}
            prefix={parts.prefix}
            suffix={parts.suffix}
            color={color}
            accessibilityLabel={eyebrow}
            testID="money-hero-amount"
          />
          <Animated.View style={[styles.gecko, bob]}>
            <Sticker
              kind={tokek.kind}
              name={guide.name}
              size={72}
              variant="mask"
              maskColor={theme.tier.locked.default}
              sticker={null}
            />
          </Animated.View>
        </Row>
      </PrivateContent>
      {home === null ? null : (
        <PrivateContent>
          <Text variant="body" color={theme.semantic.text.secondary} testID="money-hero-home">
            {home}
          </Text>
        </PrivateContent>
      )}
    </Stack>
  );
}

export function BalancesView(props: BalancesViewProps) {
  const { t } = useLingui();
  const guide = useWalletGuide();
  const guideName = guide.name;
  const appLocale = useLocale();
  const locale = props.locale ?? appLocale;
  const styles = useStyles();
  const theme = useTheme();
  const inset = useTabBarInset();
  const spent = formatWhole(props.totalSpentMinor, props.currency, locale);
  const taps = props.settleTaps;
  const settleLabel =
    taps === 0
      ? t({ id: 'money.settle.none', message: 'Nothing to settle' })
      : t({
          id: 'money.settle.taps',
          message: plural(taps, { one: 'Settle in # tap', other: 'Settle in # taps' }),
        });
  return (
    <Scaffold variant="dark" testID="money-balances">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: inset + theme.space['32'] }]}
      >
        <WalletSwitch current="money" />
        <Row justify="space-between" align="center">
          <PrivateContent style={{ flexShrink: 1 }}>
            <Text variant="eyebrow" numberOfLines={1}>
              {upper(t({ id: 'money.header.spent', message: `Money · ${spent} spent` }), locale)}
            </Text>
          </PrivateContent>
          <Row gap="8" align="center">
            {props.offline ? <OfflinePill testID="money-offline" /> : null}
            <HeaderPill
              label={props.currency}
              onPress={props.onCurrency}
              testID="money-currency-chip"
            />
          </Row>
        </Row>
        {props.tripLabel != null && props.onTrip !== undefined ? (
          <TextLink label={props.tripLabel} onPress={props.onTrip} testID="money-trip-switch" />
        ) : null}
        {props.empty ? (
          <EmptyState
            guide={guide.id}
            guideName={guide.name}
            title={t({ id: 'money.empty.title', message: 'No expenses yet' })}
            line={t({
              id: 'money.empty.line',
              message:
                "Log what the crew spends and I'll keep who-owes-who straight. Nobody does maths.",
            })}
            action={{
              label: upper(t({ id: 'money.empty.add', message: 'Add an expense' }), locale),
              onPress: props.onAdd,
            }}
            testID="money-empty"
          />
        ) : props.solo === true ? (
          <>
            <Hero
              kind="square"
              amountMinor={props.totalSpentMinor}
              currency={props.currency}
              solo
            />
            <Card testID="money-solo">
              <Text variant="body" color={theme.semantic.text.secondary}>
                {t({
                  id: 'money.solo.line',
                  message:
                    "It's just you in this crew for now, so there's nothing to split. Once crewmates join, the expenses you share are split and I keep who-owes-who straight.",
                })}
              </Text>
            </Card>
          </>
        ) : (
          <>
            <Hero {...props.hero} currency={props.currency} />
            <Card testID="money-bars">
              <PrivateContent>
                <BalanceBars
                  owesHeading={upper(t({ id: 'money.bars.owes', message: 'Owes' }), locale)}
                  owedHeading={upper(t({ id: 'money.bars.owed', message: 'Is owed' }), locale)}
                  balances={props.lines.map((line) => ({
                    name: line.me ? t({ id: 'money.bars.you', message: 'You' }) : line.name,
                    direction: line.direction,
                    fraction: line.fraction,
                    amountLabel: formatSigned(line.netMinor, props.currency, locale),
                    highlight: line.me,
                  }))}
                />
              </PrivateContent>
            </Card>
            <PillButton
              label={upper(settleLabel, locale)}
              onPress={props.onSettle}
              disabled={taps === 0}
              block
              testID="money-settle"
            />
          </>
        )}
        <TileGrid
          columns={3}
          tiles={[
            {
              key: 'scan',
              title: upper(t({ id: 'money.tile.scan', message: 'Scan' }), locale),
              icon: 'camera',
              onPress: props.onScan,
            },
            {
              key: 'add',
              title: upper(t({ id: 'money.tile.add', message: 'Add' }), locale),
              icon: 'wallet',
              onPress: props.onAdd,
            },
            {
              key: 'budget',
              title: upper(t({ id: 'money.tile.budget', message: 'Budget' }), locale),
              icon: 'cal',
              onPress: props.onBudget,
            },
          ]}
        />
        {props.empty ? null : (
          <Stack gap="8">
            <Row justify="space-between" align="center">
              <Text variant="eyebrow">
                {upper(t({ id: 'money.latest', message: 'Latest' }), locale)}
              </Text>
              {props.latest === null ? null : (
                <TextLink
                  label={t({ id: 'money.latest.all', message: 'See all' })}
                  onPress={props.onHistory}
                  testID="money-history-link"
                />
              )}
            </Row>
            {props.latest === null ? (
              <Text
                variant="body"
                color={theme.semantic.text.secondary}
                testID="money-latest-empty"
              >
                {t({
                  id: 'money.latest.empty',
                  message: `Nothing spent yet. Add the first expense and ${guideName} keeps the tally.`,
                })}
              </Text>
            ) : (
              <View>
                <ExpenseListRow
                  item={props.latest}
                  crewCurrency={props.currency}
                  onOpen={props.onExpense}
                  testID="money-latest-row"
                />
              </View>
            )}
          </Stack>
        )}
      </ScrollView>
    </Scaffold>
  );
}
