/**
 * A listed driver for either UI, over the api: the listing, the first WhatsApp line ready to send,
 * adding him to this trip's shortlist, and reporting the listing or its tip for moderation.
 */
import { whatsAppLink, type DriverDirectoryDetail } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { shortName } from '@/lib/people/member-name';
import { useCommand } from '@/data/commands/use-command';
import { feedback, toast } from '@/motion';

import { fetchDriverDetail } from '../ours/api';
import { reportContentCommand, shortlistListedDriverCommand } from '../ours/commands';

export type DriverReport = { readonly kind: 'driver_listing' | 'driver_tip'; readonly id: string };

export function useDriverDetail(tripId: string, listingId: string) {
  const { t } = useLingui();
  const [driver, setDriver] = useState<DriverDirectoryDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [shortlisted, setShortlisted] = useState(false);
  const shortlist = useCommand(shortlistListedDriverCommand);
  const report = useCommand(reportContentCommand);

  useEffect(() => {
    let live = true;
    void fetchDriverDetail(listingId).then((outcome) => {
      if (!live) return;
      if (outcome.kind === 'ok') setDriver(outcome.value);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [listingId]);

  async function onShortlist() {
    const result = await shortlist.send({ trip_id: tripId, listing_id: listingId });
    if (result.kind === 'applied') {
      feedback.emit('success');
      setShortlisted(true);
      return;
    }
    feedback.emit('error');
    toast.show({
      id: 'drivers-shortlist',
      title: t({ id: 'drivers.detail.shortlistFailed', message: "Couldn't add him. Try again." }),
    });
  }

  async function onReport(target: DriverReport) {
    await report.send({ kind: target.kind, id: target.id, reason: 'inaccurate' });
    toast.show({
      id: 'drivers-report',
      title: t({ id: 'drivers.detail.reported', message: 'Thanks. We will take a look.' }),
    });
  }

  const message = () => {
    if (driver === null) return;
    const first = shortName(driver.display_name);
    void Linking.openURL(
      whatsAppLink(
        driver.phone_e164,
        t({
          id: 'drivers.detail.firstLine',
          message: `Hi ${first}, I found you on CritterPass. Are you free to drive our group?`,
        }),
      ),
    );
  };

  return {
    driver,
    failed,
    shortlisted,
    shortlisting: shortlist.pending,
    onShortlist: () => void onShortlist(),
    onMessage: message,
    onReport: (target: DriverReport) => void onReport(target),
  };
}
