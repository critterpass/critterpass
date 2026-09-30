/**
 * Crew settings (undesigned; built from the settings group, text field, segmented control and
 * confirm sheet): rename the crew, see its members (and remove one, for whoever manages the crew),
 * the one per-crew notification level (all, mentions or off; mentions until chosen), the crew code
 * with its QR code to scan, rotate and invite, and leave, optionally keeping the chat history.
 */
import { t } from '@lingui/core/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useContext, useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
  crewNameSchema,
  DEFAULT_CREW_NOTIFY_LEVEL,
  isCrewNotifyLevel,
  type CrewNotifyLevel,
} from '@cp/domain';
import { upper } from '@cp/i18n';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';
import { PillButton } from '@/ui/buttons/PillButton';
import { Segmented } from '@/ui/inputs/Segmented';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { TextField } from '@/ui/inputs/TextField';
import { Toggle } from '@/ui/inputs/Toggle';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import {
  LEAVE_CREW,
  REMOVE_MEMBER,
  ROTATE_JOIN_CODE,
  SET_CREW_NOTIFY,
  UPDATE_CREW,
  rowId,
} from '../crews-sheet/crew-commands';
import { useCrews } from '../crews-sheet/crew-data';
import { useCrewServices } from '../crews-sheet/crew-services';
import { useSessionUid } from '../crews-sheet/CrewsSheet';
import { crewInviteRoute } from '../crews-sheet/routes';
import { returnHome } from '../start-crew/StartCrewScreen';
import { JoinQr } from '../invite-composer/JoinQr';
import { qrChannelLink } from '../invite-composer/qr-path';
import { MembersList } from '../members/MembersList';

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.space['20'],
    gap: th.space['20'],
    paddingBottom: th.space['32'],
  },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: th.space['12'],
  },
}));

export function CrewSettingsScreen() {
  const styles = useStyles();
  const locale = useLocale();
  const localFirst = useContext(LocalFirstContext);
  const services = useCrewServices();
  const uid = useSessionUid();
  const { crewId = '' } = useLocalSearchParams<{ crewId?: string }>();
  const snapshot = useCrews(localFirst?.db ?? null, uid);
  const crew = snapshot.crews.find((c) => c.id === crewId) ?? null;
  const members = snapshot.members.filter((m) => m.crew_id === crewId);
  const me = members.find((m) => m.user_id === uid) ?? null;
  const code = snapshot.codes.find((c) => c.crew_id === crewId)?.code ?? null;
  const [name, setName] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [keepChat, setKeepChat] = useState(false);
  const notify: CrewNotifyLevel =
    me?.notify_level != null && isCrewNotifyLevel(me.notify_level)
      ? me.notify_level
      : DEFAULT_CREW_NOTIFY_LEVEL;
  const canManage = me?.role === 'organiser' || (crew?.created_by ?? null) === uid;
  const commands = localFirst?.commands ?? null;

  if (crew === null || commands === null) {
    return (
      <Scaffold variant="dark" edges={['top', 'bottom']} testID="crew-settings-missing">
        <View style={styles.content}>
          <BackEyebrow label={t({ id: 'crew.settings.back', message: 'Crews' })} />
          <Text variant="body">
            {t({
              id: 'crew.settings.missing',
              message: 'This crew isn’t on your phone yet. It shows up once it syncs.',
            })}
          </Text>
        </View>
      </Scaffold>
    );
  }

  const draftName = name ?? crew.name;
  const renameValid = crewNameSchema.safeParse(draftName).success && draftName.trim() !== crew.name;
  const failed = () =>
    toast.show({
      id: rowId('crew-settings-failed', crewId),
      title: t({
        id: 'crew.settings.failed',
        message: 'That didn’t go through. Try again with signal.',
      }),
    });

  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="crew-settings">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackEyebrow label={t({ id: 'crew.settings.back', message: 'Crews' })} />
        <Text variant="displayXl" accessibilityRole="header">
          {upper(crew.name, locale)}
        </Text>
        <TextField
          label={t({ id: 'crew.settings.name', message: 'Crew name' })}
          value={draftName}
          onChangeText={setName}
          testID="crew-settings-name"
        />
        <PillButton
          size="sm"
          label={t({ id: 'crew.settings.rename', message: 'Save name' })}
          disabled={!renameValid}
          onPress={() =>
            void commands
              .send(UPDATE_CREW, { crew_id: crewId, name: draftName })
              .then(() => setName(null))
          }
          testID="crew-settings-rename"
        />
        <MembersList
          members={members}
          uid={uid}
          createdBy={crew.created_by}
          canManage={canManage}
          onRemove={(target) =>
            void commands.send(REMOVE_MEMBER, { crew_id: crewId, uid: target }).then((sent) => {
              if (sent.kind !== 'applied') failed();
            })
          }
        />
        <Segmented
          label={t({ id: 'crew.settings.notify', message: 'Notifications' })}
          segments={[
            { value: 'all' as const, label: t({ id: 'crew.settings.notifyAll', message: 'All' }) },
            {
              value: 'mentions' as const,
              label: t({ id: 'crew.settings.notifyMentions', message: 'Mentions' }),
            },
            { value: 'off' as const, label: t({ id: 'crew.settings.notifyOff', message: 'Off' }) },
          ]}
          value={notify}
          onChange={(level) => void commands.send(SET_CREW_NOTIFY, { crew_id: crewId, level })}
          testID="crew-settings-notify"
        />
        <View style={styles.code}>
          <Text variant="h3" testID="crew-settings-code">
            {code ?? t({ id: 'crew.settings.noCode', message: 'No live code' })}
          </Text>
          <PillButton
            size="sm"
            variant="secondary"
            label={t({ id: 'crew.settings.rotate', message: 'New code' })}
            onPress={() =>
              void commands.send(ROTATE_JOIN_CODE, { crew_id: crewId }).then((sent) => {
                if (sent.kind !== 'applied') failed();
              })
            }
            testID="crew-settings-rotate"
          />
        </View>
        {code === null ? null : (
          <JoinQr
            url={qrChannelLink(services.inviteUrl(code))}
            size={160}
            testID="crew-settings-qr"
          />
        )}
        <PillButton
          label={t({ id: 'crew.settings.invite', message: 'Invite someone' })}
          onPress={() => router.push(crewInviteRoute(crewId))}
          block
          testID="crew-settings-invite"
        />
        <Toggle
          value={keepChat}
          onValueChange={setKeepChat}
          label={t({
            id: 'crew.settings.keepChat',
            message: 'If I leave, keep reading the chat history',
          })}
          testID="crew-leave-keep-chat"
        />
        <SettingsGroup
          rows={[
            {
              key: 'leave',
              kind: 'destructive',
              title: t({ id: 'crew.settings.leave', message: 'Leave the crew' }),
              onPress: () => setLeaving(true),
            },
          ]}
          testID="crew-settings-leave"
        />
      </ScrollView>
      {leaving ? (
        <ConfirmSheet
          title={t({ id: 'crew.settings.leaveTitle', message: 'Leave this crew?' })}
          consequences={[
            t({
              id: 'crew.settings.leaveTrips',
              message: 'You leave its trips; your seat opens for the waitlist.',
            }),
            t({
              id: 'crew.settings.leaveRoles',
              message: 'If you organise a trip alone, the longest-standing member takes over.',
            }),
          ]}
          confirmLabel={t({ id: 'crew.settings.leaveConfirm', message: 'Leave' })}
          mode="button"
          onConfirm={() =>
            void commands
              .send(LEAVE_CREW, { crew_id: crewId, keep_in_chat: keepChat })
              .then((sent) => {
                setLeaving(false);
                if (sent.kind === 'applied') returnHome();
                else failed();
              })
          }
          onCancel={() => setLeaving(false)}
          testID="crew-leave-confirm"
        />
      ) : null}
    </Scaffold>
  );
}
