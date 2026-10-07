/**
 * The people on the story's cards: one award card per traveller (the guide's words, else the
 * award's own number; the MVP from the live result once the vote closes) and the stamp's signers
 * in the order they signed, live signatures over the synced rows, each in their colour as ink on paper.
 */
import type { AwardCardData } from '../cards/awards-card';
import type { StampSigner } from '../cards/stamp-card';
import { inkOnPaper } from '../data/paper-ink';
import { awardDetail, awardTitle } from '../summary/award-copy';
import type { StoryCardsInput } from './story-cards';

export function awardCards(input: StoryCardsInput): AwardCardData[] {
  const { data, live } = input;
  return data.awards
    .filter((award) => !award.optedOut)
    .map((award) => {
      const chip = {
        id: award.id,
        kind: award.kind,
        title: award.title,
        name: award.name,
        me: award.userId === data.viewerId,
        mvp: award.mvp,
        value: award.value,
        evidence: award.evidence,
      };
      return {
        id: award.id,
        userId: award.userId,
        initial: (award.name.trim()[0] ?? '?').toLocaleUpperCase(),
        title: award.title ?? awardTitle(award.kind),
        line: award.line ?? awardDetail(chip),
        mvp: live.mvp === null ? award.mvp : live.mvp.includes(award.id),
        mine: data.myVote === award.id,
      };
    });
}

export function signers(input: StoryCardsInput): StampSigner[] {
  const { data, live } = input;
  const byId = new Map(data.travellers.map((person) => [person.userId, person]));
  const rows = new Map(
    data.signatures.map((row) => [
      row.signer_id,
      { key: row.stroke_media_key, at: row.signed_at ?? '' },
    ]),
  );
  for (const sign of live.signatures)
    rows.set(sign.signerId, { key: sign.strokeKey, at: sign.signedAt });
  return [...rows.entries()]
    .sort((a, b) => a[1].at.localeCompare(b[1].at) || a[0].localeCompare(b[0]))
    .flatMap(([userId, sign]) => {
      const person = byId.get(userId);
      return person === undefined
        ? []
        : [
            {
              userId,
              name: person.name,
              color: inkOnPaper(person.colour, person.colour),
              strokeKey: sign.key,
            },
          ];
    });
}
