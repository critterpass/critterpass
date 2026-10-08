/**
 * A place on the map's carousel (7c-2): photo, name, the faces of whoever saved it, a short
 * description, hours and price, the fit pill ("FITS SAT · 08:00") and the yellow + that adds it.
 * The picked card is outlined.
 */
import type { ReactNode } from 'react';
import { View, type ImageSourcePropType } from 'react-native';

import type { DoodleName } from '../icons/generated';
import { AvatarStack, type StackMember } from '../people/AvatarStack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { AddButton } from './add-button';
import { fitToneColor, type FitTone } from './fit-tone';
import { PlaceThumb } from './place-thumb';

export interface PlaceCardProps {
  readonly title: string;
  readonly description?: string | undefined;
  /** "Open 08:00–17:00 · Rp 75k". */
  readonly facts?: string | undefined;
  readonly photo?: ImageSourcePropType | undefined;
  /** The photo is a stock one standing in for the place (the picture marks it). */
  readonly genericPhoto?: boolean | undefined;
  readonly icon?: DoodleName | undefined;
  readonly savers?: readonly StackMember[] | undefined;
  readonly fit?: { readonly text: string; readonly tone: FitTone } | undefined;
  /** A small tag beside the name ("NEXT DOOR"): in the row, so it never covers the name. */
  readonly badge?: ReactNode | undefined;
  readonly picked?: boolean | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly onAdd?: (() => void) | undefined;
  /** The + button's screen-reader words ("Add Tirta Empul to the plan"). */
  readonly addLabel?: string | undefined;
  readonly testID?: string | undefined;
}

const useStyles = makeStyles((t) => ({
  card: {
    flexDirection: 'row',
    gap: t.space['12'],
    padding: t.space['12'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.base,
    borderWidth: 2,
    borderColor: t.semantic.bg.raised,
  },
  picked: { borderColor: t.color.paper.base },
  body: { flex: 1, minWidth: 0, gap: t.space['4'] },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space['8'] },
  title: { flex: 1, minWidth: 0 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: t.space['8'], marginTop: t.space['4'] },
  pill: {
    flexShrink: 1,
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.control,
  },
  spacer: { flex: 1 },
}));

export function PlaceCard({
  title,
  description,
  facts,
  photo,
  genericPhoto,
  icon,
  savers = [],
  fit,
  badge,
  picked = false,
  onPress,
  onAdd,
  addLabel,
  testID,
}: PlaceCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const label = [title, description, facts, fit?.text]
    .filter((part) => part !== undefined)
    .join(', ');
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: picked }}
      testID={testID}
    >
      <View style={[styles.card, picked ? styles.picked : null]}>
        <PlaceThumb photo={photo} genericPhoto={genericPhoto} icon={icon} size={92} />
        <View style={styles.body}>
          <View style={styles.head}>
            <View style={styles.title}>
              <Text variant="h3" numberOfLines={2}>
                {title}
              </Text>
            </View>
            {badge}
            {savers.length === 0 ? null : <AvatarStack members={savers} size="sm" max={3} />}
          </View>
          {description === undefined ? null : (
            <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={2}>
              {description}
            </Text>
          )}
          {facts === undefined ? null : (
            <Text variant="bodySm" numberOfLines={1}>
              {facts}
            </Text>
          )}
          <View style={styles.foot}>
            {fit === undefined ? null : (
              <View style={styles.pill}>
                {/* A longer line (other languages) wraps inside the pill instead of being cut. */}
                <Text
                  variant="label"
                  color={fitToneColor(theme, fit.tone)}
                  numberOfLines={2}
                  singleLine={false}
                >
                  {fit.text}
                </Text>
              </View>
            )}
            <View style={styles.spacer} />
            {onAdd === undefined ? null : (
              <AddButton accessibilityLabel={addLabel ?? title} onPress={onAdd} />
            )}
          </View>
        </View>
      </View>
    </PressScale>
  );
}
