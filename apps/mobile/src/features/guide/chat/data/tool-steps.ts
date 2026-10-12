/**
 * What a working step says while the guide runs a tool ("Checking the weather"), by the tool's
 * wire name. A tool this build does not know reads as a plain "Looking into it".
 */
import { t } from '@lingui/core/macro';

export function toolStepLabel(tool: string): string {
  switch (tool) {
    case 'weather':
    case 'marine':
      return t({ id: 'guide.step.weather', message: 'Checking the weather' });
    case 'plan_read':
      return t({ id: 'guide.step.plan', message: 'Reading your plan' });
    case 'bookings_read':
      return t({ id: 'guide.step.bookings', message: 'Looking at your bookings' });
    case 'balances_read':
      return t({ id: 'guide.step.balances', message: 'Checking who owes what' });
    case 'places_search':
      return t({ id: 'guide.step.places', message: 'Finding places nearby' });
    case 'place_details':
      return t({ id: 'guide.step.placeDetails', message: 'Checking opening hours' });
    case 'crowd_forecast':
      return t({ id: 'guide.step.crowds', message: 'Checking how busy it gets' });
    case 'route_eta':
      return t({ id: 'guide.step.route', message: 'Working out travel times' });
    case 'ride_quote':
      return t({ id: 'guide.step.ride', message: 'Pricing a ride' });
    case 'fare_calendar':
    case 'flight_status':
      return t({ id: 'guide.step.flights', message: 'Checking flights' });
    case 'fx':
      return t({ id: 'guide.step.fx', message: 'Checking the exchange rate' });
    case 'cost_quote':
      return t({ id: 'guide.step.cost', message: 'Adding up the cost' });
    case 'fit_check':
      return t({ id: 'guide.step.fit', message: 'Checking it fits the day' });
    case 'crew_profiles':
      return t({ id: 'guide.step.crew', message: "Checking what the crew's into" });
    case 'bookable_activity':
      return t({ id: 'guide.step.bookable', message: 'Checking what can be booked' });
    case 'phrase_card':
      return t({ id: 'guide.step.phrase', message: 'Writing the phrase' });
    case 'web_search':
      return t({ id: 'guide.step.web', message: 'Searching the web' });
    case 'propose_plan_changes':
      return t({ id: 'guide.step.planChange', message: 'Drafting a plan change' });
    case 'create_vote_draft':
      return t({ id: 'guide.step.vote', message: 'Drafting a vote' });
    case 'propose_expense':
      return t({ id: 'guide.step.expense', message: 'Drafting the expense' });
    case 'propose_hold':
    case 'propose_vendor_message':
      return t({ id: 'guide.step.booking', message: 'Drafting a booking' });
    default:
      return t({ id: 'guide.step.other', message: 'Looking into it' });
  }
}
