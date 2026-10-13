/**
 * The builder with nobody to send the plan to, in the premium look: inviting friends leads (she
 * came here to send the plan to them) and locking the plan in alone is the second action; on a
 * solo trip the order flips. Undesigned in the premium set; built from the kit
 * (docs/undesigned-states.md). Reads and commands are the shared `BuilderScreen`'s.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guideSticker } from '@/ui/premium/stickers/guides';
import { Button, CritterSticker, OfflinePill, Text, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { AloneViewProps } from '../builder/views';
import { lockTitle } from '../labels';

export function PremiumAloneView(props: AloneViewProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const info = guideSticker(props.guide);
  const destination = props.destination;
  const solo = props.solo === true;
  const invite = (
    <Button
      variant={solo ? 'secondary' : 'primary'}
      label={t({ id: 'proposal.alone.inviteFriends', message: 'Invite friends' })}
      onPress={props.onInvite}
      testID="build-invite"
    />
  );
  const lock = (
    <Button
      variant={solo ? 'primary' : 'secondary'}
      label={t({ id: 'proposal.alone.lockAlone', message: 'Lock it in alone' })}
      onPress={props.onLock}
      loading={props.locking}
      disabled={props.offline}
      testID="build-lock-alone"
    />
  );
  return (
    <PushScreen
      title={t({ id: 'proposal.alone.back', message: `${destination} plan` })}
      {...(props.dates === '' ? {} : { subtitle: props.dates })}
      backLabel={t({ id: 'proposal.alone.back', message: `${destination} plan` })}
      scroll={false}
      testID="proposal-alone"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: th.space.titleGutter,
          paddingTop: th.space.gap16,
          gap: th.space.gap12,
        }}
      >
        <CritterSticker kind={info.kind} name={info.name} size={96} />
        <Text variant="display" accessibilityRole="header">
          {solo
            ? lockTitle(true)
            : t({ id: 'proposal.alone.inviteTitle', message: 'Invite your friends first' })}
        </Text>
        {solo ? null : (
          <Text variant="body" tone="inkSecondary">
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
        )}
        <Text variant={solo ? 'body' : 'note'} tone="muted">
          {t({
            id: 'proposal.alone.soloNote',
            message:
              'Going alone? Lock it in and the trip is on. Friends who join later land on this plan.',
          })}
        </Text>
        {props.offline ? <OfflinePill /> : null}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: th.space.titleGutter,
          paddingBottom: insets.bottom + th.space.gap12,
          gap: th.space.gap10,
        }}
      >
        {solo ? lock : invite}
        {solo ? invite : lock}
      </View>
    </PushScreen>
  );
}
