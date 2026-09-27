import { t } from '@lingui/core/macro';

import type { DoodleName } from './generated';

/**
 * Accessibility registry for every doodle icon (docs/design-system.md §5 "Doodle labels").
 * Decorative doodles (underlines, circles, flourishes) are hidden from screen readers; meaningful
 * ones carry a localised default label the caller may override with the specific meaning.
 */
export interface DoodleA11y {
  /** Hidden from assistive tech unless the caller passes an explicit label. */
  readonly decorative: boolean;
  /** Directional art (arrows, vehicles, speech tails) flips horizontally in RTL locales. */
  readonly mirrorInRtl: boolean;
  readonly label?: () => string;
}

const decorative = (mirrorInRtl = false): DoodleA11y => ({ decorative: true, mirrorInRtl });
const labelled = (label: () => string, mirrorInRtl = false): DoodleA11y => ({
  decorative: false,
  mirrorInRtl,
  label,
});

export const DOODLE_A11Y: Readonly<Record<DoodleName, DoodleA11y>> = {
  arrow: decorative(true),
  bed: labelled(() => t({ id: 'common.icon.stay', message: 'Stay' })),
  bell: labelled(() => t({ id: 'common.icon.notifications', message: 'Notifications' })),
  boat: labelled(() => t({ id: 'common.icon.boat', message: 'Boat' }), true),
  cal: labelled(() => t({ id: 'common.icon.calendar', message: 'Calendar' })),
  camera: labelled(() => t({ id: 'common.icon.camera', message: 'Camera' })),
  car: labelled(() => t({ id: 'common.icon.car', message: 'Car' }), true),
  chat: labelled(() => t({ id: 'common.icon.chat', message: 'Chat' }), true),
  check: labelled(() => t({ id: 'common.icon.done', message: 'Done' })),
  circle: decorative(),
  egg: labelled(() => t({ id: 'common.icon.egg', message: 'Critter egg' })),
  flame: labelled(() => t({ id: 'common.icon.streak', message: 'Streak' })),
  food: labelled(() => t({ id: 'common.icon.food', message: 'Food' })),
  heart: labelled(() => t({ id: 'common.icon.favourite', message: 'Favourite' })),
  lock: labelled(() => t({ id: 'common.icon.locked', message: 'Locked' })),
  pin: labelled(() => t({ id: 'common.icon.place', message: 'Place' })),
  plane: labelled(() => t({ id: 'common.icon.flight', message: 'Flight' }), true),
  rain: labelled(() => t({ id: 'common.icon.rain', message: 'Rain' })),
  spark: decorative(),
  squiggle: decorative(),
  star: labelled(() => t({ id: 'common.icon.highlight', message: 'Highlight' })),
  sun: labelled(() => t({ id: 'common.icon.sunny', message: 'Sunny' })),
  temple: labelled(() => t({ id: 'common.icon.sight', message: 'Sight' })),
  ticket: labelled(() => t({ id: 'common.icon.ticket', message: 'Ticket' })),
  underline: decorative(),
  volcano: labelled(() => t({ id: 'common.icon.volcano', message: 'Volcano' })),
  wallet: labelled(() => t({ id: 'common.icon.wallet', message: 'Wallet' })),
  wave: labelled(() => t({ id: 'common.icon.beach', message: 'Beach' })),
};
