/**
 * Once a year (3l-9) from props: REMIND ME, the twelve-month strip (legendary months glint gold,
 * the next trip's months fill, this month is outlined), then the dated windows and the hardest
 * things, each with its gold silhouette, where and when, and YOUR DATES or the crew's "4 OF 6 IN".
 */
import { upper } from '@cp/i18n';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { MonthStrip } from '@/ui/critters/MonthStrip';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Tag } from '@/ui/plan/ActionPill';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { unknownName } from '../critters-copy';
import { CellArt } from '../dex/cell-art';
import { backToDex } from '../dex/dex-copy';
import {
  anyLabel,
  emptyBody,
  emptyTitle,
  found,
  hardest,
  hereCount,
  inboxOnly,
  intro,
  missingLine,
  monthLong,
  monthNarrow,
  monthShort,
  onOneDay,
  part,
  reminding,
  remindersOn,
  remindMe,
  title,
  yourDates,
} from './legendary-copy';
import type { LegendaryItem } from './legendary-model';

export interface LegendaryViewProps {
  readonly items: readonly LegendaryItem[];
  readonly months: readonly {
    month: number;
    legendary: boolean;
    inTrip: boolean;
    current: boolean;
  }[];
  readonly allReminded: boolean;
  readonly notificationsOff: boolean;
  readonly onRemind: () => void;
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, gap: th.space['14'] },
  list: { backgroundColor: th.semantic.bg.raised, borderRadius: th.radius.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    padding: th.space['12'],
  },
  when: { width: th.space['32'] * 1.5, alignItems: 'center' },
  divider: { height: 1, backgroundColor: th.color.divider, marginHorizontal: th.space['12'] },
}));

function When({ item }: { readonly item: LegendaryItem }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { label } = item;
  const top =
    label.kind === 'any' ? anyLabel().top : upper(monthShort(label.month, locale), locale);
  const bottom =
    label.kind === 'any'
      ? anyLabel().bottom
      : label.kind === 'part'
        ? part(label.part)
        : label.days;
  return (
    <View style={styles.when}>
      <Text variant="title" color={theme.tier.legendary.color}>
        {upper(top, locale)}
      </Text>
      <Text variant="caption" color={theme.semantic.text.secondary}>
        {upper(bottom, locale)}
      </Text>
    </View>
  );
}

function ItemRow({ item }: { readonly item: LegendaryItem }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const chip = item.found
    ? { label: found(), color: theme.semantic.state.success }
    : item.copresence !== null
      ? { label: hereCount(item.copresence.here, item.copresence.needed), color: theme.color.pink }
      : item.onYourDates
        ? { label: yourDates(), color: theme.tier.legendary.color }
        : item.reminder
          ? { label: reminding(), color: theme.color.ink['600'] }
          : null;
  return (
    <View style={styles.row} testID={`critters-legendary-${item.windowId}`}>
      <When item={item} />
      {item.critterKey === null ? null : (
        <CellArt
          critterKey={item.critterKey}
          seed={item.seed}
          city={item.placeLine}
          size={44}
          name={item.name}
          form={null}
          found={item.found}
          gold
          breathe={false}
        />
      )}
      <Stack gap="2" flex={1}>
        <Text variant="title">{upper(item.name ?? unknownName(), locale)}</Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {item.placeLine}
        </Text>
        {item.copresence !== null && item.copresence.missing.length > 0 ? (
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {missingLine(item.copresence.missing.join(', '))}
          </Text>
        ) : null}
      </Stack>
      {chip === null ? null : <Tag label={upper(chip.label, locale)} color={chip.color} />}
    </View>
  );
}

function Section({
  label,
  items,
}: {
  readonly label: string;
  readonly items: readonly LegendaryItem[];
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  if (items.length === 0) return null;
  return (
    <Stack gap="8">
      <Text variant="eyebrow" color={theme.semantic.text.secondary}>
        {upper(label, locale)}
      </Text>
      <View style={styles.list}>
        {items.map((item, i) => (
          <View key={item.windowId}>
            {i === 0 ? null : <View style={styles.divider} />}
            <ItemRow item={item} />
          </View>
        ))}
      </View>
    </Stack>
  );
}

export function LegendaryView(props: LegendaryViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const dated = props.items.filter((i) => i.label.kind !== 'any');
  const always = props.items.filter((i) => i.label.kind === 'any');
  return (
    <Scaffold variant="dark" edges={['top']} testID="critters-legendaries">
      <ScrollView contentContainerStyle={{ paddingBottom: theme.space['32'] }}>
        <View style={styles.body}>
          <Row justify="space-between" align="center">
            <BackEyebrow label={upper(backToDex(), locale)} testID="critters-legendaries-back" />
            {props.items.length === 0 ? null : (
              <PillButton
                label={props.allReminded ? remindersOn() : remindMe()}
                size="sm"
                variant={props.allReminded ? 'secondary' : 'primary'}
                onPress={props.onRemind}
                testID="critters-legendaries-remind"
              />
            )}
          </Row>
          <Text variant="displayXl" singleLine={false}>
            {upper(title(), locale)}
          </Text>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {intro()}
          </Text>
          <MonthStrip
            months={props.months.map((m) => ({
              label: upper(monthNarrow(m.month, locale), locale),
              name: monthLong(m.month, locale),
              legendary: m.legendary,
              inTrip: m.inTrip,
              current: m.current,
            }))}
            testID="critters-legendaries-months"
          />
          {props.notificationsOff ? (
            <Text variant="caption" color={theme.semantic.text.secondary}>
              {inboxOnly()}
            </Text>
          ) : null}
          {props.items.length === 0 ? (
            <Stack gap="6" testID="critters-legendaries-empty">
              <Text variant="h3">{emptyTitle()}</Text>
              <Text variant="body" color={theme.semantic.text.secondary}>
                {emptyBody()}
              </Text>
            </Stack>
          ) : null}
          <Section label={onOneDay()} items={dated} />
          <Section label={hardest()} items={always} />
        </View>
      </ScrollView>
    </Scaffold>
  );
}
