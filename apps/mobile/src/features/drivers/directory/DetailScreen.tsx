/**
 * A listed driver (6e-2) over the api: MESSAGE ON WHATSAPP opens WhatsApp with a first line ready
 * (the user sends it), Add to shortlist puts him on this trip with his number, and Report asks once
 * before filing the listing or the tip for moderation.
 */
import { whatsAppLink, type DriverDirectoryDetail } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { feedback, toast } from '@/motion';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { SessionWaiting } from '@/ui/states/SessionWaiting';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';

import { fetchDriverDetail } from '../ours/api';
import { reportContentCommand, shortlistListedDriverCommand } from '../ours/commands';
import { DetailView } from './DetailView';

type Reporting = { readonly kind: 'driver_listing' | 'driver_tip'; readonly id: string } | null;

export function DetailScreen({
  tripId,
  listingId,
}: {
  readonly tripId: string;
  readonly listingId: string;
}) {
  const { t } = useLingui();
  const [driver, setDriver] = useState<DriverDirectoryDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [shortlisted, setShortlisted] = useState(false);
  const [reporting, setReporting] = useState<Reporting>(null);
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

  if (driver === null) {
    if (failed) {
      return (
        <Scaffold testID="drivers-detail-unavailable">
          <Stack gap="12" style={{ padding: 20, paddingTop: 64 }}>
            <BackEyebrow
              label={t({ id: 'drivers.detail.back', message: "Crews' drivers" })}
              onPress={() => router.back()}
            />
            <Text variant="body">
              {t({
                id: 'drivers.detail.unavailable',
                message: "This driver's listing isn't available right now. He may have paused it.",
              })}
            </Text>
          </Stack>
        </Scaffold>
      );
    }
    return <SessionWaiting testID="drivers-detail-loading" />;
  }

  const first = driver.display_name.split(' ')[0] ?? driver.display_name;
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

  async function onReport(target: NonNullable<Reporting>) {
    setReporting(null);
    await report.send({ kind: target.kind, id: target.id, reason: 'inaccurate' });
    toast.show({
      id: 'drivers-report',
      title: t({ id: 'drivers.detail.reported', message: 'Thanks. We will take a look.' }),
    });
  }

  return (
    <>
      <DetailView
        driver={driver}
        shortlisting={shortlist.pending}
        shortlisted={shortlisted}
        onBack={() => router.back()}
        onMessage={() =>
          void Linking.openURL(
            whatsAppLink(
              driver.phone_e164,
              t({
                id: 'drivers.detail.firstLine',
                message: `Hi ${first}, I found you on CritterPass. Are you free to drive our group?`,
              }),
            ),
          )
        }
        onShortlist={() => void onShortlist()}
        onReport={() => setReporting({ kind: 'driver_listing', id: driver.id })}
        onReportTip={() => {
          if (driver.tip !== null) setReporting({ kind: 'driver_tip', id: driver.tip.id });
        }}
      />
      {reporting === null ? null : (
        <ConfirmSheet
          title={t({ id: 'drivers.report.title', message: 'Report this?' })}
          consequences={[
            t({
              id: 'drivers.report.line',
              message: 'Our team reviews it. Nobody sees who reported it.',
            }),
          ]}
          confirmLabel={t({ id: 'drivers.report.confirm', message: 'Report' })}
          mode="button"
          onConfirm={() => void onReport(reporting)}
          onCancel={() => setReporting(null)}
          testID="drivers-report-sheet"
        />
      )}
    </>
  );
}
