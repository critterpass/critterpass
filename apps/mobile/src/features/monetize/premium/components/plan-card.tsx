/**
 * The plan on the night ground (9.17): the tier eyebrow in sun, the plan's name, when it renews or
 * ends, an MRZ line and the Stamp icon, with a shine every few seconds. A fixed themed surface.
 */
import { StyleSheet, View } from 'react-native';

import { Text } from '@/ui/premium';

import { NIGHT } from './night';
import { ShineSweep } from './shine-sweep';
import { StampIcon } from './stamp-icon';

export interface PlanCardProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly line: string;
  readonly mrz: string;
  readonly iconLabel: string;
  readonly testID?: string;
}

export function PlanCard({ eyebrow, title, line, mrz, iconLabel, testID }: PlanCardProps) {
  return (
    <View testID={testID} style={styles.card}>
      <ShineSweep every={5600} width={110} distance={460} opacity={0.18} />
      <View style={styles.text}>
        <Text variant="badge" color={NIGHT.sun} style={styles.eyebrow}>
          {eyebrow}
        </Text>
        <Text variant="display" color={NIGHT.text} style={styles.heavy} numberOfLines={1}>
          {title}
        </Text>
        <Text variant="note" color={NIGHT.textSoft} numberOfLines={2}>
          {line}
        </Text>
      </View>
      <Text variant="mono" color={NIGHT.textFaint} numberOfLines={1} style={styles.mrz}>
        {mrz}
      </Text>
      <View style={styles.icon} pointerEvents="none">
        <StampIcon size={96} shape="icon" label={iconLabel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 180,
    borderRadius: 28,
    overflow: 'hidden',
    padding: 20,
    experimental_backgroundImage: `radial-gradient(120% 100% at 80% 0%, ${NIGHT.top}, ${NIGHT.mid} 70%)`,
    boxShadow: '0 20px 40px -18px rgba(23,20,42,0.6)',
  },
  text: { gap: 4, maxWidth: '62%' },
  eyebrow: { fontWeight: '800', letterSpacing: 1.5 },
  heavy: { fontWeight: '800' },
  mrz: { position: 'absolute', left: 20, right: 20, bottom: 16 },
  icon: { position: 'absolute', right: 18, top: 24 },
});
