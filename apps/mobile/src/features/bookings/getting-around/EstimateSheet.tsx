/**
 * "Why this estimate": what one fare range rests on (a meter tariff, a regulated band or the
 * operator's own rates), each source with what it covers and when it was checked, and whether a
 * person has reviewed the figures yet.
 */
import type { RideFareEstimateOption } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { Linking, Pressable } from 'react-native';

import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

export interface EstimateSheetProps {
  readonly option: RideFareEstimateOption;
  readonly locale: string;
  /** The reader's zone, for values that carry a time; calendar dates never shift. */
  readonly timeZone?: string | undefined;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * "30 Sep 2026" for a check date. A date-only value (`2026-09-30`) is a calendar day, so it is
 * formatted as that day in any zone; a full timestamp is shown in the reader's zone.
 */
export function formatCheckedDate(value: string, locale: string, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const day = DATE_ONLY.exec(value);
  if (day) {
    const at = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(at);
  }
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { ...options, ...(timeZone ? { timeZone } : {}) }).format(
    at,
  );
}

const useStyles = makeStyles(() => ({
  source: { alignSelf: 'stretch', minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
}));

export function EstimateSheet({ option, locale, timeZone }: EstimateSheetProps) {
  const theme = useTheme();
  const styles = useStyles();
  const date = (value: string) => formatCheckedDate(value, locale, timeZone);
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
              <Pressable
                accessibilityRole="link"
                onPress={() => void Linking.openURL(source.url).catch(() => undefined)}
                style={styles.source}
                testID="supplier-estimate-source"
              >
                <Text
                  variant="body"
                  color={theme.semantic.action.primary}
                  style={{ textAlign: 'left', textDecorationLine: 'underline' }}
                >
                  {source.covers}
                </Text>
              </Pressable>
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
