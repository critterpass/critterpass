/**
 * The caller's referral dashboard data with its link: the referrals, the stamps, and the code,
 * minted once when there is none yet (online; until then the link waits).
 */
import { useContext, useEffect, useRef, useState } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useSessionUid } from '@/data/powersync/use-session-uid';

import { useCrewServices } from '../crews-sheet/crew-services';
import { MINT_REFERRAL_CODE, useReferrals } from './referral-data';

export function useReferralLink() {
  const services = useCrewServices();
  const localFirst = useContext(LocalFirstContext);
  const uid = useSessionUid();
  const snapshot = useReferrals(localFirst?.db ?? null, uid);
  const [minted, setMinted] = useState<string | null>(null);
  const asked = useRef(false);
  const code = snapshot.code ?? minted;

  useEffect(() => {
    if (localFirst === null || uid === null || asked.current) return;
    if (!snapshot.loaded || snapshot.code !== null) return;
    asked.current = true;
    void localFirst.commands.send(MINT_REFERRAL_CODE, {}).then((sent) => {
      const value =
        sent.kind === 'applied' ? (sent.result as { code?: unknown } | null)?.code : undefined;
      if (typeof value === 'string') setMinted(value);
    });
  }, [localFirst, uid, snapshot.loaded, snapshot.code]);

  return { snapshot, code, url: code === null ? null : services.referralUrl(code) };
}
