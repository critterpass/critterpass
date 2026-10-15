/**
 * What a stop's menu offers. Everyone can see the details and share the stop; changing its day or
 * time needs a plan that can be edited (a member's change goes to the crew as a suggestion); a
 * booked stop is never taken off from here (its booking would be left behind); asking the guide
 * needs a guide to ask.
 */
export interface StopOffers {
  readonly move: boolean;
  readonly time: boolean;
  readonly ask: boolean;
  readonly remove: boolean;
}

export function stopOffers(input: {
  readonly readOnly: boolean;
  readonly booked: boolean;
  readonly canAsk: boolean;
}): StopOffers {
  const editable = !input.readOnly;
  return {
    move: editable,
    time: editable,
    ask: input.canAsk,
    remove: editable && !input.booked,
  };
}
