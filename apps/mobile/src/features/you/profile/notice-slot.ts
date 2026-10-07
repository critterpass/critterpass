/**
 * A notice above the profile (a failed Pass+ renewal). The area that owns the rows behind it
 * registers the component, which draws nothing when it has nothing to say.
 */
import type { ComponentType } from 'react';

let notice: ComponentType | null = null;

export function registerProfileNotice(component: ComponentType): () => void {
  notice = component;
  return () => {
    if (notice === component) notice = null;
  };
}

export function profileNotice(): ComponentType | null {
  return notice;
}
