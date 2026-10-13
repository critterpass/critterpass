/**
 * Two pieces of a place page the premium set does not draw (undesigned, built from the kit):
 * Tickets and tours, which opens the partners' offers screen (offers are never fetched or kept by
 * this page; offline it says they need a connection) with the commission line; and "Report a
 * problem" under what the guide wrote about the place, which files `report_content` so the
 * summary is checked and written again, then thanks the person (or says it did not go).
 */
import { useLingui } from '@lingui/react/macro';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { Button, Card, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import { reportContentCommand } from '../../place-detail/commands';
import { SectionLabel } from '../components/labels';

export interface PlaceOffers {
  readonly placeName: string;
  readonly offline: boolean;
  readonly onOpen: () => void;
}

export function PlaceOffersCard({ placeName, offline, onOpen }: PlaceOffers) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  return (
    <View style={{ gap: theme.space.gap8 }} testID="explore-offers">
      <SectionLabel>{t({ id: 'explore.offers.title', message: 'Tickets and tours' })}</SectionLabel>
      <Card padded style={{ gap: theme.space.gap10 }}>
        {offline ? (
          <Text variant="body" tone="muted" testID="explore-offers-offline">
            {t({ id: 'explore.offers.offline', message: 'Offers need a connection.' })}
          </Text>
        ) : (
          <>
            <Text variant="body">
              {t({
                id: 'explore.offers.body',
                message: `See what our booking partners have for ${placeName}, in their own words.`,
              })}
            </Text>
            <Button
              size="small"
              variant="secondary"
              label={t({ id: 'explore.offers.open', message: 'See offers' })}
              onPress={onOpen}
              testID="explore-offers-open"
            />
            <Text variant="captionMuted" tone="muted">
              {t({
                id: 'explore.offers.disclosure',
                message:
                  'We may earn a commission if you book. It never changes what we rank first.',
              })}
            </Text>
          </>
        )}
      </Card>
    </View>
  );
}

type ReportState = 'idle' | 'sent' | 'failed';

export function ReportPlaceProfile({ poiId }: { readonly poiId: string }) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const { send, pending } = useCommand(reportContentCommand);
  const [state, setState] = useState<ReportState>('idle');
  const report = useCallback(() => {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- wire values, never copy.
    void send({ kind: 'place_profile', id: poiId, reason: 'inaccurate' }).then((result) =>
      setState(result.kind === 'queued' || result.kind === 'applied' ? 'sent' : 'failed'),
    );
  }, [poiId, send]);
  if (state === 'sent') {
    return (
      <Text variant="captionMuted" tone="muted" testID="place-detail-profile-reported">
        {t({
          id: 'explore.profile.reported',
          message: 'Thanks. We’ll check this summary and write it again.',
        })}
      </Text>
    );
  }
  return (
    <View style={{ gap: theme.space.gap4, alignItems: 'flex-start' }}>
      <TextButton
        label={t({ id: 'explore.profile.report', message: 'Report a problem' })}
        onPress={report}
        disabled={pending}
        testID="place-detail-profile-report"
      />
      {state === 'failed' ? (
        <Text variant="captionMuted" tone="muted" testID="place-detail-profile-report-failed">
          {t({
            id: 'explore.profile.reportFailed',
            message: 'That didn’t go through. Try again in a while.',
          })}
        </Text>
      ) : null}
    </View>
  );
}
