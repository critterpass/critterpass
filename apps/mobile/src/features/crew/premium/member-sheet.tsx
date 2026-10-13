/**
 * A member (3.14), as a sheet over crew settings: their avatar and name, Message (the crew chat),
 * and for whoever runs the crew: Make organiser (asks, then hands the crew to them while you stay
 * in) and Remove from the crew (asks; the removal waits 10 s on the settings page behind with an
 * Undo). Nobody removes the crew's creator; only the creator removes another organiser. Your own
 * sheet has no actions.
 */
import { t } from '@lingui/core/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useContext, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { crewChatLink } from '@cp/domain';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import {
  Avatar,
  Card,
  Icon,
  ListCard,
  PressableScale,
  Row,
  Text,
  usePremiumTheme,
  useToast,
} from '@/ui/premium';
import { confirmAlert, SheetScreen } from '@/ui/premium/shell';

import { TRANSFER_ORGANISER } from '../crews-sheet/crew-commands';
import { requestRemoval } from '../members/undoable-removal';
import { useCrewDetail } from '../settings/use-crew-detail';
import { firstName } from './crew-copy';
import { memberAccent } from './crew-look';

export function MemberSheet() {
  const th = usePremiumTheme();
  const toast = useToast();
  const { crewId = '', uid: target = '' } = useLocalSearchParams<{
    crewId?: string;
    uid?: string;
  }>();
  const detail = useCrewDetail(crewId);
  const commands = useContext(LocalFirstContext)?.commands ?? null;
  const [busy, setBusy] = useState(false);
  const member = detail.members.find((m) => m.user_id === target) ?? null;
  const name = firstName(member?.display_name ?? null);
  const self = target === detail.uid;
  const creator = detail.crew?.created_by ?? null;
  const canRemove =
    detail.canManage &&
    !self &&
    target !== creator &&
    (member?.role !== 'organiser' || detail.uid === creator);
  const canPromote = detail.isOrganiser && !self && member?.role === 'member';

  const promote = async () => {
    if (commands === null || busy) return;
    const ok = await confirmAlert({
      title: t({ id: 'crew.premium.member.promoteTitle', message: `Make ${name} the organiser?` }),
      message: t({
        id: 'crew.premium.member.promoteLine',
        message: 'They run the crew from now on. You stay in as a member.',
      }),
      confirm: t({ id: 'crew.premium.member.promote', message: 'Make organiser' }),
      cancel: t({ id: 'crew.premium.cancel', message: 'Cancel' }),
      destructive: false,
    });
    if (!ok) return;
    setBusy(true);
    const sent = await commands.send(TRANSFER_ORGANISER, {
      crew_id: crewId,
      to_uid: target,
      leave: false,
      keep_in_chat: false,
    });
    setBusy(false);
    if (sent.kind === 'applied') {
      toast.show({
        kind: 'done',
        message: t({ id: 'crew.premium.member.promoted', message: `${name} runs the crew now` }),
      });
      router.back();
    } else {
      toast.show({
        kind: 'error',
        message: t({
          id: 'crew.settings.failed',
          message: 'That didn’t go through. Try again with signal.',
        }),
      });
    }
  };

  const remove = async () => {
    const ok = await confirmAlert({
      title: t({
        id: 'crew.premium.member.removeTitle',
        message: `Remove ${name} from ${detail.crew?.name ?? ''}?`,
      }),
      message: t({
        id: 'crew.premium.member.removeLine',
        message: 'They leave the crew’s trips and chat. You can undo for 10 seconds.',
      }),
      confirm: t({ id: 'crew.premium.member.remove', message: `Remove ${name}` }),
      cancel: t({ id: 'crew.premium.member.keep', message: `Keep ${name}` }),
    });
    if (!ok) return;
    router.back();
    requestRemoval(crewId, target);
  };

  return (
    <SheetScreen
      cancelLabel={t({ id: 'crew.premium.close', message: 'Close' })}
      testID="crew-member-sheet"
    >
      <View style={styles.identity}>
        <Avatar name={name} color={memberAccent(member?.colour)} uid={member?.user_id} size={76} />
        <Text variant="title" accessibilityRole="header">
          {self ? t({ id: 'crew.members.you', message: 'You' }) : name}
        </Text>
        <Text variant="body" tone="muted">
          {member?.role === 'organiser'
            ? t({ id: 'crew.premium.member.organiser', message: 'Runs this crew' })
            : t({ id: 'crew.premium.member.member', message: 'In the crew' })}
        </Text>
      </View>
      {self ? null : (
        <PressableScale
          accessibilityRole="button"
          onPress={() => router.push(crewChatLink(crewId))}
          testID="crew-member-message"
          style={styles.tileWrap}
        >
          <Card style={styles.tile}>
            <Icon name="send" size={28} color={th.accent.sky} />
            <Text variant="pillSmall">
              {t({ id: 'crew.premium.member.message', message: 'Message' })}
            </Text>
          </Card>
        </PressableScale>
      )}
      {canPromote || canRemove ? (
        <ListCard style={styles.rows}>
          {canPromote ? (
            <Row
              title={t({ id: 'crew.premium.member.promote', message: 'Make organiser' })}
              subtitle={t({
                id: 'crew.premium.member.promoteSub',
                message: 'You stay in as a member',
              })}
              onPress={() => void promote()}
              testID="crew-member-promote"
            />
          ) : null}
          {canRemove ? (
            <PressableScale
              accessibilityRole="button"
              onPress={() => void remove()}
              style={styles.removeRow}
              testID="crew-member-remove"
            >
              <Text variant="body" color={th.color.destructive.listAction}>
                {t({ id: 'crew.premium.member.removeRow', message: 'Remove from the crew' })}
              </Text>
            </PressableScale>
          ) : null}
        </ListCard>
      ) : null}
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  tileWrap: { marginTop: 16 },
  tile: { height: 92, alignItems: 'center', justifyContent: 'center', gap: 6 },
  rows: { marginTop: 12, marginBottom: 16 },
  removeRow: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14 },
});
