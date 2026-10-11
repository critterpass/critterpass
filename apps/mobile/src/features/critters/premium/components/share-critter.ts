/**
 * Sharing one found form from a premium screen: the critter card drawn on the phone (the post
 * format) handed straight to the system share sheet.
 */
import type { FormSpec } from '@cp/critter-art';

import { shareViaSystemSheet } from '@/ui/share-image/share-actions';

import { shareAlt, shareLine } from '../../detail/detail-copy';
import { deviceShareDeps, renderCritterCard } from '../../detail/share-card';

export async function shareCritter(card: {
  readonly kind: string;
  readonly seed: number;
  readonly form: FormSpec | null;
  readonly name: string;
  readonly tier: string;
  readonly city: string;
}): Promise<boolean> {
  try {
    const bytes = await renderCritterCard(
      {
        kind: card.kind,
        seed: card.seed,
        form: card.form,
        name: card.name,
        line: shareLine(card.tier, card.city),
      },
      'post',
    );
    await shareViaSystemSheet(bytes, shareAlt(card.name, card.city), deviceShareDeps());
    return true;
  } catch {
    return false;
  }
}
