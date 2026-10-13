/**
 * "What the crew sees" (4.11): this person's own coming week as the crew's counts read it, seven
 * tiles under their weekdays (free in mint, busy in ink, maybe on butter with a dashed edge, a dash
 * where nothing is shared), and the line that event names and times stay on the phone.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card, Text, usePremiumTheme } from '@/ui/premium';

import { markWord } from '../../calendar/manual-days';
import type { MyDay } from '../../calendar/use-my-days';
import { dayRange } from '../../data/date-range';
import { weekdayLetters } from '../../when/copy';

const NONE = '–';

export function CrewSees({ week }: { readonly week: readonly MyDay[] }) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const first = week[0];
  const last = week.at(-1);
  if (first === undefined || last === undefined) return null;
  const letters = weekdayLetters(locale);
  const look = (state: MyDay['state']) =>
    state === 'free'
      ? { bg: theme.color.status.booked.bg, ink: theme.color.status.booked.text, dashed: false }
      : state === 'busy'
        ? { bg: theme.color.ink, ink: theme.color.onInk, dashed: false }
        : state === 'maybe'
          ? { bg: theme.color.status.maybe.bg, ink: theme.color.status.maybe.text, dashed: true }
          : { bg: theme.color.control, ink: theme.color.placeholder, dashed: false };
  return (
    <Card padded testID="calendar-crew-sees">
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="label" tone="muted" style={{ flex: 1 }}>
          {t({ id: 'setup.premium.calendar.crewSees', message: 'What the crew sees' })}
        </Text>
        <Text variant="label" tone="muted">
          {dayRange(locale, first.date, last.date)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: theme.space.gap8 }}>
        {week.map((day) => {
          const colours = look(day.state);
          // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO date, never copy.
          const column = (new Date(`${day.date}T12:00:00Z`).getUTCDay() + 6) % 7;
          const word = day.state === 'unknown' ? NONE : markWord(day.state);
          const weekday = letters[column] ?? '';
          const dayNumber = String(Number(day.date.slice(8)));
          const spoken = markWord(day.state === 'unknown' ? undefined : day.state);
          return (
            <View
              key={day.date}
              style={{ flex: 1, gap: 4, alignItems: 'center' }}
              accessible
              accessibilityLabel={t({
                id: 'setup.premium.calendar.dayA11y',
                message: `${weekday} ${dayNumber}: ${spoken}`,
              })}
            >
              <Text variant="badge" tone="placeholder">
                {weekday}
              </Text>
              <View
                style={{
                  alignSelf: 'stretch',
                  height: 40,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colours.bg,
                  ...(colours.dashed
                    ? {
                        borderWidth: 1.5,
                        borderStyle: 'dashed',
                        borderColor: theme.color.status.maybe.text,
                      }
                    : {}),
                }}
              >
                <Text variant="badge" color={colours.ink} numberOfLines={1} adjustsFontSizeToFit>
                  {word}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      <Text variant="captionMuted" tone="inkSecondary" style={{ marginTop: theme.space.gap8 }}>
        {t({
          id: 'setup.premium.calendar.staysHere',
          message: 'Event names and times stay on your phone.',
        })}
      </Text>
    </Card>
  );
}
