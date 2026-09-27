import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePingRings } from '@/motion/patterns/ping-rings';

import { Row } from '../layout/Row';
import { Tag } from '../plan/ActionPill';
import { makeStyles, useTheme } from '../theme';

export interface ViewfinderProps {
  /** The live camera view (vision-camera), supplied by the feature. */
  readonly children?: ReactNode;
  /** Mode pill ("Encounter", "Auto-split on"). */
  readonly mode?: string;
  /** Context pill ("You're at Tirta Empul"). */
  readonly context?: string;
  /** Radar pings at the centre while searching. */
  readonly pinging?: boolean;
  /** Spoken description of what the camera is for ("Camera, point at the pools"). */
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

const CORNERS = ['topStart', 'topEnd', 'bottomStart', 'bottomEnd'] as const;

const useStyles = makeStyles((th) => ({
  root: { flex: 1, overflow: 'hidden', backgroundColor: th.color.ink['930'] },
  corner: {
    position: 'absolute',
    width: th.space['32'],
    height: th.space['32'],
    borderColor: th.color.paper.base,
  },
  pills: {
    position: 'absolute',
    top: th.space['16'],
    start: th.space['16'],
    end: th.space['16'],
    justifyContent: 'space-between',
  },
  pingWrap: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  ping: {
    position: 'absolute',
    width: th.space['32'] * 4,
    height: th.space['32'] * 4,
    borderRadius: th.space['32'] * 2,
    borderWidth: th.space['2'],
    borderColor: th.color.paper.base,
  },
}));

/** Camera frame: corner brackets, mode and context pills, optional ping rings over the feed. */
export function Viewfinder({
  children,
  mode,
  context,
  pinging = false,
  accessibilityLabel,
  testID,
}: ViewfinderProps) {
  const styles = useStyles();
  const theme = useTheme();
  const rings = usePingRings(pinging);
  const inset = theme.space['20'];
  const stroke = theme.space['4'];
  const cornerStyle = (corner: (typeof CORNERS)[number]) => ({
    ...(corner.startsWith('top')
      ? { top: inset, borderTopWidth: stroke }
      : { bottom: inset, borderBottomWidth: stroke }),
    ...(corner.endsWith('Start')
      ? { start: inset, borderStartWidth: stroke }
      : { end: inset, borderEndWidth: stroke }),
  });
  return (
    <View
      testID={testID}
      style={styles.root}
      accessible
      accessibilityRole="image"
      accessibilityLabel={[accessibilityLabel, context].filter(Boolean).join(', ')}
    >
      {children}
      {pinging ? (
        <View style={styles.pingWrap} pointerEvents="none">
          {rings.map((ring) => (
            <Animated.View key={ring.key} style={[styles.ping, ring.style]} />
          ))}
        </View>
      ) : null}
      {CORNERS.map((corner) => (
        <View key={corner} style={[styles.corner, cornerStyle(corner)]} pointerEvents="none" />
      ))}
      <Row style={styles.pills} pointerEvents="none">
        {mode ? <Tag label={mode} color={theme.semantic.action.primary} /> : <View />}
        {context ? <Tag label={context} color={theme.color.paper.base} /> : null}
      </Row>
    </View>
  );
}
