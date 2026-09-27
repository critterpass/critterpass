/**
 * Centrifugo channel name builders (docs/api-contracts-async.md §1.2, docs/system-architecture.md
 * §4.3), shared by the api (subscribe proxy), the worker (rt_outbox relay) and the SQL side
 * (`app.channel_name`, docs/data-model.md §3.2) so the three never drift on the string format.
 * `#` is reserved for the user-limited `user:#{uid}` channel; every other namespace uses `:`.
 */

export const CHANNEL_NAMESPACES = [
  'user',
  'crew',
  'crew_chat',
  'crew_money',
  'crew_bookings',
  'crew_collection',
  'trip',
  'trip_setup',
  'trip_draft',
  'trip_plan',
  'trip_dayof',
  'trip_watch',
  'trip_quests',
  'trip_album',
  'trip_copresence',
  'trip_presence',
  'trip_locations',
  'poll',
  'swipe',
  'proposal',
  'guide_thread',
  'disruption',
  'sos',
  'recap',
  'memory',
] as const;

export type ChannelNamespace = (typeof CHANNEL_NAMESPACES)[number];

/** Crew-scoped namespaces a membership change must unsubscribe a removed member from. */
export const CREW_CHANNEL_NAMESPACES = [
  'crew',
  'crew_chat',
  'crew_money',
  'crew_bookings',
  'crew_collection',
] as const satisfies readonly ChannelNamespace[];

export function channelName(namespace: ChannelNamespace, id: string): string {
  return namespace === 'user' ? `user:#${id}` : `${namespace}:${id}`;
}

export function userChannel(uid: string): string {
  return channelName('user', uid);
}

export function crewChannel(crewId: string): string {
  return channelName('crew', crewId);
}

export function tripChannel(tripId: string): string {
  return channelName('trip', tripId);
}

/** Every crew-scoped channel name for one crew, in the order membership-change fan-out uses. */
export function crewChannels(crewId: string): readonly string[] {
  return CREW_CHANNEL_NAMESPACES.map((namespace) => channelName(namespace, crewId));
}
