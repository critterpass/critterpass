/**
 * The rules about when in a day things happen, in one place for whoever plans or checks a stop
 * (the drafting pipeline, the fit engine, "Add to plan"): the stretches meals belong in and which
 * meals a place serves (./meal-slots), the time of day a place is for and the minutes a stop
 * there may start between (./place-time), and the usable part of a trip day (./schedule-day).
 */
export {
  BREAKFAST,
  DINNER,
  DINNER_LAST_START_MIN,
  LUNCH,
  LUNCH_LAST_START_MIN,
  mealAt,
  mealSlotAt,
  mealSlots,
  mealsInWindow,
  type MealSlot,
} from './meal-slots';
export {
  MORNING_ENDS_MIN,
  placeTime,
  placeWindow,
  sunsetMin,
  timeOfDayWindow,
  type PlaceTime,
  type PlaceWindow,
} from './place-time';
export { baseWindow, dayWindow, defaultDurationMin } from './schedule-day';
export { foodRole, stopKind, type FoodRole } from './food-role';
