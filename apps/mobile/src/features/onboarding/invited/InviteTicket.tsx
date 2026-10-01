/**
 * The yellow crew ticket (3a-10) and the stub row under it: YOU → the place, the trip's dates, the
 * seat the invitee would take of the cap and the per-person estimate, then the members already in
 * (first names and colours) and how many named seats still wait. It slides up and settles crooked
 * (about 720 ms) on arrival.
 */
import { plural, t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { money, formatMoney } from '@cp/cost-engine';
import { format, upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { useSettle } from '@/motion/patterns/settle';
import { Ticket } from '@/ui/documents/Ticket';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { TicketModel } from './ticket-model';

const useStyles = makeStyles((th) => ({
  stub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    marginTop: th.space['12'],
  },
  stubText: { flex: 1 },
}));

function placeCode(place: string | null, locale: string): string {
  if (place === null) return '???';
  return upper(place.replace(/\s+/gu, '').slice(0, 3), locale);
}

export function membersLine(model: TicketModel, locale: string): string {
  const names = model.members.map((m) => m.name);
  const listed = format.list(locale, names);
  const inLine =
    names.length === 0
      ? ''
      : t({
          id: 'onboarding.invite.ticket.membersIn',
          message: plural(names.length, {
            one: `${listed} is in.`,
            other: `${listed} are in.`,
          }),
        });
  if (model.waiting === 0) return inLine;
  const waiting = model.waiting;
  const waitLine = t({
    id: 'onboarding.invite.ticket.waiting',
    message: `${waiting} more invited, not in yet.`,
  });
  return inLine === '' ? waitLine : `${inLine} ${waitLine}`;
}

export interface InviteTicketProps {
  readonly model: TicketModel;
  /** Play the arrival (first show); settled otherwise. */
  readonly arrive: boolean;
}

export function InviteTicket({ model, arrive }: InviteTicketProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const settle = useSettle({ active: arrive });

  const dates =
    model.tripStart === null || model.tripEnd === null
      ? t({ id: 'onboarding.invite.ticket.datesOpen', message: 'Dates to vote' })
      : upper(
          format.dateInterval(locale, new Date(model.tripStart), new Date(model.tripEnd), {
            month: 'short',
            day: 'numeric',
          }),
          locale,
        );
  const seatNumber = model.seat?.number ?? 0;
  const seatCap = model.seat?.cap ?? 0;
  const seat =
    model.seat === null
      ? t({ id: 'onboarding.invite.ticket.seatCrew', message: 'Crew seat' })
      : t({ id: 'onboarding.invite.ticket.seatOf', message: `${seatNumber} of ${seatCap}` });
  const each =
    model.estimate === null
      ? t({ id: 'onboarding.invite.ticket.eachLater', message: 'Worked out together' })
      : `~${formatMoney(money(BigInt(model.estimate.minor), model.estimate.currency), {
          mode: 'local',
          locale,
        })}`;
  const crew = model.crewName ?? '';
  const members = membersLine(model, locale);

  return (
    <Animated.View style={settle}>
      <Ticket
        kind="crew"
        headStart={upper(
          t({ id: 'onboarding.invite.ticket.head', message: 'CritterPass Air · crew ticket' }),
          locale,
        )}
        headEnd={upper(crew, locale)}
        from={{ code: upper(t({ id: 'onboarding.invite.ticket.you', message: 'You' }), locale) }}
        to={{ code: placeCode(model.place, locale) }}
        fields={[
          {
            key: 'dates',
            label: upper(t({ id: 'onboarding.invite.ticket.dates', message: 'Dates' }), locale),
            value: dates,
          },
          {
            key: 'seat',
            label: upper(t({ id: 'onboarding.invite.ticket.seat', message: 'Seat' }), locale),
            value: seat,
          },
          {
            key: 'each',
            label: upper(t({ id: 'onboarding.invite.ticket.each', message: 'Each' }), locale),
            value: each,
          },
        ]}
        stubText={upper(model.place ?? crew, locale)}
        accessibilityLabel={t({
          id: 'onboarding.invite.ticket.a11y',
          message: `Crew ticket for ${crew}: ${dates}, seat ${seat}, ${each} each.`,
        })}
        testID="invite-ticket"
      />
      {model.members.length > 0 || model.waiting > 0 ? (
        <View style={styles.stub} testID="invite-ticket-members">
          <AvatarStack
            members={model.members.map((m, index) => ({
              key: `${index}`,
              name: m.name,
              joinIndex: index,
            }))}
            max={5}
            size="sm"
          />
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            style={StyleSheet.flatten(styles.stubText)}
          >
            {members}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}
