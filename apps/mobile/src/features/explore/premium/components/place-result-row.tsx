/**
 * One place in a premium results card (4.31, 4.33 ways back, 4.57): the 48 thumb, the name, a muted
 * meta line, the fit line in its tone ("Fits Mon, your first night" in booked green) and the 34
 * control `+` that adds it. A place already on a day says so and has no `+`.
 */
import type { ReactNode } from 'react';
import { Pressable, View, type ImageSourcePropType } from 'react-native';

import { IconButton, Text, usePremiumTheme, type PremiumTheme } from '@/ui/premium';

import type { DoodleName } from './doodle';
import { PlaceThumb } from './place-thumb';

/** How a fit line reads: it fits, it needs a move, the crew is split, or nothing to say. */
export type FitLineTone = 'fits' | 'needsMove' | 'split' | 'none';

export interface PlaceResultRowProps {
  readonly title: string;
  readonly meta?: string | undefined;
  readonly icon: DoodleName;
  readonly photo?: ImageSourcePropType | undefined;
  readonly fitLine?: { readonly text: string; readonly tone: FitLineTone } | undefined;
  /** A trailing line of its own (offline freshness), drawn like a good fit. */
  readonly fresh?: string | undefined;
  readonly onPress?: (() => void) | undefined;
  /** The `+`; absent leaves the row without one. */
  readonly onAdd?: (() => void) | undefined;
  readonly addLabel?: string | undefined;
  /** A tag or pill drawn where the `+` would be. */
  readonly trailing?: ReactNode;
  readonly thumbSize?: number;
  readonly testID?: string | undefined;
  readonly addTestID?: string | undefined;
}

export function fitColour(t: PremiumTheme, tone: FitLineTone): string {
  if (tone === 'fits') return t.color.status.booked.text;
  if (tone === 'needsMove') return t.color.status.maybe.text;
  if (tone === 'split') return t.color.status.voteOpen.text;
  return t.color.muted;
}

const THUMB = 48;

export function PlaceResultRow(props: PlaceResultRowProps) {
  const t = usePremiumTheme();
  const label = [props.title, props.meta, props.fitLine?.text, props.fresh]
    .filter((part) => part !== undefined)
    .join(', ');
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.onPress === undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={props.testID}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.gap12,
        paddingVertical: t.space.gap8 + 1,
        paddingHorizontal: t.space.gap12,
        backgroundColor: pressed ? t.color.control : undefined,
      })}
    >
      <PlaceThumb photo={props.photo} icon={props.icon} size={props.thumbSize ?? THUMB} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="rowTitle" numberOfLines={1}>
          {props.title}
        </Text>
        {props.meta === undefined ? null : (
          <Text variant="captionMuted" tone="muted" numberOfLines={1}>
            {props.meta}
          </Text>
        )}
        {props.fitLine === undefined || props.fitLine.tone === 'none' ? null : (
          <Text variant="helper" color={fitColour(t, props.fitLine.tone)} numberOfLines={1}>
            {props.fitLine.text}
          </Text>
        )}
        {props.fresh === undefined ? null : (
          <Text variant="badge" color={t.color.status.booked.text} numberOfLines={1}>
            {props.fresh}
          </Text>
        )}
      </View>
      {props.trailing ??
        (props.onAdd === undefined ? null : (
          <IconButton
            icon="plus"
            label={props.addLabel ?? props.title}
            tone="control"
            size={t.size.pillSmall}
            onPress={props.onAdd}
            {...(props.addTestID === undefined ? {} : { testID: props.addTestID })}
          />
        ))}
    </Pressable>
  );
}
