/**
 * {N}'S A CROWD (4f-1) over the tracker: someone is waiting for a seat on a full trip. The crew's
 * seats with the waiting member in a dashed slot, why (free crews top out at the cap), Boost when
 * the monetisation area offers it, and "Keep it at {cap}". Nobody joins by themselves: a freed seat
 * is offered to the next person waiting. Undesigned in the premium set; built from the kit's sheet.
 */
import { SEAT_CAP_FREE } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PremiumSheet } from '@/features/album';
import { crewColour } from '@/features/vote';
import { Button, CrewStack, EmptySlot, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import type { CrewPerson } from '../data/trip';

export interface CrowdSheetProps {
  readonly destination: string;
  readonly cap: number;
  readonly seated: readonly CrewPerson[];
  readonly waiting: readonly CrewPerson[];
  readonly onBoost: (() => void) | null;
  readonly onClose: () => void;
}

export function PremiumCrowdSheet(props: CrowdSheetProps) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const seat = props.cap + 1;
  const cap = props.cap;
  const destination = props.destination;
  const who = props.waiting[0]?.name ?? '';
  return (
    <PremiumSheet
      title={
        cap === SEAT_CAP_FREE
          ? t({ id: 'proposal.crowd.titleSeven', message: 'Seven’s a crowd' })
          : t({ id: 'proposal.crowd.title', message: `${seat} is a crowd` })
      }
      onClose={props.onClose}
      testID="crowd-sheet"
    >
      <View style={{ gap: theme.space.gap14 }}>
        <Text variant="captionMuted" tone="muted">
          {t({ id: 'proposal.crowd.eyebrow', message: `${destination} · seat ${seat}` })}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap8 }}>
          <CrewStack
            members={props.seated.map((p) => ({
              id: p.uid,
              name: p.name,
              color: crewColour(p.joinIndex),
            }))}
            accessibilityLabel={props.seated.map((p) => p.name).join(', ')}
            max={props.seated.length}
          />
          {props.waiting.map((p) => (
            <EmptySlot key={p.uid} label={p.name} />
          ))}
        </View>
        <Text variant="body" tone="muted">
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
          <Button
            label={t({ id: 'proposal.crowd.boost', message: `Boost ${destination}` })}
            onPress={props.onBoost}
            testID="crowd-boost"
          />
        )}
        <TextButton
          label={t({ id: 'proposal.crowd.keep', message: `Keep it at ${cap}` })}
          onPress={props.onClose}
          align="center"
          testID="crowd-keep"
        />
      </View>
    </PremiumSheet>
  );
}
