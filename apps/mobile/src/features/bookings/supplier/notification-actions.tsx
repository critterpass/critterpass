/**
 * SEND on the push for a message to a place (category `cp.vendor`): the push shows the exact text,
 * and the tap approves that text through `approve_vendor_message`. The text is read again from the
 * trip's threads first, so what is approved is what the desk holds; a draft that changed or was
 * already answered is not approved from the push. Either way the app opens on the trip's messages,
 * where the card says where it stands. A tap that cold-started the app is picked up from the last
 * response once the session is up.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { deviceSupplierApi } from './data/api';
import { approveVendorMessageCommand } from './data/commands';
import { vendorMessagesRoute } from './routes';
import {
  APPROVE,
  handleVendorApproval,
  VENDOR_CATEGORY,
  vendorApprovalOf,
} from './vendor-approval';

/** Mounted once inside the signed-in session: the category's button title and the handler. */
export function VendorNotificationActions() {
  const { t, i18n } = useLingui();
  const { send } = useCommand(approveVendorMessageCommand);

  useEffect(() => {
    Notifications.setNotificationCategoryAsync(VENDOR_CATEGORY, [
      {
        identifier: APPROVE,
        buttonTitle: t({ id: 'suppliers.vendor.send', message: 'Send' }),
        options: { opensAppToForeground: true },
      },
    ]).catch(() => undefined);
  }, [t, i18n.locale]);

  useEffect(() => {
    const deps = {
      threads: async (tripId: string) => {
        const outcome = await deviceSupplierApi.vendorThreads(tripId);
        return outcome.kind === 'ok' ? outcome.value : null;
      },
      send,
      open: (tripId: string) => router.push(vendorMessagesRoute(tripId)),
    };
    const onResponse = (response: Notifications.NotificationResponse | null) => {
      if (response === null) return;
      const approval = vendorApprovalOf(response);
      if (approval === null) return;
      void handleVendorApproval(approval, deps).then(() =>
        Notifications.clearLastNotificationResponseAsync().catch(() => undefined),
      );
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(onResponse);
    Notifications.getLastNotificationResponseAsync().then(onResponse, () => undefined);
    return () => subscription.remove();
  }, [send]);

  return null;
}
