/**
 * Taste tag words: the full chip label ("EASY-ISH PACE", on ON YOUR PASS and the profile) and the
 * short form the pass prints as its travel style ("SUNRISE · STREET FOOD · EASY").
 */
import { t } from '@lingui/core/macro';

import type { TasteTag } from '@cp/domain';

export interface TagWords {
  readonly full: string;
  readonly short: string;
}

export function tagWords(tag: TasteTag): TagWords {
  switch (tag) {
    case 'street_food':
      return {
        full: t({ id: 'onboarding.tag.streetFood', message: 'Street food' }),
        short: t({ id: 'onboarding.tag.streetFood.short', message: 'Street food' }),
      };
    case 'sit_down_dining':
      return {
        full: t({ id: 'onboarding.tag.sitDownDining', message: 'Proper dinners' }),
        short: t({ id: 'onboarding.tag.sitDownDining.short', message: 'Dinners' }),
      };
    case 'coffee':
      return {
        full: t({ id: 'onboarding.tag.coffee', message: 'Coffee stops' }),
        short: t({ id: 'onboarding.tag.coffee.short', message: 'Coffee' }),
      };
    case 'nightlife':
      return {
        full: t({ id: 'onboarding.tag.nightlife', message: 'Night owl' }),
        short: t({ id: 'onboarding.tag.nightlife.short', message: 'Night owl' }),
      };
    case 'quiet_evenings':
      return {
        full: t({ id: 'onboarding.tag.quietEvenings', message: 'Early nights' }),
        short: t({ id: 'onboarding.tag.quietEvenings.short', message: 'Early nights' }),
      };
    case 'early_starts':
      return {
        full: t({ id: 'onboarding.tag.earlyStarts', message: 'Sunrise chaser' }),
        short: t({ id: 'onboarding.tag.earlyStarts.short', message: 'Sunrise' }),
      };
    case 'late_starts':
      return {
        full: t({ id: 'onboarding.tag.lateStarts', message: 'Slow mornings' }),
        short: t({ id: 'onboarding.tag.lateStarts.short', message: 'Lie-ins' }),
      };
    case 'easy_pace':
      return {
        full: t({ id: 'onboarding.tag.easyPace', message: 'Easy-ish pace' }),
        short: t({ id: 'onboarding.tag.easyPace.short', message: 'Easy' }),
      };
    case 'packed_days':
      return {
        full: t({ id: 'onboarding.tag.packedDays', message: 'Chaos is fine' }),
        short: t({ id: 'onboarding.tag.packedDays.short', message: 'Packed' }),
      };
    case 'nature':
      return {
        full: t({ id: 'onboarding.tag.nature', message: 'Green places' }),
        short: t({ id: 'onboarding.tag.nature.short', message: 'Nature' }),
      };
    case 'hiking':
      return {
        full: t({ id: 'onboarding.tag.hiking', message: 'Big hikes' }),
        short: t({ id: 'onboarding.tag.hiking.short', message: 'Hikes' }),
      };
    case 'beach':
      return {
        full: t({ id: 'onboarding.tag.beach', message: 'Beach, no plans' }),
        short: t({ id: 'onboarding.tag.beach.short', message: 'Beach' }),
      };
    case 'culture':
      return {
        full: t({ id: 'onboarding.tag.culture', message: 'Culture fix' }),
        short: t({ id: 'onboarding.tag.culture.short', message: 'Culture' }),
      };
    case 'history':
      return {
        full: t({ id: 'onboarding.tag.history', message: 'Old stories' }),
        short: t({ id: 'onboarding.tag.history.short', message: 'History' }),
      };
    case 'temples':
      return {
        full: t({ id: 'onboarding.tag.temples', message: 'Temples' }),
        short: t({ id: 'onboarding.tag.temples.short', message: 'Temples' }),
      };
    case 'museums':
      return {
        full: t({ id: 'onboarding.tag.museums', message: 'Museums' }),
        short: t({ id: 'onboarding.tag.museums.short', message: 'Museums' }),
      };
    case 'markets':
      return {
        full: t({ id: 'onboarding.tag.markets', message: 'Market wanderer' }),
        short: t({ id: 'onboarding.tag.markets.short', message: 'Markets' }),
      };
    case 'shopping':
      return {
        full: t({ id: 'onboarding.tag.shopping', message: 'Shopping bags' }),
        short: t({ id: 'onboarding.tag.shopping.short', message: 'Shops' }),
      };
    case 'wellness':
      return {
        full: t({ id: 'onboarding.tag.wellness', message: 'Spa days' }),
        short: t({ id: 'onboarding.tag.wellness.short', message: 'Spa' }),
      };
    case 'adventure':
      return {
        full: t({ id: 'onboarding.tag.adventure', message: 'Up for anything' }),
        short: t({ id: 'onboarding.tag.adventure.short', message: 'Adventure' }),
      };
    case 'photo_spots':
      return {
        full: t({ id: 'onboarding.tag.photoSpots', message: 'Photo dumps' }),
        short: t({ id: 'onboarding.tag.photoSpots.short', message: 'Photos' }),
      };
    case 'local_life':
      return {
        full: t({ id: 'onboarding.tag.localLife', message: 'Like a local' }),
        short: t({ id: 'onboarding.tag.localLife.short', message: 'Local' }),
      };
    case 'splurge':
      return {
        full: t({ id: 'onboarding.tag.splurge', message: 'Treat yourself' }),
        short: t({ id: 'onboarding.tag.splurge.short', message: 'Splurge' }),
      };
    case 'thrifty':
      return {
        full: t({ id: 'onboarding.tag.thrifty', message: 'Budget hacker' }),
        short: t({ id: 'onboarding.tag.thrifty.short', message: 'Thrifty' }),
      };
  }
}
