/**
 * Leave the crew, handing it over (3.16): the organiser picks who runs the crew next (members in
 * join order), then "Hand over to Maya and leave" (the label follows the pick) or "Hand over, but
 * stay in". Leaving keeps the chat history readable when chosen on the settings page. Back changes
 * nothing.
 */
import { t } from '@lingui/core/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useContext, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import {
  Button,
  GuideNote,
  ListCard,
  Text,
  TextButton,
  usePremiumTheme,
  useToast,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { TRANSFER_ORGANISER } from '../crews-sheet/crew-commands';
import { returnHome } from '../start-crew/crew-created';
import { useCrewDetail } from '../settings/use-crew-detail';
import { firstName } from './crew-copy';
import { memberAccent } from './crew-look';
import { CrewMissing } from './crew-missing';
import { RadioRow } from './components/crew-bits';

export function LeaveCrewScreen() {
  const th = usePremiumTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { crewId = '', keep = '0' } = useLocalSearchParams<{ crewId?: string; keep?: string }>();
  const detail = useCrewDetail(crewId);
  const commands = useContext(LocalFirstContext)?.commands ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<'leave' | 'stay' | null>(null);
  const back = t({ id: 'crew.settings.backPlain', message: 'Back' });
  if (!detail.loaded || detail.crew === null)
    return <CrewMissing loading={!detail.loaded} backLabel={back} />;

  const others = detail.members.filter((m) => m.user_id !== detail.uid);
  const chosen = others.find((m) => m.user_id === picked) ?? others[0] ?? null;
  const chosenName = chosen === null ? '' : firstName(chosen.display_name);

  const handOver = async (leave: boolean) => {
    if (commands === null || chosen === null || busy !== null) return;
    setBusy(leave ? 'leave' : 'stay');
    const sent = await commands.send(TRANSFER_ORGANISER, {
      crew_id: crewId,
      to_uid: chosen.user_id,
      leave,
      keep_in_chat: keep === '1',
    });
    setBusy(null);
    if (sent.kind !== 'applied') {
      toast.show({
        kind: 'error',
        message: t({
          id: 'crew.settings.failed',
          message: 'That didn’t go through. Try again with signal.',
        }),
      });
      return;
    }
    toast.show({
      kind: 'done',
      message: t({
        id: 'crew.premium.member.promoted',
        message: `${chosenName} runs the crew now`,
      }),
    });
    if (leave) returnHome();
    else router.back();
  };

  return (
    <PushScreen
      title={t({ id: 'crew.settings.leave', message: 'Leave the crew' })}
      backLabel={back}
      scroll={false}
      testID="crew-leave"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingHorizontal: th.space.gutter }]}
      >
        <Text variant="display" accessibilityRole="header">
          {t({ id: 'crew.premium.leave.title', message: `Who runs ${detail.crew.name} next?` })}
        </Text>
        <Text variant="body" tone="muted">
          {t({
            id: 'crew.premium.leave.sub',
            message: 'They get the crew’s settings, codes and trips you run.',
          })}
        </Text>
        <ListCard style={styles.list}>
          {others.map((member) => (
            <RadioRow
              key={member.user_id}
              name={firstName(member.display_name)}
              color={memberAccent(member.colour)}
              selected={member.user_id === chosen?.user_id}
              onPress={() => setPicked(member.user_id)}
              testID={`crew-leave-pick-${member.user_id}`}
            />
          ))}
        </ListCard>
        <GuideNote
          name="Tokek"
          text={t({
            id: 'crew.premium.leave.note',
            message: 'You keep your critters and stamps. Money you’re owed stays in Balances.',
          })}
        />
      </ScrollView>
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 12, paddingHorizontal: th.space.titleGutter },
        ]}
      >
        <Button
          label={t({
            id: 'crew.premium.leave.go',
            message: `Hand over to ${chosenName} and leave`,
          })}
          disabled={chosen === null}
          loading={busy === 'leave'}
          onPress={() => void handOver(true)}
          testID="crew-leave-handover"
        />
        <TextButton
          label={t({ id: 'crew.premium.leave.stay', message: 'Hand over, but stay in' })}
          disabled={chosen === null || busy !== null}
          onPress={() => void handOver(false)}
          testID="crew-leave-stay"
        />
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 24 },
  list: { marginTop: 12 },
  footer: { gap: 4 },
});
