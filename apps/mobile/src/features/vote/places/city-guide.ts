import { DESTINATION_GUIDE_TABLES, destinationGuideSql, useGuidesPerCity } from '@/data/guides';
import { isGuideStickerId } from '@/ui/avatar/guides';
import { useLiveRows } from '../data/live-rows';
import { type GuestPlace } from './use-guest-brief';

const CITY_GUIDE_TABLES = ['destinations', ...DESTINATION_GUIDE_TABLES];

/** The place's own guide while guides go by city (null: the guest guide covers it). */
export function useCityGuide(placeId: string): string | null {
  const perCity = useGuidesPerCity();
  const { rows } = useLiveRows<{ guide: string | null }>(
    // eslint-disable-next-line lingui/no-unlocalized-strings -- SQL, never copy.
    `SELECT ${destinationGuideSql(perCity, 'd.critter_key', 'NULL')} AS guide FROM destinations d WHERE d.id = ?`,
    [placeId],
    CITY_GUIDE_TABLES,
  );
  const slug = rows[0]?.guide ?? null;
  return isGuideStickerId(slug) ? slug : null;
}

/** "10 MAD ≈ $1" when the place's money is worth less than the home currency, else "1 EUR ≈ $1.08". */
export function fxLine(locale: string, fx: NonNullable<GuestPlace['fx']>): string | null {
  if (!(fx.rate > 0)) return null;
  const home = (amount: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: fx.quote,
      minimumFractionDigits: Number.isInteger(Math.round(amount * 100) / 100) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  if (fx.rate >= 1) return `1 ${fx.base} ≈ ${home(fx.rate)}`;
  const units = Math.round(1 / fx.rate);
  return `${units.toLocaleString(locale)} ${fx.base} ≈ ${home(units * fx.rate)}`;
}
