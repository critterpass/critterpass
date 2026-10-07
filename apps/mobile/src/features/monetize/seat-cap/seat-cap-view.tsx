/**
 * Seven's a crowd (4f-1): the crew is full at the free cap and someone else was invited. The sheet
 * shows the seats, what a boost costs for the crew once that person is in, and the two ways on:
 * boost the trip, or keep the cap and put them on the waitlist.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { StatusChip } from '@/ui/chips/StatusChip';
import { Row } from '@/ui/layout/Row';
import { SeatsRow } from '@/ui/monetize/SeatsRow';
import { Avatar } from '@/ui/people/Avatar';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface SeatCapViewProps {
  readonly destination: string;
  readonly cap: number;
  /** Who is seated, in join order. */
  readonly seats: ReadonlyArray<{ readonly uid: string; readonly name: string }>;
  /** The invited person's name; null when the invite names nobody. */
  readonly invitee: string | null;
  /** The store's price for a trip boost; null while the store has none to show. */
  readonly price: string | null;
  /** Each share if the crew, the invitee included, split it; null when unknown. */
  readonly each: string | null;
  /** How many would share it (the seated crew and the invitee). */
  readonly ways: number;
  readonly onBoost: () => void;
  readonly onKeep: () => void;
  readonly onDismiss: () => void;
}

const useStyles = makeStyles((th) => ({
  body: { padding: th.space['20'], gap: th.space['16'], alignItems: 'stretch' },
  price: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['12'],
  },
  grow: { flex: 1 },
}));

export function SeatCapView(props: SeatCapViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { destination, cap, price, each, ways } = props;
  const seat = cap + 1;
  const name = props.invitee ?? t({ id: 'monetize.seatCap.someone', message: 'your invitee' });
  return (
    <Sheet detents={['fit']} onDismiss={props.onDismiss} testID="seat-cap-sheet">
      <View style={styles.body}>
        <Text variant="eyebrow" color={theme.semantic.action.primary}>
          {upper(
            t({ id: 'monetize.seatCap.eyebrow', message: `${destination} · Seat ${seat}` }),
            locale,
          )}
        </Text>
        <Text variant="h1" accessibilityRole="header" testID="seat-cap-title">
          {cap === 6
            ? t({ id: 'monetize.seatCap.titleSix', message: 'Seven’s a crowd' })
            : t({ id: 'monetize.seatCap.title', message: 'The crew’s full' })}
        </Text>
        <SeatsRow
          capacity={cap}
          seats={props.seats.map((member, index) => ({
            id: member.uid,
            name: member.name,
            avatar: <Avatar name={member.name} joinIndex={index} size="md" decorative />,
          }))}
          waiting={{
            id: 'invitee',
            name,
            avatar: <Avatar name={name} joinIndex={props.seats.length} size="md" decorative />,
          }}
          testID="seat-cap-seats"
        />
        <Text variant="body" color={theme.semantic.text.secondary} testID="seat-cap-line">
          {t({
            id: 'monetize.seatCap.body',
            message: `Free crews top out at ${cap}. Boost ${destination} and ${name} gets a seat, with everything else a boost adds for the whole crew.`,
          })}
        </Text>
        {price === null ? null : (
          <Row gap="10" align="center" style={styles.price}>
            <Text variant="rowTitle" style={styles.grow} testID="seat-cap-price">
              {each === null
                ? price
                : t({ id: 'monetize.seatCap.price', message: `${price}, or ${each} each` })}
            </Text>
            {each === null ? null : (
              <StatusChip
                status="in"
                label={upper(
                  t({ id: 'monetize.seatCap.split', message: `Split ${ways} ways` }),
                  locale,
                )}
              />
            )}
          </Row>
        )}
        <PillButton
          label={
            price === null
              ? t({ id: 'monetize.seatCap.boost', message: `Boost ${destination}` })
              : t({ id: 'monetize.seatCap.boostPrice', message: `Boost ${destination} · ${price}` })
          }
          tone="pink"
          onPress={props.onBoost}
          block
          testID="seat-cap-boost"
        />
        <InlineAction
          label={t({ id: 'monetize.seatCap.keep', message: `Keep it at ${cap}` })}
          onPress={props.onKeep}
          testID="seat-cap-keep"
        />
      </View>
    </Sheet>
  );
}
