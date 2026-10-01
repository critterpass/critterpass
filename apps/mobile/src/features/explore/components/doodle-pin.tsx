/**
 * A place on the Explore map: a capsule with the category's doodle, the name and the initials of
 * the crewmates keen on it (three at most, then "+n"). The chosen pin is yellow. The map draws
 * an annotation from a picture of its view, taken once, so the pin holds still: nothing in it
 * animates, and it is whole from its first frame.
 */
import { resolveMemberStyle } from '@cp/design-tokens';
import { Pressable, View } from 'react-native';

import { Icon } from '@/ui/icons/Icon';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { categoryIcon, categoryLabel } from '../category';

/** The annotation is measured once, before the pin lays out: the pin sits in a fixed box. */
export const PIN_BOX = { width: 196, height: 52 } as const;
const MAX_FACES = 3;
const FACE = 18;

export interface PinFace {
  readonly key: string;
  readonly name: string;
  readonly joinIndex: number;
}

export interface DoodlePinProps {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly faces: readonly PinFace[];
  readonly selected: boolean;
  readonly onPress: () => void;
}

const useStyles = makeStyles((t) => ({
  box: { ...PIN_BOX, alignItems: 'center', justifyContent: 'center' },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['6'],
    maxWidth: PIN_BOX.width,
    paddingStart: t.space['4'],
    paddingEnd: t.space['10'],
    paddingVertical: t.space['4'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    borderWidth: t.space['2'],
    borderColor: t.semantic.bg.base,
  },
  chosen: { backgroundColor: t.semantic.action.primary, borderColor: t.semantic.action.primary },
  icon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.semantic.bg.base,
  },
  name: { flexShrink: 1 },
  faces: { flexDirection: 'row' },
  face: {
    width: FACE,
    height: FACE,
    borderRadius: FACE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: t.semantic.bg.base,
  },
}));

export function DoodlePin(props: DoodlePinProps) {
  const styles = useStyles();
  const theme = useTheme();
  const ink = props.selected ? theme.semantic.text.onAccent : theme.semantic.text.primary;
  const shown = props.faces.slice(0, MAX_FACES);
  const more = props.faces.length - shown.length;
  return (
    <View style={styles.box} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: props.selected }}
        accessibilityLabel={`${props.name}, ${categoryLabel(props.category)}`}
        onPress={props.onPress}
        style={[styles.capsule, props.selected ? styles.chosen : null]}
        testID={`explore-pin-${props.id}`}
      >
        <View style={styles.icon}>
          <Icon name={categoryIcon(props.category)} size={15} decorative />
        </View>
        <View style={styles.name}>
          <Text variant="label" color={ink} numberOfLines={1}>
            {props.name}
          </Text>
        </View>
        {shown.length === 0 ? null : (
          <View style={styles.faces}>
            {shown.map((face, at) => (
              <View
                key={face.key}
                style={[
                  styles.face,
                  {
                    backgroundColor: resolveMemberStyle(face.joinIndex).color,
                    marginStart: at === 0 ? 0 : -theme.space['6'],
                  },
                ]}
              >
                <Text variant="caption" color={theme.semantic.text.onAccent} numberOfLines={1}>
                  {face.name.trim().charAt(0).toUpperCase()}
                </Text>
              </View>
            ))}
            {more <= 0 ? null : (
              <Text variant="caption" color={ink} numberOfLines={1}>
                {`+${String(more)}`}
              </Text>
            )}
          </View>
        )}
      </Pressable>
    </View>
  );
}
