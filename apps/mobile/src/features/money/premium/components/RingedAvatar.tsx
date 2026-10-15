/**
 * A crew avatar that can wear the chosen ink ring (7.18 Paid by, 7.23 person filter): a 2 pt ink
 * circle 2.5 pt outside the avatar, the ground showing through the gap. The ring is a bordered
 * circle that is always mounted, so choosing someone after the row has drawn rounds it like the
 * first draw does (a ring shadow added later drew square on Android).
 */
import { StyleSheet, View } from 'react-native';

import { crewAccent } from '@/features/trip';
import { Avatar, usePremiumTheme } from '@/ui/premium';

import type { MoneyMember } from '../../data/context';

const SIZE = 36;
const GAP = 2.5;
const LINE = 2;
const OUT = GAP + LINE;

export function RingedAvatar(props: {
  readonly member: MoneyMember;
  readonly ringed: boolean;
  /** Stand back (another avatar is chosen). */
  readonly dimmed: boolean;
}) {
  const th = usePremiumTheme();
  const dim = th.scheme === 'dark' ? 0.5 : 0.45;
  return (
    <View style={[styles.box, props.dimmed && !props.ringed ? { opacity: dim } : null]}>
      <View
        pointerEvents="none"
        style={[styles.ring, { borderColor: props.ringed ? th.color.ink : 'transparent' }]}
      />
      <Avatar
        name={props.member.name}
        color={crewAccent(props.member.joinIndex)}
        uid={props.member.userId}
        size={SIZE}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: SIZE, height: SIZE },
  ring: {
    position: 'absolute',
    top: -OUT,
    left: -OUT,
    width: SIZE + OUT * 2,
    height: SIZE + OUT * 2,
    borderRadius: (SIZE + OUT * 2) / 2,
    borderWidth: LINE,
  },
});
