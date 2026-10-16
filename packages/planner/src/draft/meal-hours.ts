/**
 * When people eat where the crew is. Lunch and dinner keep the local hours of the place: Madrid
 * lunches at two and dines at nine, Lisbon and Istanbul dine at eight, Mexico City lunches late,
 * London dines at seven, and most of Asia and North America eat at noon and six. The hours are
 * read from the destination's time zone, which every place and every trip frame carries, so the
 * planner, its validators and the prompts that time a meal all read the same stretches.
 *
 * On the day the crew flies out in the evening, dinner comes early, before the ride to the
 * airport (`beforeLeaving`).
 */

/** A meal's stretch of the local day: aimed at `startMin`, started by `lastStartMin`, served to `endMin`. */
export interface MealStretch {
  readonly startMin: number;
  readonly lastStartMin: number;
  readonly endMin: number;
}

export interface MealHours {
  readonly lunch: MealStretch;
  readonly dinner: MealStretch;
}

const at = (hours: number, minutes = 0) => hours * 60 + minutes;
const stretch = (startMin: number, lastStartMin: number, endMin: number): MealStretch => ({
  startMin,
  lastStartMin,
  endMin,
});

/** Noon and six: most of Asia, North America, Africa and Oceania. */
export const USUAL_MEALS: MealHours = {
  lunch: stretch(at(11, 30), at(13, 30), at(14, 30)),
  dinner: stretch(at(18), at(20, 30), at(21, 30)),
};
/** Northern and central Europe: lunch at noon, dinner at seven. */
const NORTHERN_EUROPE: MealHours = {
  lunch: stretch(at(12), at(14), at(15)),
  dinner: stretch(at(19), at(21), at(22)),
};
/** Portugal, France, Italy, Turkey and their neighbours: lunch from half past twelve, dinner at eight. */
const SOUTHERN_EUROPE: MealHours = {
  lunch: stretch(at(12, 30), at(14), at(15, 30)),
  dinner: stretch(at(19, 30), at(21), at(22, 30)),
};
/** Spain, Greece and the Southern Cone: lunch at two, dinner from half past eight. */
const LATE_MEALS: MealHours = {
  lunch: stretch(at(13, 30), at(14, 30), at(16)),
  dinner: stretch(at(20, 30), at(21, 30), at(23)),
};
/** Mexico, Central America, the Caribbean's Spanish side and the rest of South America. */
const LATIN_AMERICA: MealHours = {
  lunch: stretch(at(13), at(14, 30), at(16)),
  dinner: stretch(at(19, 30), at(21), at(22, 30)),
};

const ZONES: readonly (readonly [MealHours, readonly string[]])[] = [
  [
    LATE_MEALS,
    [
      'Europe/Madrid',
      'Africa/Ceuta',
      'Atlantic/Canary',
      'Europe/Athens',
      'America/Argentina/',
      'America/Buenos_Aires',
      'America/Montevideo',
      'America/Santiago',
      'America/Punta_Arenas',
    ],
  ],
  [
    SOUTHERN_EUROPE,
    [
      'Europe/Lisbon',
      'Atlantic/Madeira',
      'Atlantic/Azores',
      'Europe/Paris',
      'Europe/Monaco',
      'Europe/Rome',
      'Europe/Vatican',
      'Europe/San_Marino',
      'Europe/Malta',
      'Europe/Zagreb',
      'Europe/Ljubljana',
      'Europe/Sarajevo',
      'Europe/Podgorica',
      'Europe/Belgrade',
      'Europe/Skopje',
      'Europe/Tirane',
      'Europe/Sofia',
      'Europe/Istanbul',
      'Asia/Istanbul',
      'Asia/Nicosia',
      'Asia/Famagusta',
      'Asia/Beirut',
    ],
  ],
  [
    LATIN_AMERICA,
    [
      'America/Mexico_City',
      'America/Cancun',
      'America/Merida',
      'America/Monterrey',
      'America/Matamoros',
      'America/Chihuahua',
      'America/Ciudad_Juarez',
      'America/Hermosillo',
      'America/Mazatlan',
      'America/Bahia_Banderas',
      'America/Tijuana',
      'America/Guatemala',
      'America/Belize',
      'America/El_Salvador',
      'America/Tegucigalpa',
      'America/Managua',
      'America/Costa_Rica',
      'America/Panama',
      'America/Havana',
      'America/Santo_Domingo',
      'America/Puerto_Rico',
      'America/Bogota',
      'America/Caracas',
      'America/Lima',
      'America/Guayaquil',
      'America/La_Paz',
      'America/Asuncion',
      'America/Sao_Paulo',
      'America/Bahia',
      'America/Fortaleza',
      'America/Recife',
      'America/Maceio',
      'America/Belem',
      'America/Manaus',
      'America/Cuiaba',
      'America/Campo_Grande',
    ],
  ],
];

const BY_ZONE = new Map<string, MealHours>();

/** The local meal hours in time zone `tz` (an IANA name). */
export function mealHoursIn(tz: string): MealHours {
  const known = BY_ZONE.get(tz);
  if (known !== undefined) return known;
  const listed = ZONES.find(([, zones]) =>
    zones.some((zone) => (zone.endsWith('/') ? tz.startsWith(zone) : tz === zone)),
  )?.[0];
  const hours = listed ?? (tz.startsWith('Europe/') ? NORTHERN_EUROPE : USUAL_MEALS);
  BY_ZONE.set(tz, hours);
  return hours;
}

/** The meal hours of a day window (`USUAL_MEALS` for a window built without them). */
export function mealsOf(window: { readonly meals?: MealHours }): MealHours {
  return window.meals ?? USUAL_MEALS;
}

/** A day runs through dinner when it lasts this long past dinner's start: time to sit and eat. */
export const DINNER_ROOM_MIN = 90;
/** An early dinner before a flight starts no sooner than this. */
export const EARLY_DINNER_MIN = at(17);

/**
 * The meal hours of a day that ends at `endMin` because the crew flies out: when the day ends
 * before the usual dinner fits but late enough for an early one, dinner moves to its last hour and
 * a half (a 21:30 flight: dinner at five, at the airport by half past six).
 */
export function beforeLeaving(hours: MealHours, endMin: number): MealHours {
  const startMin = endMin - DINNER_ROOM_MIN;
  if (startMin >= hours.dinner.startMin || startMin < EARLY_DINNER_MIN) return hours;
  return { ...hours, dinner: stretch(startMin, endMin - 60, endMin) };
}
