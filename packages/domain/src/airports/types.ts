/**
 * The bundled airport dataset's shapes (OurAirports, public domain, filtered to airports with
 * scheduled service). Country-level facts live once per country; metro groups ("All London
 * airports") are IATA city codes over several airports.
 */
import { z } from 'zod';

export const iataSchema = z.string().regex(/^[A-Z]{3}$/u, 'must be a three-letter IATA code');

/** 1 = large international, 2 = medium, 3 = small with scheduled service. */
export const airportRankSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const airportSchema = z
  .object({
    iata: iataSchema,
    name: z.string().min(1).max(120),
    city: z.string().max(80),
    /** ISO 3166-1 alpha-2. */
    country: z.string().regex(/^[A-Z]{2}$/u),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    rank: airportRankSchema,
  })
  .strict();
export type Airport = z.infer<typeof airportSchema>;

export const airportCountrySchema = z
  .object({
    /** ISO 3166-1 alpha-3, used on the pass MRZ. */
    iso3: z.string().regex(/^[A-Z]{3}$/u),
    /** ISO 4217 home currency; null when the country has no single circulating currency. */
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/u)
      .nullable(),
    name: z.string().min(1).max(80),
  })
  .strict();
export type AirportCountry = z.infer<typeof airportCountrySchema>;

export const metroGroupSchema = z
  .object({
    /** IATA metropolitan (city) code, e.g. LON. */
    iata: iataSchema,
    city: z.string().min(1).max(80),
    country: z.string().regex(/^[A-Z]{2}$/u),
    airports: z.array(iataSchema).min(2),
  })
  .strict();
export type MetroGroup = z.infer<typeof metroGroupSchema>;

export interface AirportDataset {
  readonly airports: readonly Airport[];
  readonly countries: Readonly<Record<string, AirportCountry>>;
  readonly metros: readonly MetroGroup[];
}

/** The home a user picks: one airport or a metro group, with the derived country and currency. */
export interface HomeBase {
  readonly iata: string;
  readonly country: string;
  readonly countryIso3: string;
  readonly currency: string | null;
  readonly city: string;
}

export function homeBaseFor(dataset: AirportDataset, iata: string): HomeBase | null {
  const metro = dataset.metros.find((m) => m.iata === iata);
  const airport = dataset.airports.find((a) => a.iata === iata);
  const country = metro?.country ?? airport?.country;
  if (country === undefined) return null;
  const facts = dataset.countries[country];
  if (facts === undefined) return null;
  return {
    iata,
    country,
    countryIso3: facts.iso3,
    currency: facts.currency,
    city: metro?.city ?? airport?.city ?? '',
  };
}
