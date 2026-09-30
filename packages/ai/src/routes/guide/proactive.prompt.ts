/**
 * The guide's proactive offer in crew chat (e.g. "Karsa Spa has three slots at 14:00. Tap in
 * and I'll book it and split it"). The facts (slots, time, price) are filled by a deterministic
 * template from the bookable slot's numbers; the model writes one short invitation from our own
 * place name and nothing else, so supplier text never enters the prompt and no number comes from
 * the model. Route `micro.line`; no tools, no web search.
 */
import { decisionBand, isConfident, yesNoVerdict } from '@cp/domain';

import type { GatewayInput, Gateway } from '../../client';
import type { DecisionClient } from '../../decide';
import { renderPersonaBlock } from '../../persona/layering';
import type { PersonaPack } from '../../persona/schema';
import { isDeclined, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import { majorUnits } from '../../prompts/tips/validate';

export const GUIDE_OFFER_ROUTE = 'micro.line' as const;
export const OFFER_LINE_MAX = 90;

export interface OfferFacts {
  /** Our own place name (POI DB), never the supplier's product title. */
  readonly placeName: string;
  readonly slots: number;
  /** ISO instant the slot starts. */
  readonly startsAt: string;
  /** The trip's zone: the time is shown as local wall time there. */
  readonly tz: string;
  readonly priceFromMinor: number | null;
  readonly currency: string | null;
}

function localTime(at: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: tz,
  }).format(new Date(at));
}

function price(minor: number, currency: string): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(Math.round(majorUnits(minor, currency)));
}

/** The offer's facts in words; every number here is the trigger's, formatted in code. */
export function offerTemplate(facts: OfferFacts): string {
  const slots = facts.slots === 1 ? 'one slot' : `${facts.slots} slots`;
  const from =
    facts.priceFromMinor === null || facts.currency === null
      ? ''
      : `, from ${price(facts.priceFromMinor, facts.currency)} each`;
  return `${facts.placeName} has ${slots} at ${localTime(facts.startsAt, facts.tz)}${from}. Tap in and I'll book it and split it.`;
}

export const OFFER_TASK = `Write one short line (under ${OFFER_LINE_MAX} characters) in your own voice inviting the crew to try the place named in the message. No numbers, times, dates or prices, no promises that anything is booked or held, no emoji. Reply with the line only.`;

export function buildOfferLineRequest(pack: PersonaPack, placeName: string): GatewayInput {
  return {
    system: [
      { type: 'text', text: renderPersonaBlock(pack) },
      { type: 'text', text: OFFER_TASK },
    ],
    messages: [{ role: 'user', content: `Place: ${placeName.slice(0, 80)}` }],
    temperature: 0.7,
  };
}

/** The model's line, or null when it broke the rules (a digit, too long, empty). */
export function validateOfferLine(text: string): string | null {
  const line = text.replace(/\s+/gu, ' ').trim();
  if (line === '' || line.length > OFFER_LINE_MAX || /\d/u.test(line)) return null;
  return line;
}

export interface GuideOfferText {
  readonly text: string;
  readonly source: 'model' | 'template';
}

/** The posted offer: the model's invitation (when valid) before the template's facts. */
export async function writeGuideOffer(
  gateway: Pick<Gateway, 'callModel'> | undefined,
  pack: PersonaPack,
  facts: OfferFacts,
  usage: UsageContext = {},
): Promise<GuideOfferText> {
  const template = offerTemplate(facts);
  if (gateway === undefined) return { text: template, source: 'template' };
  try {
    const result = await gateway.callModel(
      GUIDE_OFFER_ROUTE,
      buildOfferLineRequest(pack, facts.placeName),
      usage,
    );
    const line = isDeclined(result.message) ? null : validateOfferLine(textOf(result.message));
    return line === null
      ? { text: template, source: 'template' }
      : { text: `${line} ${template}`, source: 'model' };
  } catch {
    return { text: template, source: 'template' };
  }
}

export const CHIME_IN_ROUTE = 'guide.chime_in_classifier' as const;

export const CHIME_IN_QUESTION =
  'A travel guide could post this bookable slot into the crew chat of a group on this trip, unasked. Would the crew likely welcome it right now (it fits a trip day, it is soon enough to act on, and it is not spam)?';

/**
 * The chime-in classifier's go-ahead: only a confident yes posts; an unsure answer, a no or an
 * unavailable classifier keeps the guide quiet.
 */
export async function shouldChimeIn(
  decisions: Pick<DecisionClient, 'decide'>,
  facts: OfferFacts,
  usage: UsageContext = {},
): Promise<boolean> {
  try {
    const decision = await decisions.decide(
      CHIME_IN_ROUTE,
      {
        state: {
          offer: {
            place: facts.placeName,
            slots: facts.slots,
            local_time: localTime(facts.startsAt, facts.tz),
            starts_in_hours: Math.round((Date.parse(facts.startsAt) - Date.now()) / 3_600_000),
          },
        },
        questions: { chime_in: { type: 'noul', instructions: CHIME_IN_QUESTION } },
      },
      usage,
    );
    const answer = decision.answers.chime_in;
    const band = decisionBand(CHIME_IN_ROUTE, decision.answered_by);
    return yesNoVerdict(answer.noul, band) === 'yes' && isConfident(answer.confidence, band);
  } catch {
    return false;
  }
}
