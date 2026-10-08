/**
 * One place in a list (7c-3 Places list, 7f-2 Ideas): picture, name, a meta line, the faces of
 * whoever saved it, and the line that says when it fits, in the fit's colour. The end holds the
 * row's action: a + to add, a SPLIT tag, or a drag handle (the drag belongs to the screen).
 */
import type { ReactNode } from 'react';
import { View, type ImageSourcePropType } from 'react-native';

import type { DoodleName } from '../icons/generated';
import { AvatarStack, type StackMember } from '../people/AvatarStack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { fitToneColor, type FitTone } from './fit-tone';
import { PlaceThumb } from './place-thumb';

export interface PlaceRowProps {
  readonly title: string;
  /** "Water temple · 45 min · Rp 75k". */
  readonly meta?: string | undefined;
  readonly photo?: ImageSourcePropType | undefined;
  /** The photo is a stock one standing in for the place (the picture marks it). */
  readonly genericPhoto?: boolean | undefined;
  readonly icon?: DoodleName | undefined;
  readonly savers?: readonly StackMember[] | undefined;
  /** Faces at the row's end (Ideas, 7f-2) instead of beside the fit line (Places list). */
  readonly saversAtEnd?: boolean | undefined;
  readonly fitLine?: { readonly text: string; readonly tone: FitTone } | undefined;
  readonly trailing?: ReactNode | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly testID?: string | undefined;
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    paddingVertical: t.space['10'],
    paddingHorizontal: t.space['14'],
  },
  body: { flex: 1, minWidth: 0, gap: t.space['2'] },
  fit: { flexDirection: 'row', alignItems: 'center', gap: t.space['6'] },
  end: { flexDirection: 'row', alignItems: 'center', gap: t.space['8'] },
}));

export function PlaceRow({
  title,
  meta,
  photo,
  genericPhoto,
  icon,
  savers = [],
  saversAtEnd = false,
  fitLine,
  trailing,
  onPress,
  testID,
}: PlaceRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const faces = savers.length === 0 ? null : <AvatarStack members={savers} size="sm" max={3} />;
  const label = [title, meta, fitLine?.text].filter((part) => part !== undefined).join(', ');
  const content = (
    <View style={styles.row}>
      <PlaceThumb
        photo={photo}
        genericPhoto={genericPhoto}
        icon={icon}
        size={saversAtEnd ? 38 : 56}
      />
      <View style={styles.body}>
        {/* Two lines: a long name ("Nhà thờ Chính tòa Đức Bà Sài Gòn") reads whole. */}
        <Text variant="title" numberOfLines={2} singleLine={false}>
          {title}
        </Text>
        {meta === undefined ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={1}>
            {meta}
          </Text>
        )}
        {fitLine === undefined && (saversAtEnd || faces === null) ? null : (
          <View style={styles.fit}>
            {saversAtEnd ? null : faces}
            {fitLine === undefined ? null : (
              <Text variant="bodySm" color={fitToneColor(theme, fitLine.tone)} numberOfLines={1}>
                {fitLine.text}
              </Text>
            )}
          </View>
        )}
      </View>
      <View style={styles.end}>
        {saversAtEnd ? faces : null}
        {trailing}
      </View>
    </View>
  );
  if (onPress === undefined) return <View testID={testID}>{content}</View>;
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      {content}
    </PressScale>
  );
}
