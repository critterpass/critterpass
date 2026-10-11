/* eslint-disable lingui/no-unlocalized-strings -- the dev kit gallery's sample labels, never shipped copy. */
import { Button } from '../buttons/Button';
import { Banner, OfflinePill } from '../feedback/Banner';
import type { BannerTone } from '../feedback/Banner';
import { Spinner } from '../feedback/Spinner';
import type { ToastSpec } from '../feedback/Toast';
import { useToast } from '../feedback/ToastHost';
import { EmptyState } from '../states/EmptyState';
import { LoadingCritter, Skeleton } from '../states/Skeleton';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { GalleryRow, GallerySection } from './gallery-section';

const BANNERS: readonly [BannerTone, string][] = [
  ['guide', 'Tokek found a quieter beach near your stay.'],
  ['info', 'Prices are held for 20 minutes.'],
  ['success', 'Everyone has paid their share.'],
  ['error', 'The ferry booking did not go through.'],
];

export function FeedbackSamples() {
  const t = usePremiumTheme();
  const toast = useToast();
  const toasts: readonly [string, ToastSpec][] = [
    ['Done', { kind: 'done', message: 'Moved to Saturday', undo: noop }],
    [
      'Critter',
      {
        kind: 'critter',
        message: 'Tokek saved the plan',
        critter: { kind: 'gecko', name: 'Tokek' },
        undo: noop,
      },
    ],
    ['Error', { kind: 'error', message: 'Could not send. Try again.' }],
    [
      'Person',
      {
        kind: 'person',
        title: 'Linh joined the crew',
        subtitle: 'Bali · 12–17 Oct',
        person: { name: 'Linh', color: t.accent.mint },
      },
    ],
  ];
  return (
    <GallerySection title="Feedback">
      <GalleryRow>
        {toasts.map(([label, spec]) => (
          <Button
            key={label}
            label={`${label} toast`}
            size="small"
            variant="floating"
            onPress={() => toast.show(spec)}
          />
        ))}
      </GalleryRow>
      {BANNERS.map(([tone, text]) => (
        <Banner
          key={tone}
          tone={tone}
          text={text}
          {...(tone === 'error' ? { action: { label: 'Retry', onPress: noop } } : {})}
        />
      ))}
      <GalleryRow>
        <OfflinePill />
        <Spinner />
      </GalleryRow>
    </GallerySection>
  );
}

export function StateSamples() {
  const t = usePremiumTheme();
  return (
    <GallerySection title="States">
      <EmptyState
        title="All caught up"
        line="Nothing needs you right now. Tokek will nudge you when it does."
        check
      />
      <Skeleton height={t.size.guideCritter * 4} radius={t.radius.cardLarge} />
      <Skeleton height={t.space.gap14} tone="bar" width="70%" />
      <Skeleton height={t.space.gap12} tone="soft" width="45%" />
      <LoadingCritter label="Tokek is fetching the plan…" />
    </GallerySection>
  );
}

function noop(): void {}
