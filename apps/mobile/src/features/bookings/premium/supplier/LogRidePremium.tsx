/**
 * LOG IT, as a premium sheet: Cancel left and "Log it" right; what the ride cost, typed as money,
 * and whether it splits between the people who rode. Without an amount only the ride is kept on
 * the leg. Once logged it says so, with Done. A typed amount asks before the sheet goes.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { amountText } from '@/data/money/amount-digits';
import { useLocale } from '@/lib/i18n/use-locale';
import { Button, Text, TextField, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { useLogRide, type LogRideParams } from '../../getting-around/use-log-ride';
import { ErrorLine } from './SupplierParts';

export function LogRidePremium({ params }: { readonly params: LogRideParams }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const { digits, setDigits, done, failed, saving, people, save } = useLogRide(params);
  const label = t({ id: 'suppliers.log.cost', message: 'What it cost' });
  return (
    <SheetScreen
      title={t({ id: 'suppliers.log.title', message: 'Log the ride' })}
      cancelLabel={t({ id: 'suppliers.premium.cancel', message: 'Cancel' })}
      {...(done === null
        ? {
            verb: {
              label: t({ id: 'suppliers.log.save', message: 'Log it' }),
              disabled: saving,
              testID: 'supplier-log-ride-save',
              onPress: () => {
                save();
                // The result shows in the sheet; it closes from Done.
                return false;
              },
            },
          }
        : {})}
      dirty={done === null && digits !== ''}
      discardPrompt={{
        title: t({ id: 'suppliers.premium.discardRide', message: 'Leave without logging?' }),
        message: t({
          id: 'suppliers.premium.discardRideLine',
          message: 'The amount you typed goes.',
        }),
        discard: t({ id: 'suppliers.premium.discardVerb', message: 'Discard' }),
        keep: t({ id: 'suppliers.premium.keepEditing', message: 'Keep editing' }),
      }}
      testID="supplier-log-ride-sheet"
    >
      <View style={[styles.body, { paddingHorizontal: th.space.gutter, gap: th.space.gap14 }]}>
        {done !== null ? (
          <View style={{ gap: th.space.gap14 }} testID="supplier-log-ride-done">
            <Text variant="title">
              {done === 'split'
                ? t({
                    id: 'suppliers.log.split',
                    message: `Logged, and split between ${people > 0 ? people : 1}`,
                  })
                : t({ id: 'suppliers.log.kept', message: 'Logged on the plan' })}
            </Text>
            <Button
              label={t({ id: 'suppliers.log.done', message: 'Done' })}
              onPress={() => router.back()}
            />
          </View>
        ) : (
          <View style={{ gap: th.space.gap10 }} testID="supplier-log-ride">
            <Text variant="label" tone="muted">
              {label}
            </Text>
            <TextField
              accessibilityLabel={label}
              placeholder={amountText('0', params.currency, locale)}
              value={digits === '' ? '' : amountText(digits, params.currency, locale)}
              onChangeText={(text) => setDigits(text.replace(/\D/g, ''))}
              keyboardType="number-pad"
              helper={
                people > 1
                  ? t({
                      id: 'suppliers.log.splitNote',
                      message: `Split evenly between the ${people} who rode. Leave it empty to only note the ride.`,
                    })
                  : t({
                      id: 'suppliers.log.soloNote',
                      message: 'Leave it empty to only note the ride.',
                    })
              }
              testID="supplier-log-ride-amount"
            />
            {failed ? (
              <ErrorLine
                text={t({ id: 'suppliers.log.failed', message: 'That didn’t save. Try again.' })}
              />
            ) : null}
          </View>
        )}
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({ body: { paddingTop: 4, paddingBottom: 32 } });
