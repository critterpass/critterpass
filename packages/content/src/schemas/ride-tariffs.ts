/**
 * `ride_tariffs` release items: one ride class in one destination (metered taxi, ride-hail car or
 * bike) with the published figures behind its fare estimate, each with its source link and the date
 * it was checked. The shape and the estimate that reads it live in `@cp/domain`.
 */
import { rideTariffSchema, type RideTariff } from '@cp/domain';

export const rideTariffItemSchema = rideTariffSchema;
export type RideTariffItem = RideTariff;
