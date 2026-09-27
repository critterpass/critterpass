/** The user's `distance_unit` setting (data-model.md `user_settings`). */
export type DistanceUnit = 'metric' | 'imperial';

const METERS_PER_MILE = 1609.344;

/** Formats a distance given in metres per the user's km/mi preference (design-system.md §6). */
export function distance(locale: string, meters: number, unitPreference: DistanceUnit): string {
  if (unitPreference === 'imperial') {
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'mile', maximumFractionDigits: 1 }).format(
      meters / METERS_PER_MILE,
    );
  }
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilometer', maximumFractionDigits: 1 }).format(
    meters / 1000,
  );
}
