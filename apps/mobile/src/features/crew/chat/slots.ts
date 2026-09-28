/**
 * Places other features plug into the crew chat without editing it: where the header's MAP pill
 * goes (the crew map, or its teaser), and a hint row above the composer (the guide's metering
 * hint). Until a feature registers, the pill and the hint are not shown.
 */
import type { ComponentType } from 'react';

export type ChatMapTarget = (crewId: string) => void;

let mapTarget: ChatMapTarget | null = null;
let composerHint: ComponentType<{ readonly crewId: string }> | null = null;

export function registerChatMapTarget(target: ChatMapTarget): () => void {
  mapTarget = target;
  return () => {
    if (mapTarget === target) mapTarget = null;
  };
}

export function chatMapTarget(): ChatMapTarget | null {
  return mapTarget;
}

export function registerChatComposerHint(
  component: ComponentType<{ readonly crewId: string }>,
): () => void {
  composerHint = component;
  return () => {
    if (composerHint === component) composerHint = null;
  };
}

export function chatComposerHint(): ComponentType<{ readonly crewId: string }> | null {
  return composerHint;
}
