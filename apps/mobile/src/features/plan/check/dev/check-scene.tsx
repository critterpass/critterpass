/**
 * The plan check (7h-1) as a lab scene: for an organiser, for a member (with an organiser's
 * private ask on top), running, all clear, a too-far card opened, and on an organiser's own draft.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useLocale } from '@/lib/i18n/use-locale';

import { NO_TRIP_GUIDE } from '../../plan-guide';
import { AskCard } from '../ask-card';
import * as words from '../check-copy';
import { CheckView } from '../check-view';
import * as lab from './check-lab-copy';

const noop = () => undefined;

export function Check({
  member = false,
  state = 'ready',
  draft = false,
}: {
  member?: boolean;
  state?: 'ready' | 'running' | 'clear' | 'open';
  /** Her own draft, before the crew has a plan: each card opens its stop. */
  draft?: boolean;
}) {
  const locale = useLocale();
  const v = lab.issues(locale);
  const cards =
    state === 'clear' || state === 'running' ? [] : v.cards(member, state === 'open', draft);
  return (
    <CheckView
      backLabel={words.backTripLabel()}
      onBack={noop}
      status={state === 'running' ? words.checkingLabel() : lab.checkedNow()}
      state="ready"
      title={
        state === 'running'
          ? words.checkingTitle()
          : words.checkTitle(cards.length, state === 'clear' ? 0 : 2)
      }
      body={words.checkBody(8)}
      notice={
        state === 'running'
          ? words.runningNotice(NO_TRIP_GUIDE.name)
          : state === 'clear'
            ? words.clearNotice(NO_TRIP_GUIDE.name)
            : null
      }
      cards={cards}
      know={state === 'clear' || state === 'running' ? [] : v.know}
      ask={
        member ? (
          <AskCard
            asker="Winston"
            places={['Seniman Coffee', 'Gianyar Night Market']}
            onYes={noop}
            onNo={noop}
          />
        ) : null
      }
      balance={
        member || draft || state !== 'ready'
          ? null
          : { label: words.balanceRowLabel(), onPress: noop }
      }
      fixAll={
        cards.length === 0 || draft
          ? null
          : { label: words.fixAllLabel(3), busy: false, onPress: noop }
      }
      reducedMotion={false}
    />
  );
}
