/**
 * The ways out when no week fits everyone (3c-4): the best partial week (who can't make all of
 * it, which must-dos they'd miss), the best full-crew week (its fare difference and season
 * trade-off) and "ask {name} first" when the blocker only has a maybe block. The guide's pick
 * wears the pick tag; the selected card is outlined in yellow. Cards deal in one after another.
 * An ask shows its progress on its card: asked and waiting, freed, can't move it, no answer.
 */
import { formatNarrowCurrency } from '@cp/cost-engine';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';


import { useLocale } from '@/lib/i18n/use-locale';
import { patterns } from '@/motion';
import { Stack } from '@/ui/layout/Stack';
import { Row } from '@/ui/layout/Row';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { SetupMember } from '../data/setup-trip';
import { countWord, namesList, rangeLabel } from './copy';
import type { WindowOption } from './model';

export interface OptionPeople {
  readonly members: readonly SetupMember[];
  readonly guideName: string;
  readonly place: string;
  /** Must-do titles by id (the ones a partial week would miss). */
  readonly mustDoTitles: ReadonlyMap<string, string>;
}

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    borderWidth: th.space['2'],
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['12'],
  },
  body: { flex: 1, gap: th.space['2'] },
  trailing: { alignItems: 'flex-end', gap: th.space['6'] },
  pick: {
    backgroundColor: th.semantic.action.primary,
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['4'],
  },
}));

function minorToMajor(amountMinor: number, currency: string): number {
  const digits =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return Math.round(amountMinor / 10 ** digits);
}

/** "−$90" / "+$90" (the sign is added here: Hermes's NumberFormat has no `signDisplay`). */
export function deltaLabel(locale: string, amountMinor: number, currency: string): string {
  const amount = formatNarrowCurrency(
    locale,
    minorToMajor(Math.abs(amountMinor), currency),
    currency,
    { maximumFractionDigits: 0 },
  );
  if (amountMinor === 0) return amount;
  return `${amountMinor < 0 ? '−' : '+'}${amount}`;
}

function nameOf(people: OptionPeople, uid: string | null): string {
  return people.members.find((member) => member.uid === uid)?.name ?? '';
}

export function optionTitle(locale: string, option: WindowOption, people: OptionPeople): string {
  const range = rangeLabel(locale, option.start, option.end);
  const total = countWord(option.memberCount);
  if (option.kind === 'ask_first') {
    const name = nameOf(people, option.askUserId);
    return t({ id: 'setup.when.option.askTitle', message: `Ask ${name} first` });
  }
  if (option.freeCount >= option.memberCount) {
    return t({ id: 'setup.when.option.allTitle', message: `${range} · all ${total}` });
  }
  const free = countWord(option.freeCount);
  return t({ id: 'setup.when.option.partTitle', message: `${range} · ${free} of ${total}` });
}

function askProgress(option: WindowOption, name: string): string | null {
  switch (option.askState) {
    case 'asked':
      return t({
        id: 'setup.when.option.asked',
        message: `Asked ${name} privately. Waiting for an answer, up to two days.`,
      });
    case 'freed':
      return t({ id: 'setup.when.option.freed', message: `${name} freed it. Everyone fits now.` });
    case 'not_movable':
      return t({
        id: 'setup.when.option.notMovable',
        message: `${name} can’t move it. Pick another week.`,
      });
    case 'timed_out':
      return t({
        id: 'setup.when.option.timedOut',
        message: `No answer from ${name} in two days, so I set this one aside.`,
      });
    case null:
      return null;
  }
}

export function optionLine(locale: string, option: WindowOption, people: OptionPeople): string {
  if (option.kind === 'ask_first') {
    const name = nameOf(people, option.askUserId);
    return (
      askProgress(option, name) ??
      t({
        id: 'setup.when.option.askLine',
        message: `${name} has a maybe block that week. I’ll ask privately.`,
      })
    );
  }
  const delta =
    option.priceDeltaMinor === null || option.priceDeltaMinor === 0 || option.currency === null
      ? null
      : deltaLabel(locale, Math.abs(option.priceDeltaMinor), option.currency).slice(1);
  if (option.freeCount >= option.memberCount) {
    const place = people.place;
    const first =
      option.reason === 'season_trade'
        ? t({
            id: 'setup.when.option.allPastSeason',
            message: `Everyone is free, but it’s past ${place}’s best season.`,
          })
        : t({ id: 'setup.when.option.allFree', message: 'Everyone is free that week.' });
    if (delta === null) return first;
    return (option.priceDeltaMinor ?? 0) < 0
      ? t({ id: 'setup.when.option.fareDrop', message: `${first} Flights drop ${delta}.` })
      : t({ id: 'setup.when.option.fareRise', message: `${first} Flights cost ${delta} more.` });
  }
  const names = namesList(
    locale,
    option.missingIds.map((uid) => nameOf(people, uid)).filter((name) => name !== ''),
  );
  const missed = option.missedMustDoIds
    .map((id) => people.mustDoTitles.get(id))
    .filter((title): title is string => title !== undefined);
  if (missed.length === 0) {
    return t({ id: 'setup.when.option.partLine', message: `${names} can’t make all of it.` });
  }
  const list = namesList(locale, missed);
  return t({
    id: 'setup.when.option.partMisses',
    message: `${names} can’t make all of it and would miss ${list}.`,
  });
}

interface CardProps {
  readonly option: WindowOption;
  readonly index: number;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly people: OptionPeople;
}

function OptionCard({ option, index, selected, onSelect, people }: CardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const deal = patterns.useDeal({ active: true, index });
  const title = optionTitle(locale, option, people);
  const line = optionLine(locale, option, people);
  const guide = people.guideName;
  const pick = option.isPick
    ? t({ id: 'setup.when.option.pick', message: `${guide}'s pick` })
    : null;
  const free = people.members.filter((member) => !option.missingIds.includes(member.uid));
  const closed = option.askState === 'not_movable' || option.askState === 'timed_out';
  const delta =
    option.kind === 'full_crew' && option.priceDeltaMinor !== null && option.currency !== null
      ? deltaLabel(locale, option.priceDeltaMinor, option.currency)
      : null;
  return (
    <Animated.View style={deal}>
      <PressScale
        onPress={onSelect}
        disabled={closed}
        widthClass="wide"
        accessibilityRole="radio"
        accessibilityLabel={[title, line, pick].filter(Boolean).join(', ')}
        accessibilityState={{ checked: selected, disabled: closed }}
        testID={`window-option-${option.kind}`}
        style={[
          styles.card,
          { borderColor: selected ? theme.semantic.action.primary : 'transparent' },
        ]}
      >
        <Row align="center" gap="12">
          <View style={styles.body}>
            <Text variant="title">{title}</Text>
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {line}
            </Text>
          </View>
          <Stack style={styles.trailing}>
            {pick === null ? null : (
              <View style={styles.pick}>
                <Text variant="label" color={theme.semantic.text.onAccent}>
                  {pick}
                </Text>
              </View>
            )}
            {option.kind === 'partial' && pick === null ? (
              <AvatarStack
                members={free.map((member) => ({
                  key: member.uid,
                  name: member.name,
                  joinIndex: member.joinIndex,
                }))}
                size="sm"
                max={5}
              />
            ) : null}
            {delta === null ? null : (
              <Text
                variant="title"
                color={
                  (option.priceDeltaMinor ?? 0) < 0
                    ? theme.semantic.state.success
                    : theme.semantic.state.warning
                }
              >
                {delta}
              </Text>
            )}
          </Stack>
        </Row>
      </PressScale>
    </Animated.View>
  );
}

export interface WindowOptionsProps {
  readonly options: readonly WindowOption[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly people: OptionPeople;
}

export function WindowOptions({ options, selectedId, onSelect, people }: WindowOptionsProps) {
  return (
    <Stack gap="10" accessibilityRole="radiogroup">
      {options.map((option, index) => (
        <OptionCard
          key={option.id}
          option={option}
          index={index}
          selected={option.id === selectedId}
          onSelect={() => onSelect(option.id)}
          people={people}
        />
      ))}
    </Stack>
  );
}
