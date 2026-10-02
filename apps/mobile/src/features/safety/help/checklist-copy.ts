/**
 * The app's own words for a checklist step (EN and VI through the catalog), used whenever the
 * guide's wording (`text`) is missing: offline, or the model did not answer in time. Every fact in
 * a step comes from the step's own curated facts.
 */
import type { ChecklistStep } from '@cp/domain';
import type { I18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';

function fact(step: ChecklistStep, key: string): string {
  const value = step.facts[key];
  return value === undefined ? '' : String(value);
}

export function stepText(step: ChecklistStep, i18n: I18n): string {
  if (step.text !== null) return step.text;
  const name = fact(step, 'name');
  const minutes = fact(step, 'minutes');
  const number = fact(step, 'number');
  const phone = fact(step, 'phone');
  const phrase = fact(step, 'phrase');
  const gloss = fact(step, 'gloss');
  switch (step.kind) {
    case 'nearest_facility':
      return minutes === ''
        ? i18n._(msg({ id: 'safety.step.facility', message: `Go to ${name}.` }))
        : i18n._(
            msg({
              id: 'safety.step.facilityMinutes',
              message: `Go to ${name}, ${minutes} min by car.`,
            }),
          );
    case 'call_number':
      return i18n._(msg({ id: 'safety.step.call', message: `If it's serious, call ${number}.` }));
    case 'phrase':
      return i18n._(
        msg({ id: 'safety.step.phrase', message: `Show them: "${phrase}" (${gloss}).` }),
      );
    case 'insurance_line':
      return i18n._(
        msg({
          id: 'safety.step.insurance',
          message: "Call your insurer's assistance line; the number is on your policy card.",
        }),
      );
    case 'ops_clinic':
      return i18n._(
        msg({ id: 'safety.step.opsClinic', message: 'The ops desk can call the clinic with you.' }),
      );
    case 'freeze_cards':
      return i18n._(
        msg({
          id: 'safety.step.freezeCards',
          message: "Freeze your cards in your bank's app first.",
        }),
      );
    case 'police_report':
      return number === ''
        ? i18n._(
            msg({
              id: 'safety.step.police',
              message: 'Report it to the police and ask for a written report for your insurer.',
            }),
          )
        : i18n._(
            msg({
              id: 'safety.step.policeNumber',
              message: `Report it to the police (${number}) and ask for a written report for your insurer.`,
            }),
          );
    case 'embassy':
      return phone === ''
        ? i18n._(
            msg({
              id: 'safety.step.embassy',
              message: `If your passport is gone, contact ${name}.`,
            }),
          )
        : i18n._(
            msg({
              id: 'safety.step.embassyPhone',
              message: `If your passport is gone, call ${name} on ${phone}.`,
            }),
          );
    case 'share_pin':
      return i18n._(
        msg({
          id: 'safety.step.sharePin',
          message: 'Share where you are so the crew can find you.',
        }),
      );
    case 'stay_put':
      return i18n._(
        msg({
          id: 'safety.step.stayPut',
          message: 'Stay where you are, somewhere safe and easy to spot.',
        }),
      );
    case 'walk_back':
      return i18n._(
        msg({ id: 'safety.step.walkBack', message: 'Or walk back to your last planned stop.' }),
      );
    case 'ride_quote':
      return i18n._(
        msg({ id: 'safety.step.rideQuote', message: 'Get a ride quote and book the next car.' }),
      );
    case 'driver_message':
      return i18n._(
        msg({
          id: 'safety.step.driverMessage',
          message: 'Your guide can draft a message to your driver; you send it.',
        }),
      );
  }
}
