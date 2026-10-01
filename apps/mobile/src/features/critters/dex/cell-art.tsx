/**
 * A critter's art in a dex slot: the sticker of its best owned form once found, otherwise its true
 * silhouette (gold for a legendary) that breathes faintly so the slot reads as waiting, not empty.
 * The silhouette is labelled with its city, never its name.
 */
import type { FormSpec } from '@cp/critter-art';
import { tokens } from '@cp/design-tokens';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLoop } from '@/motion';
import { SilhouetteSlot } from '@/ui/sticker/SilhouetteSlot';
import { Sticker } from '@/ui/sticker/Sticker';

import { unknownName } from '../critters-copy';
import { artKind } from '../art-kind';

export interface CellArtProps {
  readonly critterKey: string;
  readonly seed: number;
  readonly city: string;
  readonly size: number;
  readonly name: string | null;
  readonly form: FormSpec | null;
  readonly found: boolean;
  readonly gold?: boolean;
  /** Breathe while locked (off in long strips where many would pulse at once). */
  readonly breathe?: boolean;
  readonly testID?: string;
}

export function CellArt(props: CellArtProps) {
  const { critterKey, seed, city, size, found, gold = false, breathe = true } = props;
  const pulse = useLoop('pulse', { active: breathe && !found });
  if (found) {
    return (
      <View testID={props.testID}>
        <Sticker
          kind={artKind(critterKey)}
          name={props.name ?? unknownName()}
          size={size}
          seed={seed}
          {...(props.form === null ? {} : { form: props.form })}
        />
      </View>
    );
  }
  return (
    <Animated.View style={breathe ? pulse : undefined} testID={props.testID}>
      <SilhouetteSlot
        kind={artKind(critterKey)}
        city={city}
        size={size}
        seed={seed}
        maskColor={gold ? tokens.tier.locked.legendary.silhouette : tokens.tier.locked.default}
        glyphColor={gold ? tokens.tier.legendary.color : tokens.tier.epic.color}
      />
    </Animated.View>
  );
}

export type { FormSpec };
