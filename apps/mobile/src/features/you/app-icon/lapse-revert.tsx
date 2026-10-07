/**
 * Pass+ styles end with Pass+ (a pause keeps them): whenever the app comes forward with a Pass+
 * style on the home screen and no Pass+ behind it, the default icon goes back and a toast says
 * why. Renders nothing. An account whose entitlements have not synced yet is left alone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and ids, never copy. */
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { toastQueue } from '@/motion/island-toast';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { setAppIconCommand } from './app-icon-command';
import { deviceAppIcon, type AppIconDevice } from './device';
import { iconStylesOpen, revertLapsedIcon, type IconStylesRow } from './picker-model';

export const ICON_STYLES_SQL =
  'SELECT pass_plus, icon_styles FROM user_entitlements WHERE user_id = ?';
export const ICON_STYLES_TABLES = ['user_entitlements'];

export function AppIconLapseRevert({
  device = deviceAppIcon,
}: {
  readonly device?: AppIconDevice;
}) {
  const { t } = useLingui();
  const uid = useOwnerUid();
  const { rows } = useLiveRows<IconStylesRow>(
    ICON_STYLES_SQL,
    uid === null ? null : [uid],
    ICON_STYLES_TABLES,
  );
  const { send } = useCommand(setAppIconCommand);
  const row = rows[0];
  const known = row !== undefined;
  const open = iconStylesOpen(row);
  const title = t({
    id: 'you.appIcon.lapsed',
    message: 'Pass+ ended, so the app icon is back to Passport.',
  });

  useEffect(() => {
    if (!known || open) return undefined;
    const check = () =>
      void revertLapsedIcon(open, {
        getCurrent: device.getCurrent,
        setNative: device.set,
        record: (payload) => send(payload),
      }).then((reverted) => {
        if (reverted) toastQueue.show({ id: 'app-icon-lapsed', title });
      });
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => subscription.remove();
  }, [known, open, device, send, title]);

  return null;
}
