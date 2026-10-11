/**
 * A found critter form as a premium sticker: the white die-cut edge on every tier and no tier ring
 * (the premium design dropped the pink and gold rings), optionally tilted.
 */
import type { FormSpec, Pose } from '@cp/critter-art';
import { View } from 'react-native';

import { CritterSticker } from '@/ui/premium';

export interface FormArtProps {
  readonly kind: string;
  readonly name: string;
  readonly size: number;
  readonly form?: FormSpec | null;
  readonly pose?: Pose;
  readonly seed?: number;
  /** Degrees. */
  readonly rotate?: number;
  /** Bare art without the edge (avatars, reaction busts). */
  readonly edge?: boolean;
}

/** The form without its tier ring. */
export function ringless(form: FormSpec | null | undefined): FormSpec | undefined {
  if (form === null || form === undefined) return undefined;
  return form.edge === 'none' ? form : { ...form, edge: 'none' };
}

export function FormArt({ kind, name, size, form, pose, seed, rotate, edge }: FormArtProps) {
  const spec = ringless(form);
  const art = (
    <CritterSticker
      kind={kind}
      name={name}
      size={size}
      {...(spec === undefined ? {} : { form: spec })}
      {...(pose === undefined ? {} : { pose })}
      {...(seed === undefined ? {} : { seed })}
      {...(edge === undefined ? {} : { edge })}
    />
  );
  return rotate === undefined ? (
    art
  ) : (
    <View style={{ transform: [{ rotate: `${rotate}deg` }] }}>{art}</View>
  );
}
