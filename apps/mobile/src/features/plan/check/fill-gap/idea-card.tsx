/**
 * One of Tokek's ideas for a free window (7h-2): the kit's option card (a radio, a title, a line,
 * tags) with one difference the render asks for: the tag that says whose save it is wears that
 * member's colour.
 */
import { tokens } from '@cp/design-tokens';
import { View } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface IdeaTag {
  readonly label: string;
  /** The fill; absent draws the quiet tag. */
  readonly color?: string | undefined;
}

export interface IdeaCardProps {
  readonly title: string;
  readonly body: string;
  readonly tags: readonly IdeaTag[];
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly testID?: string | undefined;
}

const RADIO = 22;
const PIP = 10;

const useStyles = makeStyles((t) => ({
  card: {
    flexDirection: 'row',
    gap: t.space['12'],
    padding: t.space['14'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    borderWidth: 2,
    borderColor: t.semantic.bg.raised,
  },
  chosen: { borderColor: t.semantic.action.primary },
  radio: {
    width: RADIO,
    height: RADIO,
    borderRadius: RADIO / 2,
    borderWidth: 2,
    borderColor: t.semantic.border.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: t.space['2'],
  },
  radioOn: { borderColor: t.semantic.action.primary },
  pip: {
    width: PIP,
    height: PIP,
    borderRadius: PIP / 2,
    backgroundColor: t.semantic.action.primary,
  },
  body: { flex: 1, minWidth: 0, gap: t.space['4'] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space['6'], marginTop: t.space['4'] },
  tag: {
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.sunken,
  },
}));

export function IdeaCard({ title, body, tags, selected, onSelect, testID }: IdeaCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityLabel={[title, body, ...tags.map((tag) => tag.label)].join(', ')}
      accessibilityState={{ selected }}
      testID={testID}
    >
      <View style={[styles.card, selected ? styles.chosen : null]}>
        <View style={[styles.radio, selected ? styles.radioOn : null]}>
          {selected ? <View style={styles.pip} /> : null}
        </View>
        <View style={styles.body}>
          <Text variant="title" singleLine={false}>
            {title}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary} singleLine={false}>
            {body}
          </Text>
          {tags.length === 0 ? null : (
            <View style={styles.tags}>
              {tags.map((tag) => (
                <View
                  key={tag.label}
                  style={[
                    styles.tag,
                    tag.color === undefined ? null : { backgroundColor: tag.color },
                  ]}
                >
                  <Text
                    variant="label"
                    {...(tag.color === undefined ? {} : { color: tokens.color.paper.ink })}
                  >
                    {tag.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </PressScale>
  );
}
