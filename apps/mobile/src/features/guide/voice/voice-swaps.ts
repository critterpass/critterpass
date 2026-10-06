/**
 * The swap cards of a voice turn from its change sets: one card per change, the set's per-person
 * cost on the card when the set holds that one change (a set with several changes gives one cost
 * line instead), and where sending to the group stands.
 */
import type { PlanCardModel } from '../chat/data/use-plan-card';
import type { VoiceGroupSend } from './voice-footer';
import type { VoiceSwap } from './voice-swap-card';

export interface VoiceProposals {
  readonly swaps: readonly VoiceSwap[];
  /** What each share moves by for change sets with several changes ("+$22"), one per set. */
  readonly costs: readonly string[];
  readonly group: VoiceGroupSend | null;
}

/** The cards and cost lines of the change sets that have synced down. */
export function voiceSwaps(
  models: readonly PlanCardModel[],
  /** The set's per-person cost as shown ("+$18"), or null when no share moves. */
  costOf: (model: PlanCardModel) => string | null,
): Pick<VoiceProposals, 'swaps' | 'costs'> {
  const swaps: VoiceSwap[] = [];
  const costs: string[] = [];
  for (const model of models) {
    const cost = costOf(model);
    const alone = model.swaps.length === 1;
    if (!alone && cost !== null) costs.push(cost);
    model.swaps.forEach((swap, index) => {
      const title = swap.after?.label || swap.before?.label || '';
      if (title === '') return;
      swaps.push({
        id: `${model.changesetId}-${index}`,
        title,
        detail: swap.reason,
        delta: alone ? cost : null,
      });
    });
  }
  return { swaps, costs };
}

/** Where sending stands: something still to send, everything sent, or nothing to send. */
export function groupStatus(models: readonly PlanCardModel[]): VoiceGroupSend['status'] | null {
  if (models.some((model) => model.state === 'draft')) return 'open';
  return models.some((model) => model.state === 'voting') ? 'sent' : null;
}
