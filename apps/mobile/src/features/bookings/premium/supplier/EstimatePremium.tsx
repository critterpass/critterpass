/**
 * "Why this estimate", as a premium sheet: what one fare range rests on (a meter tariff, a
 * regulated band or the operator's own rates), busy-time and minimum-fare notes, each source as a
 * link row with when it was checked, and whether a person has reviewed the figures yet.
 */
import { useLingui } from '@lingui/react/macro';
import { Linking, StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Icon, PressableScale, Text, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { formatCheckedDate } from '../../getting-around/EstimateSheet';
import { parseEstimateOption } from '../../getting-around/routes';

export function EstimatePremium({ raw }: { readonly raw: string | undefined }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const option = parseEstimateOption(raw);
  const date = (value: string) => formatCheckedDate(value, locale);
  return (
    <SheetScreen
      title={t({ id: 'suppliers.estimate.title', message: 'Why this estimate' })}
      cancelLabel={t({ id: 'suppliers.premium.close', message: 'Close' })}
      testID="supplier-estimate-sheet"
    >
      <View style={[styles.body, { paddingHorizontal: th.space.gutter, gap: th.space.gap14 }]}>
        {option === null ? (
          <Text variant="body" tone="inkSecondary" testID="supplier-estimate-gone">
            {t({
              id: 'suppliers.estimate.gone',
              message: 'That estimate isn’t on this phone any more. Open the ride again to see it.',
            })}
          </Text>
        ) : (
          <View style={{ gap: th.space.gap14 }} testID="supplier-estimate-why">
            <Text variant="body">
              {option.basis === 'meter_tariff'
                ? t({
                    id: 'suppliers.estimate.meter',
                    message: `${option.operator}'s published meter tariff, over the routed distance and time.`,
                  })
                : option.basis === 'regulated_band'
                  ? t({
                      id: 'suppliers.estimate.band',
                      message:
                        'The fare band the local regulator publishes, over the routed distance and time.',
                    })
                  : t({
                      id: 'suppliers.estimate.operator',
                      message: `${option.operator}'s own published rates, over the routed distance and time.`,
                    })}
            </Text>
            {option.peak_factor !== null ? (
              <Text variant="rowText" tone="inkSecondary">
                {t({
                  id: 'suppliers.estimate.peak',
                  message: `The top of the range allows for busy-time prices up to ${option.peak_factor}×; real surges can go higher.`,
                })}
              </Text>
            ) : null}
            {option.minimum_applied ? (
              <Text variant="rowText" tone="inkSecondary">
                {t({
                  id: 'suppliers.estimate.minimum',
                  message: 'This trip is short enough that the minimum fare applies.',
                })}
              </Text>
            ) : null}
            <Text variant="badge" tone="muted">
              {t({ id: 'suppliers.estimate.sources', message: 'SOURCES' })}
            </Text>
            <View
              style={[
                styles.card,
                {
                  borderRadius: th.radius.card,
                  backgroundColor: th.color.card,
                  boxShadow: th.shadow.card,
                },
              ]}
            >
              {option.sources.map((source, index) => {
                const on = date(source.checked_on);
                return (
                  <PressableScale
                    key={`${source.url}-${source.covers}`}
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(source.url).catch(() => undefined)}
                    testID="supplier-estimate-source"
                  >
                    <View
                      style={[
                        styles.row,
                        index === 0
                          ? null
                          : {
                              borderTopWidth: StyleSheet.hairlineWidth,
                              borderTopColor: th.color.hairline,
                            },
                      ]}
                    >
                      <View style={styles.flex}>
                        <Text variant="rowTitle">{source.covers}</Text>
                        <Text variant="captionMuted" tone="muted">
                          {t({ id: 'suppliers.estimate.sourceChecked', message: `Checked ${on}` })}
                        </Text>
                      </View>
                      <Icon name="forward" size={14} color={th.color.placeholder} />
                    </View>
                  </PressableScale>
                );
              })}
            </View>
            <Text variant="captionMuted" tone="muted" testID="supplier-estimate-review">
              {option.reviewed
                ? t({
                    id: 'suppliers.estimate.reviewedOn',
                    message: `Reviewed by our team, figures checked ${date(option.checked_at)}. Drivers and meters can differ.`,
                  })
                : t({
                    id: 'suppliers.estimate.unreviewed',
                    message: `Not reviewed by a person yet: figures taken from the sources on ${date(option.checked_at)}. Drivers and meters can differ.`,
                  })}
            </Text>
          </View>
        )}
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 4, paddingBottom: 32 },
  card: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  flex: { flex: 1, minWidth: 0 },
});
