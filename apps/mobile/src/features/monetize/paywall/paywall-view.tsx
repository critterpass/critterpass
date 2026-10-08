/**
 * The paywall (4e-1): the Pass+ visa on a passport page with the store's own prices, the monthly
 * or yearly choice, and one button. Every state the store or the server can leave a purchase in
 * has its own line under the button; with no price from the store the button cannot be pressed.
 */
import type { StorePlatform } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { mrzLine } from '@/ui/documents/mrz';
import { Stamp } from '@/ui/documents/Stamp';
import { Visa } from '@/ui/documents/Visa';
import { Stack } from '@/ui/layout/Stack';
import { BillingToggle, type BillingOption } from '@/ui/monetize/BillingToggle';
import { VisaPaywall } from '@/ui/monetize/VisaPaywall';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { RestoreState } from '../data/use-billing';
import type { PerkLine } from '../perks/perk-copy';
import { PaywallLinks, PaywallRestore } from './paywall-links';
import type { BillingPeriod, PaywallModel } from './paywall-model';
import { Disclosure, usePhaseLine, useRestoreLine } from './purchase-copy';

export interface PaywallViewProps {
  readonly model: PaywallModel;
  readonly holder: string;
  readonly store: StorePlatform | null;
  readonly passPerks: readonly PerkLine[];
  readonly boostPerks: readonly PerkLine[];
  /** The crew's first trip free, only while its grant is live. */
  readonly firstTripFree: { readonly crew: string; readonly until: string } | null;
  readonly boostTrip: { readonly name: string } | null;
  readonly restore: RestoreState;
  readonly onPeriod: (period: BillingPeriod) => void;
  readonly onBuy: () => void;
  readonly onCheckAgain: () => void;
  readonly onRestore: () => void;
  readonly onCompare: () => void;
  readonly onBoost: () => void;
  readonly onPlan: () => void;
  readonly onTerms: () => void;
  readonly onPrivacy: () => void;
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1 },
  content: {
    padding: t.size.gutter,
    paddingTop: t.space['32'] + t.space['24'],
    paddingBottom: t.space['16'],
    gap: t.space['16'],
  },
  // The plan choice and the button stay on screen; the page scrolls above them.
  footer: {
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['8'],
    paddingBottom: t.space['16'],
  },
}));

export function PaywallView(props: PaywallViewProps) {
  const { t, i18n } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const phaseLine = usePhaseLine();
  const restoreLine = useRestoreLine();
  const { model } = props;
  const { offer, monthly, yearly, boost, phase } = model;
  const holder = props.holder.trim();

  const options: BillingOption<BillingPeriod>[] = [];
  if (monthly) {
    options.push({
      value: 'monthly',
      label: t({ id: 'monetize.paywall.monthly', message: 'Monthly' }),
      price: monthly.priceString,
    });
  }
  if (yearly) {
    const saving = yearly.savingsPercent;
    options.push({
      value: 'yearly',
      label: t({ id: 'monetize.paywall.yearly', message: 'Yearly' }),
      price: yearly.priceString,
      ...(saving === null ? {} : { badge: `−${saving}%` }),
    });
  }

  const perMonth = yearly?.perMonthString ?? null;
  const periodLine =
    model.period === 'monthly'
      ? t({ id: 'monetize.paywall.aMonth', message: 'A month' })
      : perMonth === null
        ? t({ id: 'monetize.paywall.aYear', message: 'A year' })
        : t({ id: 'monetize.paywall.aYearPerMonth', message: `A year · ${perMonth}/mo` });
  const perk = props.passPerks.map((line) => i18n._(line.copy)).join('. ');
  const boostPerk = props.boostPerks.map((line) => i18n._(line.copy)).join(', ');
  const status = phaseLine(phase);
  const restored = restoreLine(props.restore);
  const busy = phase === 'purchasing' || phase === 'verifying';

  const visaLabel =
    offer === null
      ? t({ id: 'monetize.paywall.visaLabel', message: `Pass+ visa, holder ${holder}` })
      : t({
          id: 'monetize.paywall.visaLabelPriced',
          message: `Pass+ visa, ${offer.priceString}, holder ${holder}`,
        });

  return (
    <View style={styles.root} testID="paywall">
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <VisaPaywall
          chrome={t({ id: 'monetize.paywall.chrome', message: 'VISAS · VISAS · VISAS' })}
          page={t({ id: 'monetize.paywall.page', message: 'PAGE 07' })}
          headline={t({ id: 'monetize.paywall.headline', message: 'Go further\nthan free' })}
          visa={
            <Visa
              kind="passPlus"
              eyebrow={t({
                id: 'monetize.paywall.visaEyebrow',
                message: 'Visa · For you · Pour vous',
              })}
              title={t({ id: 'monetize.paywall.passPlus', message: 'Pass+' })}
              {...(offer === null ? {} : { price: offer.priceString, period: periodLine })}
              photo={<Sticker kind="gecko" name="Tokek" size={52} />}
              fields={[
                {
                  key: 'holder',
                  label: t({ id: 'monetize.paywall.holder', message: 'Holder' }),
                  value: holder,
                },
                {
                  key: 'entries',
                  label: t({ id: 'monetize.paywall.entries', message: 'Entries' }),
                  value: t({ id: 'monetize.paywall.unlimited', message: 'Unlimited' }),
                },
                {
                  key: 'valid',
                  label: t({ id: 'monetize.paywall.valid', message: 'Valid' }),
                  value:
                    model.period === 'monthly'
                      ? t({ id: 'monetize.paywall.validMonth', message: '1 month' })
                      : t({ id: 'monetize.paywall.validYear', message: '12 months' }),
                },
                {
                  key: 'works',
                  label: t({ id: 'monetize.paywall.worksIn', message: 'Works in' }),
                  value: t({ id: 'monetize.paywall.everyCrew', message: 'Every crew' }),
                },
              ]}
              perk={perk}
              mrz={mrzLine(['V', 'CPPASS', 'PLUS', holder])}
              accessibilityLabel={visaLabel}
              testID="paywall-visa"
            />
          }
          stamps={
            <>
              {boost && props.boostPerks.length > 0 ? (
                <Visa
                  kind="boost"
                  eyebrow={t({
                    id: 'monetize.paywall.boostEyebrow',
                    message: 'Entry · For the crew',
                  })}
                  title={t({
                    id: 'monetize.paywall.boostTitle',
                    message: `Trip boost · ${boost.priceString}`,
                  })}
                  perk={boostPerk}
                  accessibilityLabel={t({
                    id: 'monetize.paywall.boostLabel',
                    message: `Trip boost, ${boost.priceString} for the crew`,
                  })}
                  testID="paywall-boost-stamp"
                />
              ) : null}
              {props.firstTripFree ? (
                <Stamp
                  title={upper(
                    t({ id: 'monetize.paywall.firstTripFree', message: 'First trip free' }),
                    locale,
                  )}
                  top={upper(props.firstTripFree.crew, locale)}
                  bottom={upper(props.firstTripFree.until, locale)}
                  ink={theme.color.blue}
                  size={96}
                  slam
                  testID="paywall-first-trip-free"
                />
              ) : null}
            </>
          }
          note={t({ id: 'monetize.paywall.note', message: 'Critters are never for sale.' })}
          mrz={[mrzLine(['P', 'CRITTERPASS', holder]), mrzLine(['CP', 'PASS', 'PLUS'])]}
          testID="paywall-page"
        />
        {phase === 'subscribed' ? null : (
          <Disclosure
            kind="subscription"
            price={offer?.priceString}
            period={model.period}
            store={props.store}
            onTerms={props.onTerms}
            onPrivacy={props.onPrivacy}
            testID="paywall-disclosure"
          />
        )}
      </ScrollView>
      {phase === 'subscribed' ? null : <PaywallRestore onPress={props.onRestore} />}
      <Stack gap="12" style={styles.footer}>
        {options.length > 1 && phase !== 'subscribed' ? (
          <BillingToggle
            options={options}
            value={model.period}
            onChange={props.onPeriod}
            testID="paywall-period"
          />
        ) : null}
        {phase === 'subscribed' ? (
          <PillButton
            label={t({ id: 'monetize.paywall.yourPlan', message: 'You have Pass+ · Your plan' })}
            onPress={props.onPlan}
            block
            testID="paywall-plan"
          />
        ) : phase === 'verify_failed' ? (
          <PillButton
            label={t({ id: 'monetize.paywall.checkAgain', message: 'Check again' })}
            onPress={props.onCheckAgain}
            block
            testID="paywall-check-again"
          />
        ) : (
          <PillButton
            label={t({ id: 'monetize.paywall.get', message: 'Get Pass+' })}
            onPress={props.onBuy}
            loading={busy || phase === 'loading'}
            disabled={!model.canBuy}
            sheen
            block
            testID="paywall-buy"
          />
        )}
        {/* One status slot, in view beside the buttons: RESTORE's answer, else the purchase's. */}
        {restored !== null ? (
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            numberOfLines={2}
            style={{ textAlign: 'center' }}
            accessibilityLiveRegion="polite"
            testID="paywall-restore-line"
          >
            {restored}
          </Text>
        ) : status === null ? null : (
          <Text
            variant="bodySm"
            color={
              phase === 'failed' || phase === 'verify_failed'
                ? theme.semantic.state.warning
                : theme.semantic.text.secondary
            }
            numberOfLines={2}
            style={{ textAlign: 'center' }}
            accessibilityLiveRegion="polite"
            testID={`paywall-phase-${phase}`}
          >
            {status}
          </Text>
        )}
        <PaywallLinks
          onBoost={props.boostTrip && boost ? props.onBoost : null}
          onCompare={props.onCompare}
          disabled={busy}
        />
      </Stack>
    </View>
  );
}
