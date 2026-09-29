/**
 * Client specs for the crew live map commands. Sharing, pausing and meet-up changes may wait in
 * the offline queue (a moved meet-up replays when the phone is back); PING ALL and I'M ON MY WAY
 * need the network, since a ping that arrives late is worse than none.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  CreateMeetupPayload,
  MoveMeetupPayload,
  PauseLocationSharePayload,
  PingAllPayload,
  SetLocationSharePayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const setLocationShareCommand = defineClientCommand<SetLocationSharePayload>({
  name: 'set_location_share',
  offline: true,
  summarize: (payload) =>
    payload.status === 'on'
      ? msg({ id: 'liveMap.queued.shareOn', message: 'Turning on live location' })
      : msg({ id: 'liveMap.queued.shareOff', message: 'Turning off live location' }),
});

export const pauseLocationShareCommand = defineClientCommand<PauseLocationSharePayload>({
  name: 'pause_location_share',
  offline: true,
  summarize: (payload) =>
    payload.paused
      ? msg({ id: 'liveMap.queued.pause', message: 'Pausing live location' })
      : msg({ id: 'liveMap.queued.resume', message: 'Resuming live location' }),
});

export const createMeetupCommand = defineClientCommand<CreateMeetupPayload>({
  name: 'create_meetup',
  offline: true,
  summarize: () => msg({ id: 'liveMap.queued.createMeetup', message: 'Setting the meet-up' }),
});

export const moveMeetupCommand = defineClientCommand<MoveMeetupPayload>({
  name: 'move_meetup',
  offline: true,
  summarize: () => msg({ id: 'liveMap.queued.moveMeetup', message: 'Moving the meet-up' }),
});

export const pingAllCommand = defineClientCommand<PingAllPayload>({
  name: 'ping_all',
  offline: false,
});
