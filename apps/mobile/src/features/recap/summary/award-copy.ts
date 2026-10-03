/**
 * The award chips' words: a fallback title per award kind while the guide has not titled it, and
 * the chip's second line from the award's own number ("Alex: Warung Pondok", "Jordan, up at 05:10").
 */
import type { AwardKind } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';

import type { SummaryAwardChip } from './summary-model';

export function awardTitle(kind: AwardKind): string {
  switch (kind) {
    case 'treasurer':
      return t({ id: 'recap.award.treasurer', message: 'The treasurer' });
    case 'planner':
      return t({ id: 'recap.award.planner', message: 'The planner' });
    case 'early_riser':
      return t({ id: 'recap.award.earlyRiser', message: 'Earliest riser' });
    case 'critter_whisperer':
      return t({ id: 'recap.award.critterWhisperer', message: 'Critter whisperer' });
    case 'explorer':
      return t({ id: 'recap.award.explorer', message: 'The explorer' });
    case 'best_find':
      return t({ id: 'recap.award.bestFind', message: 'Best find' });
    case 'navigator':
      return t({ id: 'recap.award.navigator', message: 'The navigator' });
    case 'human_camera':
      return t({ id: 'recap.award.humanCamera', message: 'Human camera' });
    case 'good_company':
    default:
      return t({ id: 'recap.award.goodCompany', message: 'Good company' });
  }
}

/** The chip's second line from the award's own numbers: "Alex: Warung Pondok", "Jordan, up at 05:10". */
export function awardDetail(chip: SummaryAwardChip): string {
  const name = chip.me ? t({ id: 'recap.award.you', message: 'You' }) : chip.name;
  const value = chip.value;
  const { poi_name: poi, earliest_time: time } = chip.evidence;
  switch (chip.kind) {
    case 'best_find':
      return poi === undefined
        ? name
        : t({ id: 'recap.award.detail.place', message: `${name}: ${poi}` });
    case 'early_riser':
      return time === undefined
        ? name
        : t({ id: 'recap.award.detail.time', message: `${name}, up at ${time}` });
    case 'treasurer':
      return t({
        id: 'recap.award.detail.expenses',
        message: plural(value, {
          one: `${name}, # expense logged`,
          other: `${name}, # expenses logged`,
        }),
      });
    case 'planner':
      return t({
        id: 'recap.award.detail.edits',
        message: plural(value, { one: `${name}, # plan edit`, other: `${name}, # plan edits` }),
      });
    case 'critter_whisperer':
      return t({
        id: 'recap.award.detail.finds',
        message: plural(value, { one: `${name}, # find`, other: `${name}, # finds` }),
      });
    case 'explorer':
      return t({
        id: 'recap.award.detail.places',
        message: plural(value, { one: `${name}, # place`, other: `${name}, # places` }),
      });
    case 'navigator':
      return t({
        id: 'recap.award.detail.rides',
        message: plural(value, { one: `${name}, # ride sorted`, other: `${name}, # rides sorted` }),
      });
    case 'human_camera':
      return t({
        id: 'recap.award.detail.photos',
        message: plural(value, { one: `${name}, # photo`, other: `${name}, # photos` }),
      });
    case 'good_company':
    default:
      return name;
  }
}
