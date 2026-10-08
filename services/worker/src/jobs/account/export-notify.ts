/**
 * The "your data is ready" push (`data_export_ready`, on `data_export.ready`): to the export's
 * owner only, opening Settings where the download is. The router decides delivery and timing.
 */
import { ACCOUNT_PUSH, settingsLink } from '@cp/domain';

import { registerNotification } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, str } from '../setup/facts';

export function registerExportReadyPush(): void {
  registerNotification({
    key: 'data_export_ready',
    event: 'data_export.ready',
    audience: (_tx, routed) => {
      const uid = str(routed, 'user_id');
      return Promise.resolve(uid === null ? [] : [uid]);
    },
    compose(_tx, routed) {
      const exportId = str(routed, 'export_id') ?? '';
      return Promise.resolve({
        title: ACCOUNT_PUSH.exportReadyTitle,
        body: ACCOUNT_PUSH.exportReadyBody,
        sender: DEFAULT_SETUP_GUIDE,
        deepLink: settingsLink(),
        collapseVars: { export_id: exportId },
      });
    },
  });
}
