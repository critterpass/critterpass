/**
 * The share sheet for one found form of a critter: the card is drawn on the phone, post first,
 * with the form's name and "{tier} · found in {city}".
 */
import { useMemo } from 'react';

import { tierWord } from '@/ui/critters/tier';
import { ShareSheet, type ShareFormat } from '@/ui/share-image/ShareSheet';

import { shareAlt, shareLine } from './detail-copy';
import type { DetailForm } from './detail-model';
import { deviceShareDeps, renderCritterCard } from './share-card';

const FORMATS: readonly ShareFormat[] = ['post', 'story'];

export interface CritterShareProps {
  /** The critter's art kind and seed, as its sticker is drawn everywhere else. */
  readonly kind: string;
  readonly seed: number;
  readonly city: string;
  readonly form: DetailForm;
  readonly name: string;
  readonly onClose: () => void;
}

export function CritterShare({ kind, seed, city, form, name, onClose }: CritterShareProps) {
  const deps = useMemo(() => deviceShareDeps(), []);
  const { spec, rarity } = form;
  const render = useMemo(() => {
    const card = { kind, seed, form: spec, name, line: shareLine(tierWord(rarity), city) };
    return (format: ShareFormat) => renderCritterCard(card, format);
  }, [kind, seed, spec, rarity, name, city]);
  return (
    <ShareSheet
      altText={shareAlt(name, city)}
      formats={FORMATS}
      render={render}
      deps={deps}
      onClose={onClose}
      testID="critters-share"
    />
  );
}
