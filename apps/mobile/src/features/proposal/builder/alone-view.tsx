/**
 * The builder with nobody to send the plan to (a crew of one, or friends who haven't joined yet):
 * there is no pitch to make yet, so inviting friends is the main action (she came here to send
 * the plan to them) and locking the plan in alone is the second. Friends who join after a lock
 * land on this plan.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { guideSticker, type GuideStickerId } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  header: {
    paddingHorizontal: th.space['20'],
    minHeight: th.space['32'] + th.space['12'],
    justifyContent: 'center',
  },
  body: { flex: 1, paddingHorizontal: th.space['20'], gap: th.space['14'] },
  footer: { paddingHorizontal: th.space['20'], gap: th.space['10'], paddingBottom: th.space['8'] },
}));

export interface AloneViewProps {
  readonly guide: GuideStickerId;
  readonly destination: string;
  /** "Oct 2–4", or empty before the dates are set. */
  readonly dates: string;
  readonly offline: boolean;
  readonly locking: boolean;
  readonly onBack: () => void;
  readonly onLock: () => void;
  readonly onInvite: () => void;
}

export function AloneView(props: AloneViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const info = guideSticker(props.guide);
  const destination = props.destination;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="proposal-alone">
      <View style={styles.header}>
        <BackEyebrow
          label={t({ id: 'proposal.alone.back', message: `${destination} plan` })}
          onPress={props.onBack}
          testID="build-back"
        />
      </View>
      <View style={styles.body}>
        <Sticker kind={info.kind} name={info.name} size={96} />
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'proposal.alone.inviteTitle', message: 'Invite your friends first' })}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {props.dates === ''
            ? t({
                id: 'proposal.alone.inviteBody',
                message: `It’s just you on ${destination} for now, so there’s nobody to send the plan to. Invite your friends, then send it once they’ve joined.`,
              })
            : t({
                id: 'proposal.alone.inviteBodyDates',
                message: `It’s just you on ${destination}, ${props.dates}, for now, so there’s nobody to send the plan to. Invite your friends, then send it once they’ve joined.`,
              })}
        </Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary} singleLine={false}>
          {t({
            id: 'proposal.alone.soloNote',
            message:
              'Going alone? Lock it in and the trip is on. Friends who join later land on this plan.',
          })}
        </Text>
        {props.offline ? <OfflinePill /> : null}
      </View>
      <View style={styles.footer}>
        <PillButton
          label={t({ id: 'proposal.alone.inviteFriends', message: 'Invite friends' })}
          onPress={props.onInvite}
          sheen
          testID="build-invite"
        />
        <PillButton
          variant="secondary"
          label={t({ id: 'proposal.alone.lockAlone', message: 'Lock it in alone' })}
          onPress={props.onLock}
          loading={props.locking}
          disabled={props.offline}
          testID="build-lock-alone"
        />
      </View>
    </Scaffold>
  );
}
