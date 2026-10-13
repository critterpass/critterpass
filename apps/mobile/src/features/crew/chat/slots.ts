/**
 * Places other features plug into the crew chat without editing it: where the header's MAP pill
 * goes (the crew map, or its teaser), a badge beside the header's title (the BOOSTED pill) and a
 * hint row above the composer (the guide's metering hint). Until a feature registers, none of them
 * is shown.
 */
import { createElement, type ComponentType, type ReactNode } from 'react';

export type ChatMapTarget = (crewId: string) => void;

let mapTarget: ChatMapTarget | null = null;
let composerHint: ComponentType<{ readonly crewId: string }> | null = null;
let headerBadge: ComponentType<{ readonly crewId: string }> | null = null;

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

export function registerChatHeaderBadge(
  component: ComponentType<{ readonly crewId: string }>,
): () => void {
  headerBadge = component;
  return () => {
    if (headerBadge === component) headerBadge = null;
  };
}

/** The registered header chip for this crew, or nothing while no area registered one. */
export function ChatHeaderBadge({ crewId }: { readonly crewId: string }): ReactNode {
  return headerBadge === null ? null : createElement(headerBadge, { crewId });
}
