/**
 * One crewmate on the map: a dark capsule with their member-colour border, avatar, name and status
 * ("Leaving Karsa Spa"). A stale fix greys the pin ("Last seen 12 min ago"); an approximate one
 * (precise location off) says so. Tapping pops it and opens the detail sheet.
 */
import { resolveMemberStyle } from '@cp/design-tokens';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PressScale } from '@/ui/press/PressScale';
import { Avatar } from '@/ui/people/Avatar';
import { Row, Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import type { PersonView } from '../data/view-model';
import { usePopIn } from './use-pop-in';

export const usePinStyles = makeStyles((th) => ({
  capsule: {
    alignItems: 'center',
    gap: th.space['8'],
    backgroundColor: th.semantic.bg.sunken,
    borderRadius: th.radius.pill,
    borderWidth: 2,
    paddingVertical: th.space['4'],
    paddingLeft: th.space['4'],
    paddingRight: th.space['12'],
    maxWidth: 220,
  },
  tail: {
    alignSelf: 'flex-start',
    marginLeft: th.space['16'],
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  stale: { opacity: 0.5 },
  names: { flexShrink: 1 },
}));

export function MemberPin({
  person,
  status,
  label,
  onPress,
}: {
  readonly person: PersonView;
  readonly status: string;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const styles = usePinStyles();
  const theme = useTheme();
  const pop = usePopIn();
  const colour = resolveMemberStyle(person.joinIndex).color;
  return (
    <Animated.View style={[pop, person.stale ? styles.stale : null]}>
      <PressScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={`live-pin-${person.uid}`}
      >
        <Row
          style={[
            styles.capsule,
            { borderColor: person.stale ? theme.semantic.text.secondary : colour },
          ]}
        >
          <Avatar name={person.name} joinIndex={person.joinIndex} size="sm" decorative />
          <Stack gap="2" style={styles.names}>
            <Text variant="label" numberOfLines={1}>
              {person.name}
            </Text>
            <Text variant="caption" color={theme.semantic.text.secondary} numberOfLines={1}>
              {status}
            </Text>
          </Stack>
        </Row>
        <View
          style={[
            styles.tail,
            { borderTopColor: person.stale ? theme.semantic.text.secondary : colour },
          ]}
        />
      </PressScale>
    </Animated.View>
  );
}
