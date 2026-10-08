/**
 * What the draft screens' back says. Back returns to wherever she came from (setup, the trip map's
 * draft note, a proposal turn), so it only names setup when the screen was opened cold and setup
 * is where it lands.
 */
import { t } from '@lingui/core/macro';

import { canGoBack } from '@/lib/navigation/back';

/** The back eyebrow: "Back" over a screen, "{destination} setup" when setup is where it goes. */
export function draftBackLabel(destination: string | null): string {
  return destination === null || canGoBack()
    ? t({ id: 'planDraft.loading.back', message: 'Back' })
    : t({ id: 'planDraft.review.back', message: `${destination} setup` });
}

/** The drafting wait's back button, worded the same way. */
export function draftingBackLabel(): string {
  return canGoBack()
    ? t({ id: 'planDraft.loading.back', message: 'Back' })
    : t({ id: 'planDraft.drafting.back', message: 'Back to setup' });
}
