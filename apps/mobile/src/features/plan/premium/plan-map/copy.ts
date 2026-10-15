/** The premium plan map's own words (the trip map's copy module supplies the rest). */
import { t } from '@lingui/core/macro';

const booked = () => t({ id: 'plan.premium.map.booked', message: 'Booked' });
const stopMenu = () => t({ id: 'plan.premium.map.stopMenu', message: 'More for this stop' });
const dropSlot = () => t({ id: 'plan.premium.map.dropSlot', message: 'Drops here' });

export const planMapCopy = {
  back: () => t({ id: 'plan.premium.map.back', message: 'Back' }),
  more: () => t({ id: 'plan.premium.map.more', message: 'More for this plan' }),
  // Short enough for the pill beside the back and ⋯ circles; the pill steps its size down to
  // fit a long place or guide name rather than cutting the guide's name.
  search: (place: string, guide: string) =>
    place === ''
      ? t({ id: 'plan.premium.map.searchOrAsk', message: `Search, or ask ${guide}` })
      : t({ id: 'plan.premium.map.search', message: `Search ${place}, or ask ${guide}` }),
  addTo: (weekday: string) =>
    weekday === ''
      ? t({ id: 'plan.premium.map.addAny', message: 'Add a stop, or paste a link' })
      : t({ id: 'plan.premium.map.addTo', message: `Add to ${weekday}, or paste a link` }),
  stay: () => t({ id: 'plan.premium.map.stay', message: 'Stay' }),
  booked,
  stopMenu,
  dropSlot,
  timeline: () => ({ booked: booked(), menu: stopMenu(), drop: dropSlot() }),
  check: () => t({ id: 'plan.premium.map.check', message: 'Check' }),
  see: () => t({ id: 'plan.premium.map.see', message: 'See' }),
  wholeTrip: () => t({ id: 'plan.premium.map.wholeTrip', message: 'The whole trip' }),
  share: () => t({ id: 'plan.premium.map.share', message: 'Share' }),
  ideasLine: (n: number) =>
    t({
      id: 'plan.premium.map.ideasWaiting',
      message: `${String(n)} saved places aren’t in a day yet`,
    }),
  ideas: () => t({ id: 'plan.premium.map.ideas', message: 'Ideas' }),
  closeMenu: () => t({ id: 'plan.premium.map.closeMenu', message: 'Close the menu' }),
  menu: {
    ideas: (n: number) => t({ id: 'plan.premium.menu.ideas', message: `Ideas · ${String(n)}` }),
    places: () => t({ id: 'plan.premium.menu.places', message: 'Places as a list' }),
    allDays: () => t({ id: 'plan.premium.menu.allDays', message: 'All days' }),
    share: () => t({ id: 'plan.premium.menu.share', message: 'Share the plan' }),
    check: () => t({ id: 'plan.premium.menu.check', message: 'Check the plan' }),
    settings: () => t({ id: 'plan.premium.menu.settings', message: 'Trip settings' }),
  },
  stop: {
    details: () => t({ id: 'plan.premium.stop.details', message: 'See the details' }),
    move: () => t({ id: 'plan.premium.stop.move', message: 'Move to another day' }),
    time: () => t({ id: 'plan.premium.stop.time', message: 'Change time' }),
    ask: (guide: string) => t({ id: 'plan.premium.stop.ask', message: `Ask ${guide} about it` }),
    // Waits in the guide's composer for her to send or change.
    askAbout: (title: string) =>
      t({ id: 'plan.premium.stop.askAbout', message: `What should we know about ${title}?` }),
    share: () => t({ id: 'plan.premium.stop.share', message: 'Share' }),
    remove: () => t({ id: 'plan.premium.stop.remove', message: 'Remove from plan' }),
    removed: (title: string) =>
      t({ id: 'plan.premium.stop.removed', message: `${title} is back in Ideas` }),
    moving: (time: string) => t({ id: 'plan.premium.stop.moving', message: `Moving to ${time}` }),
  },
};
