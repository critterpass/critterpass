/**
 * A supplier offer (6f-1): who sells it, the supplier's own words under THEIR WORDS (verbatim,
 * fetched for this view only), the guide's note below a rule in the guide's voice, and the way
 * out: OPEN {SUPPLIER} ↗ through the attribution bridge, or BOOK in the app when the supplier's
 * booking is switched on. A link-only card names the place in our words and never borrows the
 * supplier's.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine, type GuideId } from '@/ui/people/GuideLine';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { HoldTimer } from './HoldTimer';

export interface OfferAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly loading?: boolean;
  readonly testID?: string;
}

export interface OfferCardProps {
  /** "Klook", "Viator". */
  readonly supplier: string;
  readonly title: string;
  /** The title and lines are the supplier's own words (shown under THEIR WORDS). */
  readonly verbatim: boolean;
  readonly lines?: readonly string[];
  /** "seen 09:10 on Viator". */
  readonly seen?: string | null;
  readonly note?: { readonly guide: GuideId; readonly name: string; readonly line: string } | null;
  /** Truthful status line from the copy rules ("4 seats held until 14:20"). */
  readonly status?: string | null;
  /** The supplier's hold deadline, only while it reports a hold. */
  readonly holdUntil?: string | null;
  readonly onHoldExpired?: () => void;
  readonly primary: OfferAction;
  readonly secondary?: OfferAction | null;
  /** Shown under the buttons when the last tap did not go through. */
  readonly error?: string | null;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['16'],
    gap: t.space['12'],
  },
  from: {
    alignSelf: 'flex-start',
    backgroundColor: t.color.paper.base,
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
  },
  rule: { height: 1, backgroundColor: t.color.divider },
}));

export function OfferCard(props: OfferCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const supplier = props.supplier;
  return (
    <Stack style={styles.card} testID={props.testID ?? 'supplier-offer-card'}>
      <Row gap="10" align="center" style={{ justifyContent: 'space-between' }}>
        <View style={styles.from}>
          <Text variant="label" color={theme.semantic.text.onAccent}>
            {upper(t({ id: 'suppliers.offer.from', message: `From ${supplier}` }), locale)}
          </Text>
        </View>
        {props.seen ? (
          <Text variant="caption" color={theme.semantic.text.secondary} style={{ flexShrink: 1 }}>
            {props.seen}
          </Text>
        ) : null}
      </Row>
      <Stack gap="4">
        {props.verbatim ? (
          <Text variant="eyebrow" color={theme.semantic.text.secondary}>
            {upper(t({ id: 'suppliers.offer.theirWords', message: 'Their words' }), locale)}
          </Text>
        ) : null}
        <Text variant="rowTitle" testID="supplier-offer-title">
          {props.title}
        </Text>
        {(props.lines ?? []).map((line) => (
          <Text key={line} variant="bodySm">
            {line}
          </Text>
        ))}
      </Stack>
      {props.status || props.holdUntil ? (
        <Row gap="8" align="center" style={{ flexWrap: 'wrap' }}>
          {props.status ? (
            <Text variant="bodySm" testID="supplier-offer-status" style={{ flexShrink: 1 }}>
              {props.status}
            </Text>
          ) : null}
          {props.holdUntil ? (
            <HoldTimer
              until={props.holdUntil}
              {...(props.onHoldExpired ? { onExpired: props.onHoldExpired } : {})}
            />
          ) : null}
        </Row>
      ) : null}
      {props.note ? (
        <Stack gap="10">
          <View style={styles.rule} />
          <GuideLine guide={props.note.guide} name={props.note.name} line={props.note.line} />
        </Stack>
      ) : null}
      <Row gap="10">
        {props.secondary ? (
          <View style={{ flex: 1 }}>
            <PillButton
              variant="secondary"
              size="sm"
              label={props.secondary.label}
              onPress={props.secondary.onPress}
              {...(props.secondary.testID ? { testID: props.secondary.testID } : {})}
            />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <PillButton
            tone="cream"
            size="sm"
            label={props.primary.label}
            onPress={props.primary.onPress}
            loading={props.primary.loading ?? false}
            {...(props.primary.testID ? { testID: props.primary.testID } : {})}
          />
        </View>
      </Row>
      {props.error ? (
        <Text variant="caption" color={theme.semantic.state.urgent} testID="supplier-offer-error">
          {props.error}
        </Text>
      ) : null}
    </Stack>
  );
}
