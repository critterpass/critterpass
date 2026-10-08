/**
 * One SOS per gesture. From the moment the cancel window ends until the screen changes, the send is
 * `sending`: nothing can start a second one (a second alert would break through Do Not Disturb
 * again). A send that went stays locked, since the screen is about to leave; one that failed
 * unlocks and says so, and the person can try again.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface SendOnce {
  readonly sending: boolean;
  /** The last attempt did not go out. */
  readonly failed: boolean;
  readonly fire: () => void;
}

/** `run` resolves true when the SOS left (or is kept to send by itself), false when it did not. */
export function useSendOnce(run: () => Promise<boolean>): SendOnce {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  const locked = useRef(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  const fire = useCallback(() => {
    if (locked.current) return;
    locked.current = true;
    setSending(true);
    setFailed(false);
    void latest
      .current()
      .catch(() => false)
      .then((went) => {
        if (went) return;
        locked.current = false;
        setSending(false);
        setFailed(true);
      });
  }, []);

  return { sending, failed, fire };
}
