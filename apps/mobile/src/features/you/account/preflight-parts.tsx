/**
 * The preflight's own pieces of 3n-9: what each crew owes you (with Settle up), what you owe them,
 * who takes over the trips you organise, the trip you are on right now, and which store keeps
 * billing Pass+. Every line comes from `GET /v1/me/deletion/preflight`.
 */
import { formatMoney, isKnownCurrency } from '@cp/cost-engine';
import type { DeletionPreflight } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

type Balance = DeletionPreflight['balances'][number];

/** "S$186.40"; a currency the formatter does not know reads as its code and the minor amount. */
function amountText(minor: number, currency: string, locale: string): string {
  const code = currency;
  if (!isKnownCurrency(code)) return `${currency} ${String(minor)}`;
  return formatMoney({ amountMinor: BigInt(minor), currency: code }, { locale, mode: 'local' });
}

/* eslint-disable lingui/no-unlocalized-strings -- React list keys below, never copy. */
const oweKey = (b: Balance) => `owe-${b.crew_id}-${b.currency}`;
const tripKey = (id: string) => `trip-${id}`;
/* eslint-enable lingui/no-unlocalized-strings */
type Source = NonNullable<DeletionPreflight['subscription']>['source'];

const useStyles = makeStyles((t) => ({
  owed: {
    backgroundColor: t.color.orange,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
  },
  owedText: { flex: 1, minWidth: 0 },
  note: { flex: 1, minWidth: 0 },
}));

export function OwedCard(props: { readonly balance: Balance; readonly onSettle: () => void }) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const amount = amountText(props.balance.net_minor, props.balance.currency, locale);
  const crew = props.balance.crew_name;
  return (
    <Row gap="12" style={styles.owed} testID={`you-delete-owed-${props.balance.crew_id}`}>
      <View style={styles.owedText}>
        <Text variant="h3" color={theme.semantic.text.onAccent}>
          {upper(t({ id: 'you.delete.owed', message: `You’re owed ${amount}` }), locale)}
        </Text>
        <Text variant="bodySm" color={theme.semantic.text.onAccent}>
          {t({ id: 'you.delete.owedLine', message: `Settle up first, or ${crew} keep it.` })}
        </Text>
      </View>
      <PillButton
        label={t({ id: 'you.delete.settleUp', message: 'Settle up' })}
        tone="ink"
        size="sm"
        onPress={props.onSettle}
        testID="you-delete-settle"
      />
    </Row>
  );
}

/** Amounts you owe, open trips you organise and a trip under way, as plain lines. */
export function PreflightLines({ preflight }: { readonly preflight: DeletionPreflight }) {
  const { t } = useLingui();
  const theme = useTheme();
  const locale = useLocale();
  const lines: { key: string; text: string }[] = [];
  for (const b of preflight.balances) {
    if (b.net_minor >= 0) continue;
    const amount = amountText(-b.net_minor, b.currency, locale);
    const crew = b.crew_name;
    lines.push({
      key: oweKey(b),
      text: t({
        id: 'you.delete.owe',
        message: `You owe ${crew} ${amount}. It stays on the crew’s balances under “former member”.`,
      }),
    });
  }
  for (const trip of preflight.organised_trips) {
    const name = trip.trip_name ?? t({ id: 'you.delete.tripFallback', message: 'your trip' });
    const next = trip.transfer_to_name;
    let text: string;
    if (trip.sole_member) {
      text = t({
        id: 'you.delete.tripAlone',
        message: `Nobody else is on ${name}, so it closes with you.`,
      });
    } else if (next !== null) {
      text = t({
        id: 'you.delete.tripHandOver',
        message: `${next} takes over organising ${name}.`,
      });
    } else {
      text = t({
        id: 'you.delete.tripCoOrganiser',
        message: `${name} keeps its other organiser.`,
      });
    }
    lines.push({ key: tripKey(trip.trip_id), text });
  }
  if (preflight.active_trip !== null) {
    const name =
      preflight.active_trip.trip_name ?? t({ id: 'you.delete.tripFallback', message: 'your trip' });
    lines.push({
      key: 'active',
      text: t({
        id: 'you.delete.activeTrip',
        message: `You’re on ${name} right now. The crew loses your plans, pings and location at once.`,
      }),
    });
  }
  if (lines.length === 0) return null;
  return (
    <Stack gap="8" testID="you-delete-preflight-lines">
      {lines.map((line) => (
        <Text key={line.key} variant="bodySm" color={theme.semantic.text.secondary}>
          {line.text}
        </Text>
      ))}
    </Stack>
  );
}

/** The billing note: which store keeps charging, and the way to cancel there. Gifts bill nobody. */
export function BillingNote(props: {
  readonly source: Source | null;
  readonly passPlus: boolean;
  readonly onManage: (() => void) | null;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  let text: string | null = null;
  if (props.source === 'app_store') {
    text = t({
      id: 'you.delete.billedAppStore',
      message:
        'Pass+ is billed by the App Store. Deleting doesn’t cancel it, so cancel it there too.',
    });
  } else if (props.source === 'play') {
    text = t({
      id: 'you.delete.billedPlay',
      message:
        'Pass+ is billed by Google Play. Deleting doesn’t cancel it, so cancel it there too.',
    });
  } else if (props.source === null && props.passPlus) {
    text = t({
      id: 'you.delete.passPlus',
      message:
        'Pass+ is billed by the store you bought it from. Deleting doesn’t cancel it, so cancel it there too.',
    });
  }
  if (text === null) return null;
  const manage = props.source === 'app_store' || props.source === 'play' ? props.onManage : null;
  return (
    <Stack gap="4" style={styles.note} testID="you-delete-pass-plus">
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {text}
      </Text>
      {manage === null ? null : (
        <Text
          variant="bodySm"
          color={theme.semantic.action.primary}
          accessibilityRole="link"
          onPress={manage}
          testID="you-delete-manage-subscription"
        >
          {t({ id: 'you.delete.manageSubscription', message: 'Manage subscription ›' })}
        </Text>
      )}
    </Stack>
  );
}
