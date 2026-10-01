/**
 * {N}'S A CROWD (4f-1): someone is waiting for a seat on a full trip. The sheet shows the crew's
 * seats with the waiting member's dashed seat, why (free crews top out at the cap), BOOST when
 * the monetisation area offers it, and "Keep it at {cap}". Nobody joins by themselves: a freed
 * seat is offered to the next person waiting.
 */
import { SEAT_CAP_FREE } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Avatar } from '@/ui/people/Avatar';
import { EmptySeat } from '@/ui/people/EmptySeat';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { CrewPerson } from '../data/trip';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'], gap: th.space['14'] },
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
}));

export interface CrowdSheetProps {
  readonly destination: string;
  readonly cap: number;
  readonly seated: readonly CrewPerson[];
  readonly waiting: readonly CrewPerson[];
  readonly onBoost: (() => void) | null;
  readonly onClose: () => void;
}

export function CrowdSheet(props: CrowdSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const next = props.waiting[0];
  const seat = props.cap + 1;
  const cap = props.cap;
  const destination = props.destination;
  const who = next?.name ?? '';
  return (
    <Sheet detents={['medium']} onDismiss={props.onClose} testID="crowd-sheet">
      <View style={styles.body}>
        <Text variant="eyebrow" color={theme.semantic.action.primary}>
          {t({ id: 'proposal.crowd.eyebrow', message: `${destination} · seat ${seat}` })}
        </Text>
        <Text variant="h1" accessibilityRole="header">
          {cap === SEAT_CAP_FREE
            ? t({ id: 'proposal.crowd.titleSeven', message: 'Seven’s a crowd' })
            : t({ id: 'proposal.crowd.title', message: `${seat} is a crowd` })}
        </Text>
        <View style={styles.seats}>
          {props.seated.map((p) => (
            <Avatar key={p.uid} name={p.name} joinIndex={p.joinIndex} size="md" />
          ))}
          {props.waiting.map((p) => (
            <EmptySeat key={p.uid} label={p.name} />
          ))}
        </View>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {props.onBoost === null
            ? t({
                id: 'proposal.crowd.bodyNoBoost',
                message: `Free crews top out at ${cap}. ${who} is first in line: if a seat frees up, it’s offered to them.`,
              })
            : t({
                id: 'proposal.crowd.body',
                message: `Free crews top out at ${cap}. Boost ${destination} and ${who} gets a seat, and the whole crew gets the live map and unlimited redrafts.`,
              })}
        </Text>
        {props.onBoost === null ? null : (
          <PillButton
            tone="pink"
            label={t({ id: 'proposal.crowd.boost', message: `Boost ${destination}` })}
            onPress={props.onBoost}
            testID="crowd-boost"
          />
        )}
        <TextLink
          label={t({ id: 'proposal.crowd.keep', message: `Keep it at ${cap}` })}
          onPress={props.onClose}
          testID="crowd-keep"
        />
      </View>
    </Sheet>
  );
}
