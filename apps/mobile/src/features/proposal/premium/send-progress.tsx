/**
 * After Send, in the premium look: each recipient's row turns to Sent as the guide finishes their
 * version; one the guide couldn't write gets the crew's shared version and says so. The crew can
 * already open it; Who's in? goes to the tracker (4.51). Undesigned in the premium set; built from
 * the kit (docs/undesigned-states.md).
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { crewColour } from '@/features/vote';
import { guideSticker } from '@/ui/avatar/guides';
import {
  Avatar,
  Button,
  CritterSticker,
  ListCard,
  Row,
  StatusTag,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import type { SendProgressProps } from '../builder/views';

export function PremiumSendProgress(props: SendProgressProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const info = guideSticker(props.guide);
  const byUid = new Map(props.versions.map((v) => [v.recipientId, v]));
  const done = props.versions.filter((v) => v.status !== 'pending').length;
  return (
    <View
      style={{ flex: 1, backgroundColor: th.color.ground, paddingTop: insets.top }}
      testID="proposal-sent"
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: th.space.titleGutter,
          paddingTop: th.space.emptyTextGap,
          gap: th.space.gap12,
        }}
      >
        <CritterSticker kind={info.kind} name={info.name} size={112} />
        <Text variant="display" accessibilityRole="header">
          {t({ id: 'proposal.sent.title', message: 'It’s on its way' })}
        </Text>
        <Text variant="body" tone="inkSecondary">
          {done < props.versions.length
            ? t({
                id: 'proposal.sent.writing',
                message: `${props.guideName} is finishing each version. The crew can open it already.`,
              })
            : t({ id: 'proposal.sent.done', message: 'Every version is written and sent.' })}
        </Text>
        <ListCard>
          {props.recipients.map((person) => {
            const version = byUid.get(person.uid);
            const ready = version !== undefined && version.status !== 'pending';
            return (
              <Row
                key={person.uid}
                testID={`sent-${person.uid}`}
                variant="person"
                leading={
                  <Avatar name={person.name} color={crewColour(person.joinIndex)} size={32} />
                }
                title={person.name}
                subtitle={
                  version?.fallbackNote ??
                  (ready
                    ? t({
                        id: 'proposal.sent.readyFor',
                        message: `${person.name}'s version is ready`,
                      })
                    : t({
                        id: 'proposal.sent.pendingFor',
                        message: `${props.guideName} is writing ${person.name}'s version`,
                      }))
                }
                trailing={
                  ready ? (
                    <StatusTag
                      tone="booked"
                      label={t({ id: 'proposal.sent.stamped', message: 'Sent' })}
                    />
                  ) : undefined
                }
              />
            );
          })}
        </ListCard>
      </ScrollView>
      <View
        style={{
          paddingHorizontal: th.space.titleGutter,
          paddingTop: th.space.gap8,
          paddingBottom: insets.bottom + th.space.gap12,
        }}
      >
        <Button
          label={t({ id: 'proposal.sent.tracker', message: 'Who’s in?' })}
          onPress={props.onTracker}
          testID="sent-tracker"
        />
      </View>
    </View>
  );
}
