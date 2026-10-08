/**
 * The in-app links the server sends (push `deeplink`, inbox `deep_link`, briefing lines, Live
 * Activities, OAuth returns): one builder per screen, each returning the path the app's router
 * resolves, with the query that screen reads. Servers write links only through these, and the app
 * checks a sample of every builder (`app-link-samples.ts`) against its route files, so a link that
 * opens no screen cannot ship.
 *
 * Every export of this module is a builder. A screen's former paths live in `trip-paths.ts`.
 */

/**
 * A trip's planning screens are linked as `/trip/<trip id>/…`; the app forwards them to the
 * trip's own `/<trip id>/…`.
 */
function tripScreen(tripId: string, tail: string): string {
  return `/trip/${tripId}/${tail}`;
}

function withQuery(path: string, params: Readonly<Record<string, string>>): string {
  return `${path}?${new URLSearchParams(params).toString()}`;
}

// Tabs and the inbox.

/** The PASS tab: the critter collection. */
export function passLink(): string {
  return '/pass';
}

export function inboxLink(): string {
  return '/inbox';
}

/** A trip's hub in the TRIPS tab. */
export function tripHubLink(tripId: string): string {
  return `/trips/${tripId}`;
}

/** A trip's day-of screen; `localDate` is `YYYY-MM-DD` in the trip's zone, or `today`. */
export function tripDayLink(tripId: string, localDate: string): string {
  return `/trips/${tripId}/day/${localDate}`;
}

// Wallet: bookings and money.

export function bookingLink(bookingId: string): string {
  return `/wallet/bookings/${bookingId}`;
}

export function boardingPassLink(bookingId: string): string {
  return `/wallet/bookings/pass/${bookingId}`;
}

export function addBookingLink(): string {
  return '/wallet/bookings/add';
}

/** Money's home in the wallet tab: the crew's balances. */
export function moneyLink(): string {
  return '/wallet/money';
}

export function paymentLink(paymentId: string): string {
  return `/money/payment/${paymentId}`;
}

export function expenseLink(expenseId: string): string {
  return `/money/expense/${expenseId}`;
}

export function settleLink(): string {
  return '/money/settle';
}

// Crew.

/** The crews list. */
export function crewsLink(): string {
  return '/crew';
}

/** The crews list, opened on a seat someone offered. */
export function seatOfferLink(offerId: string): string {
  return `/crew?seat_offer=${offerId}`;
}

export function crewChatLink(crewId: string): string {
  return `/crew/${crewId}/chat`;
}

export function crewInviteLink(crewId: string): string {
  return `/crew/${crewId}/invite`;
}

// Deciding where to go.

export function voteLink(pollId: string): string {
  return `/vote/${pollId}`;
}

export function voteRevealLink(pollId: string): string {
  return `/vote/${pollId}/reveal`;
}

export function proposalLink(proposalId: string): string {
  return `/proposal/${proposalId}`;
}

export function proposalTrackerLink(proposalId: string): string {
  return `/proposal/${proposalId}/tracker`;
}

// Planning a trip.

export function tripPlanLink(tripId: string): string {
  return tripScreen(tripId, 'plan');
}

/** A proposed change to the plan, opened for review. */
export function changeReviewLink(tripId: string, changeSetId: string): string {
  return tripScreen(tripId, `review/${changeSetId}`);
}

export function tripIdeasLink(tripId: string): string {
  return tripScreen(tripId, 'ideas');
}

/** The plan check: what still needs an answer before the trip. */
export function tripCheckLink(tripId: string): string {
  return tripScreen(tripId, 'check');
}

export function tripDraftLink(tripId: string): string {
  return tripScreen(tripId, 'draft');
}

/** The trip setup steps a link opens. */
export type LinkedSetupStep = 'when' | 'rooms' | 'must-dos';

export function setupStepLink(tripId: string, step: LinkedSetupStep): string {
  return tripScreen(tripId, `setup/${step}`);
}

export function addMustDoLink(tripId: string): string {
  return tripScreen(tripId, 'setup/must-dos/add');
}

/** One question the setup asks a member. */
export function setupAskLink(tripId: string, askId: string): string {
  return tripScreen(tripId, `setup/ask/${askId}`);
}

// On the trip.

export function questsLink(tripId: string): string {
  return `/quests/${tripId}`;
}

/** The crew map of a trip: everyone sharing where they are, a Help share included. */
export function crewMapLink(tripId: string): string {
  return `/map/${tripId}`;
}

export function gettingAroundLink(): string {
  return '/getting-around';
}

export function disruptionLink(disruptionId: string): string {
  return `/disruption/${disruptionId}`;
}

export function runningLateLink(disruptionId: string): string {
  return `/late/${disruptionId}`;
}

export function forecastLink(tripId: string): string {
  return `/forecast/${tripId}`;
}

export function sosLink(sosId: string): string {
  return `/sos/${sosId}`;
}

/** The suppliers' messages of a trip. */
export function supplierMessagesLink(tripId: string): string {
  return `/supplier/messages?tripId=${encodeURIComponent(tripId)}`;
}

// The guide.

/** A saved guide thread. */
export function guideThreadLink(threadId: string): string {
  return `/guide/${threadId}`;
}

// After the trip.

export function recapLink(tripId: string): string {
  return `/recap/${tripId}`;
}

/** The postcard screen in a trip's recap, opened on one postcard. */
export function postcardLink(tripId: string, postcardId: string): string {
  return `/recap/${tripId}/postcard?postcard_id=${postcardId}`;
}

/** Where the postcards of an album are sent. */
export function postcardAddressLink(): string {
  return '/album/address';
}

/** A memory, with the trip it is from. */
export function memoryLink(memoryId: string, tripId: string): string {
  return `/memory/${memoryId}?trip=${tripId}`;
}

// Critters, settings and the plan.

export function legendariesLink(): string {
  return '/critters/legendaries';
}

export function settingsLink(): string {
  return '/you/settings';
}

/** The member's own plan: what they pay for and until when. */
export function membershipLink(): string {
  return '/you/plan';
}

// OAuth returns: the provider's redirect comes back through the api to one of these screens.

/** How a provider's authorization ended, as the screen that finishes the connection reads it. */
export type OAuthReturn =
  | { readonly status: 'denied' | 'failed' }
  | { readonly status: 'authorized'; readonly state: string; readonly code: string };

function oauthReturnLink(path: string, provider: string, outcome: OAuthReturn): string {
  return withQuery(path, {
    provider,
    status: outcome.status,
    ...(outcome.status === 'authorized' ? { state: outcome.state, code: outcome.code } : {}),
  });
}

/** Where a mailbox provider's authorization returns to. */
export function mailboxConnectedLink(provider: string, outcome: OAuthReturn): string {
  return oauthReturnLink('/wallet/mailbox/connected', provider, outcome);
}

/** Where a calendar provider's authorization returns to. */
export function calendarConnectedLink(provider: string, outcome: OAuthReturn): string {
  return oauthReturnLink('/setup/calendar/connected', provider, outcome);
}
