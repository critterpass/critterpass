/**
 * A found booking (3h-2). The first waiting one is open: doodle, title, "Fri Oct 16 · Sanur →
 * Penida · 6 seats · $228", FROM ALEX'S EMAIL, the "Split 6 ways" switch, ADD and IGNORE. The rest
 * are compact with ADD. Fields assemble one by one (460 ms apart) as Tokek reads them. Parsing,
 * couldn't-read and already-in-the-wallet cards are built from the same card (undesigned).
 */
import { upper } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { useMotionMode } from '@/motion/motion-mode';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { Icon } from '@/ui/icons/Icon';
import { Toggle } from '@/ui/inputs/Toggle';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { makeStyles, sizeToken, useTheme } from '@/ui/theme';

import { clock, dayDate, price as formatPrice, zoneOf } from '../format';
import { candidateIcon, type CandidateView } from './candidate-model';

/** Per-field reveal as Tokek reads the confirmation. */
export const ASSEMBLE_STAGGER_MS = 460;

const useStyles = makeStyles((t) => ({
  grow: { flex: 1, minWidth: 0 },
  half: { flex: 1 },
  split: { flexShrink: 1 },
  // Whose inbox it came from, in a filled pill that reads on the raised card (3h-2).
  from: {
    flexShrink: 1,
    justifyContent: 'center',
    minHeight: sizeToken(t.size.chip, 'height'),
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space['10'],
    backgroundColor: t.semantic.bg.control,
  },
}));

export interface CandidateCardProps {
  readonly view: CandidateView;
  readonly variant: 'open' | 'compact';
  readonly split: boolean;
  /** Reveal the fields one by one (a card that just finished parsing). */
  readonly assemble: boolean;
  readonly tz?: string | undefined;
  readonly onSplit: (next: boolean) => void;
  readonly onAdd: () => void;
  readonly onIgnore: () => void;
  readonly onByHand: () => void;
}

function useLine(view: CandidateView, tz: string | undefined): string {
  const locale = useLocale();
  const { t } = useLingui();
  const booking = view.booking;
  if (booking === null) return '';
  const zone = zoneOf(booking.tz, tz);
  const start = booking.segments[0]?.sched_dep_at ?? booking.starts_at;
  // A flight reads "07:05 → 08:30" when the confirmation printed when it lands.
  const lands = booking.segments[booking.segments.length - 1]?.sched_arr_at;
  const leaves = clock(locale, start, zone);
  const seats = view.travellerIds.length;
  return [
    dayDate(locale, start, zone),
    booking.kind === 'stay'
      ? ''
      : lands === undefined || leaves === ''
        ? leaves
        : `${leaves} → ${clock(locale, lands, zone)}`,
    booking.location ?? '',
    seats >= 2
      ? t({
          id: 'bookings.candidate.seats',
          message: plural(seats, { one: '# seat', other: '# seats' }),
        })
      : '',
    view.mine && booking.price !== null
      ? t({ id: 'bookings.candidate.paidByYou', message: 'paid by you' })
      : '',
    booking.price === null
      ? ''
      : formatPrice(locale, booking.price.amount_minor, booking.price.currency),
  ]
    .filter((part) => part !== '')
    .join(' · ');
}

export function CandidateCard(props: CandidateCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const [motionMode] = useMotionMode();
  const { view } = props;
  const line = useLine(view, props.tz);
  const animate = props.assemble && motionMode !== 'off';
  const reveal = (node: ReactNode, key: string, order: number) => {
    const delay = order * ASSEMBLE_STAGGER_MS;
    return (
      <Animated.View key={key} {...(animate ? { entering: FadeIn.delay(delay) } : {})}>
        {node}
      </Animated.View>
    );
  };
  const testID = `bookings-candidate-${view.id}`;
  if (view.state === 'parsing') {
    return (
      <Card testID={`${testID}-parsing`}>
        <Stack gap="8">
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {t({ id: 'bookings.candidate.parsing', message: 'Tokek is reading it…' })}
          </Text>
          <Skeleton preset="lines" />
        </Stack>
      </Card>
    );
  }
  const title =
    view.booking?.title ?? t({ id: 'bookings.candidate.untitled', message: 'A booking' });
  const head = (
    <Row gap="12" align="center">
      <Icon name={candidateIcon(view.booking)} size={32} decorative />
      <Stack gap="2" style={styles.grow}>
        <Text variant="title" numberOfLines={2}>
          {upper(title, locale)}
        </Text>
        {line === '' ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {line}
          </Text>
        )}
      </Stack>
      {props.variant === 'compact' && view.state === 'pending' ? (
        <PillButton
          label={t({ id: 'bookings.candidate.add', message: 'Add' })}
          onPress={props.onAdd}
          size="sm"
          testID={`${testID}-add`}
        />
      ) : null}
    </Row>
  );
  if (view.state === 'failed' || view.state === 'duplicate') {
    const failed = view.state === 'failed';
    return (
      <Card testID={`${testID}-${view.state}`}>
        <Stack gap="12">
          {view.booking === null ? null : head}
          <Text variant="body">
            {failed
              ? t({
                  id: 'bookings.candidate.failed',
                  message: 'Couldn’t read this one — add it by hand.',
                })
              : t({ id: 'bookings.candidate.duplicate', message: 'Already in the wallet.' })}
          </Text>
          <Row gap="8">
            {failed ? (
              <PillButton
                label={t({ id: 'bookings.candidate.byHand', message: 'Add by hand' })}
                onPress={props.onByHand}
                size="sm"
                testID={`${testID}-by-hand`}
              />
            ) : null}
            <PillButton
              label={t({ id: 'bookings.candidate.dismiss', message: 'Dismiss' })}
              onPress={props.onIgnore}
              variant="secondary"
              size="sm"
              testID={`${testID}-dismiss`}
            />
          </Row>
        </Stack>
      </Card>
    );
  }
  if (props.variant === 'compact') return <Card testID={testID}>{head}</Card>;
  const who = view.fromMember;
  return (
    <Card testID={testID}>
      <Stack gap="14">
        {reveal(head, 'head', 0)}
        <Row gap="8" align="center" justify="space-between">
          {who === null
            ? null
            : reveal(
                <View style={styles.from} testID="bookings-candidate-from">
                  <Text variant="label" numberOfLines={1}>
                    {upper(
                      t({ id: 'bookings.candidate.from', message: `From ${who}’s email` }),
                      locale,
                    )}
                  </Text>
                </View>,
                'from',
                1,
              )}
          {view.canSplit
            ? reveal(
                <Row gap="8" align="center" style={styles.split}>
                  <Text variant="bodySm">
                    {t({
                      id: 'bookings.candidate.split',
                      message: plural(view.travellerIds.length, {
                        one: 'Split # way',
                        other: 'Split # ways',
                      }),
                    })}
                  </Text>
                  <Toggle
                    value={props.split}
                    onValueChange={props.onSplit}
                    label={t({ id: 'bookings.candidate.splitA11y', message: 'Split the price' })}
                    testID={`${testID}-split`}
                  />
                </Row>,
                'split',
                2,
              )
            : null}
        </Row>
        {view.needsConfirm
          ? reveal(
              <Text variant="bodySm" color={theme.semantic.state.warning}>
                {t({
                  id: 'bookings.candidate.check',
                  message: 'Something in this email looked odd. Check it before you add it.',
                })}
              </Text>,
              'check',
              3,
            )
          : null}
        {reveal(
          <Row gap="8">
            <View style={styles.half}>
              <PillButton
                label={t({ id: 'bookings.candidate.add', message: 'Add' })}
                onPress={props.onAdd}
                size="sm"
                block
                testID={`${testID}-add`}
              />
            </View>
            <View style={styles.half}>
              <PillButton
                label={t({ id: 'bookings.candidate.ignore', message: 'Ignore' })}
                onPress={props.onIgnore}
                variant="secondary"
                size="sm"
                block
                testID={`${testID}-ignore`}
              />
            </View>
          </Row>,
          'actions',
          4,
        )}
      </Stack>
    </Card>
  );
}
