/**
 * The recap story's cards in play order, each with its length, its narration (the guide's words
 * in the reader's language, else a line built from the card's numbers) and its recorded voice. A
 * card with nothing behind it is left out: no critters found, no route, no expenses, nothing got
 * away. The postcard (the eighth card) joins once its card exists.
 */
import type { RecapCard } from '@cp/domain';
import { format, type DistanceUnit } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import type { GuideId } from '@/ui/people/GuideLine';

import { AwardsCard } from '../cards/awards-card';
import { CoverCard } from '../cards/cover-card';
import { CrittersCard } from '../cards/critters-card';
import { GotAwayCard } from '../cards/got-away-card';
import { receiptNote, receiptSections, receiptSubtitle, yourShare } from '../cards/receipt-copy';
import { ReceiptCard } from '../cards/receipt-card';
import { ROUTE_CARD_MS, RouteCard } from '../cards/route-card';
import { StampCard } from '../cards/stamp-card';
import { artKind } from '../data/critter-art';
import type { StrokeFetch } from '../signature/stroke-store';
import { gotAwayLine, headerEyebrow } from '../summary/summary-copy';
import type { SummaryModel } from '../summary/summary-model';
import {
  awardsTitle,
  cardLabel,
  daysChip,
  formsFoundLine,
  longestLegLine,
  newLocalsTitle,
  receiptHeadline,
  routeDriverLine,
  routeStopsLine,
  stampCaption,
  stopDays,
  sunriseChip,
  travellersChip,
  tripDates,
} from './story-copy';
import { awardCards, signers } from './story-people';
import type { RecapLive } from './use-recap-channel';
import type { StoryData } from './use-story-data';

export const CARD_MS = 6000;

export interface StoryCardSpec {
  readonly card: RecapCard;
  readonly label: string;
  readonly durationMs: number;
  readonly caption: string | null;
  readonly narrationKey: string | null;
  readonly content: ReactNode;
}

export interface StoryCardsInput {
  readonly data: StoryData;
  readonly summary: SummaryModel;
  readonly live: RecapLive;
  readonly guide: GuideId;
  readonly ground: string;
  readonly locale: string;
  readonly unit: DistanceUnit;
  readonly loadStroke?: StrokeFetch;
}

function upperPlace(summary: SummaryModel): string {
  return summary.place ?? t({ id: 'recap.story.yourTrip', message: 'Your trip' });
}

export function buildStoryCards(input: StoryCardsInput): StoryCardSpec[] {
  const { data, summary, guide, locale, unit } = input;
  const recap = data.recap;
  const stats = recap?.stats ?? null;
  if (recap === null || stats === null) return [];
  const copy = recap.copy;
  const words = (card: RecapCard) => copy[card]?.narration ?? null;
  const cards: StoryCardSpec[] = [];
  const add = (
    card: RecapCard,
    content: ReactNode,
    fallback: string | null,
    durationMs = CARD_MS,
  ) =>
    cards.push({
      card,
      label: cardLabel(card),
      durationMs,
      caption: words(card) ?? fallback,
      narrationKey: recap.narration[card] ?? null,
      content,
    });
  const place = upperPlace(summary);
  const eyebrow = headerEyebrow(summary, locale);

  add(
    'cover',
    <CoverCard
      guide={guide}
      ground={input.ground}
      eyebrow={eyebrow}
      place={copy.cover?.headline ?? place}
      chips={[
        daysChip(stats.days),
        travellersChip(stats.travellers),
        ...(stats.superlatives.length > 0 ? [sunriseChip(stats.superlatives.length)] : []),
      ]}
      forms={data.foundForms}
    />,
    null,
  );

  if (stats.critters.forms_found > 0 && data.foundForms.length > 0) {
    add(
      'critters',
      <CrittersCard
        eyebrow={t({ id: 'recap.story.critters.eyebrow', message: 'New friends' })}
        headline={copy.critters?.headline ?? newLocalsTitle(stats.critters.new_critters)}
        line={formsFoundLine(stats.critters.forms_found)}
        forms={data.foundForms}
      />,
      null,
    );
  }

  const route = recap.route;
  if (route !== null && route.stops.length > 0) {
    const km = Math.round(route.total_m / 1000);
    const driver = route.top_driver;
    const longest = route.longest_leg === null ? undefined : route.legs[route.longest_leg];
    const from = longest === undefined ? undefined : route.stops[longest.from];
    const to = longest === undefined ? undefined : route.stops[longest.to];
    add(
      'route',
      <RouteCard
        guide={guide}
        eyebrow={t({ id: 'recap.story.route.eyebrow', message: 'The route' })}
        km={km}
        formatKm={(value) => format.distance(locale, Math.round(value) * 1000, unit)}
        line={
          copy.route?.headline ??
          (driver?.provider_name != null
            ? routeDriverLine(driver.provider_name, Math.round(driver.distance_m / 1000))
            : routeStopsLine(route.stops.length))
        }
        stops={route.stops.map((stop, index) => ({
          id: `${stop.poi_id}-${index}`,
          name: stop.name,
          dayLabel: stopDays(
            stop.day_from,
            stop.day_to,
            stop.before_sunrise ? stop.local_time : null,
          ),
          highlight: stop.before_sunrise,
        }))}
        longestLeg={
          copy.route?.line ??
          (longest !== undefined && from !== undefined && to !== undefined
            ? longestLegLine(from.name, to.name, longest.minutes)
            : null)
        }
      />,
      null,
      ROUTE_CARD_MS,
    );
  }

  const awards = awardCards(input);
  if (awards.length > 0) {
    add(
      'awards',
      <AwardsCard
        eyebrow={t({ id: 'recap.story.awards.eyebrow', message: 'The crew awards' })}
        headline={copy.awards?.headline ?? awardsTitle(awards.length)}
        awards={awards}
      />,
      null,
    );
  }

  const receipt = recap.receipt;
  if (receipt !== null && receipt.expenses > 0) {
    const dates = tripDates(summary, locale);
    add(
      'receipt',
      <ReceiptCard
        guide={guide}
        eyebrow={t({ id: 'recap.story.receipt.eyebrow', message: 'Money, wrapped' })}
        headline={
          copy.receipt?.headline ??
          receiptHeadline(locale, receipt.under_minor, receipt.total_minor, receipt.currency)
        }
        title={summary.crewName ?? place}
        subtitle={receiptSubtitle(dates, receipt.travellers)}
        sections={receiptSections(receipt, locale)}
        note={copy.receipt?.line ?? receiptNote(receipt, locale)}
        footer={t({ id: 'recap.story.receipt.thanks', message: 'Thank you' })}
        paidLabel={
          receipt.settled
            ? {
                top: t({ id: 'recap.story.receipt.paidTop', message: 'Balances' }),
                title: t({ id: 'recap.story.receipt.paid', message: 'Paid' }),
                bottom: t({ id: 'recap.story.receipt.paidBottom', message: 'In full' }),
              }
            : null
        }
        share={yourShare(locale, data.myShareMinor ?? receipt.each_minor, receipt.currency)}
      />,
      null,
    );
  }

  const gotAway = recap.gotAway;
  if (gotAway !== null && summary.gotAway !== null) {
    const name = summary.gotAway.name;
    const found = gotAway.forms_found;
    const total = gotAway.forms_total;
    add(
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a card id, never copy.
      'got_away',
      <GotAwayCard
        kind={artKind(gotAway.critter_key)}
        city={place}
        eyebrow={t({ id: 'recap.story.gotAway.eyebrow', message: 'The one that got away' })}
        name={
          name === null
            ? t({ id: 'recap.story.gotAway.unnamed', message: 'A golden one' })
            : gotAway.rarity === 'legendary'
              ? t({ id: 'recap.story.gotAway.golden', message: `Golden ${name}` })
              : name
        }
        story={gotAwayLine(summary.gotAway)}
        formsLabel={t({ id: 'recap.story.gotAway.forms', message: `${found} of ${total} forms` })}
      />,
      null,
    );
  }

  const stamp = data.stamps[0];
  if (stamp !== undefined && stamp.trip_id === data.tripId) {
    const seq = stamp.seq_no;
    add(
      'stamp',
      <StampCard
        chrome={t({ id: 'recap.story.stamp.chrome', message: 'Entries · Entrées' })}
        page={seq === null ? null : t({ id: 'recap.story.stamp.page', message: `Page ${seq}` })}
        place={place}
        top={
          stamp.iata === null
            ? t({ id: 'recap.story.stamp.arrivedNoCode', message: 'Arrived' })
            : t({ id: 'recap.story.stamp.arrived', message: `${stamp.iata} · Arrived` })
        }
        bottom={tripDates(summary, locale)}
        ink={stamp.ink_colour ?? input.ground}
        older={data.stamps.slice(1).map((older) => ({
          id: older.id,
          title: older.place ?? '',
          ink: older.ink_colour ?? input.ground,
        }))}
        signers={signers(input)}
        caption={stampCaption(seq, place)}
        detail={t({
          id: 'recap.story.stamp.detail',
          message: "The crew signed it. It's on your profile now.",
        })}
        {...(input.loadStroke === undefined ? {} : { loadStroke: input.loadStroke })}
      />,
      null,
    );
  }
  return cards;
}
