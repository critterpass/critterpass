/**
 * How a member likes to sleep (4.17): three option cards (share a room, own room, don't mind) and
 * the chips the guide should know (light sleeper, early riser, night owl, snoring, ground floor).
 */
import { ROOM_SLEEP_CHOICES, type RoomSleepChoice } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Icon, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

/* eslint-disable lingui/no-unlocalized-strings -- chip keys, never copy. */
export const CHIPS = [
  'light_sleeper',
  'early_bird',
  'night_owl',
  'snorer',
  'ground_floor',
] as const;
/* eslint-enable lingui/no-unlocalized-strings */

export function SleepChoices(props: {
  readonly sleep: RoomSleepChoice | null;
  readonly chips: readonly string[];
  readonly onSleep: (sleep: RoomSleepChoice) => void;
  readonly onChips: (chips: readonly string[]) => void;
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const shownSleep = props.sleep;
  const shownChips = props.chips;
  const setSleep = props.onSleep;
  const setChips = props.onChips;
  const option = (choice: RoomSleepChoice) =>
    choice === 'share'
      ? {
          title: t({ id: 'setup.premium.sleep.share', message: 'Share a room' }),
          line: t({ id: 'setup.premium.sleep.shareLine', message: 'Cheapest' }),
        }
      : choice === 'own'
        ? {
            title: t({ id: 'setup.premium.sleep.own', message: 'Own room' }),
            line: t({ id: 'setup.premium.sleep.ownLine', message: 'Costs more a night' }),
          }
        : {
            title: t({ id: 'setup.premium.sleep.either', message: 'Don’t mind' }),
            line: t({ id: 'setup.premium.sleep.eitherLine', message: 'The guide decides' }),
          };
  const chipLabel = (chip: string) =>
    chip === 'light_sleeper'
      ? t({ id: 'setup.premium.chip.light', message: 'Light sleeper' })
      : chip === 'early_bird'
        ? t({ id: 'setup.premium.chip.early', message: 'Early riser' })
        : chip === 'night_owl'
          ? t({ id: 'setup.premium.chip.owl', message: 'Night owl' })
          : chip === 'snorer'
            ? t({ id: 'setup.premium.chip.snore', message: 'I snore, honestly' })
            : t({ id: 'setup.premium.chip.ground', message: 'Ground floor' });
  return (
    <>
      <Text variant="label" tone="muted" style={{ paddingHorizontal: theme.space.gap8 }}>
        {t({ id: 'setup.premium.sleep.title', message: 'How do you like to sleep?' })}
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.space.gap8 }}>
        {ROOM_SLEEP_CHOICES.map((choice) => {
          const on = shownSleep === choice;
          const words = option(choice);
          return (
            <PressableScale
              key={choice}
              onPress={() => setSleep(choice)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${words.title}. ${words.line}`}
              testID={`budget-sleep-${choice}`}
              style={{
                flex: 1,
                minHeight: 104,
                borderRadius: theme.radius.card,
                padding: theme.space.gap12,
                backgroundColor: theme.color.card,
                borderWidth: on ? 2 : 0.5,
                borderColor: on ? theme.color.ink : theme.color.hairline,
                justifyContent: 'flex-end',
                gap: 2,
              }}
            >
              {on ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: theme.color.ink,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="check" size={12} color={theme.color.onInk} />
                </View>
              ) : null}
              <Text variant="rowTextStrong">{words.title}</Text>
              <Text variant="captionMuted" tone="muted">
                {words.line}
              </Text>
            </PressableScale>
          );
        })}
      </View>
      <Text variant="label" tone="muted" style={{ paddingHorizontal: theme.space.gap8 }}>
        {t({ id: 'setup.premium.sleep.know', message: 'Anything the guide should know' })}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap8 }}>
        {CHIPS.map((chip) => {
          const on = shownChips.includes(chip);
          return (
            <PressableScale
              key={chip}
              onPress={() =>
                setChips(on ? shownChips.filter((entry) => entry !== chip) : [...shownChips, chip])
              }
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              testID={`budget-chip-${chip}`}
              style={{
                height: 36,
                borderRadius: 18,
                paddingHorizontal: theme.space.rowPadH,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.gap4,
                backgroundColor: on ? theme.color.ink : theme.color.card,
                ...(on ? {} : { boxShadow: theme.shadow.float }),
              }}
            >
              {on ? <Icon name="check" size={12} color={theme.color.onInk} /> : null}
              <Text variant="pillSmall" tone={on ? 'onInk' : 'ink'}>
                {chipLabel(chip)}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </>
  );
}
