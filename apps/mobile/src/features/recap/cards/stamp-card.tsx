/**
 * Card 7, the stamp (3m-8): a passport page. "ENTRIES · ENTRÉES" and the page number at the top,
 * an older stamp faded in the corner, the trip's stamp slamming down large in the middle in the
 * guide's ink with the guide drawn inside it, the crew's signatures writing themselves in a loose
 * row under it in their own colours (one after another, and live as each traveller opens the
 * recap), and "STAMP 13 IS ĐÀ NẴNG" at the foot. Every colour arrives as ink that reads on paper.
 */
import { useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useStamp } from '@/motion/patterns/stamp';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { WrittenSignature } from '../signature/written-signature';
import { fetchStroke, useStroke, type StrokeFetch } from '../signature/stroke-store';
import { useCardTimeline } from '../story/use-card-timeline';
import { CardShell, FOOTER_PT } from './card-shell';
import { PassportStamp, stampDrop } from './passport-stamp';

const SLAM_MS = 500;
const SIGN_GAP_MS = 700;
const STAMP = 230;
const DOODLE = 64;
const TILT = -6;
const OLDER_TILT = -8;
/** Under the caption when no action follows it: the home indicator and a little air. */
const FOOT_CLEAR_PT = 56;
/** Each signature's hand-placed lean and drop, in the order they sign. */
const LEANS = [
  { rotate: -5, drop: 0 },
  { rotate: 3, drop: 10 },
  { rotate: -2, drop: 4 },
  { rotate: 6, drop: 12 },
  { rotate: -4, drop: 2 },
  { rotate: 2, drop: 8 },
] as const;
const OLDER = 104;
/** Paper kept between the older stamp's ring and the trip's. */
const CLEAR = 12;

const useStyles = makeStyles((th) => ({
  chrome: { flexDirection: 'row', justifyContent: 'space-between' },
  field: { flex: 1, justifyContent: 'space-between' },
  // The older stamp sits in the upper corner; the trip's stamp lands clear of it, below.
  stamps: { alignItems: 'center', justifyContent: 'flex-end' },
  stamp: { width: STAMP, height: STAMP, transform: [{ rotate: `${TILT}deg` }] },
  older: {
    position: 'absolute',
    top: 0,
    start: 0,
    opacity: 0.6,
    transform: [{ rotate: `${OLDER_TILT}deg` }],
  },
  foot: { alignItems: 'center', gap: th.space['4'] },
  centred: { textAlign: 'center', alignSelf: 'stretch' },
  signatures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: th.space['24'],
    rowGap: th.space['4'],
    paddingTop: th.space['16'],
  },
}));

export interface StampSigner {
  readonly userId: string;
  readonly name: string;
  readonly color: string;
  readonly strokeKey: string | null;
}

export interface StampCardProps {
  readonly chrome: string;
  readonly page: string | null;
  readonly place: string;
  readonly top: string;
  readonly bottom: string;
  readonly ink: string;
  /** The stamp's small lines, where the ink needs darkening at their size. */
  readonly lineInk?: string;
  readonly guideKind: string;
  readonly older: readonly { readonly id: string; readonly title: string; readonly ink: string }[];
  readonly signers: readonly StampSigner[];
  readonly caption: string;
  readonly detail: string;
  /** SIGN IT sits under the page: the page keeps room for it. */
  readonly signable?: boolean;
  readonly loadStroke?: StrokeFetch;
}

function Signer({
  signer,
  written,
  load,
  index,
}: {
  readonly signer: StampSigner;
  readonly written: boolean;
  readonly load: StrokeFetch;
  readonly index: number;
}) {
  const stroke = useStroke(signer.strokeKey, load);
  const lean = LEANS[index % LEANS.length] ?? LEANS[0];
  return (
    <View style={{ marginTop: lean.drop, transform: [{ rotate: `${lean.rotate}deg` }] }}>
      <WrittenSignature
        name={signer.name}
        color={signer.color}
        stroke={stroke}
        written={written}
        testID={`recap-signature-${signer.userId}`}
      />
    </View>
  );
}

function TripStamp(props: StampCardProps) {
  const styles = useStyles();
  const slam = useStamp({ active: true });
  return (
    <Animated.View style={[styles.stamp, slam]} testID="recap-stamp">
      <PassportStamp
        title={props.place}
        top={props.top}
        bottom={props.bottom}
        ink={props.ink}
        {...(props.lineInk === undefined ? {} : { lineInk: props.lineInk })}
        size={STAMP}
      >
        <Sticker
          kind={props.guideKind}
          name={props.place}
          size={DOODLE}
          variant="stamp"
          // Line art inked straight onto the stamp, as an icon is: no sticker edge.
          blend="srcOver"
          form={{
            rarity: 'common',
            edge: 'none',
            palette: { f: props.ink, dk: props.ink, bl: props.ink, ink: props.ink },
          }}
          sticker={null}
        />
      </PassportStamp>
    </Animated.View>
  );
}

export function StampCard(props: StampCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const load = props.loadStroke ?? fetchStroke;
  const steps = [SLAM_MS, ...props.signers.map((_, index) => SLAM_MS + 600 + index * SIGN_GAP_MS)];
  const reached = useCardTimeline(steps);
  const ink = theme.color.paper.ink;
  // A stamp with no place to print (the home stamp) is not drawn as an empty ring.
  const older = props.older.find((stamp) => stamp.title !== '');
  const { width } = useWindowDimensions();
  const drop =
    older === undefined ? 0 : stampDrop(width - 2 * theme.size.gutter, STAMP, OLDER, CLEAR);
  return (
    <CardShell
      ground={theme.color.paper.base}
      tone="paper"
      footerPt={props.signable === true ? FOOTER_PT : FOOT_CLEAR_PT}
      testID="recap-card-stamp"
    >
      <View style={styles.chrome} importantForAccessibility="no-hide-descendants">
        <Text variant="eyebrow" color={ink}>
          {props.chrome}
        </Text>
        {props.page === null ? null : (
          <Text variant="eyebrow" color={ink}>
            {props.page}
          </Text>
        )}
      </View>
      <View style={styles.field}>
        <View>
          <View style={[styles.stamps, { height: STAMP + drop }]}>
            {older === undefined ? null : (
              <View style={styles.older}>
                <PassportStamp title={older.title} ink={older.ink} size={OLDER} />
              </View>
            )}
            {reached > 0 ? <TripStamp {...props} /> : null}
          </View>
          <View style={styles.signatures} testID="recap-signatures">
            {props.signers.map((signer, index) => (
              <Signer
                key={signer.userId}
                signer={signer}
                written={reached > index + 1}
                load={load}
                index={index}
              />
            ))}
          </View>
        </View>
        <View
          style={styles.foot}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${props.caption}. ${props.detail}`}
        >
          <Text variant="h2" color={ink} style={styles.centred}>
            {props.caption}
          </Text>
          <Text variant="bodySm" color={theme.color.paper.muted} style={styles.centred}>
            {props.detail}
          </Text>
        </View>
      </View>
    </CardShell>
  );
}
