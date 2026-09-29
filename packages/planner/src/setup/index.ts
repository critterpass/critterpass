// Trip setup: date windows over date-level availability and the options shown when none fits.
export {
  addDays,
  bestWindow,
  compareWindows,
  datesOf,
  MAX_HORIZON_DAYS,
  scoreWindows,
  type ScoredWindow,
  type WindowDayState,
  type WindowInput,
  type WindowMember,
} from './windows';
export {
  windowOptions,
  type MustDoWindowRef,
  type WindowOption,
  type WindowOptionKind,
  type WindowOptionsInput,
  type WindowReason,
} from './no-fit-options';
export {
  fareLookup,
  openDates,
  seasonScorer,
  windowInputFrom,
  type SetupWindowSource,
  type WindowInputOptions,
} from './window-inputs';
