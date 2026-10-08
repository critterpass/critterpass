/**
 * Budget (3i-6): "BALI BUDGET" with DAY 5 OF 8, SPENT against PLANNED with the TODAY marker, the
 * category bars, the day bars against the dashed plan (over-plan days pink) and Tokek's line with
 * the forecast. Undesigned: no budget set (the organiser can set one), before the trip, and over
 * budget (the spent figure turns pink).
 */
import type { Forecast } from '@cp/cost-engine';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { InfoPill } from '@/ui/chips/InfoPill';
import { DayBarsVsPlan } from '@/ui/data/DayBarsVsPlan';
import { LinearBar } from '@/ui/data/LinearBar';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Amount } from '@/ui/money/Amount';
import { GuideLine } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';
import { useWalletGuide } from '@/features/bookings';

import { useCategoryLabel } from '../components/category';
import { estimateMinor, finishDeltaShown, otherSpentMinor } from './estimates';
import { formatWhole } from '../format';
import { MONEY_ROUTES } from '../routes';

const CATEGORY_COLOUR = (theme: ReturnType<typeof useTheme>) => ({
  stays: theme.semantic.state.info,
  food: theme.semantic.state.urgent,
  transit: theme.semantic.state.success,
  fun: theme.semantic.state.warning,
});

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['20'], paddingTop: t.space['8'] },
  // Each figure sits in a box of a known width, so it is fitted to that width on one line and
  // never split from its symbol.
  beside: { flexDirection: 'row', alignItems: 'flex-end', gap: t.space['16'] },
  spent: { flex: 1, minWidth: 0 },
  planned: { flexShrink: 0, alignItems: 'flex-end' },
  stacked: { gap: t.space['12'] },
}));

/**
 * The size the spent figure is set at, by how long it prints: "US$4,812" at the hero size, a total
 * in đồng a step or two down, so it stays on one line with its symbol.
 */
function amountVariant(text: string): 'displayHero' | 'displayXl' | 'h1' {
  if (text.length <= 8) return 'displayHero';
  return text.length <= 11 ? 'displayXl' : 'h1';
}

/** The longest SPENT and PLANNED, in characters together, that sit side by side on one row. */
const BESIDE_MAX_CHARS = 12;

export interface BudgetViewProps {
  readonly title: string;
  readonly currency: string;
  readonly today: number;
  readonly days: number;
  readonly forecast: Forecast;
  readonly organiser: boolean;
  readonly onSetBudget: () => void;
}

/** Whole units through Money's own formatter, so the symbol reads as it does on Balances. */
function useWhole(currency: string) {
  const locale = useLocale();
  return (amountMinor: bigint) => formatWhole(amountMinor, currency, locale);
}

export function BudgetView(props: BudgetViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const inset = useTabBarInset();
  const locale = useLocale();
  const { t } = useLingui();
  const guide = useWalletGuide();
  const categoryLabel = useCategoryLabel();
  const whole = useWhole(props.currency);
  const f = props.forecast;
  // Planned figures are estimates and print rounded; spend stays exact.
  const planned = f.plannedMinor === null ? null : estimateMinor(f.plannedMinor, props.currency);
  const plan = (minor: bigint) => estimateMinor(minor, props.currency);
  const other = otherSpentMinor(f);
  const over = planned !== null && f.spentMinor > planned;
  const day = props.today;
  const days = props.days;
  const dayChip =
    day === 0
      ? t({ id: 'money.budget.before', message: 'Before the trip' })
      : day > days
        ? t({ id: 'money.budget.after', message: 'Trip over' })
        : t({ id: 'money.budget.day', message: `Day ${day} of ${days}` });
  const spent = whole(f.spentMinor);
  const plannedText = planned === null ? null : whole(planned);
  // 3i-6 sets PLANNED beside SPENT ("$4,812" and "$7,440"). Longer figures (a code-like symbol, a
  // total in đồng) do not fit a phone's row side by side, so PLANNED goes under SPENT instead.
  const beside = plannedText !== null && spent.length + plannedText.length <= BESIDE_MAX_CHARS;
  const delta = finishDeltaShown(f, props.currency);
  const deltaText = delta === null ? '' : whole(delta < 0n ? -delta : delta);
  const biggest = f.biggest?.label ?? null;
  const pace =
    delta === null
      ? null
      : delta >= 0n
        ? t({ id: 'money.budget.under', message: `On track to finish ${deltaText} under.` })
        : t({ id: 'money.budget.over', message: `Heading for ${deltaText} over.` });
  const biggestLine =
    biggest === null
      ? ''
      : t({ id: 'money.budget.biggest', message: `${biggest} is the biggest cost left.` });
  const top = f.days.reduce(
    (max, line) =>
      line.spentMinor > max ? line.spentMinor : line.plannedMinor > max ? line.plannedMinor : max,
    1n,
  );
  return (
    <Scaffold variant="dark" testID="money-budget">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: inset + theme.space['32'] }]}
      >
        <BackEyebrow
          label={upper(t({ id: 'money.back', message: 'Money' }), locale)}
          fallback={MONEY_ROUTES.balances}
        />
        <Row justify="space-between" align="center">
          <Text variant="eyebrow">{upper(props.title, locale)}</Text>
          <InfoPill variant="outline" testID="money-budget-day">
            {upper(dayChip, locale)}
          </InfoPill>
        </Row>
        <View style={beside ? styles.beside : styles.stacked}>
          <Stack gap="2" style={beside ? styles.spent : undefined}>
            <Text variant="eyebrow">
              {upper(t({ id: 'money.budget.spent', message: 'Spent' }), locale)}
            </Text>
            <Amount
              variant={amountVariant(spent)}
              color={over ? theme.semantic.state.urgent : undefined}
              testID="money-budget-spent"
              numberOfLines={1}
              autoFit
            >
              {spent}
            </Amount>
          </Stack>
          {plannedText === null ? null : (
            <Stack gap="2" style={beside ? styles.planned : undefined}>
              <Text variant="eyebrow">
                {upper(t({ id: 'money.budget.planned', message: 'Planned' }), locale)}
              </Text>
              <Amount
                variant="h2"
                color={theme.semantic.text.secondary}
                numberOfLines={1}
                testID="money-budget-planned"
              >
                {plannedText}
              </Amount>
            </Stack>
          )}
        </View>
        {planned === null ? (
          <Card testID="money-budget-none">
            <Stack gap="12">
              <Text variant="body">
                {props.organiser
                  ? t({
                      id: 'money.budget.noneOrganiser',
                      message: 'No crew budget yet. Set one and every expense counts against it.',
                    })
                  : t({
                      id: 'money.budget.none',
                      message: 'No crew budget yet. An organiser can set one.',
                    })}
              </Text>
              {props.organiser ? (
                <PillButton
                  label={upper(t({ id: 'money.budget.set', message: 'Set a crew budget' }), locale)}
                  onPress={props.onSetBudget}
                  block
                  testID="money-budget-set"
                />
              ) : null}
            </Stack>
          </Card>
        ) : (
          <LinearBar
            value={Number(f.spentMinor)}
            max={Number(planned)}
            {...(day > 0 && day <= days
              ? {
                  marker: {
                    at: day / Math.max(1, days),
                    label: upper(t({ id: 'money.budget.today', message: 'Today' }), locale),
                  },
                }
              : {})}
            accessibilityLabel={t({
              id: 'money.budget.spentOf',
              message: `${spent} spent of ${plannedText ?? ''}`,
            })}
          />
        )}
        {f.categories.some((line) => line.plannedMinor > 0n || line.spentMinor > 0n) ||
        other > 0n ? (
          <Card testID="money-budget-categories">
            <Stack gap="16">
              {f.categories.map((line, index) => (
                <LinearBar
                  key={line.category}
                  index={index}
                  color={CATEGORY_COLOUR(theme)[line.category]}
                  label={upper(categoryLabel(line.category), locale)}
                  value={Number(line.spentMinor)}
                  max={Number(
                    line.plannedMinor > 0n ? plan(line.plannedMinor) : line.spentMinor || 1n,
                  )}
                  valueLabel={
                    line.plannedMinor > 0n
                      ? `${whole(line.spentMinor)} / ${whole(plan(line.plannedMinor))}`
                      : whole(line.spentMinor)
                  }
                  overLabel={t({
                    id: 'money.budget.overBy',
                    message: `Over by ${whole(line.spentMinor - plan(line.plannedMinor))}`,
                  })}
                />
              ))}
              {other === 0n ? null : (
                <LinearBar
                  index={f.categories.length}
                  color={theme.semantic.text.secondary}
                  label={upper(categoryLabel('other'), locale)}
                  value={Number(other)}
                  max={Number(other)}
                  valueLabel={whole(other)}
                />
              )}
            </Stack>
          </Card>
        ) : null}
        {f.days.length === 0 ? null : (
          <DayBarsVsPlan
            title={upper(t({ id: 'money.budget.byDay', message: 'By day' }), locale)}
            legend={upper(t({ id: 'money.budget.legend', message: 'Dashes = plan' }), locale)}
            days={f.days.map((line) => ({
              label: `D${String(line.day)}`,
              plan: Number(plan(line.plannedMinor)) / Number(top),
              ...(line.day <= day ? { actual: Number(line.spentMinor) / Number(top) } : {}),
              amountLabel: t({
                id: 'money.budget.dayA11y',
                message: `${whole(line.spentMinor)} of ${whole(plan(line.plannedMinor))} planned`,
              }),
              today: line.day === day,
            }))}
            testID="money-budget-days"
          />
        )}
        {pace === null ? null : (
          <GuideLine
            guide={guide.id}
            name={guide.name}
            sticker={
              <Sticker
                kind={guideSticker(guide.id).kind}
                name={guide.name}
                size={44}
                pose="point"
              />
            }
            line={[pace, biggestLine].filter(Boolean).join(' ')}
            testID="money-budget-line"
          />
        )}
      </ScrollView>
    </Scaffold>
  );
}
