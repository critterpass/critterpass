/**
 * Is this right?'s pieces (6.22): the 22 pt check (mint with a tick once confirmed, an empty ring
 * before), the includes chips (booked tint when included, dashed tangerine when not said), the
 * peek card with the words a line came from, and the guide's bar that writes the question.
 */
import type { DriverCard, IncludeKey, SourceSpan } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { Linking, StyleSheet, View } from 'react-native';

import { guideCritterKind } from '@/features/trip';
import {
  Button,
  CritterSticker,
  Icon,
  PressableScale,
  ring,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import { askWords, usePriceWords } from '../../shared/price-text';

/** Under the price: his own words when no one price could be read, and every price he gave. */
export function PriceLines({ card }: { readonly card: DriverCard }) {
  const th = usePremiumTheme();
  const words = usePriceWords();
  const { t } = useLingui();
  const ask = askWords(card);
  const tiers = card.price_tiers ?? [];
  if (ask === null && tiers.length === 0) return null;
  return (
    <View testID="drivers-check-price-notes">
      {ask === null ? null : (
        <Text variant="captionMuted" color={th.color.status.maybe.text}>
          {t({ id: 'drivers.check.priceAskWords', message: `He wrote: “${ask}”` })}
        </Text>
      )}
      {tiers.map((tier) => (
        <Text key={tier.label} variant="captionMuted" tone="muted">
          {words.tier(tier)}
        </Text>
      ))}
    </View>
  );
}

const NEXT = { unknown: 'yes', yes: 'no', no: 'unknown' } as const;
const KEYS = ['fuel', 'parking', 'tolls', 'entry'] as const;

export function CheckCircle(props: {
  readonly on: boolean;
  readonly label: string;
  readonly onPress?: (() => void) | undefined;
  readonly testID?: string;
}) {
  const th = usePremiumTheme();
  const dot = (
    <View
      style={[
        styles.dot,
        props.on
          ? { backgroundColor: th.accent.mint }
          : { backgroundColor: th.color.card, boxShadow: ring(2, th.color.fieldBorder, true) },
      ]}
    >
      {props.on ? <Icon name="check" size={13} color={th.color.onAccent} /> : null}
    </View>
  );
  if (props.onPress === undefined) return <View style={styles.hit}>{dot}</View>;
  return (
    <PressableScale
      onPress={props.onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: props.on }}
      accessibilityLabel={props.label}
      style={styles.hit}
      {...(props.testID === undefined ? {} : { testID: props.testID })}
    >
      {dot}
    </PressableScale>
  );
}

export function IncludesChips(props: {
  readonly card: DriverCard;
  readonly includeLabel: Readonly<Record<IncludeKey, string>>;
  readonly onChange: (card: DriverCard) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { card } = props;
  return (
    <View style={styles.chips}>
      {KEYS.map((key) => {
        const said = card.includes[key] ?? 'unknown';
        const item = props.includeLabel[key];
        const text =
          said === 'yes'
            ? `✓ ${item}`
            : said === 'no'
              ? t({ id: 'drivers.check.notIncl', message: `${item} extra` })
              : `${item}?`;
        const look =
          said === 'yes'
            ? {
                box: { backgroundColor: th.color.status.booked.bg },
                ink: th.color.status.booked.text,
              }
            : said === 'no'
              ? { box: { backgroundColor: th.color.control }, ink: th.color.ink }
              : {
                  box: [
                    styles.dashed,
                    { borderColor: th.accent.tangerine, backgroundColor: th.color.card },
                  ],
                  ink: th.color.status.maybe.text,
                };
        return (
          <PressableScale
            key={key}
            onPress={() =>
              props.onChange({ ...card, includes: { ...card.includes, [key]: NEXT[said] } })
            }
            accessibilityRole="button"
            accessibilityLabel={item}
            testID={`drivers-check-include-${key}`}
          >
            <View style={[styles.chip, look.box]}>
              <Text variant="pillSmall" color={look.ink}>
                {text}
              </Text>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

export function PeekCard({ source, span }: { readonly source: string; readonly span: SourceSpan }) {
  const th = usePremiumTheme();
  return (
    <View
      style={[styles.peek, { borderRadius: th.radius.cardRow, backgroundColor: th.accent.paper }]}
      testID="drivers-check-peek"
    >
      <Text variant="caption">
        {source.slice(Math.max(0, span[0] - 40), span[0])}
        <Text variant="caption" style={{ backgroundColor: th.accent.sun }}>
          {source.slice(span[0], span[1])}
        </Text>
        {source.slice(span[1], span[1] + 40)}
      </Text>
    </View>
  );
}

export function AskBar(props: {
  readonly guide: { readonly id: string; readonly name: string };
  readonly name: string;
  readonly count: number;
  readonly url: string | null;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { name, count, url } = props;
  return (
    <View
      style={[
        styles.ask,
        { borderRadius: th.radius.cardRow, backgroundColor: th.color.banner.guide.bg },
      ]}
      testID="drivers-check-ask"
    >
      <CritterSticker
        kind={guideCritterKind(props.guide.id)}
        name={props.guide.name}
        size={40}
        pose="point"
      />
      <Text variant="caption" style={styles.flex}>
        {t({
          id: 'drivers.check.missing',
          message: `${count} things aren't in his message. Want me to write the question?`,
        })}
      </Text>
      <Button
        label={t({ id: 'drivers.check.ask', message: `Ask ${name}` })}
        size="small"
        disabled={url === null}
        onPress={() => {
          if (url !== null) void Linking.openURL(url);
        }}
        testID="drivers-check-ask-button"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 28, borderRadius: 14, paddingHorizontal: 10, justifyContent: 'center' },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed' },
  peek: { padding: 12 },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
});
