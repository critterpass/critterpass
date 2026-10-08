/**
 * Leaving the purchase screens once something was bought. The welcome and the boost stamp replace
 * the screen the purchase was made on, but the paywall that led there can still be underneath
 * ("What's in each" and the boost sheet are pushed over it). Done closes the whole run of them,
 * back to the screen the person was on before the paywall.
 */
import { router } from 'expo-router';

import { goBackOr } from '@/lib/navigation/back';

export function closePurchaseModals(): void {
  try {
    if (router.canDismiss()) router.dismissAll();
  } catch {
    // Outside a navigator (a lab scene): nothing to dismiss.
  }
  goBackOr();
}
