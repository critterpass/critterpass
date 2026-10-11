/**
 * The yellow crew ticket (3a-10) and the stub row under it: YOU → the place, the trip's dates, the
 * seat the invitee would take of the cap and the per-person estimate, then the members already in
 * (first names and colours) and how many named seats still wait. It slides up and settles crooked
 * (about 720 ms) on arrival.
 */
import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { useSettle } from '@/motion/patterns/settle';
import { Ticket } from '@/ui/documents/Ticket';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { membersLine, placeCode, ticketFacts } from './ticket-facts';
import type { TicketModel } from './ticket-model';

export { membersLine };

const useStyles = makeStyles((th) => ({
  stub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    marginTop: th.space['12'],
  },
  stubText: { flex: 1 },
}));

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

  const { dates, seat, each, members } = ticketFacts(model, locale);
  const crew = model.crewName ?? '';

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
