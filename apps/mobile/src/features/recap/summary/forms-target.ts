/**
 * Where the recap page's forms card leads: the critter whose forms it shows (the one that got
 * away), else the destination's own critter, else the destination's set. Never the whole
 * collection or the year's legendaries: the card is about this trip.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design screen ids, never copy. */

export type FormsTarget =
  | { readonly screen: '3l-3'; readonly params: { readonly critterId: string } }
  | { readonly screen: '3l-8'; readonly params: { readonly setId: string } };

export interface FormsTargetInput {
  readonly gotAwayCritterId: string | null;
  readonly destinationCritterId: string | null;
  readonly setId: string | null;
}

export function formsTarget(input: FormsTargetInput): FormsTarget | null {
  const critterId = input.gotAwayCritterId ?? input.destinationCritterId;
  if (critterId !== null) return { screen: '3l-3', params: { critterId } };
  if (input.setId !== null) return { screen: '3l-8', params: { setId: input.setId } };
  return null;
}
