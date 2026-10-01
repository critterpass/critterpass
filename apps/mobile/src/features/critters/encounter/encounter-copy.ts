/** Encounter words (3l-4, 3l-5, 3l-6, 3l-10), in the active locale. */
import { plural, t } from '@lingui/core/macro';

export function modeLabel(legendary: boolean): string {
  return legendary
    ? t({ id: 'critters.encounter.legendaryMode', message: 'Legendary' })
    : t({ id: 'critters.encounter.mode', message: 'Encounter' });
}

export function youreAt(place: string): string {
  return t({ id: 'critters.encounter.youreAt', message: `You're at ${place}` });
}

export function isHere(name: string | null): string {
  return name === null
    ? t({ id: 'critters.encounter.someoneHere', message: 'Someone is here' })
    : t({ id: 'critters.encounter.isHere', message: `${name} is here` });
}

export function liveBody(phase: string, legendary: boolean): string {
  if (phase === 'ready') {
    return t({
      id: 'critters.encounter.readyBody',
      message: "It's settled next to you. Hold the ring and it's yours.",
    });
  }
  if (phase === 'draining') {
    return t({
      id: 'critters.encounter.drainingBody',
      message: "You've stepped away. It's watching from the edge, so come back slowly.",
    });
  }
  return legendary
    ? t({
        id: 'critters.encounter.legendaryBody',
        message: "It only comes out now, and only for those who stay. Keep still and it'll settle.",
      })
    : t({
        id: 'critters.encounter.shyBody',
        message: "It's shy around crowds. Stay a few minutes and it'll come closer.",
      });
}

export function crewHere(member: string): string {
  return t({ id: 'critters.encounter.crewHere', message: `${member} befriended one here.` });
}

export function holdLabel(): string {
  return t({ id: 'critters.encounter.hold', message: 'Hold' });
}

export function holdTitle(): string {
  return t({ id: 'critters.encounter.holdTitle', message: 'Hold to befriend' });
}

export function stayTitle(): string {
  return t({ id: 'critters.encounter.stayTitle', message: 'Stay close' });
}

export function befriendAction(): string {
  return t({ id: 'critters.encounter.befriend', message: 'Befriend' });
}

export function tapInstead(): string {
  return t({ id: 'critters.encounter.tapInstead', message: 'Befriend without holding' });
}

export function formOf(name: string | null, tier: string, no: number, total: number): string {
  return name === null
    ? t({ id: 'critters.encounter.formNo', message: `${tier} form, ${no} of ${total}` })
    : t({ id: 'critters.encounter.formOf', message: `${name}'s ${tier} form, ${no} of ${total}` });
}

export function stayedFor(minutes: number): string {
  return t({
    id: 'critters.encounter.stayed',
    message: plural(minutes, { one: 'You stayed # min', other: 'You stayed # min' }),
  });
}

export function encounterOver(): string {
  return t({ id: 'critters.encounter.over', message: 'Encounter over' });
}

export function wanderedTitle(): string {
  return t({ id: 'critters.encounter.wandered', message: 'It wandered off' });
}

export function wanderedBody(place: string, minutes: number): string {
  return t({
    id: 'critters.encounter.wanderedBody',
    message: plural(minutes, {
      one: `You left ${place} after # minute, and it's shy. It comes back when the place goes quiet.`,
      other: `You left ${place} after # minutes, and it's shy. It comes back when the place goes quiet.`,
    }),
  });
}

export function bestChance(): string {
  return t({ id: 'critters.encounter.bestChance', message: 'Best chance' });
}

export function whenLabel(today: boolean, time: string): string {
  return today
    ? t({ id: 'critters.encounter.today', message: `Today, ${time}` })
    : t({ id: 'critters.encounter.tomorrow', message: `Tomorrow, ${time}` });
}

export function noForecast(): string {
  return t({
    id: 'critters.encounter.noForecast',
    message: 'No crowd forecast here yet. Early mornings are usually the quietest.',
  });
}

export function remindAt(time: string): string {
  return t({ id: 'critters.encounter.remindAt', message: `Remind me at ${time}` });
}

export function reminderSet(time: string): string {
  return t({ id: 'critters.encounter.reminderSet', message: `We'll nudge you at ${time}` });
}

export function reminderDenied(): string {
  return t({
    id: 'critters.encounter.reminderDenied',
    message: 'Notifications are off, so we can’t nudge you. Turn them on in Settings.',
  });
}

export function reminderTitle(place: string): string {
  return t({ id: 'critters.encounter.reminderTitle', message: `${place} is going quiet` });
}

export function reminderBody(): string {
  return t({
    id: 'critters.encounter.reminderBody',
    message: 'The shy one might come back now. Go softly.',
  });
}

export function backToDay(): string {
  return t({ id: 'critters.encounter.backToDay', message: 'Back to the day' });
}

export function befriendedTitle(): string {
  return t({ id: 'critters.encounter.befriended', message: 'Befriended!' });
}

export function formEyebrow(tier: string, no: number, total: number): string {
  return t({ id: 'critters.encounter.formEyebrow', message: `${tier} form · ${no} of ${total}` });
}

export function xpChip(xp: number): string {
  return t({ id: 'critters.encounter.xp', message: `+${xp} XP` });
}

export function crewChip(count: number): string {
  return t({ id: 'critters.encounter.crewChip', message: `${count} in the crew` });
}

export function noticed(minutes: number): string {
  return t({
    id: 'critters.encounter.noticed',
    message: plural(minutes, {
      one: 'You stayed # minute. It noticed.',
      other: 'You stayed # minutes. It noticed.',
    }),
  });
}

export function addToPass(): string {
  return t({ id: 'critters.encounter.addToPass', message: 'Add to your pass' });
}

export function shareWithCrew(): string {
  return t({ id: 'critters.encounter.shareCrew', message: 'Share with the crew' });
}

export function onYourPass(): string {
  return t({
    id: 'critters.encounter.onPass',
    message: 'On your pass. We’re checking it, then it’s yours for good.',
  });
}

export function nothingHere(): { title: string; body: string } {
  return {
    title: t({ id: 'critters.encounter.nothingTitle', message: 'Nothing stirring yet' }),
    body: t({
      id: 'critters.encounter.nothingBody',
      message: 'Critters come out at real places. Walk to a spot on your plan and stay a while.',
    }),
  };
}

export function rustled(place: string): string {
  return t({ id: 'critters.encounter.rustled', message: `Something rustled near ${place}` });
}

export function look(): string {
  return t({ id: 'critters.encounter.look', message: 'Look' });
}

export function sceneLabel(place: string): string {
  return t({ id: 'critters.encounter.scene', message: `A critter at ${place}` });
}
