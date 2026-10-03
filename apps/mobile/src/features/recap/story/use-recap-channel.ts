/**
 * The recap's live channel (`recap:{recap_id}`): a traveller's signature as they open the recap
 * (it writes itself on the stamp before the row syncs), the MVP tallies as votes land, and the
 * MVP once the vote closes. The synced rows catch up behind; this only makes it live.
 */
import {
  RECAP_RT,
  recapMvpResultDataSchema,
  recapMvpVoteDataSchema,
  recapSignatureDataSchema,
} from '@cp/domain';
import { useState } from 'react';

import { useChannel } from '@/data/realtime/use-channel';

export interface LiveSignature {
  readonly signerId: string;
  readonly strokeKey: string | null;
  readonly signedAt: string;
}

export interface RecapLive {
  readonly signatures: readonly LiveSignature[];
  /** Award id → votes, from the latest tally; empty until one arrives. */
  readonly tallies: ReadonlyMap<string, number>;
  /** The MVP award ids once the vote has closed; null until then. */
  readonly mvp: readonly string[] | null;
}

export function useRecapChannel(recapId: string | null): RecapLive {
  const [signatures, setSignatures] = useState<readonly LiveSignature[]>([]);
  const [tallies, setTallies] = useState<ReadonlyMap<string, number>>(new Map());
  const [mvp, setMvp] = useState<readonly string[] | null>(null);

  useChannel('recap', recapId, {
    onEvent: (envelope) => {
      if (envelope.type === RECAP_RT.signature) {
        const data = recapSignatureDataSchema.safeParse(envelope.data);
        if (!data.success) return;
        const next = {
          signerId: data.data.signer_id,
          strokeKey: data.data.stroke_media_key,
          signedAt: data.data.signed_at,
        };
        setSignatures((all) => [...all.filter((s) => s.signerId !== next.signerId), next]);
        return;
      }
      if (envelope.type === RECAP_RT.mvpVote || envelope.type === RECAP_RT.mvpResult) {
        const vote = recapMvpVoteDataSchema.safeParse(envelope.data);
        const result = recapMvpResultDataSchema.safeParse(envelope.data);
        const counts = vote.success ? vote.data.tallies : result.success ? result.data.tallies : [];
        setTallies(new Map(counts.map((tally) => [tally.award_id, tally.votes])));
        if (envelope.type === RECAP_RT.mvpResult && result.success) setMvp(result.data.award_ids);
      }
    },
  });

  return { signatures, tallies, mvp };
}
