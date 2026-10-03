/**
 * The colours a fit speaks in across the planning screens: a day's dot on a chip (7f-1 green,
 * orange, grey) and the line under a place (7c-3, 7f-2: yellow when it fits, orange when it only
 * fits if something moves, pink when the crew is split, quiet when it doesn't fit).
 */
import type { Theme } from '../theme';

export type FitGrade = 'good' | 'possible' | 'no';
export type FitTone = 'fits' | 'needsMove' | 'split' | 'none';

export function fitDotColor(theme: Theme, grade: FitGrade): string {
  if (grade === 'good') return theme.semantic.state.success;
  if (grade === 'possible') return theme.semantic.state.warning;
  return theme.color.ink[400];
}

export function fitToneColor(theme: Theme, tone: FitTone): string {
  if (tone === 'fits') return theme.semantic.action.primary;
  if (tone === 'needsMove') return theme.semantic.state.warning;
  if (tone === 'split') return theme.semantic.state.urgent;
  return theme.semantic.text.secondary;
}
