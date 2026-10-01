/**
 * The builder with nobody to send the plan to (a crew of one, or friends who haven't joined yet):
 * no pitch to make, so the organiser locks the plan in, or invites friends first. Friends who join
 * after the lock land on this plan.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { GUIDE_STICKERS, type GuideStickerId } from '@/ui/avatar/guides';
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
  const info = GUIDE_STICKERS[props.guide];
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
          {t({ id: 'proposal.alone.title', message: 'Lock the plan in?' })}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {props.dates === ''
            ? t({
                id: 'proposal.alone.body',
                message: `It’s just you on ${destination} for now, so there’s nobody to pitch it to. Lock it in and the trip is on. Friends who join later land on this plan.`,
              })
            : t({
                id: 'proposal.alone.bodyDates',
                message: `It’s just you on ${destination}, ${props.dates}, for now, so there’s nobody to pitch it to. Lock it in and the trip is on. Friends who join later land on this plan.`,
              })}
        </Text>
        {props.offline ? <OfflinePill /> : null}
      </View>
      <View style={styles.footer}>
        <PillButton
          label={t({ id: 'proposal.alone.lock', message: 'Lock it in' })}
          onPress={props.onLock}
          loading={props.locking}
          disabled={props.offline}
          sheen
          testID="build-lock-alone"
        />
        <PillButton
          variant="secondary"
          label={t({ id: 'proposal.alone.invite', message: 'Invite friends first' })}
          onPress={props.onInvite}
          testID="build-invite"
        />
      </View>
    </Scaffold>
  );
}
