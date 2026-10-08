/** Settings › App › Widgets: the way into the widget gallery (5c-5). */
import { t } from '@lingui/core/macro';

import type { SettingsRow } from '@/ui/inputs/SettingsGroup';

export function widgetsRow(onPress: (() => void) | undefined): SettingsRow | null {
  if (onPress === undefined) return null;
  return {
    key: 'widgets',
    kind: 'value',
    title: t({ id: 'you.settings.widgets', message: 'Widgets' }),
    subtitle: t({ id: 'you.settings.widgetsLine', message: 'The trip on your home screen' }),
    value: '',
    onPress,
  };
}

/** Settings › App › Invite friends: the way into the member's referral link and who joined with it. */
export function inviteFriendsRow(onPress: (() => void) | undefined): SettingsRow | null {
  if (onPress === undefined) return null;
  return {
    key: 'invite-friends',
    kind: 'value',
    title: t({ id: 'you.settings.inviteFriends', message: 'Invite friends' }),
    subtitle: t({
      id: 'you.settings.inviteFriendsLine',
      message: 'Your link, and who joined with it',
    }),
    value: '',
    onPress,
  };
}
