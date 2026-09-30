/**
 * "Why this estimate": what one fare range rests on (a meter tariff, a regulated band or the
 * operator's own rates), each source with what it covers and when it was checked, and whether a
 * person has reviewed the figures yet.
 */
import type { RideFareEstimateOption } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { Linking } from 'react-native';

import { TextLink } from '@/ui/buttons/TextLink';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export interface EstimateSheetProps {
  readonly option: RideFareEstimateOption;
  /** Formats an ISO date for the reader. */
  readonly date: (iso: string) => string;
}

export function EstimateSheet({ option, date }: EstimateSheetProps) {
  const theme = useTheme();
  const { t } = useLingui();
  const operator = option.operator;
  const basis =
    option.basis === 'meter_tariff'
      ? t({
          id: 'suppliers.estimate.meter',
          message: `${operator}'s published meter tariff, over the routed distance and time.`,
        })
      : option.basis === 'regulated_band'
        ? t({
            id: 'suppliers.estimate.band',
            message:
              'The fare band the local regulator publishes, over the routed distance and time.',
          })
        : t({
            id: 'suppliers.estimate.operator',
            message: `${operator}'s own published rates, over the routed distance and time.`,
          });
  const peak = option.peak_factor;
  const checked = date(option.checked_at);
  return (
    <Stack gap="14" testID="supplier-estimate-why">
      <Text variant="body">{basis}</Text>
      {peak !== null ? (
        <Text variant="bodySm">
          {t({
            id: 'suppliers.estimate.peak',
            message: `The top of the range allows for busy-time prices up to ${peak}×; real surges can go higher.`,
          })}
        </Text>
      ) : null}
      {option.minimum_applied ? (
        <Text variant="bodySm">
          {t({
            id: 'suppliers.estimate.minimum',
            message: 'This trip is short enough that the minimum fare applies.',
          })}
        </Text>
      ) : null}
      <Stack gap="8">
        <Text variant="eyebrow" color={theme.semantic.text.secondary}>
          {t({ id: 'suppliers.estimate.sources', message: 'SOURCES' })}
        </Text>
        {option.sources.map((source) => {
          const on = date(source.checked_on);
          return (
            <Stack key={`${source.url}-${source.covers}`} gap="2">
              <TextLink
                label={source.covers}
                onPress={() => void Linking.openURL(source.url).catch(() => undefined)}
              />
              <Text variant="caption" color={theme.semantic.text.secondary}>
                {t({ id: 'suppliers.estimate.sourceChecked', message: `Checked ${on}` })}
              </Text>
            </Stack>
          );
        })}
      </Stack>
      <Text
        variant="caption"
        color={theme.semantic.text.secondary}
        testID="supplier-estimate-review"
      >
        {option.reviewed
          ? t({
              id: 'suppliers.estimate.reviewedOn',
              message: `Reviewed by our team, figures checked ${checked}. Drivers and meters can differ.`,
            })
          : t({
              id: 'suppliers.estimate.unreviewed',
              message: `Not reviewed by a person yet: figures taken from the sources on ${checked}. Drivers and meters can differ.`,
            })}
      </Text>
    </Stack>
  );
}
