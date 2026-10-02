/** The crew chat lab scene after a member's account was erased. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture names and lines, never shipped copy. */
import { ScrollView } from 'react-native';

import { ChatMessage } from '@/ui/chat/ChatMessage';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { memberName } from '@/ui/people/member-name';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';

/** A crew thread a week after one member's account was erased: their lines stay, emptied. */
export function FormerMemberChat() {
  const gone = memberName(null);
  const lines: readonly { who: string | null; text: string; mine?: boolean }[] = [
    { who: 'Maya', text: "who's up for the spa on day 3?" },
    { who: null, text: 'Message deleted' },
    { who: 'Jordan', text: 'in. morning slot?' },
    { who: 'Maya', text: 'booking the 10:00, six of us' },
    { who: null, text: 'Message deleted' },
    { who: 'Winston', text: 'five now, I will fix the booking', mine: true },
    { who: 'Jordan', text: 'thanks. dinner after at the warung?' },
    { who: 'Maya', text: 'yes. I will ask them for the big table' },
    { who: null, text: 'Message deleted' },
    { who: 'Winston', text: 'see you all at the gate', mine: true },
  ];
  const faces = ['Maya', 'Jordan'];
  return (
    <Scaffold variant="dark" edges={['top']} testID="you-former-chat">
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 64 }}>
        <Stack gap="12">
          <ChatMessage kind="divider" text="Today" />
          {lines.map((line, index) => {
            const name = line.who ?? gone;
            const first = line.mine !== true && lines[index - 1]?.who !== line.who;
            return (
              <Stack key={`${index}-${name}`} gap="4">
                {first ? (
                  <Text variant="caption" style={{ marginStart: 44 }}>
                    {name}
                  </Text>
                ) : null}
                <ChatMessage
                  kind={line.mine === true ? 'mine' : 'theirs'}
                  text={line.text}
                  {...(line.mine === true
                    ? {}
                    : {
                        author: name,
                        avatar: (
                          <Avatar
                            name={name}
                            joinIndex={Math.max(0, faces.indexOf(name))}
                            size="sm"
                          />
                        ),
                      })}
                />
              </Stack>
            );
          })}
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}
