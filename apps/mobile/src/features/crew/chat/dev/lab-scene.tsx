/**
 * A stretch of crew chat with fixed messages, for review and screenshots: crewmates' bubbles, the
 * member's own and a line from the guide, drawn by the same bubble the chat uses.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture messages, never shipped copy. */
import { ScrollView } from 'react-native';

import { Stack } from '@/ui/layout/Stack';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';

import { Bubble } from '../components/bubble';
import type { ChatMessage } from '../data/rows';

const ME = 'u-me';

const LINES: readonly (readonly [sender: string, name: string, body: string])[] = [
  ['u-maya', 'Maya Tan', 'Villa door code is 4471. Check-in from 3 pm'],
  ['u-maya', 'Maya Tan', 'I paid the deposit, Rp 2.400.000 each'],
  [ME, 'Winston', 'Sent mine to your BCA account ending 8830'],
  ['u-leo', 'Leo Park', 'My flight is SQ 938, booking ref K7PQ2Z'],
  [ME, 'Winston', 'See you at arrivals'],
];

function message(index: number, sender: string, name: string, body: string): ChatMessage {
  return {
    id: `lab-${String(index)}`,
    crewId: 'lab-crew',
    seq: index + 1,
    senderKind: 'user',
    senderId: sender,
    senderName: name,
    guideId: null,
    type: 'text',
    body,
    refKind: null,
    refId: null,
    replyToId: null,
    mentions: [],
    mentionsGuide: false,
    attachments: [],
    edited: false,
    deleted: false,
    createdAt: '2026-10-07T03:00:00.000Z',
    status: 'sent',
  };
}

export function ChatLabScene() {
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="chat-lab-scene">
      <ScrollView>
        <Stack gap="8" padding="16">
          <Text variant="eyebrow">The Bali Six</Text>
          {LINES.map(([sender, name, body], index) => (
            <Bubble
              key={body}
              message={message(index, sender, name, body)}
              mine={sender === ME}
              first={LINES[index - 1]?.[0] !== sender}
              last={LINES[index + 1]?.[0] !== sender}
              joinIndex={sender === ME ? 0 : sender === 'u-maya' ? 1 : 2}
            />
          ))}
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}
