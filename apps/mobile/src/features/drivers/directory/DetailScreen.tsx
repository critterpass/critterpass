/**
 * A listed driver (6e-2): its data and actions are `useDriverDetail`. Report asks once before it
 * files the listing or the tip for moderation.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { SessionWaiting } from '@/ui/states/SessionWaiting';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';

import { DetailView } from './DetailView';
import { useDriverDetail, type DriverReport } from './use-driver-detail';

/* eslint-disable lingui/no-unlocalized-strings -- report kinds the moderation queue takes, not copy. */
const REPORT = { listing: 'driver_listing', tip: 'driver_tip' } as const;
/* eslint-enable lingui/no-unlocalized-strings */

export function DetailScreen({
  tripId,
  listingId,
}: {
  readonly tripId: string;
  readonly listingId: string;
}) {
  const { t } = useLingui();
  const detail = useDriverDetail(tripId, listingId);
  const [reporting, setReporting] = useState<DriverReport | null>(null);
  const { driver } = detail;

  if (driver === null) {
    if (detail.failed) {
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

  return (
    <>
      <DetailView
        driver={driver}
        shortlisting={detail.shortlisting}
        shortlisted={detail.shortlisted}
        onBack={() => router.back()}
        onMessage={detail.onMessage}
        onShortlist={detail.onShortlist}
        onReport={() => setReporting({ kind: REPORT.listing, id: driver.id })}
        onReportTip={() => {
          if (driver.tip !== null) setReporting({ kind: REPORT.tip, id: driver.tip.id });
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
          onConfirm={() => {
            setReporting(null);
            detail.onReport(reporting);
          }}
          onCancel={() => setReporting(null)}
          testID="drivers-report-sheet"
        />
      )}
    </>
  );
}
