/**
 * The crew card's badge slot: another area (crew chat) registers the component that renders a
 * crew's badge (its unread count). Until one registers, the slot renders nothing.
 */
import type { ComponentType } from 'react';

export interface CrewCardBadgeProps {
  readonly crewId: string;
}

let badge: ComponentType<CrewCardBadgeProps> | null = null;

export function registerCrewCardBadge(component: ComponentType<CrewCardBadgeProps>): () => void {
  badge = component;
  return () => {
    if (badge === component) badge = null;
  };
}

export function crewCardBadge(): ComponentType<CrewCardBadgeProps> | null {
  return badge;
}
