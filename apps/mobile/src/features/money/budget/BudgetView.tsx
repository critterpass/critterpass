/**
 * Budget (3i-6): "BALI BUDGET" with DAY 5 OF 8, SPENT against PLANNED with the TODAY marker, the
 * category bars, the day bars against the dashed plan (over-plan days pink) and Tokek's line with
 * the forecast. Undesigned: no budget set (the organiser can set one), before the trip, and over
 * budget (the spent figure turns pink).
 */
import type { Forecast } from '@cp/cost-engine';
import { format, upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { InfoPill } from '@/ui/chips/InfoPill';
import { DayBarsVsPlan } from '@/ui/data/DayBarsVsPlan';
import { LinearBar } from '@/ui/data/LinearBar';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useCategoryLabel } from '../components/category';
import { toMajor } from '../format';

const CATEGORY_COLOUR = (theme: ReturnType<typeof useTheme>) => ({
  stays: theme.semantic.state.info,
  food: theme.semantic.state.urgent,
  transit: theme.semantic.state.success,
  fun: theme.semantic.state.warning,
});

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['20'], paddingTop: t.space['8'] },
}));

export interface BudgetViewProps {
  readonly title: string;
  readonly currency: string;
  readonly today: number;
  readonly days: number;
  readonly forecast: Forecast;
  readonly organiser: boolean;
  readonly onSetBudget: () => void;
}

function useWhole(currency: string) {
  const locale = useLocale();
  return (amountMinor: bigint) =>
    format.number(locale, Math.round(toMajor(amountMinor, currency)), {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });
}

export function BudgetView(props: BudgetViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const inset = useTabBarInset();
  const locale = useLocale();
  const { t } = useLingui();
  const categoryLabel = useCategoryLabel();
  const whole = useWhole(props.currency);
  const f = props.forecast;
  const planned = f.plannedMinor;
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
  const delta = f.finishDeltaMinor;
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
        <BackEyebrow label={upper(t({ id: 'money.back', message: 'Money' }), locale)} />
        <Row justify="space-between" align="center">
          <Text variant="eyebrow">{upper(props.title, locale)}</Text>
          <InfoPill variant="outline" testID="money-budget-day">
            {upper(dayChip, locale)}
          </InfoPill>
        </Row>
        <Row justify="space-between" align="flex-end" gap="12">
          <Stack gap="2" style={{ flexShrink: 1 }}>
            <Text variant="eyebrow">
              {upper(t({ id: 'money.budget.spent', message: 'Spent' }), locale)}
            </Text>
            <Text
              variant="displayHero"
              color={over ? theme.semantic.state.urgent : undefined}
              testID="money-budget-spent"
              numberOfLines={1}
              autoFit
            >
              {spent}
            </Text>
          </Stack>
          {planned === null ? null : (
            <Stack gap="2" align="flex-end" style={{ flexShrink: 1 }}>
              <Text variant="eyebrow">
                {upper(t({ id: 'money.budget.planned', message: 'Planned' }), locale)}
              </Text>
              <Text variant="h1" color={theme.semantic.text.secondary} numberOfLines={1} autoFit>
                {whole(planned)}
              </Text>
            </Stack>
          )}
        </Row>
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
              message: `${spent} spent of ${whole(planned)}`,
            })}
          />
        )}
        {f.categories.some((line) => line.plannedMinor > 0n || line.spentMinor > 0n) ? (
          <Card testID="money-budget-categories">
            <Stack gap="16">
              {f.categories.map((line, index) => (
                <LinearBar
                  key={line.category}
                  index={index}
                  color={CATEGORY_COLOUR(theme)[line.category]}
                  label={upper(categoryLabel(line.category), locale)}
                  value={Number(line.spentMinor)}
                  max={Number(line.plannedMinor > 0n ? line.plannedMinor : line.spentMinor || 1n)}
                  valueLabel={
                    line.plannedMinor > 0n
                      ? `${whole(line.spentMinor)} / ${whole(line.plannedMinor)}`
                      : whole(line.spentMinor)
                  }
                  overLabel={t({
                    id: 'money.budget.overBy',
                    message: `Over by ${whole(line.spentMinor - line.plannedMinor)}`,
                  })}
                />
              ))}
            </Stack>
          </Card>
        ) : null}
        {f.days.length === 0 ? null : (
          <DayBarsVsPlan
            title={upper(t({ id: 'money.budget.byDay', message: 'By day' }), locale)}
            legend={upper(t({ id: 'money.budget.legend', message: 'Dashes = plan' }), locale)}
            days={f.days.map((line) => ({
              label: `D${String(line.day)}`,
              plan: Number(line.plannedMinor) / Number(top),
              ...(line.day <= day ? { actual: Number(line.spentMinor) / Number(top) } : {}),
              amountLabel: t({
                id: 'money.budget.dayA11y',
                message: `${whole(line.spentMinor)} of ${whole(line.plannedMinor)} planned`,
              }),
              today: line.day === day,
            }))}
            testID="money-budget-days"
          />
        )}
        {pace === null ? null : (
          <GuideLine
            guide="tokek"
            name={GUIDE_STICKERS.tokek.name}
            sticker={
              <Sticker
                kind={GUIDE_STICKERS.tokek.kind}
                name={GUIDE_STICKERS.tokek.name}
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
