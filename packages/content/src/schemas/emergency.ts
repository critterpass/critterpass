/**
 * Safety datasets: emergency numbers per country (every country of the 61 places) and facilities
 * (hospital, clinic, pharmacy, embassy) for the six guide destinations. The model only structures
 * what official sources say and never invents a number: every record carries its source and the
 * date it was read, and nothing publishes until a person has verified it (`verified_at`).
 */
import { z } from 'zod';

import { countryCodeSchema, httpsUrlSchema, isoDateSchema, slugSchema } from './common';

export const EMERGENCY_SERVICES = [
  'general',
  'police',
  'ambulance',
  'fire',
  'tourist_police',
  'coast_guard',
  // A real hotline that is none of the above (search and rescue, a helpline): listed under its own
  // label, never the number Help leads with.
  'other',
] as const;

const phoneNumberSchema = z.string().regex(/^\+?[0-9][0-9 -]{1,18}$/u, 'must be a dialable number');

export const emergencyNumberItemSchema = z
  .object({
    country: countryCodeSchema,
    numbers: z
      .array(
        z
          .object({
            service: z.enum(EMERGENCY_SERVICES),
            number: phoneNumberSchema,
            /** Short label shown under the number: "Ambulance, police, fire". */
            label: z.string().min(1).max(40),
          })
          .strict(),
      )
      .min(1),
    source_url: httpsUrlSchema,
    retrieved_on: isoDateSchema,
    verified_at: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type EmergencyNumberItem = z.infer<typeof emergencyNumberItemSchema>;

export const FACILITY_KINDS = ['hospital', 'clinic', 'pharmacy', 'embassy'] as const;

export const facilityItemSchema = z
  .object({
    ref: slugSchema,
    destination: slugSchema,
    kind: z.enum(FACILITY_KINDS),
    name: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().min(1),
    phone: phoneNumberSchema.nullable(),
    open_24h: z.boolean().nullable(),
    source_url: httpsUrlSchema,
    retrieved_on: isoDateSchema,
    verified_at: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type FacilityItem = z.infer<typeof facilityItemSchema>;

/** Safety records publish only once a person has checked them against the source. */
export function isSafetyRecordPublishable(record: { verified_at: string | null }): boolean {
  return record.verified_at !== null;
}
