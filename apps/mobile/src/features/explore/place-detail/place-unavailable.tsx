/**
 * A place's page before there is a place to draw: a skeleton while the phone or the api answers,
 * and words with a way on when the api has no such place or could not be reached. A failed read
 * says so and offers RETRY; it only blames the connection when there is none.
 */
import { useLingui } from '@lingui/react/macro';

import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';

import { guideFor } from '../format';
import type { PlaceRowState } from './remote-place';

export interface PlaceUnavailableProps {
  readonly state: Exclude<PlaceRowState, { kind: 'ready' }>;
  readonly onBack: () => void;
}

export function PlaceUnavailable({ state, onBack }: PlaceUnavailableProps) {
  const { t } = useLingui();
  const guest = guideFor(null);
  return (
    <Scaffold
      testID={
        state.kind === 'waiting'
          ? 'explore-place-waiting'
          : state.kind === 'failed'
            ? 'explore-place-failed'
            : 'explore-place-missing'
      }
    >
      <BackEyebrow
        label={t({ id: 'explore.hero.back', message: 'Explore' })}
        onPress={onBack}
        testID="explore-back"
      />
      {state.kind === 'waiting' ? (
        <Skeleton preset="card" />
      ) : state.kind === 'missing' ? (
        <EmptyState
          guide={guest.id}
          guideName={guest.name}
          title={t({ id: 'explore.place.goneTitle', message: "This place isn't listed any more" })}
          line={t({
            id: 'explore.place.goneLine',
            message: 'It may have closed or been merged with another. Search for it by name.',
          })}
          action={{ label: t({ id: 'explore.place.goBack', message: 'Go back' }), onPress: onBack }}
        />
      ) : (
        <EmptyState
          guide={guest.id}
          guideName={guest.name}
          title={t({ id: 'explore.place.failedTitle', message: "This place didn't load" })}
          line={
            state.offline
              ? t({
                  id: 'explore.place.missingOffline',
                  message: "I need a connection the first time. After that it's here offline.",
                })
              : t({
                  id: 'explore.place.failedLine',
                  message: 'Something went wrong on our side. Try again.',
                })
          }
          action={{
            label: t({ id: 'explore.place.retry', message: 'Retry' }),
            onPress: state.retry,
          }}
        />
      )}
    </Scaffold>
  );
}
