/**
 * The recap page's words: each stat tile's number and caption, the header, the forms card, the
 * got-away line and the badges. Numbers come from the model (the recap row) and are only
 * formatted here; the guide's own words replace the code-built ones once they are written.
 */
import type { RideProvider } from '@cp/domain';
import { format, type DistanceUnit } from '@cp/i18n';
import { plural, t } from '@lingui/core/macro';

import type { SummaryGotAway, SummaryModel, SummaryTile } from './summary-model';

// eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time suffix, never copy.
const NOON_UTC = 'T12:00:00Z';

export interface TileCopy {
  readonly value: string;
  readonly caption: string;
}

/** A whole amount with its symbol ("$0", "₫1,200,000"). */
export function wholeMoney(locale: string, amountMinor: number, currency: string): string {
  const exponent =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return format.number(locale, Math.abs(amountMinor) / 10 ** exponent, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
}

function wholeDistance(locale: string, metres: number, unit: DistanceUnit): string {
  const rounded = unit === 'imperial' ? metres : Math.round(metres / 1000) * 1000;
  return format.distance(locale, rounded, unit);
}

function providerName(provider: RideProvider): string {
  switch (provider) {
    case 'grab':
      return 'Grab';
    case 'gojek':
      return 'Gojek';
    case 'uber':
      return 'Uber';
    case 'taxi':
      return t({ id: 'recap.summary.provider.taxi', message: 'taxi' });
    case 'transfer':
      return t({ id: 'recap.summary.provider.transfer', message: 'the transfer' });
    case 'driver':
    default:
      return t({ id: 'recap.summary.provider.driver', message: 'your driver' });
  }
}

function distanceCaption(tile: Extract<SummaryTile, { id: 'distance' }>): string {
  if (tile.driver !== null) {
    const name = tile.driver.name ?? providerName(tile.driver.provider);
    return t({ id: 'recap.summary.distance.driver', message: `driven, mostly by ${name}` });
  }
  const stops = tile.stops;
  return t({
    id: 'recap.summary.distance.stops',
    message: plural(stops, { one: `between # stop`, other: `between # stops` }),
  });
}

function owedCaption(tile: Extract<SummaryTile, { id: 'owed' }>): string {
  if (!tile.settled) {
    return t({ id: 'recap.summary.owed.open', message: 'still to settle up' });
  }
  const after = tile.settledDaysAfterEnd;
  if (after === null) return t({ id: 'recap.summary.owed.square', message: 'everyone square' });
  if (after < 0) {
    const days = -after;
    return t({
      id: 'recap.summary.owed.early',
      message: plural(days, { one: `settled # day early`, other: `settled # days early` }),
    });
  }
  if (after === 0) {
    return t({ id: 'recap.summary.owed.lastDay', message: 'settled on the last day' });
  }
  return t({
    id: 'recap.summary.owed.after',
    message: plural(after, { one: `settled # day after`, other: `settled # days after` }),
  });
}

export function tileCopy(tile: SummaryTile, locale: string, unit: DistanceUnit): TileCopy {
  switch (tile.id) {
    case 'distance': {
      const distance = wholeDistance(locale, tile.metres, unit);
      return {
        value: tile.estimated
          ? t({ id: 'recap.summary.distance.about', message: `about ${distance}` })
          : distance,
        caption: distanceCaption(tile),
      };
    }
    case 'sunrise': {
      const { place, localTime } = tile;
      return {
        value: place,
        caption: t({
          id: 'recap.summary.sunrise.caption',
          message: `started at ${localTime}, before sunrise`,
        }),
      };
    }
    case 'photos': {
      const count = tile.count;
      const top = tile.top;
      const taken = top?.count ?? 0;
      const name = top?.name ?? '';
      return {
        value: t({
          id: 'recap.summary.photos.value',
          message: plural(count, { one: `# photo`, other: `# photos` }),
        }),
        caption:
          top === null
            ? t({ id: 'recap.summary.photos.crew', message: 'in the crew album' })
            : top.me
              ? t({
                  id: 'recap.summary.photos.mine',
                  message: `you took ${taken} of them`,
                })
              : t({
                  id: 'recap.summary.photos.top',
                  message: `${name} took ${taken} of them`,
                }),
      };
    }
    case 'owed': {
      const amount = wholeMoney(locale, tile.outstandingMinor, tile.currency);
      return {
        value: t({ id: 'recap.summary.owed.value', message: `${amount} owed` }),
        caption: owedCaption(tile),
      };
    }
    case 'days': {
      const { days, travellers } = tile;
      return {
        value: t({
          id: 'recap.summary.days.value',
          message: plural(days, { one: `# day`, other: `# days` }),
        }),
        caption:
          travellers === 1
            ? t({ id: 'recap.summary.days.solo', message: 'just you, on your own clock' })
            : t({
                id: 'recap.summary.days.crew',
                message: `${travellers} of you, start to finish`,
              }),
      };
    }
    case 'finds': {
      const { forms, newCritters } = tile;
      return {
        value: t({
          id: 'recap.summary.finds.value',
          message: plural(forms, { one: `# find`, other: `# finds` }),
        }),
        caption: t({
          id: 'recap.summary.finds.caption',
          message: plural(newCritters, {
            0: `all old friends`,
            one: `# new local`,
            other: `# new locals`,
          }),
        }),
      };
    }
    case 'meals': {
      const { meals } = tile;
      const each = wholeMoney(locale, tile.eachMinor, tile.currency);
      return {
        value: t({
          id: 'recap.summary.meals.value',
          message: plural(meals, { one: `# meal`, other: `# meals` }),
        }),
        caption: t({ id: 'recap.summary.meals.caption', message: `${each} each, all in` }),
      };
    }
  }
}

/** "OCT 12–19 · THE BALI SIX", or "· JUST YOU" on a solo trip. */
export function headerEyebrow(model: SummaryModel, locale: string): string {
  const dates =
    model.startDate === null || model.endDate === null
      ? null
      : format.dateInterval(
          locale,
          new Date(`${model.startDate}${NOON_UTC}`),
          new Date(`${model.endDate}${NOON_UTC}`),
          { month: 'short', day: 'numeric', timeZone: 'UTC' },
        );
  const who = model.crewName ?? t({ id: 'recap.summary.justYou', message: 'Just you' });
  return dates === null ? who : `${dates} · ${who}`;
}

export function headerTitle(model: SummaryModel): string {
  const place = model.place;
  return place === null
    ? t({ id: 'recap.summary.titleNoPlace', message: 'The recap' })
    : t({ id: 'recap.summary.title', message: `${place}, the recap` });
}

/** "The Golden Tokek got away." then the guide's line, or the sightings while it is unwritten. */
export function gotAwayLine(gotAway: SummaryGotAway): string {
  const name = gotAway.name;
  const first =
    name === null
      ? gotAway.rarity === 'legendary'
        ? t({ id: 'recap.summary.gotAway.goldUnnamed', message: 'A golden one got away.' })
        : t({ id: 'recap.summary.gotAway.unnamed', message: 'A rare one got away.' })
      : gotAway.rarity === 'legendary'
        ? t({ id: 'recap.summary.gotAway.gold', message: `The Golden ${name} got away.` })
        : t({ id: 'recap.summary.gotAway.named', message: `${name} got away.` });
  if (gotAway.line !== null) return `${first} ${gotAway.line}`;
  const sightings = gotAway.sightings;
  if (sightings === 0) return first;
  const second = t({
    id: 'recap.summary.gotAway.seen',
    message: plural(sightings, {
      one: `Seen once, befriended by nobody.`,
      other: `Seen # times, befriended by nobody.`,
    }),
  });
  return `${first} ${second}`;
}

/** "TOKEK'S FORMS", or this trip's finds. */
export function formsEyebrow(kind: 'got_away' | 'finds', name: string | null): string {
  if (kind === 'finds') return t({ id: 'recap.summary.forms.finds', message: 'New locals' });
  return name === null
    ? t({ id: 'recap.summary.forms.unnamed', message: 'The one that got away' })
    : t({ id: 'recap.summary.forms.named', message: `${name}'s forms` });
}

export function formsCount(found: number, total: number, kind: 'got_away' | 'finds'): string {
  return kind === 'finds'
    ? t({ id: 'recap.summary.forms.foundCount', message: `${found} found` })
    : t({
        id: 'recap.summary.forms.ofCount',
        message: `${found} of ${total} found`,
      });
}

export function updatedBadge(updated: 'expenses' | 'other'): string {
  return updated === 'expenses'
    ? t({ id: 'recap.summary.updated.expenses', message: 'Updated with late expenses' })
    : t({ id: 'recap.summary.updated.other', message: 'Updated with late additions' });
}
