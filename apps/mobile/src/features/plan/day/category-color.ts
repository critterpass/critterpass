/**
 * A plan item's block colour (3e-2): sights and outings blue, food yellow, spa and slow things
 * pink, getting around orange, and anything booked in paper cream so the fixed points read apart.
 */
import type { Theme } from '@/ui/theme';

import type { DayItem } from './plan-model';

const FOOD = [
  'food',
  'restaurant',
  'cafe',
  'coffee',
  'meal',
  'breakfast',
  'lunch',
  'dinner',
  'bar',
];
const SLOW = ['spa', 'wellness', 'massage', 'rest', 'nap', 'pool', 'beach'];
const MOVE = ['transport', 'transfer', 'pickup', 'flight', 'drive', 'boat', 'ferry', 'train'];

function has(category: string, words: readonly string[]): boolean {
  return words.some((word) => category.includes(word));
}

export function blockColor(theme: Theme, item: Pick<DayItem, 'category' | 'lock'>): string {
  if (item.lock === 'booking') return theme.color.paper.bright;
  const category = (item.category ?? '').toLowerCase();
  if (has(category, FOOD)) return theme.color.yellow;
  if (has(category, SLOW)) return theme.color.pink;
  if (has(category, MOVE)) return theme.color.orange;
  return theme.color.blue;
}
