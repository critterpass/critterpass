/**
 * The manifest's words, from what is actually true: how many are in of how many seats, whether
 * named seats still wait (a count, never a name, and never a claim that we nudged anyone), and
 * for a waitlisted joiner their place in line.
 */
import { t } from '@lingui/core/macro';

export interface ManifestFacts {
  readonly name: string;
  readonly crew: string;
  readonly members: number;
  /** The trip's seat cap; null for a crew-only join. */
  readonly cap: number | null;
  readonly waiting: number;
  readonly waitlisted: boolean;
  readonly position: number | null;
}

export interface ManifestCopy {
  readonly eyebrow: string;
  readonly count: string | null;
  readonly title: string;
  readonly body: string;
  readonly welcome: string;
}

export function manifestCopy(f: ManifestFacts): ManifestCopy {
  const { name, crew, members, waiting } = f;
  const cap = f.cap ?? 0;
  const eyebrow = t({
    id: 'onboarding.invite.manifest.eyebrow',
    message: `Crew manifest · ${crew}`,
  });
  const count =
    f.cap === null
      ? null
      : t({ id: 'onboarding.invite.manifest.count', message: `${members} of ${cap}` });
  const welcome = t({
    id: 'onboarding.invite.manifest.welcome',
    message: `Welcome, ${name}. Glad you made it.`,
  });
  if (f.waitlisted) {
    const position = f.position ?? 1;
    return {
      eyebrow,
      count,
      welcome,
      title: t({ id: 'onboarding.invite.manifest.waitlistTitle', message: `${name}’s next` }),
      body:
        position === 1
          ? t({
              id: 'onboarding.invite.manifest.waitlistFirst',
              message: `You’re in ${crew} and next for a seat. When one frees up, you get a day to take it.`,
            })
          : t({
              id: 'onboarding.invite.manifest.waitlistBody',
              message: `You’re in ${crew} and number ${position} for a seat. When one frees up, you get a day to take it.`,
            }),
    };
  }
  const title = t({ id: 'onboarding.invite.manifest.title', message: `${name}’s in` });
  const body =
    waiting === 0
      ? t({
          id: 'onboarding.invite.manifest.allIn',
          message: `${members} in. That’s everyone invited so far.`,
        })
      : waiting === 1
        ? t({
            id: 'onboarding.invite.manifest.oneWaiting',
            message: `${members} in. One more invite hasn’t been opened yet.`,
          })
        : t({
            id: 'onboarding.invite.manifest.someWaiting',
            message: `${members} in. ${waiting} more invites haven’t been opened yet.`,
          });
  return { eyebrow, count, title, body, welcome };
}
