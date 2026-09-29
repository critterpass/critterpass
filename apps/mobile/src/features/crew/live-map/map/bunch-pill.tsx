/**
 * Crewmates within 60 m of each other merge into one pill: "MAYA + RIN · Karsa Spa", with up to
 * three avatars and "+n" beyond. The merge and split spring in; reduced motion swaps instantly.
 */
import { resolveMemberStyle } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AvatarStack } from '@/ui/people/AvatarStack';
import { PressScale } from '@/ui/press/PressScale';
import { Row, Stack, Text, useTheme } from '@/ui';

import type { PersonView } from '../data/view-model';
import { usePopIn } from './use-pop-in';
import { usePinStyles } from './member-pin';

/** "MAYA + RIN", "MAYA + RIN + ALEX", "MAYA + 3". */
export function bunchTitle(people: readonly PersonView[]): string {
  const names = people.map((person) => person.name);
  if (names.length <= 3) return names.join(' + ');
  const [first] = names;
  const more = names.length - 1;
  return t({ id: 'liveMap.bunch.more', message: `${first ?? ''} + ${more}` });
}

export function BunchPill({
  people,
  place,
  label,
  onPress,
}: {
  readonly people: readonly PersonView[];
  readonly place: string | null;
  readonly label: string;
  readonly onPress: () => void;
}) {
  const styles = usePinStyles();
  const theme = useTheme();
  const pop = usePopIn();
  const lead = people[0];
  const colour =
    lead === undefined ? theme.semantic.text.secondary : resolveMemberStyle(lead.joinIndex).color;
  return (
    <Animated.View style={pop}>
      <PressScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID="live-bunch"
      >
        <Row style={[styles.capsule, { borderColor: colour }]}>
          <AvatarStack
            members={people.map((person) => ({
              key: person.uid,
              name: person.name,
              joinIndex: person.joinIndex,
            }))}
            max={3}
            size="sm"
          />
          <Stack gap="2" style={styles.names}>
            <Text variant="label" numberOfLines={1} style={{ textTransform: 'uppercase' }}>
              {bunchTitle(people)}
            </Text>
            {place === null ? null : (
              <Text variant="caption" color={theme.semantic.text.secondary} numberOfLines={1}>
                {place}
              </Text>
            )}
          </Stack>
        </Row>
        <View style={[styles.tail, { borderTopColor: colour }]} />
      </PressScale>
    </Animated.View>
  );
}
