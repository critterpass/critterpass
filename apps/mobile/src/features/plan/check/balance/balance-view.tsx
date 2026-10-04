/**
 * Balance the crew (7h-5), from props only: ← TRIP and ONLY YOU SEE THIS; WHOSE PICKS MADE IT and
 * a line about it; each member with their must-do (✓ once in) and squares that fill in their
 * colour as their saves land in days ("0 OF 3 SAVES IN" in pink); for someone at zero, Tokek's
 * card with their saves that fit without moving anything, ADD BOTH and ASK {NAME} FIRST.
 * Undesigned: the ask already sent, a declined ask.
 */
import { resolveMemberStyle, tokens } from '@cp/design-tokens';
import { ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Avatar } from '@/ui/people/Avatar';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { PlanGuideSticker } from '../../plan-guide';

export interface BalanceRowView {
  readonly key: string;
  readonly name: string;
  readonly joinIndex: number;
  readonly mustDo: string | null;
  readonly saved: number;
  readonly placed: number;
  readonly count: string;
}

export interface BalanceOfferView {
  readonly line: string;
  readonly joinIndex: number;
  readonly initialName: string;
  readonly places: readonly {
    readonly key: string;
    readonly name: string;
    readonly when: string;
  }[];
  readonly add: {
    readonly label: string;
    readonly busy: boolean;
    readonly onPress: () => void;
  } | null;
  readonly ask: {
    readonly label: string;
    readonly busy: boolean;
    readonly onPress: (() => void) | null;
  };
  readonly status: string | null;
}

export interface BalanceViewProps {
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly onlyYou: string;
  readonly title: string;
  readonly summary: string;
  readonly loading: boolean;
  readonly rows: readonly BalanceRowView[];
  readonly offer: BalanceOfferView | null;
}

const SQUARE = 10;
const MAX_SQUARES = 8;

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['24'],
    gap: th.space['14'],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: {
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['4'],
    backgroundColor: th.semantic.bg.control,
  },
  list: { borderRadius: th.radius.lg, backgroundColor: th.semantic.bg.raised },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['10'],
  },
  who: { flex: 1, minWidth: 0, gap: th.space['2'] },
  count: { alignItems: 'flex-end', gap: th.space['4'] },
  squares: { flexDirection: 'row', gap: 3 },
  square: { width: SQUARE, height: SQUARE, borderRadius: 2 },
  offer: {
    gap: th.space['10'],
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    borderWidth: 2,
    borderColor: tokens.color.yellow,
    backgroundColor: th.semantic.bg.raised,
  },
  offerHead: { flexDirection: 'row', alignItems: 'center', gap: th.space['10'] },
  offerLine: { flex: 1, minWidth: 0 },
  place: { flexDirection: 'row', alignItems: 'center', gap: th.space['10'] },
  placeName: { flexShrink: 1 },
  actions: { flexDirection: 'row', gap: th.space['10'], flexWrap: 'wrap' },
}));

export function BalanceView(props: BalanceViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const offer = props.offer;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="plan-balance">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <BackEyebrow label={props.backLabel} onPress={props.onBack} />
          <View style={styles.chip}>
            <Text variant="label" color={theme.semantic.text.secondary}>
              {props.onlyYou}
            </Text>
          </View>
        </View>
        <Text variant="h1" singleLine={false} testID="plan-balance-title">
          {props.title}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary} singleLine={false}>
          {props.summary}
        </Text>
        {props.loading ? <Skeleton preset="list" repeat={5} /> : null}
        <View style={styles.list} testID="plan-balance-rows">
          {props.rows.map((row) => {
            const colour = resolveMemberStyle(row.joinIndex).color;
            const shown = Math.min(row.saved, MAX_SQUARES);
            return (
              <View key={row.key} style={styles.row} testID={`plan-balance-row-${row.key}`}>
                <Avatar name={row.name} joinIndex={row.joinIndex} size="md" decorative />
                <View style={styles.who}>
                  <Text variant="rowTitle" numberOfLines={1}>
                    {row.name}
                  </Text>
                  {row.mustDo === null ? null : (
                    <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={1}>
                      {row.mustDo}
                    </Text>
                  )}
                </View>
                <View style={styles.count}>
                  <View style={styles.squares}>
                    {Array.from({ length: shown }, (_, index) => (
                      <View
                        key={index}
                        style={[
                          styles.square,
                          {
                            backgroundColor:
                              index < row.placed ? colour : theme.semantic.bg.control,
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <Text
                    variant="label"
                    color={
                      row.placed === 0 && row.saved > 0
                        ? tokens.color.pink
                        : theme.semantic.text.secondary
                    }
                  >
                    {row.count}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        {offer === null ? null : (
          <View style={styles.offer} testID="plan-balance-offer">
            <View style={styles.offerHead}>
              <PlanGuideSticker size={40} />
              <Text variant="voice" style={styles.offerLine} singleLine={false}>
                {offer.line}
              </Text>
            </View>
            {offer.places.map((place) => (
              <View key={place.key} style={styles.place}>
                <Avatar name={offer.initialName} joinIndex={offer.joinIndex} size="sm" decorative />
                <Text variant="title" style={styles.placeName} numberOfLines={2} singleLine={false}>
                  {place.name}
                </Text>
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {place.when}
                </Text>
              </View>
            ))}
            {offer.status === null ? null : (
              <Text variant="bodySm" color={theme.semantic.text.secondary} singleLine={false}>
                {offer.status}
              </Text>
            )}
            <View style={styles.actions}>
              {offer.add === null ? null : (
                <PillButton
                  label={offer.add.label}
                  onPress={offer.add.onPress}
                  loading={offer.add.busy}
                  size="sm"
                  testID="plan-balance-add"
                />
              )}
              <PillButton
                label={offer.ask.label}
                onPress={offer.ask.onPress ?? (() => undefined)}
                disabled={offer.ask.onPress === null}
                loading={offer.ask.busy}
                size="sm"
                variant="secondary"
                testID="plan-balance-ask"
              />
            </View>
          </View>
        )}
      </ScrollView>
    </Scaffold>
  );
}
