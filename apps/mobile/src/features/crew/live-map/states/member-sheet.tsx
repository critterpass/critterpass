/**
 * Tapping a pin: who, what they are doing, when their location last came in, and CALL when they
 * share their number with the crew.
 */
import { t } from '@lingui/core/macro';
import { Linking, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { Sheet } from '@/ui/sheet/Sheet';
import { Row, Stack, Text, useTheme } from '@/ui';

import type { PersonView } from '../data/view-model';

/** `tel:` URL for a displayed number (spaces and punctuation dropped). */
export function telUrl(phone: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a URL scheme, never copy.
  return `tel:${phone.replace(/[^+\d]/gu, '')}`;
}

export function lastSeenLine(
  person: PersonView,
  now: number,
  time: (at: number) => string,
): string {
  if (person.position === null) return '';
  const minutes = Math.round((now - person.position.at) / 60_000);
  if (minutes < 1) return t({ id: 'liveMap.sheet.justNow', message: 'Updated just now' });
  return t({
    id: 'liveMap.sheet.lastSeen',
    message: `Last seen ${minutes} min ago, at ${time(person.position.at)}`,
  });
}

export function MemberSheet({
  people,
  title,
  status,
  lastSeen,
  onDismiss,
}: {
  readonly people: readonly PersonView[];
  readonly title: string;
  readonly status: string;
  readonly lastSeen: string;
  readonly onDismiss: () => void;
}) {
  const theme = useTheme();
  const callable = people.filter((person) => person.phone !== null && !person.isMe);
  return (
    <Sheet
      detents={['fit']}
      onDismiss={onDismiss}
      accessibilityLabel={title}
      testID="live-member-sheet"
    >
      <View
        style={{
          paddingHorizontal: theme.space['20'],
          paddingBottom: theme.space['24'],
          gap: theme.space['16'],
        }}
      >
        <Row style={{ gap: theme.space['12'], alignItems: 'center' }}>
          <AvatarStack
            members={people.map((person) => ({
              key: person.uid,
              name: person.name,
              joinIndex: person.joinIndex,
            }))}
            max={3}
            size="lg"
          />
          <Stack gap="2" style={{ flex: 1 }}>
            <Text variant="h3" accessibilityRole="header">
              {title}
            </Text>
            <Text variant="body" color={theme.semantic.text.secondary}>
              {status}
            </Text>
            {lastSeen === '' ? null : (
              <Text variant="caption" color={theme.semantic.text.secondary}>
                {lastSeen}
              </Text>
            )}
          </Stack>
        </Row>
        {callable.map((person) => (
          <PillButton
            key={person.uid}
            label={
              callable.length === 1
                ? t({ id: 'liveMap.sheet.call', message: 'Call' })
                : t({ id: 'liveMap.sheet.callName', message: `Call ${person.name}` })
            }
            variant="secondary"
            onPress={() => void Linking.openURL(telUrl(person.phone ?? ''))}
            block
            testID={`live-call-${person.uid}`}
          />
        ))}
      </View>
    </Sheet>
  );
}
