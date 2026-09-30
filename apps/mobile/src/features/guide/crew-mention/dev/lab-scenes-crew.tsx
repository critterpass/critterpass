/**
 * Guide lab scenes for the guide in crew chat (3g-1), over the Bali Six fixtures with every handler
 * a no-op: the offer card open, confirming, taken by you, full, expired and refused, and the
 * guide's typing, its reply streaming in, and the spent-meter hint above the composer.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { Scaffold, Stack, Text, makeStyles, useTheme } from '@/ui';
import { ChatMessage } from '@/ui/chat/ChatMessage';
import { Composer } from '@/ui/chat/Composer';
import { Avatar } from '@/ui/people/Avatar';

import { GuideChatHintView } from '../guide-chat-hint';
import { OfferCardView, type ClaimProblem, type OfferState } from '../offer-card';

const noop = () => undefined;
const OFFER = "Karsa Spa has three slots at 14:00. Tap in and I'll book it and split it.";
const NOW = new Date('2026-10-03T07:48:00Z');

const useStyles = makeStyles((t) => ({
  body: { padding: t.size.gutter, gap: t.space['12'] },
  foot: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['12'], gap: t.space['8'] },
}));

function CrewChat({
  offer,
  hint,
}: {
  readonly offer: {
    state: OfferState;
    confirming?: boolean;
    problem?: ClaimProblem;
    taken?: number;
  } | null;
  readonly hint?: ReactNode;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Scaffold edges={['top', 'bottom']} testID="guide-crew-lab">
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="h2">THE BALI SIX</Text>
        <ChatMessage
          kind="theirs"
          text="who's up for the spa on day 3?"
          avatar={<Avatar name="Maya" joinIndex={0} size="sm" decorative />}
        />
        <ChatMessage
          kind="theirs"
          text="me, my legs are done after that ridge walk"
          avatar={<Avatar name="Alex" joinIndex={2} size="sm" decorative />}
        />
        <ChatMessage kind="mine" text="same, book me in" />
        <ChatMessage
          kind="theirs"
          text="warung lunch was 1.08M for six btw"
          avatar={<Avatar name="Winston" joinIndex={3} size="sm" decorative />}
        />
        {offer === null ? null : (
          <OfferCardView
            text={OFFER}
            color={theme.guide.tokek}
            state={offer.state}
            slotsLeft={3 - (offer.taken ?? 2)}
            taken={offer.taken ?? 2}
            total={3}
            confirming={offer.confirming === true}
            problem={offer.problem ?? null}
            onIn={noop}
            onConfirm={noop}
            onNotNow={noop}
          />
        )}
        <ChatMessage kind="mine" text="@tokek can we catch sunset somewhere after?" />
      </ScrollView>
      <Stack style={styles.foot}>
        {hint}
        <Composer
          value=""
          onChangeText={noop}
          onSend={noop}
          onAttach={noop}
          placeholder="Message, or @tokek"
        />
      </Stack>
    </Scaffold>
  );
}

const hint = (props: Partial<Parameters<typeof GuideChatHintView>[0]>) => (
  <GuideChatHintView
    slug="tokek"
    guideName="Tokek"
    replies={[]}
    typing={false}
    spentResetAt={undefined}
    now={NOW}
    {...props}
  />
);

export const CREW_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'crew-typing': () => <CrewChat offer={{ state: 'open' }} hint={hint({ typing: true })} />,
  'crew-offer-confirm': () => <CrewChat offer={{ state: 'open', confirming: true }} />,
  'crew-offer-mine': () => <CrewChat offer={{ state: 'mine', taken: 3 }} />,
  'crew-offer-full': () => <CrewChat offer={{ state: 'full', taken: 3 }} />,
  'crew-offer-expired': () => <CrewChat offer={{ state: 'expired' }} />,
  'crew-offer-problem': () => <CrewChat offer={{ state: 'open', problem: 'offer_full' }} />,
  'crew-streaming': () => (
    <CrewChat
      offer={{ state: 'open' }}
      hint={hint({
        replies: [{ key: 'r', text: 'Batu Bolong at 18:05. Twenty minutes from the spa.' }],
      })}
    />
  ),
  'crew-spent': () => (
    <CrewChat offer={null} hint={hint({ spentResetAt: '2026-10-03T15:00:00Z' })} />
  ),
};
