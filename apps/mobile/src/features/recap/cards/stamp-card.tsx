/**
 * Card 7, the stamp (3m-8): a passport page. "ENTRIES · ENTRÉES" and the page number at the top,
 * an older stamp faded in the corner, the trip's stamp slamming down large in the middle in the
 * guide's ink with the guide drawn inside it, the crew's signatures writing themselves around and
 * under it in their own colours (one after another, and live as each traveller opens the recap),
 * and "STAMP 13 IS ĐÀ NẴNG" at the foot.
 */
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useStamp } from '@/motion/patterns/stamp';
import { Stamp } from '@/ui/documents/Stamp';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { WrittenSignature } from '../signature/written-signature';
import { fetchStroke, useStroke, type StrokeFetch } from '../signature/stroke-store';
import { useCardTimeline } from '../story/use-card-timeline';
import { CardShell } from './card-shell';

const SLAM_MS = 500;
const SIGN_GAP_MS = 700;
const STAMP = 230;
const DOODLE = 48;
const TILT = -6;
/** Where signatures land on the page, as fractions of the field: around and under the stamp. */
const SPOTS = [
  { x: 0.02, y: 0.66 },
  { x: 0.58, y: 0.64 },
  { x: 0.08, y: 0.8 },
  { x: 0.6, y: 0.8 },
  { x: 0.32, y: 0.9 },
  { x: 0.66, y: 0.04 },
  { x: 0.0, y: 0.5 },
  { x: 0.7, y: 0.5 },
] as const;

const useStyles = makeStyles((th) => ({
  chrome: { flexDirection: 'row', justifyContent: 'space-between' },
  field: { flex: 1 },
  stamp: {
    position: 'absolute',
    alignSelf: 'center',
    top: '12%',
    width: STAMP,
    height: STAMP,
    transform: [{ rotate: `${TILT}deg` }],
  },
  doodle: {
    position: 'absolute',
    top: STAMP * 0.12,
    alignSelf: 'center',
  },
  older: { position: 'absolute', top: 0, start: 0, opacity: 0.5 },
  foot: { alignItems: 'center', gap: th.space['4'] },
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
  readonly guideKind: string;
  readonly older: readonly { readonly id: string; readonly title: string; readonly ink: string }[];
  readonly signers: readonly StampSigner[];
  readonly caption: string;
  readonly detail: string;
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
  const spot = SPOTS[index % SPOTS.length] ?? SPOTS[0];
  return (
    <View style={{ position: 'absolute', left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}>
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
      <Stamp
        title={props.place}
        top={props.top}
        bottom={props.bottom}
        ink={props.ink}
        size={STAMP}
        tilt={0}
      />
      <View style={styles.doodle} pointerEvents="none">
        <Sticker
          kind={props.guideKind}
          name={props.place}
          size={DOODLE}
          variant="mask"
          maskColor={props.ink}
          sticker={null}
        />
      </View>
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
  return (
    <CardShell ground={theme.color.paper.base} tone="paper" testID="recap-card-stamp">
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
        {props.older.length === 0 ? null : (
          <View style={styles.older}>
            {props.older.slice(0, 1).map((stamp) => (
              <Stamp key={stamp.id} title={stamp.title} ink={stamp.ink} size={120} tilt={-8} />
            ))}
          </View>
        )}
        {reached > 0 ? <TripStamp {...props} /> : null}
        <View style={{ flex: 1 }} testID="recap-signatures">
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
        <Text variant="h2" color={ink}>
          {props.caption}
        </Text>
        <Text variant="bodySm" color={ink}>
          {props.detail}
        </Text>
      </View>
    </CardShell>
  );
}
